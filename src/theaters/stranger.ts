import type { Theater } from "../lib.ts";
import { eigalandDays } from "./eigaland.ts";

export const stranger: Theater = {
  id: "stranger",
  name: "Stranger",
  area: "菊川",
  url: "https://stranger.jp/",
  scrape: ({ today }) =>
    eigalandDays((d) => `https://stranger.jp/api/website/show/listByDomainAndDate?domain=stranger.jp&date=${d}`, today),
};
