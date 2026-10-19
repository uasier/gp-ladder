import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".site-dist");
await mkdir(path.join(output, "screenshots"), { recursive: true });
await cp(path.join(root, "site"), output, { recursive: true });
for (const name of [
  "og.png",
  "app-icon.png",
  "favicon.png",
  "apple-touch-icon.png",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
]) {
  await cp(path.join(root, "public", name), path.join(output, name));
}
for (const name of ["lxsz.jpg", "zt.jpg", "jjzt.jpg", "analysis.jpg"]) {
  await cp(
    path.join(root, "docs/screenshots", name),
    path.join(output, "screenshots", name),
  );
}
let html = await readFile(path.join(output, "index.html"), "utf8");
for (const name of ["styles.css", "app.js"]) {
  const digest = createHash("sha256")
    .update(await readFile(path.join(output, name)))
    .digest("hex")
    .slice(0, 12);
  html = html.replace(`./${name}"`, `./${name}?v=${digest}"`);
}
await writeFile(path.join(output, "index.html"), html);
console.log(`Website assembled: ${output}`);
