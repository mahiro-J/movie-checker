import * as cheerio from "cheerio";
import { fetchText, htmlToLines, z2h, ymd, plusMinutes, joinTitles, type Theater, type Screening } from "../lib.ts";

// アンスティチュ・フランセのイベント一覧(WordPress API)から「映画」×「東京」の最近のものを取り、
// 会場が東京日仏学院のページだけ読む。ページ内は
// 「作品名 原題」→「（1958年／エジプト／…／77分）」→ … →「上映日時：」→「10.26 (月) 19:00 トークあり」
const API = "https://culture.institutfrancais.jp/wp-json/wp/v2/event?event-taxonomy=20&event-host=39&per_page=10&_fields=link";

export const institut: Theater = {
  id: "institut",
  name: "東京日仏学院",
  area: "飯田橋",
  url: "https://culture.institutfrancais.jp/event?taxonomy=cinema&host=tokyo",
  async scrape({ today }) {
    const out: Screening[] = [];
    for (const link of await eventLinks()) out.push(...parseEvent(htmlToLines(await fetchText(link)).map(z2h), today));
    return out.filter((s) => s.date >= today);
  },
};

// API は GitHub のサーバーからだと拒否される(403)ので、そのときは一覧ページのリンクを拾う
async function eventLinks(): Promise<string[]> {
  try {
    return (JSON.parse(await fetchText(API)) as { link: string }[]).map((e) => e.link);
  } catch {
    const list = "https://culture.institutfrancais.jp/event?taxonomy=cinema&host=tokyo";
    const $ = cheerio.load(await fetchText(list));
    const links = new Set<string>();
    $("a[href]").each((_, a) => {
      const u = new URL($(a).attr("href")!, list);
      if (/^\/event\/[^/]+$/.test(u.pathname) && !u.pathname.startsWith("/event/page")) links.add(u.origin + u.pathname);
    });
    return [...links].slice(0, 15);
  }
}

const INFO = /^[（(].*\d{4}年.*\d+分/; // 「（1958年／…／77分）」
const SHOW = /^(\d{1,2})\.(\d{1,2})\s*[（(].[）)]\s*(\d{1,2}:\d{2})\s*(.*)$/;

/** 「短い出会い Короткие встречи」→「短い出会い」(後ろの原題を落とす) */
function jaTitle(l: string): string {
  const s = l.replace(/\s+[A-Za-zÀ-ÿА-Яа-яЁё0-9’'«»"!?.,:&\-–\s]+$/, "").trim();
  return /[ぁ-んァ-ヶ一-龠]/.test(s) ? s : l;
}

function parseEvent(lines: string[], today: string): Screening[] {
  // 会場の欄に東京日仏学院とあるものだけ
  const v = lines.findIndex((l) => l === "会場" || l === "場所");
  if (v < 0 || !lines[v + 1]?.includes("東京日仏学院")) return [];
  const program = lines.find((l) => l.startsWith("トップページイベント"))?.replace("トップページイベント", "");

  const out: Screening[] = [];
  let titles: string[] = [];
  let mins: number[] = [];
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^[〈<]\s*プログラム/.test(l)) {
      titles = [];
      mins = [];
      total = 0;
    } else if (INFO.test(l) && i > 0) {
      titles.push(jaTitle(lines[i - 1]));
      mins.push(Number(/(\d+)分/.exec(l)![1]));
    } else if (/^[（(]\s*計\s*(\d+)\s*分/.test(l)) {
      total = Number(/(\d+)/.exec(l)![1]);
    } else if (/^上映日時/.test(l)) {
      const min = total || mins.reduce((a, b) => a + b, 0);
      for (let j = i + 1; j < lines.length; j++) {
        const m = SHOW.exec(lines[j]);
        if (!m) break;
        const start = m[3].padStart(5, "0");
        out.push({
          date: ymd(Number(m[1]), Number(m[2]), today),
          start,
          end: min ? plusMinutes(start, min) : undefined,
          title: joinTitles(titles),
          note: m[4].replace(/^[☆★]/, "").trim() || undefined,
          program,
        });
      }
      titles = [];
      mins = [];
      total = 0;
    }
  }
  return out.filter((s) => s.title);
}
