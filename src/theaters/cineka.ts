import { fetchText, type Theater, type Screening } from "../lib.ts";

// TTCG の共通データファイル。dates に日ごとの作品コード、screens に「コード-日付」ごとの時刻
type Time = { start_time: string; end_time: string };
type Data = {
  dates: { date_year: string; date_month: string; date_day: string; movie: string[] }[];
  movies: Record<string, { name: string }[]>;
  screens: Record<string, { name: string; time: Time[] }[]>;
};

export const cineka: Theater = {
  id: "cineka",
  name: "キネカ大森",
  area: "大森",
  url: "https://ttcg.jp/cineka_omori/",
  async scrape() {
    const d = JSON.parse(await fetchText("https://ttcg.jp/data/cineka_omori.js")) as Data;
    const t = (s: string) => `${s.slice(0, 2)}:${s.slice(2, 4)}`;
    const out: Screening[] = [];
    for (const day of d.dates) {
      const date = `${day.date_year}-${day.date_month}-${day.date_day}`;
      for (const code of day.movie) {
        const title = d.movies[code]?.[0]?.name ?? code;
        for (const sc of d.screens[`${code}-${date}`] ?? []) {
          for (const tm of sc.time) out.push({ date, start: t(tm.start_time), end: t(tm.end_time), title, screen: sc.name });
        }
      }
    }
    return out;
  },
};
