/*
 * Préchargement sur appareil tactile. Ailleurs, prefetch: { prefetchAll: true, defaultStrategy: "hover" }
 * (astro.config.mjs) précharge chaque page au survol de son lien. Sans survol et sans économie de données, on
 * précharge les liens du menu à l'inactivité après le chargement, et chaque lien interne dès qu'il est touché
 * (pointerdown). prefetch() d'Astro écarte lui-même la page courante, les autres origines, saveData et la 2G.
 * data-astro-reload sur un lien le sort du routeur (fichiers, pages hors du site).
 */
import { prefetch } from "astro:prefetch";
import { idle } from "./idle";

function touchOnly(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return matchMedia("(hover: none)").matches && connection?.saveData !== true;
}

function prefetchLink(target: EventTarget | null): void {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
  if (link && link.target !== "_blank" && !link.hasAttribute("download")) prefetch(link.href);
}

/** Appelé une fois par app.ts */
export function initIntent(): void {
  if (!touchOnly()) return;
  document.addEventListener("pointerdown", (event) => prefetchLink(event.target), { capture: true, passive: true });
  const preloadNav = () =>
    idle(
      () => {
        for (const link of document.querySelectorAll<HTMLAnchorElement>("#site-header a[href^='/']")) prefetch(link.href);
      },
      { timeout: 2000 },
    );
  if (document.readyState === "complete") preloadNav();
  else addEventListener("load", preloadNav, { once: true });
}
