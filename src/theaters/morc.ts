import fs from "node:fs";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { fetchText, type Theater, type Screening } from "../lib.ts";

// Morc阿佐ヶ谷は週ごとの時間割が画像(ウエ=1F / シタ=B1F)だけなので、Claude に画像を読ませる。
// 同じ画像は二度読まない(data/morc-cache.json に結果を保存)ので、費用は新しい画像の分だけ。
const CACHE = "data/morc-cache.json";
const MODEL = process.env.MORC_MODEL ?? "claude-opus-5-5";

const Result = z.object({
  screenings: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      start: z.string().describe("HH:MM 24時間表記"),
      end: z.string().describe("HH:MM。書かれていなければ空文字"),
      title: z.string(),
      note: z.string().describe("トーク付きなどの補足。なければ空文字"),
    }),
  ),
});

export const morc: Theater = {
  id: "morc",
  name: "Morc阿佐ヶ谷",
  area: "阿佐ヶ谷",
  url: "https://www.morc-asagaya.com/schedule/",
  async scrape({ today }) {
    const html = await fetchText("https://www.morc-asagaya.com/schedule/");
    const urls = [...new Set(html.match(/https:\/\/www\.morc-asagaya\.com\/wp-content\/uploads\/[^"']+?(?:ウエ|シタ)[^"']*?\.(?:png|jpe?g)/g) ?? [])];
    if (!urls.length) throw new Error("時間割の画像が見つかりませんでした");

    const cache: Record<string, Screening[]> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
    const out: Screening[] = [];
    let client: Anthropic | undefined;
    for (const url of urls) {
      const res = await fetch(encodeURI(url), { headers: { "User-Agent": "Mozilla/5.0 movie-checker/0.1" } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const key = crypto.createHash("sha256").update(buf).digest("hex");
      const screen = url.includes("ウエ") ? "ウエ(1F)" : "シタ(B1F)";
      if (!cache[key]) {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が未設定のため画像を読めません");
        client ??= new Anthropic();
        const media = url.endsWith(".png") ? "image/png" : "image/jpeg";
        const r = await client.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "low", format: zodOutputFormat(Result) },
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
                {
                  type: "text",
                  text:
                    `映画館の週間上映スケジュール表の画像です。すべての上映回を書き出してください。` +
                    `今日は ${today} です。年が書かれていなければ今日に一番近い年にしてください。` +
                    `日付ごとに時刻が違う場合も、表に書かれている通りに1回ずつ分けて出してください。`,
                },
              ],
            },
          ],
        });
        if (!r.parsed_output) throw new Error(`画像を読めませんでした (${r.stop_reason})`);
        cache[key] = r.parsed_output.screenings.map((s) => ({
          date: s.date,
          start: s.start.padStart(5, "0"),
          end: s.end ? s.end.padStart(5, "0") : undefined,
          title: s.title,
          note: s.note || undefined,
        }));
        fs.mkdirSync("data", { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      }
      for (const s of cache[key]) out.push({ ...s, screen });
    }
    return out;
  },
};
