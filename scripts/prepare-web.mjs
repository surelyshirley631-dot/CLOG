import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const outputDir = join(projectRoot, "www");
const staticFiles = ["index.html", "style.css", "sw.js", "manifest.webmanifest", "sticker.png"];
const staticDirs = ["js"];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const fileName of staticFiles) {
  const source = join(projectRoot, fileName);
  if (!existsSync(source)) continue;
  cpSync(source, join(outputDir, fileName));
}

for (const dirName of staticDirs) {
  const source = join(projectRoot, dirName);
  if (!existsSync(source)) continue;
  cpSync(source, join(outputDir, dirName), { recursive: true });
}

const copiedEntries = readdirSync(outputDir);
console.log(`Prepared Capacitor web assets in www/: ${copiedEntries.join(", ")}`);
