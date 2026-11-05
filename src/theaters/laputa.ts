import * as cheerio from "cheerio";
import { fetchText, htmlToLines, hhmm, ymd, dateRange, z2h, type Theater, type Screening } from "../lib.ts";

// トップページから特集ページを集め、特集ごとに
//  (a) sc.html(上映スケジュール表)があればそれを読む
//  (b) なければ特集ページの「9月27日（日）、29日（火）〜10月3日（土）」+ 作品名 と、
//      見出しの「朝10時30分より」「連日21時スタート」などの固定時刻を組み合わせる
const TOP = "http://www.laputa-jp.com/laputa/main/index.html";

export const laputa: Theater = {
  id: "laputa",
  name: "ラピュタ阿佐ヶ谷",
  area: "阿佐ヶ谷",
  url: TOP,
  async scrape({ today }) {
    const $ = cheerio.load(await fetchText(TOP));
    const programs = new Set<string>();
    $("a[href*='/laputa/program/']").each((_, a) => {
      const m = /(https?:\/\/[^"]*\/laputa\/program\/[^/]+\/)/.exec(new URL($(a).attr("href")!, TOP).href);
      if (m) programs.add(m[1]);
    });
    const out: Screening[] = [];
    for (const p of programs) {
      const page = await fetchText(p).catch(() => "");
      if (!page) continue;
      const lines = htmlToLines(page).map(z2h);
      const program = lines[0]?.replace(/[/／|｜]\s*ラピュタ阿佐[ケヶ]谷\s*$/, "").trim();
      const sc = await fetchText(p + "sc.html").catch(() => "");
      const list = sc ? parseTimetable(htmlToLines(sc).map(z2h), today) : parseFixedTime(lines, today);
      for (const s of list) out.push({ ...s, program });
    }
    return out;
  },
};

/** sc.html: 「10」「月」「18(日) ~20(火)」「13:30-14:14」「鳩」… */
function parseTimetable(lines: string[], today: string) {
  const res: Screening[] = [];
  let month = 0;
  let dates: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\d{1,2}$/.test(l) && lines[i + 1] === "月") {
      month = +l;
      continue;
    }
    const dm = /^(?:(\d{1,2})月)?(\d{1,2})\([^)]*\)\s*(?:~\s*(?:(\d{1,2})月)?(\d{1,2})\([^)]*\))?$/.exec(l);
    if (dm && month) {
      if (dm[1]) month = +dm[1];
      const from = ymd(month, +dm[2], today);
      let endMonth = dm[3] ? +dm[3] : month;
      if (dm[4] && +dm[4] < +dm[2] && !dm[3]) endMonth = (month % 12) + 1;
      dates = dm[4] ? dateRange(from, ymd(endMonth, +dm[4], today)) : [from];
      continue;
    }
    const tm = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(l);
    if (tm && dates.length && lines[i + 1]) {
      for (const date of dates) res.push({ date, start: hhmm(tm[1]), end: hhmm(tm[2]), title: lines[i + 1] });
    }
  }
  return res;
}

/** モーニングショー/レイトショー型: 作品ごとの上映日 + 見出しの固定時刻 */
function parseFixedTime(lines: string[], today: string) {
  const head = lines.slice(0, 8).join(" ");
  const tm = /(\d{1,2})時(?:(\d{1,2})分)?/.exec(head) || /(\d{1,2}):(\d{2})より/.exec(head);
  if (!tm) return [];
  const start = hhmm(`${tm[1]}:${tm[2] ?? "00"}`);
  // 休館日
  const closed = new Set<string>();
  for (const l of lines.filter((x) => /休館/.test(x))) for (const d of parseJpDates(l, today)) closed.add(d);
  const res: Screening[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\d{1,2}月\d{1,2}日/.test(lines[i]) || /休館|〜.*\d{4}年/.test(lines[i])) continue;
    const title = lines[i + 1];
    if (!title || /^\d{4}年/.test(title)) continue;
    for (const date of parseJpDates(lines[i], today)) if (!closed.has(date)) res.push({ date, start, title });
  }
  return res;
}

/** 「9月27日（日）、29日（火）〜10月3日（土）」→ 日付の一覧 */
function parseJpDates(text: string, today: string): string[] {
  const s = text.replace(/[（(][^）)]*[）)]/g, "");
  const out: string[] = [];
  let month = 0;
  let prev = "";
  let pendingRange = false;
  for (const m of s.matchAll(/(?:(\d{1,2})月)?(\d{1,2})日|([~、,])/g)) {
    if (m[3]) {
      if (m[3] === "~") pendingRange = true;
      continue;
    }
    if (m[1]) month = +m[1];
    if (!month) continue;
    const d = ymd(month, +m[2], today);
    if (pendingRange && prev) out.push(...dateRange(prev, d).slice(1));
    else out.push(d);
    pendingRange = false;
    prev = d;
  }
  return out;
}
