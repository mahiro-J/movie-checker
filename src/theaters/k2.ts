import { addDays, type Theater, type Screening } from "../lib.ts";

// box-office.app のAPI。時刻はUTCなので日本時間に直す
const API = "https://api.box-office.app";
const jst = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString();

export const k2: Theater = {
  id: "k2",
  name: "シモキタ-エキマエ-シネマK2",
  area: "下北沢",
  url: "https://k2-cinema.com/",
  async scrape({ today }) {
    const get = async (p: string) => {
      const r = await fetch(API + p, {
        headers: { "User-Agent": "Mozilla/5.0 movie-checker/0.1", Origin: "https://k2-cinema.com" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${p}`);
      return r.json();
    };
    const list: { titleId: number; startAt: string; endAt: string }[] = await get(
      `/timetable/timetables-with-date/theater/1?fromIso8601=${today}&toIso8601=${addDays(today, 20)}`,
    );
    const names = new Map<number, string>();
    for (const id of new Set(list.map((s) => s.titleId))) {
      const t = await get(`/title/title/${id}`);
      // 「『顔 -かお-』／얼굴」→「顔 -かお-」
      names.set(id, String(t.name).replace(/^『(.+?)』.*$/, "$1"));
    }
    return list.map((s): Screening => {
      const a = jst(s.startAt);
      const b = jst(s.endAt);
      return { date: a.slice(0, 10), start: a.slice(11, 16), end: b.slice(11, 16), title: names.get(s.titleId) ?? "?" };
    });
  },
};
