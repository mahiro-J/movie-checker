import * as cheerio from "cheerio";
import { fetchText, hhmm, clean, type Theater, type Screening } from "../lib.ts";

// https は繋がらないので http で取る。日付見出し(h3)ごとに、スクリーン別の表
export const eurospace: Theater = {
  id: "eurospace",
  name: "ユーロスペース",
  area: "渋谷",
  url: "http://www.eurospace.co.jp/schedule/",
  async scrape() {
    const $ = cheerio.load(await fetchText("http://www.eurospace.co.jp/schedule/"));
    const out: Screening[] = [];
    $("article").each((_, art) => {
      const dm = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec($(art).find("h3").first().text());
      if (!dm) return;
      const date = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
      $(art)
        .find("div.scrolltable")
        .each((_, wrap) => {
          // 表の直前にある「スクリーン1」の文字
          const prev = wrap.prev;
          const screen = prev && prev.type === "text" ? /スクリーン\d/.exec(prev.data)?.[0] : undefined;
          const tbl = $(wrap).find("table");
          const times = tbl.find("tr.time td").map((_, td) => clean($(td).text())).get();
          tbl
            .find("tr")
            .not(".time")
            .first()
            .find("td")
            .each((i, td) => {
              if (!times[i] || !/\d+:\d+/.test(times[i])) return;
              const parts = ($(td).html() ?? "").split(/<br\s*\/?>/i).map((p) => clean(cheerio.load(p).text()));
              const title = parts[0];
              const endPart = parts.find((p) => /^〜/.test(p));
              const note = parts.slice(1).filter((p) => p && p !== endPart && !/^※予告/.test(p)).join(" ") || undefined;
              out.push({ date, start: hhmm(times[i]), end: endPart ? hhmm(endPart) : undefined, title, screen, note });
            });
        });
    });
    return out;
  },
};
