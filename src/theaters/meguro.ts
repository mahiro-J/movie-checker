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
        let title = lines[i - 1];
        // 題名が2行に分かれることがある:「ゴッドファーザー」+「＜最終章＞：…」、「…PARTⅡ 4K」+「4Kレストア」
        const prev = lines[i - 2] ?? "";
        if (/^(\d+K\S*|デジタルリマスター\S*)$/.test(title)) title = prev;
        else if (/^[＜<〈：:]/.test(title) && !/^※|^\d{1,2}月|～/.test(prev)) title = prev + title;
        title = title.replace(/\s+・/g, "・").replace(/ ・ /g, "・");
        out.push({ date, start: hhmm(tm[1]), end: hhmm(tm[2]), title, program });
      }
    }
    // 作品紹介の「♪『マザー』(1982年/アメリカ/101分/…)」から製作年を取る(監督を調べるときに同名作品と見分ける)
    const years = new Map<string, number>();
    for (const l of lines) for (const m of l.matchAll(/『(.+?)』\s*[(（](\d{4})年/g)) years.set(m[1].replace(/\s+/g, ""), +m[2]);
    for (const s of out) {
      const k = s.title.replace(/\s+/g, "");
      s.year = years.get(k) ?? [...years].find(([full]) => full.endsWith(k) || full.startsWith(k))?.[1];
    }
    return out;
  },
};
