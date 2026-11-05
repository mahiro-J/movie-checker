import { fetchDom, hhmm, ymd, clean, type Theater, type Screening } from "../lib.ts";

export const imageforum: Theater = {
  id: "imageforum",
  name: "シアター・イメージフォーラム",
  area: "渋谷",
  url: "https://www.imageforum.co.jp/theatre/schedule/",
  async scrape({ today }) {
    const $ = await fetchDom("https://www.imageforum.co.jp/theatre/schedule/");
    const out: Screening[] = [];
    $(".schedule-day-box").each((_, box) => {
      const dm = /(\d{1,2})\/(\d{1,2})/.exec($(box).find("h2").first().text());
      if (!dm) return;
      const date = ymd(+dm[1], +dm[2], today);
      $(box)
        .find("table")
        .each((_, tbl) => {
          const screen = ($(tbl).find("caption img").attr("alt") || "").replace(/（.*$/, "") || undefined;
          $(tbl)
            .find("td.schebox")
            .each((_, td) => {
              const t = clean($(td).find("div").first().text());
              if (!/\d+:\d+/.test(t)) return;
              // 「邦題　English Title」の英語部分は落とす
              const full = clean($(td).find("p").first().text());
              const title = full.replace(/ [A-Za-z0-9][\x20-\x7EÀ-ɏ’“”–]*$/, "");
              const spans = $(td).find("span").map((_, s) => clean($(s).text())).get();
              const end = spans.find((s) => /^〜\s*\d/.test(s));
              const note =
                spans
                  .filter((s) => s !== end)
                  .join(" ")
                  .replace(/[／/]?\s*※?予告編.*$/, "")
                  .trim() || undefined;
              out.push({ date, start: hhmm(t), end: end ? hhmm(end) : undefined, title, screen, note });
            });
        });
    });
    return out;
  },
};
