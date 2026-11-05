import { fetchDom, hhmm, ymd, dateRange, clean, type Theater, type Screening } from "../lib.ts";

// 表の見出しが「10/31(土)～11/6(金)」や「11/14(土)」、行が作品、セルが上映時刻
export const waseda: Theater = {
  id: "waseda",
  name: "早稲田松竹",
  area: "高田馬場",
  url: "http://wasedashochiku.co.jp/",
  async scrape({ today }) {
    const $ = await fetchDom("http://wasedashochiku.co.jp/");
    const out: Screening[] = [];
    $("table.top-schedule-area").each((_, tbl) => {
      const head = $(tbl).find("thead").text();
      const ds = [...head.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map((m) => ymd(+m[1], +m[2], today));
      if (!ds.length) return;
      const dates = ds.length >= 2 ? dateRange(ds[0], ds[1]) : ds;
      $(tbl)
        .find("tr.schedule-item")
        .each((_, tr) => {
          let title = clean($(tr).find("th").text());
          let program: string | undefined;
          const pm = /^【(.+?)】(.+)$/.exec(title);
          if (pm) [program, title] = [pm[1], pm[2]];
          $(tr)
            .find("td")
            .each((_, td) => {
              const sub = $(td).find("sub");
              const subText = clean(sub.text());
              sub.remove();
              const t = clean($(td).text());
              if (!/\d+:\d+/.test(t)) return;
              const em = /～\s*(\d+:\d+)/.exec(subText);
              const note = clean(subText.replace(/～\s*\d+:\d+/, "")) || undefined;
              for (const date of dates) out.push({ date, start: hhmm(t), end: em ? hhmm(em[1]) : undefined, title, program, note });
            });
        });
    });
    return out;
  },
};
