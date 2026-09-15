import { copyFile, mkdir } from "node:fs/promises";
await mkdir("public/vendor", { recursive: true });
for (const [from, to] of [
  ["@zxing/browser/umd/zxing-browser.min.js", "zxing-browser.min.js"],
  ["@zxing/browser/LICENSE", "ZXING-BROWSER-LICENSE"],
  ["@zxing/library/LICENSE", "ZXING-LIBRARY-LICENSE"],
  ["@zxing/text-encoding/LICENSE.md", "ZXING-TEXT-ENCODING-LICENSE"],
])
  await copyFile(`node_modules/${from}`, `public/vendor/${to}`);
console.log("Vendored the pinned ZXing decoder and its licenses.");
