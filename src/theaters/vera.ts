import { fetchDom, hhmm, ymd, plusMinutes, clean, type Theater, type Screening } from "../lib.ts";

// schedule.html の table.pctime。各行が1日、セルに時刻と「作品名(103分)」
export const vera: Theater = {
  id: "vera",
  name: "シネマヴェーラ渋谷",
  area: "渋谷",
  url: "http://www.cinemavera.com/schedule.html",
  async scrape({ today }) {
    const $ = await fetchDom(this.url);
    const program = clean($(".programs .subject h2").first().text()) || undefined;
    const out: Screening[] = [];
    let month = 0;
    $("table.pctime tr").each((_, tr) => {
      // 「11/1」のあとは「2」「3」と日だけになる
      const dm = /^(?:(\d{1,2})\/)?(\d{1,2})$/.exec(clean($(tr).find("li.day").text()));
      if (!dm) return;
      if (dm[1]) month = +dm[1];
      if (!month) return;
      const date = ymd(month, +dm[2], today);
      $(tr)
        .find("ul")
        .each((_, ul) => {
          const t = clean($(ul).find("li.time").text());
          const f = clean($(ul).find("li.film").text());
          if (!/\d+:\d+/.test(t) || !f) return;
          const rm = /[(（](\d+)分[)）]\s*$/.exec(f);
          const start = hhmm(t);
          out.push({ date, start, end: rm ? plusMinutes(start, +rm[1]) : undefined, title: f.replace(/[(（]\d+分[)）]\s*$/, ""), program });
        });
    });
    return out;
  },
};
