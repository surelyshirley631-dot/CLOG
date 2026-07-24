import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "www");

const assets = [
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "sw.js",
  "sticker.png",
  "js"
];

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await Promise.all(
    assets.map(async asset => {
      const source = path.join(projectRoot, asset);
      const target = path.join(outDir, asset);
      await cp(source, target, { recursive: true });
    })
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
