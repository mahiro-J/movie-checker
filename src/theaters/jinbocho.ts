import { fetchText, hhmm, type Theater, type Screening } from "../lib.ts";

// ページは画面側で組み立てているが、元データが schedule-data.js にそのまま入っている
export const jinbocho: Theater = {
  id: "jinbocho",
  name: "神保町シアター",
  area: "神保町",
  url: "https://www.shogakukan.co.jp/jinbocho-theater/",
  async scrape() {
    const js = await fetchText("https://www.shogakukan.co.jp/jinbocho-theater/_assets/js/schedule-data.js");
    const i = js.indexOf("window.SCHEDULE_DATA =");
    const start = js.indexOf("{", i);
    // 対応する閉じカッコまでを切り出して JSON として読む
    let depth = 0, end = start;
    for (let j = start; j < js.length; j++) {
      if (js[j] === "{") depth++;
      else if (js[j] === "}" && --depth === 0) { end = j + 1; break; }
    }
    const data = JSON.parse(js.slice(start, end)) as {
      days: { date: string; closed: boolean; slots: { time: string; endTime?: string; title: string }[] }[];
    };
    const out: Screening[] = [];
    for (const d of data.days) {
      if (d.closed) continue;
      for (const s of d.slots) out.push({ date: d.date, start: hhmm(s.time), end: s.endTime ? hhmm(s.endTime) : undefined, title: s.title });
    }
    return out;
  },
};
