#!/usr/bin/env node
// Contrôle des budgets et de la structure du build. À lancer après `astro build` : `pnpm build && pnpm check:budgets`
// (ou comme commande de build Cloudflare : un dépassement bloque alors le déploiement, la version en ligne reste).
// Aucune dépendance : node:fs, node:path, node:zlib.
//
// 1. Graphe initial par page : <script type="module" src>, <link rel="modulepreload">, puis les imports statiques des
//    chunks de dist/_astro. Le module de page (src/scripts/pages/<data-page>.ts), importé par app.ts dès son
//    exécution par import.meta.glob, est compté dans le JS initial.
// 2. gzip niveau 9 (zlib.gzipSync) de chaque chunk, sommé par page.
// 3. Chunks différés (DEFERRED, repérés au nom) : jamais dans le JS initial d'une page.
// 4. Plafonds : 90 Kio de JS initial par page, 20 Kio de CSS gzip, 64 Kio de polices préchargées (les polices
//    seulement déclarées en @font-face, que le navigateur ne télécharge que si une règle les emploie, sont signalées
//    à part).
// 5. Aucun [data-astro-transition-persist] descendant d'un autre (lexeur de balises à pile) ; racines connues, uniques.
// 6. Liens internes vers une page ou un fichier de dist, sans .html ni barre finale (sinon un 301 à chaque clic) ;
//    <img> présentes, avec alt ; fichiers des srcset (<source>, <img>, préchargements d'images) présents.
// Sortie lisible ; tous les contrôles sont menés, puis process.exit(1) s'il y a au moins un échec.
// Option : --dist=<dossier> pour contrôler un autre build que dist/.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// --dist=<dossier> : un autre build (contrôle du script lui-même sur un dist fabriqué)
const distArg = process.argv.slice(2).find((a) => a.startsWith("--dist="));
const DIST = distArg ? resolve(distArg.slice("--dist=".length)) : join(ROOT, "dist");
const KIB = 1024;
const CAP = {
  js: 90 * KIB,
  css: 20 * KIB,
  fonts: 64 * KIB,
};
// Racines persistantes autorisées : les noms des transition:persist du layout (aucun par défaut : le header est
// remplacé à chaque navigation). Toujours nommer un persistant (transition:persist="nom") : sans valeur, Astro pose
// un identifiant généré, refusé ici.
const PERSIST_ROOTS = new Set([]);
// Chunks chargés à la demande, repérés au nom ({ name, re: /^nom[.-]/ }) : jamais dans le JS initial d'une page.
// Tous importés par pages/home.ts : hero-flow (le WebGL du hero), work-canvas (la toile infinie des projets, 12
// novembre 2026) et three (three.js, leur chunk commun : astro.config.mjs).
const DEFERRED = [
  { name: "hero-flow", re: /^hero-flow[.-]/ },
  { name: "work-canvas", re: /^work-canvas[.-]/ },
  { name: "three", re: /^three[.-]/ },
];
// Estimation : signalée, sans échec.
const HTML_HINT = { raw: 15_000, gzip: 5_000 };

const failures = [];
const infos = [];
const fail = (msg) => failures.push(msg);
const info = (msg) => infos.push(msg);

if (!existsSync(DIST)) {
  process.stderr.write("check-budgets : dist/ est absent, lancer `pnpm build` d'abord.\n");
  process.exit(1);
}

// ── Outils ──────────────────────────────────────────────────────────────────────────────────────────────────

