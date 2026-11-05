import { addDays, type Screening } from "../lib.ts";

// 映画ランド(eigaland)のチケットシステムを使う館の共通処理。日付ごとにJSONが返る
type Show = { startTime: string; endTime: string; screenName?: string };
type Item = { movieDetail: { movieName: string }; houseList: { houseName: string; showList: Show[] }[] };

export async function eigalandDays(urlForDate: (date: string) => string, today: string, days = 14): Promise<Screening[]> {
  const out: Screening[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const res = await fetch(urlForDate(date), { headers: { "User-Agent": "Mozilla/5.0 movie-checker/0.1" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items: Item[] = Array.isArray(json) ? json : (json.data ?? []);
    for (const it of items) {
      for (const h of it.houseList ?? []) {
        for (const s of h.showList ?? []) {
          out.push({
            date: s.startTime.slice(0, 10),
            start: s.startTime.slice(11, 16),
            end: s.endTime?.slice(11, 16),
            title: it.movieDetail.movieName.replace(/　/g, " "),
          });
        }
      }
    }
  }
  return out;
}
