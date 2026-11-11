/*
 * Media queries partagées (gsap.matchMedia, scripts) et lecture de <html>. Le mouvement réduit est lu en direct,
 * jamais mis en cache : l'utilisateur peut le changer page ouverte.
 */

/** small = (width < 48rem), écrit en max-width : Safari 16.0 à 16.3 ne connaît pas la syntaxe d'intervalle */
export const MQ = {
  reduce: "(prefers-reduced-motion: reduce)",
  motion: "(prefers-reduced-motion: no-preference)",
  fine: "(hover: hover) and (pointer: fine)",
  small: "(max-width: 47.999rem)",
  desktop: "(min-width: 64rem)",
} as const;

export function matches(query: string): boolean {
  return matchMedia(query).matches;
}

export function isReduced(): boolean {
  return matches(MQ.reduce);
}

export function isFinePointer(): boolean {
  return matches(MQ.fine);
}

export function isSmall(): boolean {
  return matches(MQ.small);
}

/** html[data-page] de la page affichée */
export function currentPage(): string {
  return document.documentElement.dataset.page ?? "";
}
