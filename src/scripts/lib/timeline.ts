/*
 * Les animations de la transition en cours. Une navigation qui arrive pendant une transition appelle
 * finishTransition() (app.ts) : tout ce qui tourne passe à son état final puis meurt, la nouvelle part de là.
 * Une navigation tient jusqu'à deux timelines à la fois : la sortie (au clic) et l'entrée (après le swap).
 */
import type { gsap } from "gsap";
import type { Timeline } from "../types";

let latest: Timeline | null = null;
const running = new Set<gsap.core.Animation>();
let swapAt = 0;

export function current(): Timeline | null {
  return latest;
}

/** Déclare la timeline de transition en cours ; elle est suivie jusqu'à sa fin */
export function setCurrent(tl: Timeline | null): void {
  latest = tl;
  if (tl) running.add(tl);
}

/** Retire cette timeline si c'est encore la courante (à appeler dans son onComplete) */
export function clearCurrent(tl: Timeline): void {
  if (latest === tl) latest = null;
  running.delete(tl);
}

/** Suit une animation de transition sans en faire la courante ; renvoie la fonction qui l'oublie */
export function track(animation: gsap.core.Animation): () => void {
  running.add(animation);
  return () => running.delete(animation);
}

/** Navigation pendant une transition : tout ce qui tourne encore passe à son état final, puis meurt */
export function finishTransition(): void {
  const animations = Array.from(running);
  running.clear();
  latest = null;
  for (const animation of animations) animation.progress(1).kill();
}

/** Note l'instant du swap : app.ts l'appelle dans astro:after-swap, et au premier chargement */
export function markSwap(at: number = performance.now()): void {
  swapAt = at;
}

/** Millisecondes écoulées depuis le dernier swap (caler une étape d'arrivée dans un module de page) */
export function sinceSwap(): number {
  return performance.now() - swapAt;
}
