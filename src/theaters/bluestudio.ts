import { fetchText, htmlToLines, hhmm, dateRange, z2h, type Theater, type Screening } from "../lib.ts";

// 「作品名」→「上映期間：2026/11/4（水）～2026/11/17（火）」→「13：00/16：00/19：00」
export const bluestudio: Theater = {
  id: "bluestudio",
  name: "シネマ・ブルースタジオ",
  area: "北千住",
  url: "https://www.art-center.jp/tokyo/bluestudio/schedule.html",
  async scrape() {
    const lines = htmlToLines(await fetchText("https://www.art-center.jp/tokyo/bluestudio/schedule.html")).map(z2h);
    const out: Screening[] = [];
    for (let i = 0; i < lines.length; i++) {
      const pm = /上映期間:\s*(\d{4})\/(\d{1,2})\/(\d{1,2}).*?~\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(lines[i]);
      if (!pm) continue;
      // 作品名は上映期間より前の、※で始まらない一番近い行
      let j = i - 1;
      while (j > 0 && /^※/.test(lines[j])) j--;
      const title = lines[j];
      const note = lines.slice(j + 1, i).find((l) => /mm|フィルム/.test(l))?.replace(/^※/, "");
      const p = (y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      const dates = dateRange(p(pm[1], pm[2], pm[3]), p(pm[4], pm[5], pm[6]));
      // 期間の後ろ数行から時刻の並びを探す
      const timeLine = lines.slice(i + 1, i + 4).find((l) => /^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})*$/.test(l));
      if (!timeLine) continue;
      for (const d of dates) for (const t of timeLine.split("/")) out.push({ date: d, start: hhmm(t), title, note });
    }
    return out;
  },
};
