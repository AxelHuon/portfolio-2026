#!/usr/bin/env node
/*
 * Images du site : une source → ses variantes AVIF et WebP aux largeurs voulues, dans public/, et l'objet Picture à
 * reprendre dans src/data/content.ts (ou picture() du même fichier, qui le reconstruit depuis le nom).
 *
 *   node scripts/assets/images.mjs <source> <sortie> <ratio> <largeurs> [version]
 *   node scripts/assets/images.mjs sources/equipe.jpg img/about/equipe 4:5 480,768,1080 v1
 *     → public/img/about/equipe-480-v1.avif, …-480-v1.webp, …, …-1080-v1.webp
 *   ratio : 3:2, 4:5, 16:9… (recadrage centré) ou « original » ; largeurs jamais au-delà de la source.
 *   --og : l'image de partage, JPEG 1200 × 630 (sortie public/<sortie>-<version>.jpg, sous 300 Ko).
 *
 * Encodage repris de Berjyy : redimensionnement lanczos (ffmpeg), AVIF avifenc -q 55 -s 4 (4:2:0), WebP cwebp -q 78
 * -m 6 -sharp_yuv. Outils : ffmpeg, avifenc (libavif), cwebp (libwebp) ; sur macOS : brew install ffmpeg libavif webp.
 * Les noms sont versionnés (servis immutable, public/_headers) : une image changée prend une nouvelle version.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const og = process.argv.includes("--og");
const [source, out, ratioArg = "original", widthsArg = "480,768,1080", version = "v1"] = args;
if (!source || !out) {
  console.error("usage : node scripts/assets/images.mjs <source> <sortie> <ratio> <largeurs> [version] [--og]");
  process.exit(1);
}

const run = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const probe = (file) => {
  const [width, height] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file])
    .trim()
    .split(",")
    .map(Number);
  return { width, height };
};

const WORK = mkdtempSync(path.join(os.tmpdir(), "site-images-"));
try {
  const target = path.join(ROOT, "public", out);
  mkdirSync(path.dirname(target), { recursive: true });

  if (og) {
    const file = `${target}-${version}.jpg`;
    run("ffmpeg", ["-v", "error", "-y", "-i", source, "-vf", "scale=1200:630:force_original_aspect_ratio=increase:flags=lanczos,crop=1200:630", "-q:v", "3", "-frames:v", "1", file]);
    const kb = Math.round(statSync(file).size / 1024);
    if (kb > 300) console.warn(`[images] ${path.relative(ROOT, file)} pèse ${kb} Ko : au-delà de 300 Ko, WhatsApp n'affiche pas l'aperçu`);
    console.log(JSON.stringify({ src: `/${out}-${version}.jpg`, width: 1200, height: 630, alt: "" }, null, 2));
    process.exit(0);
  }

  // master : recadrage centré au ratio voulu, en PNG RGB
  const master = path.join(WORK, "master.png");
  const crop =
    ratioArg === "original"
      ? "null"
      : (() => {
          const [w, h] = ratioArg.split(":").map(Number);
          return `crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'`;
        })();
  run("ffmpeg", ["-v", "error", "-y", "-i", source, "-vf", `${crop},format=rgb24`, "-frames:v", "1", master]);
  const size = probe(master);

  const widths = [...new Set(widthsArg.split(",").map(Number).map((w) => Math.min(w, size.width)))].sort((a, b) => a - b);
  const avif = [];
  const webp = [];
  let largest = { src: "", width: 0, height: 0 };
  for (const width of widths) {
    const scaled = path.join(WORK, `${width}.png`);
    run("ffmpeg", ["-v", "error", "-y", "-i", master, "-vf", `scale=${width}:-2:flags=lanczos`, scaled]);
    const { height } = probe(scaled);
    const name = `${out}-${width}-${version}`;
    run("avifenc", ["-q", "55", "-s", "4", "-y", "420", "-j", "all", scaled, path.join(ROOT, "public", `${name}.avif`)]);
    run("cwebp", ["-quiet", "-q", "78", "-m", "6", "-sharp_yuv", "-metadata", "none", scaled, "-o", path.join(ROOT, "public", `${name}.webp`)]);
    avif.push(`/${name}.avif ${width}w`);
    webp.push(`/${name}.webp ${width}w`);
    largest = { src: `/${name}.webp`, width, height };
  }
  console.log(JSON.stringify({ ...largest, alt: "", avif: avif.join(", "), webp: webp.join(", ") }, null, 2));
} finally {
  rmSync(WORK, { recursive: true, force: true });
}
