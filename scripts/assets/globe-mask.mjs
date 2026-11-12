#!/usr/bin/env node
/*
 * Le masque des terres du globe de l'accueil (gl/work-canvas.ts : la Terre en points, à la fin des projets) : les
 * polygones des terres émergées de Natural Earth (domaine public), rastérisés en équirectangulaire, blanc sur noir, en
 * PNG niveaux de gris (ffmpeg). Le shader le lit au centre de chaque point : 2 048 × 1 024 (0,18° par pixel, pour des
 * points tous les 0,9° ; WIDTH=… pour une autre largeur), depuis les contours au 1:50 m (au 1:110 m, la France ne se
 * reconnaissait pas).
 *
 *   curl -sSfL -o sources/globe/ne_50m_land.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
 *   node scripts/assets/globe-mask.mjs sources/globe/ne_50m_land.geojson img/globe/land v2
 *     → public/img/globe/land-v2.png
 *
 * Remplissage pair-impair par lignes de balayage : les trous des polygones (lacs) restent noirs.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [source, out, version = "v1"] = process.argv.slice(2);
if (!source || !out) {
  console.error("usage : node scripts/assets/globe-mask.mjs <geojson> <sortie> [version]");
  process.exit(1);
}

const WIDTH = Number(process.env.WIDTH ?? 2048);
const HEIGHT = WIDTH / 2;

/** Les anneaux de tous les polygones, en pixels (x vers l'est, y vers le sud) */
const rings = [];
const toPixel = ([lon, lat]) => [((lon + 180) / 360) * WIDTH, ((90 - lat) / 180) * HEIGHT];
for (const feature of JSON.parse(readFileSync(source, "utf8")).features) {
  const { type, coordinates } = feature.geometry;
  const polygons = type === "Polygon" ? [coordinates] : type === "MultiPolygon" ? coordinates : [];
  for (const polygon of polygons) for (const ring of polygon) rings.push(ring.map(toPixel));
}

// chaque ligne : les croisements de tous les bords à mi-hauteur du pixel, triés ; on remplit entre deux croisements
const pixels = Buffer.alloc(WIDTH * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  const cy = y + 0.5;
  const crossings = [];
  for (const ring of rings) {
    for (let k = 0; k < ring.length - 1; k++) {
      const [x1, y1] = ring[k];
      const [x2, y2] = ring[k + 1];
      if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) crossings.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  crossings.sort((a, b) => a - b);
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    const from = Math.max(0, Math.round(crossings[k]));
    const to = Math.min(WIDTH, Math.round(crossings[k + 1]));
    pixels.fill(255, y * WIDTH + from, y * WIDTH + to);
  }
}

const target = path.join(ROOT, "public", `${out}-${version}.png`);
mkdirSync(path.dirname(target), { recursive: true });
execFileSync(
  "ffmpeg",
  ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", `${WIDTH}x${HEIGHT}`, "-i", "-", "-pix_fmt", "gray", target],
  { input: pixels },
);
console.log(`${path.relative(ROOT, target)} : ${WIDTH} × ${HEIGHT}`);
