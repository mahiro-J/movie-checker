import { fetchText, htmlToLines, hhmm, ymd, type Theater, type Screening } from "../lib.ts";

// テキストで「11月5日(木)」→ 作品名 → 「9:00 ～ 終映10:20」 の順に並んでいる
export const meguro: Theater = {
  id: "meguro",
  name: "目黒シネマ",
  area: "目黒",
  url: "http://www.okura-movie.co.jp/meguro_cinema/now_showing.html",
  async scrape({ today }) {
    const lines = htmlToLines(await fetchText(this.url));
    const out: Screening[] = [];
    let date = "";
    let program: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const pm = /^【(.+)】$/.exec(l);
      if (pm) program = pm[1];
      const dm = /^(\d{1,2})月(\d{1,2})日\s*\(/.exec(l);
      if (dm) {
        date = ymd(+dm[1], +dm[2], today);
        continue;
      }
      const tm = /^(\d{1,2}:\d{2})\s*～\s*終映\s*(\d{1,2}:\d{2})/.exec(l);
      if (tm && date) {
        const title = lines[i - 1].replace(/\s+・/g, "・").replace(/ ・ /g, "・");
        out.push({ date, start: hhmm(tm[1]), end: hhmm(tm[2]), title, program });
      }
    }
    return out;
  },
};
