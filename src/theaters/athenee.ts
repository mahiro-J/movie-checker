import { fetchText, htmlToLines, z2h, plusMinutes, joinTitles, type Theater, type Screening } from "../lib.ts";
import * as cheerio from "cheerio";

// トップページに並ぶ特集ページを1つずつ開き、「■上映スケジュール」の欄を読む。
// 欄の中は「11月17日（火）」→「13:15」→「『作品名』［35分］」…の並び
const TOP = "https://athenee.net/culturalcenter/";

export const athenee: Theater = {
  id: "athenee",
  name: "アテネ・フランセ文化センター",
  area: "御茶ノ水",
  url: "https://athenee.net/culturalcenter/schedule/schedule.html",
  async scrape({ today }) {
    const $ = cheerio.load(await fetchText(TOP));
    const pages = new Set<string>();
    $("a[href*='program/']").each((_, a) => {
      pages.add(new URL($(a).attr("href")!, TOP).href.replace("://www.", "://"));
    });
    const out: Screening[] = [];
    for (const url of pages) out.push(...parseProgram(htmlToLines(await fetchText(url)).map(z2h)));
    return out.filter((s) => s.date >= today);
  },
};

const BRACKET = /［[^］]*］?/g; // ［35分］［120分（予定）］［8分） など
const SKIP = /^(トーク|特別講義|シンポジウム|講演|講座|上映前)/;

function parseProgram(lines: string[]): Screening[] {
  const program = lines[0];
  const ym = lines.map((l) => /(\d{4})年(\d{1,2})月/.exec(l)).find(Boolean);
  if (!ym) return [];
  const startYear = Number(ym[1]);
  const startMonth = Number(ym[2]);

  const begin = lines.findIndex((l) => /^■.*上映スケジュール/.test(l));
  if (begin < 0) return [];
  let end = lines.findIndex((l, i) => i > begin && /^■/.test(l));
  if (end < 0) end = lines.length;
  const sec = lines.slice(begin + 1, end);

  const isDate = (l: string) => /^(\d{1,2})月(\d{1,2})日/.exec(l);
  const isTime = (l: string) => /^(\d{1,2}:\d{2})$/.exec(l);

  const out: Screening[] = [];
  let date = "";
  for (let i = 0; i < sec.length; i++) {
    const d = isDate(sec[i]);
    if (d) {
      const m = Number(d[1]);
      const y = m < startMonth ? startYear + 1 : startYear;
      date = `${y}-${String(m).padStart(2, "0")}-${d[2].padStart(2, "0")}`;
      continue;
    }
    const t = isTime(sec[i]);
    if (!t || !date) continue;
    // 次の時刻・日付・注意書きまでがこの回の中身
    const block: string[] = [];
    for (let j = i + 1; j < sec.length && !isTime(sec[j]) && !isDate(sec[j]) && !/^[＊※*]/.test(sec[j]); j++) block.push(sec[j]);
    if (!block.length || SKIP.test(block[0])) continue;

    const filmLines = block.filter((l) => l.startsWith("『"));
    const films = filmLines.flatMap((l) => [...l.matchAll(/『(.+?)』/g)].map((m) => m[1]));
    const first = block[0].replace(BRACKET, "").trim();
    const title = first.startsWith("『") || /^プログラム/.test(first) ? joinTitles(films) || first : first;

    const total = block.map((l) => /計(\d+)分/.exec(l)).find(Boolean);
    const sum = filmLines.flatMap((l) => [...l.matchAll(/［(\d+)分/g)]).reduce((a, m) => a + Number(m[1]), 0);
    const min = total ? Number(total[1]) : sum;

    const notes: string[] = [];
    const extra = block[0].startsWith("『") ? block[0].replace(/『.*』/, "").replace(BRACKET, "").replace(/\+$/, "").trim() : "";
    if (extra) notes.push(extra);
    const talk = block.find((l) => SKIP.test(l));
    if (talk) notes.push(talk.replace(/[:：].*$/, "") + "あり");

    out.push({
      date,
      start: t[1].padStart(5, "0"),
      end: min ? plusMinutes(t[1].padStart(5, "0"), min) : undefined,
      title,
      note: notes.join("・") || undefined,
      program,
    });
  }
  return out;
}
