import { addDays, type Theater, type Screening } from "../lib.ts";

type Film = { title_name: string; schedule_list: { start_time: string; end_time: string; note?: string }[] };

export const cinemalice: Theater = {
  id: "cinemalice",
  name: "シネマリス",
  area: "神保町",
  url: "https://cinemalice.theater/",
  async scrape({ today }) {
    const r = await fetch(
      `https://cinemalice.theater/api/schedules?from_date=${today}&to_date=${addDays(today, 20)}&include_details=1`,
      { headers: { "User-Agent": "Mozilla/5.0 movie-checker/0.1" } },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data: { playdates: Record<string, Film[]> } = await r.json();
    const out: Screening[] = [];
    for (const [date, films] of Object.entries(data.playdates)) {
      for (const f of films) {
        for (const s of f.schedule_list) {
          // note は「【シアター2】PG12　※最終上映」のような形
          const sm = /【(.+?)】/.exec(s.note ?? "");
          const note = (s.note ?? "").replace(/【.+?】/, "").trim() || undefined;
          out.push({ date, start: s.start_time.slice(0, 5), end: s.end_time?.slice(0, 5), title: f.title_name, screen: sm?.[1], note });
        }
      }
    }
    return out;
  },
};
