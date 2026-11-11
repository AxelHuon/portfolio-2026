#!/usr/bin/env node
/*
 * Icônes du site, depuis le logo SVG (src/assets/logo.svg, la source du logo du header) :
 *
 *   node scripts/assets/icons.mjs [logo.svg] ["#couleur de fond"]
 *
 * Par défaut : src/assets/logo.svg sur #06122b (site.themeColor). Le logo garde sa couleur (sa teinte de fill).
 * - favicon.svg : les onglets des navigateurs récents, nette à toutes les tailles ;
 * - favicon.ico (16, 32 et 48 px) : les autres navigateurs, Google (48 px) ;
 *   ces deux-là : le logo sur un carreau aux coins arrondis, fond transparent autour ;
 * - apple-touch-icon.png (180), icon-192.png, icon-512.png : carrés opaques (iOS noircit la transparence et arrondit
 *   lui-même les coins ; Android pose les icônes « any » telles quelles) ;
 * - icon-maskable-512.png : le logo dans la zone sûre de 80 % (cercle), pour les icônes adaptatives d'Android
 *   (purpose: "maskable" dans le manifeste).
 * Noms fixes (référencés par Base.astro et le manifeste), cache d'un jour (public/_headers).
 *
 * Sans dépendance ni outil externe (aucun outil de rendu SVG sur le poste, ffmpeg ne lit pas le SVG) : les tracés
 * du logo (M, L, H, V, C, Q, Z) sont aplatis en polygones et remplis (règle non nulle) avec un anticrénelage exact à
 * l'horizontale et 16 sous-lignes à la verticale ; PNG écrits avec zlib, ICO qui embarque ces PNG.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [logoArg, backgroundArg] = process.argv.slice(2);
const logoPath = path.resolve(ROOT, logoArg ?? "src/assets/logo.svg");
const background = hex(backgroundArg ?? "#06122b");
const out = (name) => path.join(ROOT, "public", name);

/**
 * Les formats : taille (px), carreau (arrondi en part de la taille, ou carré opaque), largeur du logo en part de la
 * taille. Favicons : le logo le plus grand possible (l'onglet est minuscule) ; écrans d'accueil : de l'air autour
 * (iOS arrondit à 22 % environ) ; maskable : la diagonale du logo tient dans le cercle de 80 %.
 */
const TAB = { radius: 0.22, logo: 0.74 };
const HOME = { radius: 0, logo: 0.6 };
const MASKABLE = { radius: 0, logo: 0.52 };

// ── le logo ────────────────────────────────────────────────────────────────────────────────────────────────────
const svg = readFileSync(logoPath, "utf8");
const viewBox = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "").split(/[\s,]+/).map(Number);
if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) throw new Error(`${logoPath} : viewBox illisible`);
const paths = Array.from(svg.matchAll(/\sd="([^"]+)"/g), (match) => match[1]);
if (!paths.length) throw new Error(`${logoPath} : aucun tracé`);
const ink = hex(/fill="(#[0-9a-fA-F]{3,6})"/.exec(svg.replace(/<svg[^>]*>/, ""))?.[1] ?? "#ffffff");

function hex(value) {
  const h = value.replace(/^#/, "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`couleur illisible : ${value}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** Un tracé SVG en polygones (courbes aplaties) */
function flatten(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const polygons = [];
  let current = [];
  let i = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const num = () => Number(tokens[i++]);
  const STEPS = 24;
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (command.toUpperCase()) {
      case "M":
        if (current.length) polygons.push(current);
        x = num() + ox;
        y = num() + oy;
        startX = x;
        startY = y;
        current = [[x, y]];
        command = relative ? "l" : "L"; // des coordonnées qui suivent un M sont des L
        break;
      case "L":
        x = num() + ox;
        y = num() + oy;
        current.push([x, y]);
        break;
      case "H":
        x = num() + ox;
        current.push([x, y]);
        break;
      case "V":
        y = num() + oy;
        current.push([x, y]);
        break;
      case "C": {
        const [x1, y1, x2, y2, x3, y3] = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy];
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          const u = 1 - t;
          current.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ]);
        }
        x = x3;
        y = y3;
        break;
      }
      case "Q": {
        const [x1, y1, x2, y2] = [num() + ox, num() + oy, num() + ox, num() + oy];
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          const u = 1 - t;
          current.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
        }
        x = x2;
        y = y2;
        break;
      }
      case "Z":
        current.push([startX, startY]);
        polygons.push(current);
        current = [];
        x = startX;
        y = startY;
        break;
      default:
        throw new Error(`commande de tracé non prise en charge : ${command} (convertir le logo en M, L, H, V, C, Q, Z)`);
    }
  }
  if (current.length) polygons.push(current);
  return polygons;
}

const logo = paths.flatMap(flatten);

