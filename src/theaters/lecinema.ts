import * as cheerio from "cheerio";
import { fetchText, hhmm, clean, type Theater, type Screening } from "../lib.ts";

// Bunkamura のチケット購入ページ。表示できる日(3日ほど)を1日ずつ開く
const BASE = "https://ticket.bunkamura.co.jp/ticket/ProgramDetailCinema";

export const lecinema: Theater = {
  id: "lecinema",
  name: "Bunkamuraル・シネマ渋谷宮下",
  area: "渋谷",
  url: "https://www.bunkamura.co.jp/cinema_miyashita/",
  async scrape() {
    const first = cheerio.load(await fetchText(`${BASE}/index`));
    const days = [...new Set(first("[id=calLink]").map((_, e) => first(e).attr("val")).get())].filter(Boolean) as string[];
    const out: Screening[] = [];
    for (const v of days) {
      const $ = cheerio.load(await fetchText(`${BASE}/calclick/${v}`));
      const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
      $("h4.schedule-header").each((_, h) => {
        const raw = clean($(h).find(".cinema-title").text());
        // 「トリコロール/赤の愛＜キェシロフスキ没後30年＞」→ 作品名と特集名に分ける
        const pm = /^(.+?)＜(.+)＞$/.exec(raw);
        const title = pm ? pm[1] : raw;
        $(h)
          .nextAll("table.schedule-table")
          .first()
          .find("td")
          .each((_, td) => {
            const st = clean($(td).find(".start-time").text());
            if (!st) return;
            const text = clean($(td).text());
            const em = /〜\s*(\d{1,2}:\d{2})/.exec(text);
            const fl = /渋谷宮下\s*(\d+F)/.exec(text);
            out.push({ date, start: hhmm(st), end: em ? hhmm(em[1]) : undefined, title, program: pm?.[2], screen: fl?.[1] });
          });
      });
    }
    return out;
  },
};
