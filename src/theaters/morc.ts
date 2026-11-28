import { fetchDom, plusMinutes, type Theater, type Screening } from "../lib.ts";

// Morc阿佐ヶ谷の公式スケジュールは画像だけなので、映画.com の劇場ページ(約6日分)から読む。
// 作品ごとに .movie-schedule[data-title] があり、その中の td[data-date] に時刻が並ぶ
const SRC = "https://eiga.com/theater/13/130610/3315/";

export const morc: Theater = {
  id: "morc",
  name: "Morc阿佐ヶ谷",
  area: "阿佐ヶ谷",
  url: "https://www.morc-asagaya.com/schedule/",
  async scrape() {
    const $ = await fetchDom(SRC);
    const out: Screening[] = [];
    $(".movie-schedule[data-title]").each((_, box) => {
      const $box = $(box);
      const title = $box.attr("data-title")!.replace(/　/g, " ").trim();
      const min = Number(/(\d+)分/.exec($box.parent().find(".movie-image .data").text())?.[1] ?? 0);
      const type = $box.find(".movie-type").text().trim();
      $box.find("td[data-date]").each((_, td) => {
        const d = $(td).attr("data-date")!;
        const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        $(td)
          .children()
          .not(".date")
          .each((_, el) => {
            const m = /^(\d{1,2}):(\d{2})$/.exec($(el).text().trim());
            if (!m) return;
            const start = `${m[1].padStart(2, "0")}:${m[2]}`;
            out.push({ date, start, end: min ? plusMinutes(start, min) : undefined, title, note: type || undefined });
          });
      });
    });
    if (!out.length) throw new Error("映画.com のページに上映予定が見つかりません");
    return out;
  },
};
