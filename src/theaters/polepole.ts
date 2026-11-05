import type { Theater } from "../lib.ts";
import { eigalandDays } from "./eigaland.ts";

export const polepole: Theater = {
  id: "polepole",
  name: "ポレポレ東中野",
  area: "東中野",
  url: "https://pole2.co.jp/",
  scrape: ({ today }) =>
    eigalandDays((d) => `https://pole2.co.jp/api/website/show/listByDomainAndDate?domain=pole2.co.jp&date=${d}`, today),
};
