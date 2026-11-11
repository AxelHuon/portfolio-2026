/*
 * Défilement lissé : Lenis, créé par le module d'une page (jamais global : ses classes sur <html> disparaissent au
 * swap du ClientRouter) et détruit dans son destroy.
 * lerp 0,1 ; syncTouch false (le toucher reste natif) ; autoRaf false : une seule horloge, gsap.ticker, qui appelle
 * lenis.raf(ms) à chaque image. Une page qui a des ScrollTrigger passe ScrollTrigger (de lib/plugins/scroll-trigger) :
 * chaque défilement de Lenis le met à jour. Pas d'import ici : une page sans ScrollTrigger ne le charge pas.
 * - Une seule instance à la fois ; activeLenis() la donne au code commun (l'arrêter à l'ouverture du menu).
 * - Lenis lit la position courante à sa création et ne la change pas : un retour arrière, dont Astro restaure le
 *   défilement, n'est jamais ramené en haut.
 * - null en mouvement réduit : le défilement reste natif.
 *
 * Usage, dans src/scripts/pages/<page>.ts :
 *   const smooth = createSmoothScroll({ scrollTrigger: ScrollTrigger });   // null en mouvement réduit
 *   return { destroy() { smooth?.destroy(); } };
 */
import { gsap } from "gsap";
import Lenis from "lenis";
import { isReduced } from "./root";

export interface SmoothScrollOptions {
  /** ScrollTrigger de la page (lib/plugins/scroll-trigger) : chaque défilement de Lenis appelle son update() */
  scrollTrigger?: { update(): void };
}

export interface SmoothScroll {
  lenis: Lenis;
  /** débranche Lenis du ticker et de ScrollTrigger, puis le détruit (classes de <html> retirées) */
  destroy(): void;
}

let active: SmoothScroll | null = null;

/** L'instance en cours, sinon null */
export function activeLenis(): Lenis | null {
  return active?.lenis ?? null;
}

/** Crée le défilement lissé de la page ; null en mouvement réduit */
export function createSmoothScroll(options: SmoothScrollOptions = {}): SmoothScroll | null {
  if (isReduced()) return null;
  active?.destroy();

  const lenis = new Lenis({ lerp: 0.1, syncTouch: false, autoRaf: false });
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  const trigger = options.scrollTrigger;
  const unlisten = trigger ? lenis.on("scroll", () => trigger.update()) : null;

  const instance: SmoothScroll = {
    lenis,
    destroy() {
      unlisten?.();
      gsap.ticker.remove(tick);
      lenis.destroy();
      if (active === instance) active = null;
    },
  };
  active = instance;
  return instance;
}
