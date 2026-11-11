/*
 * Transition entre les pages : un fondu neutre de <main> (le header est remplacé tel quel), à remplacer par celle de
 * la DA du projet en gardant ce contrat :
 * - runExit tourne dans e.loader (app.ts), en même temps que le fetch de la page suivante ; il résout quand le swap
 *   peut avoir lieu, ne rejette jamais, ne touche jamais au défilement (Astro le note au départ) ;
 * - runEnter tourne dans astro:after-swap, avant la peinture : l'opacité seule, jamais visibility ni autoAlpha sur
 *   main (le focus du h1 échouerait) ;
 * - chaque timeline passe par setCurrent / clearCurrent : une navigation pendant la transition la finit d'un coup.
 */
import { gsap } from "gsap";
import { clearCurrent, setCurrent } from "./lib/timeline";
import type { Kind } from "./types";

const DURATION = { nav: 0.25, reduced: 0.15 } as const;

const main = () => document.getElementById("main");

/** Rend main visible (fin de transition, navigation abandonnée, retour depuis le bfcache) */
export function restoreMain(): void {
  const el = main();
  if (el) gsap.set(el, { clearProps: "opacity" });
}

/** Sortie : résout quand le swap peut avoir lieu */
export function runExit(kind: Kind): Promise<void> {
  const el = main();
  if (kind === "cut" || kind === "first" || !el) return Promise.resolve();
  const duration = DURATION[kind];
  return new Promise<void>((resolve) => {
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      window.clearTimeout(safety);
      resolve();
    };
    // onglet masqué (rAF suspendu) : la navigation n'est jamais bloquée
    const safety = window.setTimeout(release, duration * 1000 + 400);
    const tl = gsap.timeline({
      onComplete: () => {
        clearCurrent(tl);
        release();
      },
      onInterrupt: release,
    });
    setCurrent(tl.to(el, { opacity: 0, duration, ease: "none" }));
  });
}

/** Entrée : dans astro:after-swap, avant la peinture */
export function runEnter(kind: Kind): void {
  const el = main();
  if (kind === "cut" || kind === "first" || !el) return;
  gsap.set(el, { opacity: 0 });
  const tl = gsap.timeline({
    onComplete: () => {
      restoreMain();
      clearCurrent(tl);
    },
  });
  setCurrent(tl.to(el, { opacity: 1, duration: DURATION[kind], ease: "none" }));
}