const gzCache = new Map();
function gz(file) {
  let n = gzCache.get(file);
  if (n === undefined) {
    n = gzipSync(readFileSync(file), { level: 9 }).length;
    gzCache.set(file, n);
  }
  return n;
}
const gzText = (text) => gzipSync(Buffer.from(text, "utf8"), { level: 9 }).length;
const kib = (n) => `${(n / KIB).toFixed(1)} Kio`;
const rel = (file) => relative(DIST, file).split(sep).join("/");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Chemin d'URL du site (« /_astro/x.js », « ./x.js » relatif à un fichier) → fichier de dist, ou null hors site. */
function toDistFile(url, fromFile) {
  if (!url || /^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith("data:")) return null;
  const clean = url.split(/[?#]/)[0];
  const abs = clean.startsWith("/")
    ? join(DIST, ...clean.slice(1).split("/"))
    : join(dirname(fromFile), ...clean.split("/"));
  return abs;
}

// ── Lexeur de balises HTML (pile, éléments vides, />, texte brut de script/style/textarea/title) ─────────────

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW = new Set(["script", "style", "textarea", "title"]);

function parseAttrs(src) {
  const attrs = new Map();
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/**
 * Parcourt le document et appelle onOpen(el, stack) pour chaque élément ouvrant (stack = ancêtres, du plus
 * lointain au plus proche), onRaw(el, text) pour le contenu de script/style. el = { name, attrs, line }.
 */
function lex(html, { onOpen, onRaw }) {
  const stack = [];
  let i = 0;
  let line = 1;
  const advance = (to) => {
    for (let k = i; k < to; k++) if (html.charCodeAt(k) === 10) line++;
    i = to;
  };
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    advance(lt);
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      advance(end < 0 ? html.length : end + 3);
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i);
      advance(end < 0 ? html.length : end + 1);
      continue;
    }
    const close = html[i + 1] === "/";
    const nameMatch = /^[a-zA-Z][\w:-]*/.exec(html.slice(i + (close ? 2 : 1), i + (close ? 2 : 1) + 64));
    if (!nameMatch) {
      advance(i + 1);
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    // fin de balise : premier « > » hors guillemets
    let j = i + (close ? 2 : 1) + nameMatch[0].length;
    let quote = null;
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const inner = html.slice(i + (close ? 2 : 1) + nameMatch[0].length, j);
    const tagLine = line;
    advance(Math.min(j + 1, html.length));
    if (close) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const selfClosing = /\/\s*$/.test(inner);
    const el = { name, attrs: parseAttrs(selfClosing ? inner.replace(/\/\s*$/, "") : inner), line: tagLine };
    onOpen?.(el, stack);
    if (RAW.has(name) && !selfClosing) {
      const endRe = new RegExp(`</${name}\\s*>`, "ig");
      endRe.lastIndex = i;
      const m = endRe.exec(html);
      const end = m ? m.index : html.length;
      onRaw?.(el, html.slice(i, end));
      advance(m ? end + m[0].length : html.length);
      continue;
    }
    if (!VOID.has(name) && !selfClosing) stack.push(el);
  }
}

// ── Graphe des chunks JS ───────────────────────────────────────────────────────────────────────────────────

const STATIC_RE =
  /(?:^|[^\w$.])(?:import\s*(?:[\w$*{}\s,]+?\s*from\s*)?|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(["'`])([^"'`]+?\.m?js)\1/g;
const DYNAMIC_RE = /(?:^|[^\w$.])import\(\s*(["'`])([^"'`]+?\.m?js)\1\s*\)/g;

const chunkCache = new Map();
function chunk(file) {
  let c = chunkCache.get(file);
  if (c) return c;
  const code = existsSync(file) ? readFileSync(file, "utf8") : "";
  const statics = new Set();
  const dynamics = new Set();
  for (const m of code.matchAll(STATIC_RE)) {
    const f = toDistFile(m[2], file);
    if (f) statics.add(f);
  }
  for (const m of code.matchAll(DYNAMIC_RE)) {
    const f = toDistFile(m[2], file);
    if (f) dynamics.add(f);
  }
  c = { file, code, exists: code !== "" || existsSync(file), statics, dynamics };
  chunkCache.set(file, c);
  return c;
}

/** Fermeture des imports statiques depuis des points d'entrée. */
function closure(entries) {
  const seen = new Set();
  const todo = [...entries];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const c = chunk(f);
    if (!c.exists) fail(`chunk introuvable : ${rel(f)}`);
    for (const d of c.statics) if (!seen.has(d)) todo.push(d);
  }
  return seen;
}

/** Module de page chargé par app.ts (import.meta.glob : "./pages/<id>.ts":()=>…import(`./<chunk>.js`)…). */
function pageModuleOf(pageId, graph) {
  const key = `"./pages/${pageId}.ts"`;
  for (const f of graph) {
    const { code } = chunk(f);
    const at = code.indexOf(key);
    if (at < 0) continue;
    const m = /import\(\s*(["'`])([^"'`]+?\.m?js)\1\s*\)/.exec(code.slice(at, at + 400));
    if (m) return toDistFile(m[2], f);
  }
  return null;
}

const sum = (files) => [...files].reduce((n, f) => n + (existsSync(f) ? gz(f) : 0), 0);

// ── Pages ──────────────────────────────────────────────────────────────────────────────────────────────────

const htmlFiles = walk(DIST)
  .filter((f) => f.endsWith(".html"))
  .sort();
const astroDir = join(DIST, "_astro");
const allChunks = existsSync(astroDir)
  ? readdirSync(astroDir)
      .filter((n) => /\.m?js$/.test(n))
      .map((n) => join(astroDir, n))
  : [];

const pages = [];

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const page = {
    file,
    name: rel(file),
    id: null,
    entries: new Set(),
    inlineModules: [],
    inlineClassic: 0,
    styles: new Set(),
    inlineCss: "",
    fonts: new Set(),
    persist: [],
    imgs: [],
    links: [],
    srcsets: [],
    h1: 0,
    bytes: Buffer.byteLength(html),
    gzip: gzText(html),
  };
  lex(html, {
    onOpen(el, stack) {
      const a = el.attrs;
      if (el.name === "html") {
        page.id = a.get("data-page") ?? null;
      }
      if (el.name === "script" && a.has("src")) {
        const type = (a.get("type") ?? "").toLowerCase();
        if (type === "module") {
          const f = toDistFile(a.get("src"), file);
          if (f) page.entries.add(f);
        }
      }
      if (el.name === "link") {
        const relAttr = (a.get("rel") ?? "").toLowerCase().split(/\s+/);
        const f = toDistFile(a.get("href"), file);
        if (f && relAttr.includes("modulepreload")) page.entries.add(f);
        if (f && relAttr.includes("stylesheet")) page.styles.add(f);
        if (f && relAttr.includes("preload") && (a.get("as") ?? "").toLowerCase() === "font") page.fonts.add(f);
        if (relAttr.includes("preload") && a.has("imagesrcset")) page.srcsets.push({ el, value: a.get("imagesrcset") });
      }
      if ((el.name === "source" || el.name === "img") && a.has("srcset")) page.srcsets.push({ el, value: a.get("srcset") });
      if (el.name === "h1") page.h1++;

      const persist = a.get("data-astro-transition-persist");
      if (persist !== undefined) {
        const outer = stack.find((s) => s.attrs.has("data-astro-transition-persist"));
        page.persist.push({ id: persist, line: el.line, outer, el });
      }
      if (el.name === "img") page.imgs.push({ el, stack: [...stack] });
      if (el.name === "a" && a.has("href")) page.links.push({ el, stack: [...stack] });
    },
    onRaw(el, text) {
      if (el.name === "style") page.inlineCss += text;
      if (el.name === "script" && !el.attrs.has("src")) {
        const type = (el.attrs.get("type") ?? "").toLowerCase();
        if (type === "module") page.inlineModules.push(text);
        else if (type === "" || type === "text/javascript") page.inlineClassic += Buffer.byteLength(text);
      }
    },
  });
  for (const text of page.inlineModules) {
    for (const m of text.matchAll(STATIC_RE)) {
      const f = toDistFile(m[2], file);
      if (f) page.entries.add(f);
    }
  }
  pages.push(page);
}

if (pages.length === 0) fail("aucune page HTML dans dist/");

// ── 1–3. JS initial, chunks différés ──────────────────────────────────────────────────────────────────────

const baseName = (f) => posix.basename(f.split(sep).join("/"));
const deferredChunks = DEFERRED.map((d) => ({ ...d, files: allChunks.filter((f) => d.re.test(baseName(f))) }));

for (const page of pages) {
  const staticGraph = closure(page.entries);
  page.staticGraph = staticGraph;
  page.module = page.id ? pageModuleOf(page.id, staticGraph) : null;
  page.graph = page.module ? closure([...staticGraph, page.module]) : staticGraph;
  page.js = sum(page.graph) + page.inlineModules.reduce((n, t) => n + gzText(t), 0);
  page.jsStatic = sum(staticGraph);
  if (page.js > CAP.js) fail(`${page.name} : JS initial ${kib(page.js)} > ${kib(CAP.js)}`);
  for (const d of deferredChunks) {
    for (const f of d.files) {
      if (page.graph.has(f)) fail(`${page.name} : ${rel(f)} (${d.name}) est dans le JS initial ; il reste différé`);
    }
  }
}
for (const d of deferredChunks) for (const f of d.files) info(`chunk différé ${d.name} : ${rel(f)}, ${kib(gz(f))} gzip`);

// ── 4. CSS et polices ──────────────────────────────────────────────────────────────────────────────────────

const fontFaceRe = /url\(\s*(["']?)([^"')]+?\.woff2?)\1\s*\)/g;
const declaredNotes = new Set();
for (const page of pages) {
  page.css = sum(page.styles) + (page.inlineCss ? gzText(page.inlineCss) : 0);
  if (page.css > CAP.css) fail(`${page.name} : CSS ${kib(page.css)} gzip > ${kib(CAP.css)}`);
  // déclarées : les url() des @font-face (feuilles liées et <style>) ; préchargées : <link rel="preload" as="font">
  const declared = new Set();
  for (const f of page.styles) {
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, "utf8").matchAll(fontFaceRe)) {
      const ff = toDistFile(m[2], f);
      if (ff) declared.add(ff);
    }
  }
  for (const m of page.inlineCss.matchAll(fontFaceRe)) {
    const ff = toDistFile(m[2], page.file);
    if (ff) declared.add(ff);
  }
  const all = new Set([...declared, ...page.fonts]);
  for (const f of all) if (!existsSync(f)) fail(`${page.name} : police introuvable ${rel(f)}`);
  const bytes = (files) => [...files].reduce((n, f) => n + (existsSync(f) ? statSync(f).size : 0), 0);
  page.fontBytes = bytes(page.fonts);
  if (page.fontBytes > CAP.fonts) fail(`${page.name} : polices préchargées ${kib(page.fontBytes)} > ${kib(CAP.fonts)}`);
  for (const f of page.fonts) {
    if (!declared.has(f)) info(`${page.name} : ${rel(f)} préchargée sans @font-face qui la déclare`);
  }
  // des polices peuvent être déclarées sans préchargement (graisses secondaires) : signalé une fois, sans échec
  const unloaded = [...declared].filter((f) => !page.fonts.has(f));
  if (unloaded.length) {
    declaredNotes.add(
      `polices déclarées sans préchargement (téléchargées seulement si une règle les emploie) : ${unloaded
        .map((f) => `${rel(f)} ${kib(bytes([f]))}`)
        .join(", ")} ; déclarées et préchargées en tout ${kib(bytes(all))}`,
    );
  }
}
for (const note of declaredNotes) info(note);

// ── 5. Persistants ─────────────────────────────────────────────────────────────────────────────────────────

for (const page of pages) {
  const seen = new Map();
  for (const p of page.persist) {
    if (p.outer) {
      const describe = (el) => {
        const id = el.attrs.get("id");
        const cls = el.attrs.get("class");
        return `<${el.name}${id ? `#${id}` : ""}${cls ? `.${cls.trim().split(/\s+/)[0]}` : ""}>`;
      };
      fail(
        `${page.name} : persistant imbriqué « ${p.id} » ${describe(p.el)} (ligne ${p.line}) dans la racine « ${p.outer.attrs.get(
          "data-astro-transition-persist",
        )} » ${describe(p.outer)} (ligne ${p.outer.line})`,
      );
    }
    if (!PERSIST_ROOTS.has(p.id)) fail(`${page.name} : racine persistante inattendue « ${p.id} » (ligne ${p.line})`);
    if (seen.has(p.id)) fail(`${page.name} : racine persistante « ${p.id} » en double (lignes ${seen.get(p.id)} et ${p.line})`);
    seen.set(p.id, p.line);
  }
}

// ── 6. Liens internes et images ────────────────────────────────────────────────────────────────────────────

const pageNames = new Set(pages.map((p) => p.name));
let linksChecked = 0;
let imagesChecked = 0;
for (const page of pages) {
  for (const { el } of page.links) {
    const href = el.attrs.get("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    linksChecked++;
    const path = href.split(/[?#]/)[0];
    if (/\.html$/.test(path) || (path.length > 1 && path.endsWith("/"))) {
      fail(`${page.name} ligne ${el.line} : lien interne « ${href} » en .html ou à barre finale (un 301 à chaque clic)`);
      continue;
    }
    const ok = /\.[a-z0-9]+$/i.test(path)
      ? existsSync(toDistFile(path, page.file))
      : pageNames.has(path === "/" ? "index.html" : `${path.slice(1)}.html`);
    if (!ok) fail(`${page.name} ligne ${el.line} : lien interne cassé « ${href} »`);
  }
  for (const { el } of page.imgs) {
    imagesChecked++;
    const src = el.attrs.get("src") ?? "";
    const f = toDistFile(src, page.file);
    if (f && !existsSync(f)) fail(`${page.name} ligne ${el.line} : image introuvable « ${src} »`);
    if (!el.attrs.has("alt")) fail(`${page.name} ligne ${el.line} : <img src="${src}"> sans alt`);
    if (!el.attrs.has("width") || !el.attrs.has("height")) info(`${page.name} ligne ${el.line} : <img src="${src}"> sans width/height`);
  }
  for (const { el, value } of page.srcsets) {
    for (const candidate of value.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      const f = toDistFile(url, page.file);
      if (f && !existsSync(f)) fail(`${page.name} ligne ${el.line} : fichier de srcset introuvable « ${url} »`);
    }
  }
}

// ── Contrôles de structure annexes (signalés, sans échec) ──────────────────────────────────────────────────

const heavy = [];
for (const page of pages) {
  if (page.h1 !== 1) info(`${page.name} : ${page.h1} <h1> (attendu : 1, dans main ; app.ts y pose le focus)`);
  if (page.bytes > HTML_HINT.raw || page.gzip > HTML_HINT.gzip) {
    heavy.push(`${page.name} ${(page.bytes / 1000).toFixed(1)} / ${(page.gzip / 1000).toFixed(1)}`);
  }
}
if (heavy.length) {
  info(`HTML au-delà de l'estimation (15 Ko, 5 Ko gzip), en Ko brut / gzip : ${heavy.join(" · ")}`);
}

// ── Rapport ────────────────────────────────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const out = [];
out.push(`check-budgets — ${pages.length} pages dans dist/`);
out.push("");
out.push(
  `${pad("page", 28)} ${pad("data-page", 10)} ${lpad("JS initial", 11)} ${lpad("(statique)", 11)} ${lpad("CSS", 9)} ${lpad("polices", 9)} ${lpad("inline", 7)}`,
);
for (const p of pages) {
  out.push(
    `${pad(p.name, 28)} ${pad(p.id ?? "—", 10)} ${lpad(kib(p.js), 11)} ${lpad(kib(p.jsStatic), 11)} ${lpad(kib(p.css), 9)} ${lpad(
      kib(p.fontBytes),
      9,
    )} ${lpad(`${p.inlineClassic} o`, 7)}`,
  );
}
out.push("");
out.push(`plafonds : JS initial ${kib(CAP.js)} · CSS ${kib(CAP.css)} gzip · polices préchargées ${kib(CAP.fonts)}`);
out.push(`persistants : ${pages.reduce((n, p) => n + p.persist.length, 0)} racines contrôlées`);
out.push(`liens internes : ${linksChecked} contrôlés · images : ${imagesChecked} <img> contrôlées`);
if (infos.length) {
  out.push("");
  for (const m of infos) out.push(`info  ${m}`);
}
out.push("");
if (failures.length) {
  for (const m of failures) out.push(`ÉCHEC ${m}`);
  out.push("");
  out.push(`${failures.length} échec(s).`);
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(1);
}
out.push("Tous les contrôles passent.");
process.stdout.write(`${out.join("\n")}\n`);
