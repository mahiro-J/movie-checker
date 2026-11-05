import * as cheerio from "cheerio";
import { fetchText, hhmm, ymd, dateRange, z2h, clean, type Theater, type Screening } from "../lib.ts";

// schedule.html に作品ごとのブロック。作品名(.eiga-title)の近くの .day に
//   「10/31(土)〜11/6(金)」「9：30～(終10：50)」 や 「11/5(木) 19：50～(終21：20)」
export const shimotakaido: Theater = {
  id: "shimotakaido",
  name: "下高井戸シネマ",
  area: "下高井戸",
  url: "https://shimotakaidocinema.com/schedule/schedule.html",
  async scrape({ today }) {
    const html = (await fetchText("https://shimotakaidocinema.com/schedule/schedule.html")).replace(/<!--[\s\S]*?-->/g, "");
    const $ = cheerio.load(html);
    const out: Screening[] = [];
    $(".eiga-title").each((_, el) => {
      const title = clean($(el).text());
      if (!title) return;
      // 同じ囲みの中で、作品名より後ろにある最初の .day
      const box = $(el).closest(".text, .tokusyu-r, li, .box");
      const day = box.find(".day").first();
      if (!day.length) return;
      day.find("br").replaceWith("\n");
      const program = $(el).closest(".details-content").length
        ? clean($(el).closest(".details-content").parent().prevAll(".box").first().find(".title-s").text()) || undefined
        : undefined;
      for (const s of parseDayText(day.text(), today)) out.push({ ...s, title, program });
    });
    return out;
  },
};

function parseDayText(text: string, today: string) {
  const res: Omit<Screening, "title">[] = [];
  let dates: string[] = [];
  for (const raw of z2h(text).split("\n")) {
    const line = clean(raw);
    if (!line) continue;
    // 「時間変則・作品日替り」は特集全体の目安なので使わない
    if (/日替|変則/.test(line)) return [];
    const range = /(\d{1,2})\/(\d{1,2})\([^)]*\)\s*~\s*(?:(\d{1,2})\/)?(\d{1,2})\([^)]*\)/.exec(line);
    const singles = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\([^)]*\)/g)];
    if (range) {
      const from = ymd(+range[1], +range[2], today);
      const to = ymd(range[3] ? +range[3] : +range[1], +range[4], today);
      dates = dateRange(from, to);
    } else if (singles.length) {
      dates = singles.map((m) => ymd(+m[1], +m[2], today));
    }
    const rest = line.replace(/\d{1,2}\/\d{1,2}\([^)]*\)/g, "");
    for (const m of rest.matchAll(/(\d{1,2}:\d{2})\s*~?\s*(?:\(終\s*(\d{1,2}:\d{2})\))?/g)) {
      for (const date of dates) res.push({ date, start: hhmm(m[1]), end: m[2] ? hhmm(m[2]) : undefined });
    }
  }
  return res;
}
