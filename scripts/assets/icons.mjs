#!/usr/bin/env node
/*
 * Icônes du site, depuis le logo du client (carré, PNG à fond transparent, 512 px ou plus) :
 *
 *   node scripts/assets/icons.mjs sources/logo.png "#ffffff"
 *
 * - favicon.ico (32 px) et favicon.png (32 px, transparent) : les onglets ;
 * - apple-touch-icon.png (180), icon-192.png, icon-512.png : opaques, sur la couleur donnée (site.themeColor), le
 *   logo à 86 % du carreau. iOS noircit la transparence et arrondit lui-même les coins. 86 % dépasse la zone sûre de
 *   80 % des icônes « maskable » : ne pas déclarer purpose: "maskable" dans le manifeste sans repasser sous 80 %.
 * Noms fixes (référencés par Base.astro et le manifeste), cache d'un jour (public/_headers). Outil : ffmpeg.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [logo, background = "#ffffff"] = process.argv.slice(2);
if (!logo) {
  console.error('usage : node scripts/assets/icons.mjs <logo.png> ["#couleur de fond"]');
  process.exit(1);
}
const TILE = 0.86;
const out = (name) => path.join(ROOT, "public", name);
const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
const color = `0x${background.replace(/^#/, "")}`;

// onglets : transparent, le logo plein cadre
ffmpeg(["-i", logo, "-vf", "scale=32:32:force_original_aspect_ratio=decrease,pad=32:32:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba", "-frames:v", "1", out("favicon.png")]);
ffmpeg(["-i", out("favicon.png"), "-frames:v", "1", out("favicon.ico")]);

// écrans d'accueil : opaques
for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  const tile = Math.round(size * TILE);
  ffmpeg([
    "-f", "lavfi", "-i", `color=c=${color}:s=${size}x${size}`,
    "-i", logo,
    "-filter_complex", `[1]scale=${tile}:${tile}:force_original_aspect_ratio=decrease[logo];[0][logo]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24`,
    "-frames:v", "1", out(name),
  ]);
}
console.log("[icons] favicon.ico, favicon.png, apple-touch-icon.png, icon-192.png, icon-512.png écrits dans public/");
