// 全館を順番に取得して data/schedule.json に保存する
// 使い方: npx tsx src/run.ts          (全館)
//         npx tsx src/run.ts waseda   (指定した館だけ、確認用)
import fs from "node:fs";
import path from "node:path";
import { todayJST, type Screening, type Ctx } from "./lib.ts";
import { theaters } from "./theaters/index.ts";

type TheaterResult = {
  id: string;
  name: string;
  area: string;
  url: string;
  ok: boolean;
  error?: string;
  fetchedAt: string;
  screenings: Screening[];
};

const OUT = path.resolve("data/schedule.json");
const only = process.argv.slice(2);
const today = todayJST();

const ctx: Ctx = { today };

const prev: Record<string, TheaterResult> = {};
if (fs.existsSync(OUT)) {
  for (const t of JSON.parse(fs.readFileSync(OUT, "utf8")).theaters as TheaterResult[]) prev[t.id] = t;
}

const results: TheaterResult[] = [];
for (const th of theaters) {
  if (only.length && !only.includes(th.id)) {
    if (prev[th.id]) results.push(prev[th.id]);
    continue;
  }
  const base = { id: th.id, name: th.name, area: th.area, url: th.url };
  try {
    const list = dedupe(await withTimeout(th.scrape(ctx), 90_000));
    if (list.length === 0) throw new Error("上映回が1件も取れませんでした");
    results.push({ ...base, ok: true, fetchedAt: new Date().toISOString(), screenings: list });
    const days = new Set(list.map((s) => s.date));
    console.log(`✓ ${th.name}: ${list.length}回 / ${days.size}日分 (${[...days].sort()[0]}〜${[...days].sort().at(-1)})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 失敗したら前回のデータを残す
    const old = prev[th.id];
    results.push({ ...base, ok: false, error: msg, fetchedAt: old?.fetchedAt ?? "", screenings: old?.screenings ?? [] });
    console.log(`✗ ${th.name}: ${msg}`);
  }
}

// 昨日より前の回は捨てる
for (const r of results) r.screenings = r.screenings.filter((s) => s.date >= today);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), theaters: results }, null, 1));
console.log(`保存しました: ${OUT}`);

function dedupe(list: Screening[]): Screening[] {
  const seen = new Set<string>();
  return list
    .filter((s) => {
      const k = `${s.date} ${s.start} ${s.screen ?? ""} ${s.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("時間切れ")), ms))]);
}
