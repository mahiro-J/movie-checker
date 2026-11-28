// 共通の道具: 型定義、ページ取得、日付と時刻の整形
import * as cheerio from "cheerio";

export type Screening = {
  date: string; // "2026-11-05"
  start: string; // "09:30"
  end?: string; // "11:05"
  title: string;
  note?: string; // トーク付き、35mm など
  screen?: string; // スクリーン名(複数ある館だけ)
  program?: string; // 特集名
  director?: string; // 監督(複数は「、」区切り)
  year?: number; // 製作年(館に書いてあれば。監督を調べるときに同名の別作品と見分ける)
};

export type Theater = {
  id: string;
  name: string;
  area: string;
  url: string; // 人が見る公式スケジュールページ
  scrape: (ctx: Ctx) => Promise<Screening[]>;
};

export type Ctx = {
  today: string; // JSTの今日 "2026-11-05"
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) movie-checker/0.1 (personal use)";

/** ページを取得して文字列で返す。Shift_JIS や EUC-JP も自動判定する */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ja" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 2048)).toLowerCase();
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  let enc = "utf-8";
  const m = /charset=["']?([\w-]+)/.exec(ctype) || /charset=["']?([\w-]+)/.exec(head);
  if (m) enc = m[1];
  if (/shift_jis|sjis|x-sjis|windows-31j|cp932/.test(enc)) enc = "shift_jis";
  try {
    return new TextDecoder(enc).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

export async function fetchDom(url: string) {
  return cheerio.load(await fetchText(url));
}

/** HTMLを行ごとのテキストにする(ブロック要素で改行) */
export function htmlToLines(html: string): string[] {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  $("br").replaceWith("\n");
  $("p,div,li,tr,h1,h2,h3,h4,h5,h6,dt,dd,section,article,table,ul,ol,th,td").each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  return $.root()
    .text()
    .split("\n")
    .map((l) => l.replace(/[\s　]+/g, " ").trim())
    .filter(Boolean);
}

/** 全角数字・記号を半角にする */
export function z2h(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：；;]/g, ":")
    .replace(/[／]/g, "/")
    .replace(/[〜～]/g, "~");
}

/** "9:5" → "09:05"。24時以降もそのまま("25:10") */
export function hhmm(t: string): string {
  const m = /(\d{1,2})\s*[:：]\s*(\d{2})/.exec(z2h(t));
  if (!m) throw new Error(`bad time: ${t}`);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** 月日だけの日付に、今日に一番近い年をつける */
export function ymd(month: number, day: number, today: string): string {
  const ty = Number(today.slice(0, 4));
  const t = Date.parse(today);
  let best = "";
  let bestDiff = Infinity;
  for (const y of [ty - 1, ty, ty + 1]) {
    const s = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const d = Math.abs(Date.parse(s) - t);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 開始日から終了日まで(両端含む)の日付一覧 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 120; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 開始時刻と上映分数から終了時刻 */
export function plusMinutes(start: string, min: number): string {
  const [h, m] = start.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function todayJST(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function clean(s: string): string {
  return s.replace(/[\s　]+/g, " ").trim();
}

/** 併映・短編集の作品名をまとめる。4本以上は「ほかN本」 */
export function joinTitles(titles: string[]): string {
  if (titles.length <= 3) return titles.join(" / ");
  return `${titles.slice(0, 3).join(" / ")} ほか${titles.length - 3}本`;
}

/**
 * 館のページの文章から監督を拾う。作品名が出てくる行のすぐ後ろ(数行以内)にある
 * 「監督：○○」「監督・脚本：○○」を、その作品の監督とする。見つかったものは上書きしない。
 */
export function directorsFromText(list: Screening[], lines: string[], within = 8): void {
  const flat = (s: string) =>
    z2h(s)
      .replace(/^\s*\d{1,2}[.．、]\s*/, "") // 「1.『破れ太鼓』」の番号
      .replace(/[\s　『』「」]/g, "");
  const keyOf = (t: string) => flat(t.replace(/【[^】]*】|＜[^＞]*＞|［[^］]*］|[（(][^）)]*[）)]|🎥.*$|\s+\d+K.*$/g, ""));
  const keys = new Set(list.map((s) => keyOf(s.title)).filter((k) => k.length >= 1));
  // 題名だけの行(年や上映時間が後ろに付く程度まで)を見出しとみなす
  const isHead = (l: string, key: string) => l === key || (l.startsWith(key) && l.length <= key.length + 16);
  const flats = lines.map(flat);
  const found = new Map<string, string | undefined>();
  for (const s of list) {
    if (s.director) continue;
    if (!found.has(s.title)) {
      const key = keyOf(s.title);
      let dir: string | undefined;
      const DIR = /監督(?:[・\/／][^：:\n]{1,15})?\s*[：:]\s*(.+)$/;
      if (key.length >= 1) {
        // 1) 「題名（1955・米/106分）監督：○○ 出演：…」のように同じ行にあるもの
        for (let i = 0; i < lines.length && !dir; i++) {
          if (!flats[i].startsWith(key)) continue;
          const m = DIR.exec(z2h(lines[i]));
          if (m) dir = personName(m[1]);
        }
        // 2) 題名の行の数行下にあるもの
        for (let i = 0; i < lines.length && !dir; i++) {
          if (!isHead(flats[i], key)) continue;
          for (let j = i + 1; j < Math.min(lines.length, i + within) && !dir; j++) {
            // 別の作品の題名で始まる行まで来たら、そこから先は別の作品の情報
            if ([...keys].some((k) => k !== key && !key.startsWith(k) && flats[j].startsWith(k))) break;
            const l = z2h(lines[j]);
            const m = DIR.exec(l) ?? /^■?監督(?:・\S{1,10})?\s+(\S.*)$/.exec(l); // 「■監督・脚本 ジャファル・パナヒ」
            if (m) dir = personName(m[1]);
            // 「監督」の行の次の行に名前(神保町シアター)
            else if (/^■?監督(?:・\S{1,10})?$/.test(l) && lines[j + 1]) dir = personName(z2h(lines[j + 1]));
          }
        }
      }
      found.set(s.title, dir);
    }
    const d = found.get(s.title);
    if (d) s.director = d;
  }
}

/** 「ヨン・サンホ『新感染』」「濱口竜介 出演：…」→ 名前だけ。複数は「、」区切り */
function personName(s: string): string | undefined {
  const name = s
    .split(/[『「（(]|\s*[／\/|｜]?\s*(?:出演|共演|声の出演|声|脚本|撮影|原作|音楽|製作|主演)\s*[:：]|\s(?:出演|脚本|撮影|原作|音楽|製作)/)[0]
    .replace(/[、,・]\s*$/, "")
    .trim();
  if (!name || name.length > 40) return undefined;
  return name.split(/\s*[、,]\s*|\s+[&＆]\s+/).filter(Boolean).join("、");
}
