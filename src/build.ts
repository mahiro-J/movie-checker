// data/schedule.json をページに埋め込んで dist/index.html を作る
import fs from "node:fs";

const data = fs.readFileSync("data/schedule.json", "utf8");
const tpl = fs.readFileSync("site/template.html", "utf8");
fs.mkdirSync("dist", { recursive: true });
// データ内に "</script>" があってもページが壊れないように < を逃がす
fs.writeFileSync("dist/index.html", tpl.replace("/*DATA*/null", () => data.replace(/</g, "\\u003c")));
console.log("作成しました: dist/index.html");
