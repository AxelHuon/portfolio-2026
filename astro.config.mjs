// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { writeFileSync } from "node:fs";
import { SITE_URL, UNLISTED } from "./site.config.mjs";

// JS initial : le graphe statique commun à toutes les pages tient en deux chunks, le routeur d'Astro (ClientRouter,
// prefetch) et « base » (GSAP, scripts du site), au lieu d'une dizaine de petits morceaux compressés chacun à part.
// Seuls les modules du graphe initial ($initial) y entrent : les modules de page (import.meta.glob d'app.ts), Lenis,
// les plugins GSAP et three.js (src/scripts/gl) importés par eux restent différés. Le contenu (src/data/content.ts)
// n'est jamais importé côté client.
const ROUTER = /[\\/]node_modules[\\/]astro[\\/](dist[\\/](transitions|prefetch|runtime)[\\/]|components[\\/]ClientRouter\.astro)/;
const BASE = /[\\/]src[\\/](scripts|data)[\\/]|[\\/]node_modules[\\/]gsap[\\/]|vite[\\/]preload-helper/;
// three.js : un chunk à lui, chargé à la demande, partagé par les deux scènes de l'accueil (gl/hero-flow,
// gl/work-canvas) ; jamais dans le JS initial (check:budgets)
const THREE = /[\\/]node_modules[\\/]three[\\/]/;

// Redirections définitives : html_handling de Cloudflare renvoie /about.html et /about/ vers /about en 307
// (temporaire) ; dist/_redirects, écrit après le build depuis la liste des pages, les passe en 301. Les règles de
// _redirects s'appliquent avant les fichiers ; /about lui-même n'y figure pas, il reste servi en 200 (pas de boucle).
/** @type {import("astro").AstroIntegration} */
const redirects301 = {
  name: "redirects-301",
  hooks: {
    "astro:build:done": ({ dir, pages }) => {
      const lines = ["# généré par astro.config.mjs (redirects-301) : variantes en .html et à barre finale → URL canonique"];
      for (const { pathname } of pages) {
        const path = pathname.replace(/\/$/, "");
        if (path === "404") continue;
        if (path === "") {
          lines.push("/index / 301", "/index.html / 301");
          continue;
        }
        lines.push(`/${path}.html /${path} 301`, `/${path}/ /${path} 301`);
      }
      writeFileSync(new URL("_redirects", dir), `${lines.join("\n")}\n`);
    },
  },
};

export default defineConfig({
  site: SITE_URL,
  output: "static",
  // URL sans barre finale : about.html est servi en /about par Cloudflare (html_handling auto-trailing-slash)
  trailingSlash: "never",
  build: { format: "file" },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  // Police : une seule famille sur tout le site, Satoshi (Fontshare, Indian Type Foundry, licence ITF FFL : gratuite,
  // y compris pour un usage commercial ; choix d'Axel le 11 novembre 2026), une grotesque géométrique. Servie depuis
  // le site (/_astro/fonts), préchargée par <Font> dans Base.astro, avec une police de repli aux mêmes métriques (pas
  // de saut à son arrivée). 400 pour le texte, 500 pour les titres, le nom et les liens. La variable --font-body est
  // reliée dans src/styles/global.css (font-sans et font-display). Voir le README.
  fonts: [
    {
      provider: fontProviders.fontshare(),
      name: "Satoshi",
      cssVariable: "--font-body",
      weights: [400, 500],
      styles: ["normal"],
      fallbacks: ["sans-serif"],
    },
  ],
  integrations: [sitemap({ filter: (page) => !UNLISTED.test(new URL(page).pathname) }), redirects301],
  vite: {
    plugins: [tailwindcss()],
    // three (three.js, chargé à la demande par l'accueil) fait environ 520 Ko minifié : au-delà des 500 par défaut
    build: { chunkSizeWarningLimit: 600 },
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  { name: "router", tags: ["$initial"], test: ROUTER },
                  { name: "base", tags: ["$initial"], test: BASE },
                  { name: "three", test: THREE },
                ],
              },
            },
          },
        },
      },
    },
  },
});
