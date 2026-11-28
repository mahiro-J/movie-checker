// 監督名を埋める。館のデータに監督がない上映は、映画.com で作品名を検索して調べる。
// 調べた結果は data/directors.json に保存し、同じ作品は二度調べない(見つからなかった作品は7日後に再挑戦)。
import fs from "node:fs";
import * as cheerio from "cheerio";
import { fetchText, type Screening } from "./lib.ts";

const CACHE = "data/directors.json";
type Entry = { director: string | null; id?: string; checked: string };
type Cache = Record<string, Entry>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 検索用に作品名から飾りを外す: 【名画座】、＜特集名＞、4Kレストア版、🎥35mm、（原題）など */
export function cleanTitle(t: string): string {
  return t
    .replace(/[０-９Ａ-Ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/^【[^】]*】|【[^】]*】$|(?:^|\s)[＜<〈《][^＞>〉》]*[＞>〉》]|［[^］]*］/g, " ")
    .replace(/🎥.*$/, "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+ほか\d+本$/, "")
    .replace(/[\s　]+(\d+K|リストア|リマスター|レストア|デジタル|ディレクターズ|完全版|特別版|公開\d+周年|字幕版|吹替版|IMAX).*$/, "")
    .replace(/\s*(\d+K)?(デジタル)?(リマスター|レストア|修復|リストア)版?$/, "")
    .replace(/[\s　]+/g, " ")
    .trim();
}

/** 比較用: 空白・記号・全角半角の違いをなくす */
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[（(]\d{4}[）)]$/, "")
    .replace(/[\s・･:：!！?？、。,.『』「」〜~\-－―'’"“”＜＞<>〈〉]/g, "") // 長音「ー」は残す(マザー と マザ は別)
    .toLowerCase();
}

/** 2本立てなどを1本ずつに分ける */
function parts(title: string): string[] {
  return title
    .split(/\s+\/\s+|＋|\s\+\s|(?<=\S)\+(?=\S)/)
    .map(cleanTitle)
    .filter((p) => p.length >= 1 && !/^(ゲスト|トーク|交流会|舞台挨拶)/.test(p));
}

type Movie = { id: string; directors: string[]; min?: number; year?: number };

async function movie(id: string, name = ""): Promise<Movie> {
  const $ = cheerio.load(await fetchText(`https://eiga.com/movie/${id}/`));
  let directors: string[] = [];
  $("script[type='application/ld+json']").each((_, s) => {
    try {
      const j = JSON.parse($(s).html() || "");
      for (const o of Array.isArray(j) ? j : [j]) {
        if (o["@type"] === "Movie" && o.director) {
          directors = (Array.isArray(o.director) ? o.director : [o.director]).map((p: { name: string }) => p.name);
        }
      }
    } catch {}
  });
  const data = $("p.data").first().text();
  const min = Number(/(\d+)分/.exec(data)?.[1]) || undefined;
  const year = Number(/(\d{4})年製作/.exec(data)?.[1]) || undefined;
  // 製作年が書いてなければ「マザー（1982）」のような題名から
  return { id, directors, min, year: year ?? (Number(/[（(](\d{4})[）)]$/.exec(name)?.[1]) || undefined) };
}

/**
 * 候補から1本選ぶ。
 * 1) 上映枠の長さと本編の長さが合わない候補(同名の別作品)は捨てる
 * 2) 監督名が番組名(「映画の匠 野村芳太郎」など)に入っている候補を優先
 * 3) 上映枠の長さに一番近いもの。わからなければ先に見つかった順(映画.com の人気順)
 */
function pick(movies: Movie[], duration?: number, hint?: string, year?: number): Movie | null {
  let ms = movies.filter((m) => m.directors.length);
  // 上映枠が本編より短いのはありえない。長い分はトークや休憩(最大1時間程度)
  if (duration) ms = ms.filter((m) => !m.min || (duration - m.min >= -5 && duration - m.min <= Math.max(60, m.min * 0.3)));
  if (!ms.length) return null;
  const h = hint ? norm(hint) : "";
  const inHint = (m: Movie) => !!h && m.directors.some((d) => norm(d).length >= 2 && h.includes(norm(d)));
  // 館が製作年を書いていれば、それが合う候補を最優先
  const yearOk = (m: Movie) => !!year && !!m.year && Math.abs(m.year - year) <= 1;
  const score = (m: Movie) => (yearOk(m) ? -2000 : 0) + (inHint(m) ? -1000 : 0) + (duration && m.min ? Math.abs(duration - m.min - 5) : 500);
  return [...ms].sort((a, b) => score(a) - score(b))[0];
}

function matchesHint(m: Movie, hint?: string): boolean {
  if (!hint) return true;
  const h = norm(hint);
  return m.directors.some((d) => norm(d).length >= 2 && h.includes(norm(d)));
}

/** 映画.com で作品名を検索し、題名が一致する候補(最大4本)の作品ページを読む */
async function eigaCands(title: string): Promise<Movie[]> {
  const q = norm(title);
  const cands: { id: string; name: string }[] = [];
  let hits: typeof cands = [];
  // 検索結果は人気順で部分一致も混ざるので、『嘘』のような短い題名は4ページ目まで見る
  const maxPage = q.length <= 4 ? 4 : 1;
  for (let page = 1; page <= maxPage; page++) {
    if (page > 1) await sleep(300);
    const url = `https://eiga.com/search/${encodeURIComponent(title)}/movie/${page > 1 ? `${page}/` : ""}`;
    const $ = cheerio.load(await fetchText(url));
    const before = cands.length;
    $("a[href^='/movie/'] p.title").each((_, p) => {
      const id = /\/movie\/(\d+)\//.exec($(p).closest("a").attr("href") || "")?.[1];
      if (id && !cands.some((c) => c.id === id)) cands.push({ id, name: $(p).text().trim() });
    });
    if (cands.length === before) break;
    hits = cands.filter((c) => norm(c.name) === q);
  }
  // 館のデータで題名が途中で切れている(前方一致)、または短く書かれている(後方一致)ことがある。
  // どちらも候補が1件だけのときに限って使う
  if (!hits.length && q.length >= 3) {
    const pre = cands.filter((c) => q.length >= 4 && norm(c.name).startsWith(q));
    const suf = cands.filter((c) => norm(c.name).endsWith(q));
    if (pre.length === 1) hits = pre;
    else if (suf.length === 1) hits = suf;
  }
  const movies: Movie[] = [];
  for (const h of hits.slice(0, q.length <= 4 ? 8 : 4)) {
    await sleep(300);
    const m = await movie(h.id, h.name);
    if (m.directors.length) movies.push(m);
  }
  return movies;
}

// --- Wikipedia(日本語版)。映画.com にない古い作品や、短い題名で検索が埋もれる作品用 ---
const WIKI = "https://ja.wikipedia.org/w/api.php";
const WIKI_UA = { "User-Agent": "movie-checker/0.1 (https://github.com/mahiro-J/movie-checker)" };

async function wikiJson(params: Record<string, string>): Promise<any> {
  const res = await fetch(`${WIKI}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`, { headers: WIKI_UA });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return res.json();
}

/** 基礎情報テンプレートの値を読める形に: [[A|B]]→B、{{仮リンク|名前|…}}→名前、<br />→、 */
function wikiText(v: string): string {
  return v
    .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>/g, "")
    .replace(/\{\{(?:仮リンク|ill2?|lang\|[a-z-]+)\|([^|}]+)[^}]*\}\}/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?>|\n\*|、/g, "、")
    .replace(/<[^>]+>|'''?/g, "")
    .split(/、|\n/)
    .map((s) => s.replace(/[（(][^）)]*[）)]/g, "").trim())
    .filter(Boolean)
    .join("、");
}

/** Wikipedia で「世界 (映画)」「事件 (1978年の映画)」のような記事を探す。題名そのままの記事も候補に入れる */
async function wikiCands(title: string): Promise<Movie[]> {
  const ps = await wikiJson({ action: "query", list: "prefixsearch", pssearch: `${title} (`, pslimit: "15" });
  const q = norm(title);
  const names: string[] = [title, ...(ps.query?.prefixsearch ?? []).map((p: { title: string }) => p.title)].filter(
    (t: string, i, a) => a.indexOf(t) === i && norm(t.replace(/\s*\([^)]*\)$/, "")) === q,
  );
  if (!names.length) return [];
  const pages = await wikiJson({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: names.slice(0, 6).join("|") });
  let movies: Movie[] = [];
  for (const p of pages.query?.pages ?? []) {
    const full: string = p.revisions?.[0]?.slots?.main?.content ?? "";
    // 映画の基礎情報(Infobox Film)の部分だけを見る。小説の記事の途中に映画版の情報があることもある
    const at = full.search(/\{\{\s*(Infobox Film|基礎情報 映画)/i);
    if (at < 0) continue;
    const src = full.slice(at, at + 4000);
    const field = (k: string) => new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n]*(?:\\n\\*[^\\n]*)*)`).exec(src)?.[1];
    const dir = field("監督");
    if (!dir) continue;
    const directors = wikiText(dir).split("、").filter(Boolean);
    if (!directors.length) continue;
    const min = Number(/(\d+)\s*分/.exec(field("上映時間") ?? "")?.[1]) || undefined;
    const year = Number(/\((\d{4})年/.exec(p.title)?.[1] ?? /(\d{4})年/.exec(field("公開") ?? "")?.[1]) || undefined;
    movies.push({ id: "wiki:" + p.title, directors, min, year });
  }
  return movies;
}

/** 番組名が「○○監督特集」「○○監督傑作選」なら○○を監督とみなす(最後の手段) */
function fromProgram(program?: string): string | undefined {
  const m = /([^\s　「『【]+?)\s*監督(?:特集|傑作選|作品選|レトロスペクティ)/.exec(program ?? "");
  return m?.[1];
}

/** 映画.com → Wikipedia の順に探す。だめなら副題を外したもの、「／」で区切ったものも試す */
async function resolve(title: string, duration?: number, hint?: string, year?: number): Promise<Movie | null> {
  const variants = [
    title,
    title.replace(/\s*[-－‐~〜][^-－‐~〜]+[-－‐~〜]$/, "").trim(), // 「顔 -かお-」→「顔」
    title.replace(/(\s+[A-Za-z0-9'’&!?.,:-]+)+$/, "").trim(), // 「プリズン・サークル PRISON CIRCLE」→「プリズン・サークル」
  ];
  for (const v of [...new Set(variants)].filter(Boolean)) {
    await sleep(300);
    const e = await eigaCands(v);
    const m = pick(e, duration, hint, year);
    // 番組名と監督が合っていれば確定。合わないときは Wikipedia の候補も合わせて選び直す
    if (m && matchesHint(m, hint) && (!year || m.year === undefined || Math.abs(m.year - year) <= 1)) return m;
    const all = pick([...e, ...(await wikiCands(v))], duration, hint, year);
    if (all) return all;
  }
  if (/／/.test(title)) {
    // 「ラーメン／遊泳禁止区域／先輩の女」のような短編の組み合わせ
    const found: string[] = [];
    for (const sub of title.split("／").map((x) => x.trim()).filter(Boolean)) {
      const m = await resolve(sub);
      if (m) for (const d of m.directors) if (!found.includes(d)) found.push(d);
    }
    if (found.length) return { id: "parts", directors: found };
  }
  return null;
}

function minutes(s: Screening): number | undefined {
  if (!s.end) return undefined;
  const [h1, m1] = s.start.split(":").map(Number);
  const [h2, m2] = s.end.split(":").map(Number);
  const d = h2 * 60 + m2 - (h1 * 60 + m1);
  return d > 0 ? d : undefined;
}

export async function fillDirectors(all: Screening[], today: string): Promise<void> {
  const cache: Cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const stale = (e?: Entry) => !e || (e.director === null && e.checked < addDaysStr(today, -7));
  let looked = 0;
  for (const s of all) {
    if (s.director) continue;
    const ps = parts(s.title);
    const single = ps.length === 1;
    const names: string[] = [];
    for (const p of ps) {
      // 番組名によって同名の別作品を選ぶことがあるので、番組名も含めて覚える
      const key = norm(p) + (s.year && single ? `#${s.year}` : "") + (s.program ? "@" + norm(s.program).slice(0, 40) : "");
      if (!key) continue;
      if (stale(cache[key])) {
        try {
          const m = await resolve(p, single ? minutes(s) : undefined, s.program, single ? s.year : undefined);
          cache[key] = { director: m ? m.directors.join("、") : null, id: m?.id, checked: today };
          looked++;
        } catch (e) {
          console.warn(`  監督の検索に失敗: ${p} (${e})`);
          continue;
        }
      }
      const d = cache[key]?.director;
      if (d) for (const n of d.split("、")) if (!names.includes(n)) names.push(n);
    }
    if (!names.length) {
      const p = fromProgram(s.program);
      if (p) names.push(p);
    }
    if (names.length) s.director = names.join("、");
  }

  // 最後の手段: 特集上映で、同じ番組の他の作品の監督がほぼ全部同じ人で、その名前が番組名に入っていれば、その人にする
  const byProgram = new Map<string, Screening[]>();
  for (const s of all) if (s.program) byProgram.set(s.program, [...(byProgram.get(s.program) ?? []), s]);
  for (const [program, list] of byProgram) {
    const known = [...new Set(list.filter((s) => s.director).map((s) => s.title))].map((t) => list.find((s) => s.title === t)!.director!);
    if (known.length < 2) continue;
    const count = new Map<string, number>();
    for (const d of known) count.set(d, (count.get(d) ?? 0) + 1);
    const [top, n] = [...count].sort((a, b) => b[1] - a[1])[0];
    if (n / known.length >= 0.7 && norm(program).includes(norm(top))) for (const s of list) if (!s.director) s.director = top;
  }
  // オールナイトなど題名に監督名が入っているもの(「流転する時代、ジャ・ジャンクーの眼差し」)
  const people = [...new Set(all.flatMap((s) => s.director?.split("、") ?? []))].filter((n) => norm(n).length >= 4);
  for (const s of all) {
    if (s.director) continue;
    const hit = people.find((n) => norm(s.title).includes(norm(n)));
    if (hit) s.director = hit;
  }
  fs.writeFileSync(CACHE, JSON.stringify(sortKeys(cache), null, 1));
  const miss = all.filter((s) => !s.director).length;
  console.log(`監督: 新しく${looked}作品を調べました。監督不明の回: ${miss} / ${all.length}`);
}

function addDaysStr(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

function sortKeys(c: Cache): Cache {
  return Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));
}
