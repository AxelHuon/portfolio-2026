import type { gsap } from "gsap";

/**
 * Le type d'une navigation, choisi par app.ts :
 * - first : premier chargement ;
 * - nav : navigation animée ;
 * - reduced : mouvement réduit (la transition se résume à un fondu court, ou rien) ;
 * - cut : rien d'animé (le navigateur anime déjà le retour, geste d'iOS et de Safari).
 */
export type Kind = "first" | "nav" | "reduced" | "cut";

/** Ce que renvoie init : destroy est appelé une fois, en astro:before-swap ; tout ce que init a créé disparaît */
export interface PageInstance {
  destroy(kind: Kind): void;
  /**
   * La page est prête à être montrée (une texture chargée, un premier rendu) : au premier chargement, le loader
   * l'attend (plafonné à 6 s, chrome/loader.ts). Absente : prête tout de suite. Ne rejette jamais.
   */
  ready?: Promise<unknown>;
}

/** src/scripts/pages/<html data-page>.ts : init au premier chargement, puis à chaque arrivée sur la page */
export interface PageModule {
  init(kind: Kind): PageInstance | void;
}

export type Timeline = gsap.core.Timeline;