/** Un rectangle aux coins arrondis en polygone */
function roundRect(size, radius) {
  if (radius <= 0) return [[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]];
  const r = radius;
  const points = [];
  const corners = [
    [size - r, r, -Math.PI / 2],
    [size - r, size - r, 0],
    [r, size - r, Math.PI / 2],
    [r, r, Math.PI],
  ];
  for (const [cx, cy, from] of corners) {
    for (let s = 0; s <= 16; s++) {
      const a = from + (s / 16) * (Math.PI / 2);
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  points.push(points[0]);
  return [points];
}

/** Couverture (0 à 1) de polygones sur une image size², règle non nulle */
function raster(polygons, size) {
  const SUB = 16;
  const coverage = new Float32Array(size * size);
  const edges = [];
  for (const polygon of polygons) {
    for (let k = 1; k < polygon.length; k++) {
      const [x0, y0] = polygon[k - 1];
      const [x1, y1] = polygon[k];
      if (y0 !== y1) edges.push({ x0, y0, x1, y1, dir: y1 > y0 ? 1 : -1, top: Math.min(y0, y1), bottom: Math.max(y0, y1) });
    }
  }
  const span = (row, a, b, weight) => {
    a = Math.max(0, Math.min(size, a));
    b = Math.max(0, Math.min(size, b));
    if (b <= a) return;
    const ia = Math.floor(a);
    const ib = Math.floor(b);
    const base = row * size;
    if (ia === ib) {
      coverage[base + ia] += (b - a) * weight;
      return;
    }
    coverage[base + ia] += (ia + 1 - a) * weight;
    for (let i = ia + 1; i < ib; i++) coverage[base + i] += weight;
    if (ib < size) coverage[base + ib] += (b - ib) * weight;
  };
  for (let row = 0; row < size; row++) {
    for (let k = 0; k < SUB; k++) {
      const sy = row + (k + 0.5) / SUB;
      const crossings = [];
      for (const e of edges) {
        if (sy < e.top || sy >= e.bottom) continue;
        crossings.push([e.x0 + ((sy - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0), e.dir]);
      }
      crossings.sort((p, q) => p[0] - q[0]);
      let winding = 0;
      let start = 0;
      for (const [cx, dir] of crossings) {
        const before = winding;
        winding += dir;
        if (before === 0 && winding !== 0) start = cx;
        else if (before !== 0 && winding === 0) span(row, start, cx, 1 / SUB);
      }
    }
  }
  for (let i = 0; i < coverage.length; i++) coverage[i] = Math.min(1, coverage[i]);
  return coverage;
}

/** Le logo placé au centre d'un carré de côté size, sur width (part de size) de large */
function placeLogo(size, width) {
  const [vx, vy, vw, vh] = viewBox;
  const scale = (size * width) / vw;
  const dx = (size - vw * scale) / 2 - vx * scale;
  const dy = (size - vh * scale) / 2 - vy * scale;
  return { scale, dx, dy, polygons: logo.map((polygon) => polygon.map(([px, py]) => [px * scale + dx, py * scale + dy])) };
}

/** Une icône size² en RGBA : le carreau puis le logo par-dessus */
function render(size, { radius, logo: width }) {
  const tile = raster(roundRect(size, radius * size), size);
  const mark = raster(placeLogo(size, width).polygons, size);
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const m = mark[i];
    const t = tile[i];
    const alpha = m + t * (1 - m);
    for (let c = 0; c < 3; c++) {
      rgba[i * 4 + c] = alpha > 0 ? Math.round((ink[c] * m + background[c] * t * (1 - m)) / alpha) : 0;
    }
    rgba[i * 4 + 3] = Math.round(alpha * 255);
  }
  return rgba;
}

// ── PNG et ICO ─────────────────────────────────────────────────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** PNG 8 bits : RGBA, ou RGB si l'image est opaque */
function png(size, rgba) {
  const opaque = rgba.every((value, index) => index % 4 !== 3 || value === 255);
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * channels + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * channels + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < channels; c++) raw[row + 1 + x * channels + c] = rgba[(y * size + x) * 4 + c];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
/** ICO qui embarque des PNG (pris en charge partout depuis Windows Vista) */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size >= 256 ? 0 : size;
    header[entry + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

/** Le favicon SVG : le carreau arrondi et les tracés d'origine, mis à l'échelle */
function faviconSvg() {
  const size = 64;
  const { scale, dx, dy } = placeLogo(size, TAB.logo);
  const color = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  const round = (value) => Number(value.toFixed(4));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${round(TAB.radius * size)}" fill="${color(background)}"/>`,
    `<g fill="${color(ink)}" transform="translate(${round(dx)} ${round(dy)}) scale(${round(scale)})">`,
    ...paths.map((d) => `<path d="${d}"/>`),
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}

// ── écriture ───────────────────────────────────────────────────────────────────────────────────────────────────
const tabs = [16, 32, 48].map((size) => ({ size, data: png(size, render(size, TAB)) }));
writeFileSync(out("favicon.ico"), ico(tabs));
writeFileSync(out("favicon.svg"), faviconSvg());
for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  writeFileSync(out(name), png(size, render(size, HOME)));
}
writeFileSync(out("icon-maskable-512.png"), png(512, render(512, MASKABLE)));
console.log(
  "[icons] favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png écrits dans public/",
);
