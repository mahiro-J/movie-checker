import { fetchDom, hhmm, ymd, clean, type Theater, type Screening } from "../lib.ts";

// 番組ブロック(id="d2026-11-01-1")の中に「11/1（日）」「2（月）」… の見出しと上映回
export const bungeiza: Theater = {
  id: "bungeiza",
  name: "新文芸坐",
  area: "池袋",
  url: "https://www.shin-bungeiza.com/schedule",
  async scrape({ today }) {
    const $ = await fetchDom("https://www.shin-bungeiza.com/schedule");
    const out: Screening[] = [];
    $(".schedule-box").each((_, box) => {
      const idm = /^d(\d{4})-(\d{2})-/.exec($(box).attr("id") || "");
      let month = idm ? +idm[2] : 0;
      const program = clean($(box).find(".schedule-box-txt h1").first().text()) || undefined;
      let date = "";
      // 上映回は番組ブロックのすぐ後ろの .schedule-content に入っている(2本立てなら txt が複数)
      $(box)
        .next(".schedule-content")
        .find(".schedule-content-txt")
        .children()
        .each((_, el) => {
          const $el = $(el);
          if (el.tagName === "h2") {
            const m = /^(?:(\d{1,2})\/)?(\d{1,2})/.exec(clean($el.text()));
            if (!m) return;
            if (m[1]) month = +m[1];
            date = month ? ymd(month, +m[2], today) : "";
          } else if ($el.hasClass("schedule-program") && date) {
            // <p><span class="r-tag">トーク付</span> 作品名</p> → タグは備考へ
            const p = $el.find("p").first().clone();
            const tags = p.find("span[class$=-tag]").map((_, s) => clean($(s).text())).get();
            p.find("span[class$=-tag]").remove();
            const title = clean(p.text());
            const note = tags.filter((t) => t !== "ロードショー").join(" ") || undefined;
            $el.find("li").each((_, li) => {
              const tm = /(\d{1,2}:\d{2})(?:\s*[-〜～]\s*(\d{1,2}:\d{2}))?/.exec(clean($(li).text()));
              if (tm) out.push({ date, start: hhmm(tm[1]), end: tm[2] ? hhmm(tm[2]) : undefined, title, note, program });
            });
          }
        });
    });
    return out;
  },
};
