/*
 * Réglages lus par astro.config.mjs (et Base.astro pour UNLISTED). Sans dépendance : un fichier .mjs que la config
 * d'Astro charge sans passer par Vite.
 */

/** Le domaine de production, sans barre finale : canonical, Open Graph, JSON-LD, sitemap, robots.txt */
export const SITE_URL = "https://example.com";

/**
 * Pages servies mais hors des moteurs : noindex (Base.astro) et absentes du sitemap. Au build, Astro.url.pathname
 * finit en .html (build.format "file"), d'où le (\.html)?.
 */
export const UNLISTED = /\/(404|legal)(\.html)?\/?$/;
