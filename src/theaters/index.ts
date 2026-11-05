import type { Theater } from "../lib.ts";
import { waseda } from "./waseda.ts";
import { bungeiza } from "./bungeiza.ts";
import { meguro } from "./meguro.ts";
import { laputa } from "./laputa.ts";
import { morc } from "./morc.ts";
import { vera } from "./vera.ts";
import { jinbocho } from "./jinbocho.ts";
import { shimotakaido } from "./shimotakaido.ts";
import { nfaj } from "./nfaj.ts";
import { cineka } from "./cineka.ts";
import { cinemalice } from "./cinemalice.ts";
import { eurospace } from "./eurospace.ts";
import { imageforum } from "./imageforum.ts";
import { k2 } from "./k2.ts";
import { lecinema } from "./lecinema.ts";
import { stranger } from "./stranger.ts";
import { bluestudio } from "./bluestudio.ts";
import { kscinema } from "./kscinema.ts";
import { athenee } from "./athenee.ts";
import { institut } from "./institut.ts";
import { polepole } from "./polepole.ts";

// 表示順もこの順番
export const theaters: Theater[] = [
  waseda,
  bungeiza,
  meguro,
  laputa,
  morc,
  vera,
  jinbocho,
  shimotakaido,
  nfaj,
  athenee,
  institut,
  cineka,
  cinemalice,
  eurospace,
  imageforum,
  k2,
  lecinema,
  stranger,
  bluestudio,
  kscinema,
  polepole,
];
