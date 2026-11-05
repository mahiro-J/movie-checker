import { fetchDom, hhmm, ymd, plusMinutes, clean, type Theater, type Screening } from "../lib.ts";

// トップページのカレンダー: 日付タブ(button) と対応するパネルに会場・特集・上映回
export const nfaj: Theater = {
  id: "nfaj",
  name: "国立映画アーカイブ",
  area: "京橋",
  url: "https://www.nfaj.go.jp/calendar/",
  async scrape({ today }) {
    const $ = await fetchDom("https://www.nfaj.go.jp/");
    const out: Screening[] = [];
    $("#calendar button[role=tab]").each((_, btn) => {
      const dm = /(\d{1,2})\/(\d{1,2})/.exec($(btn).text());
      const panelId = $(btn).attr("aria-controls");
      if (!dm || !panelId) return;
      const date = ymd(+dm[1], +dm[2], today);
      $(`#${panelId} .film`).each((_, film) => {
        const screen = clean($(film).find("h2").first().text()) || undefined;
        const program = clean($(film).find("h3").first().text()) || undefined;
        $(film)
          .find("li")
          .each((_, li) => {
            const t = $(li).find("time").attr("datetime") || clean($(li).find("time").text());
            if (!t || !/\d+:\d+/.test(t)) return;
            const title = clean($(li).find("a").not(".ticket").first().text());
            const rest = clean($(li).text().replace(t, "").replace(title, ""));
            const rm = /計?(\d+)分/.exec(rest);
            const start = hhmm(t);
            out.push({ date, start, end: rm ? plusMinutes(start, +rm[1]) : undefined, title, note: rest || undefined, screen, program });
          });
      });
    });
    return out;
  },
};
