/*
 * Tâche de basse priorité : requestIdleCallback, avec un repli setTimeout(cb, 200) pour Safari, qui ne le connaît
 * pas. Renvoie la fonction d'annulation (à appeler dans destroy).
 */

export interface IdleOptions {
  /** délai maximal avant exécution, en ms (requestIdleCallback seulement) */
  timeout?: number;
}

const FALLBACK_DELAY = 200;

export function idle(callback: () => void, options: IdleOptions = {}): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => callback(), options.timeout ? { timeout: options.timeout } : undefined);
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, FALLBACK_DELAY);
  return () => window.clearTimeout(handle);
}
