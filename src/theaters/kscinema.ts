import type { Theater } from "../lib.ts";
import { eigalandDays } from "./eigaland.ts";

const KEY = "30060115-7a0d-4878-8386-1492c5b4ac08";
export const kscinema: Theater = {
  id: "kscinema",
  name: "K's cinema",
  area: "新宿",
  url: "https://www.ks-cinema.com/schedule/",
  scrape: ({ today }) =>
    eigalandDays((d) => `https://schedule.eigaland.com/api/schedulePage/show/listByCinemaIdAndDate?webKey=${KEY}&date=${d}`, today),
};
