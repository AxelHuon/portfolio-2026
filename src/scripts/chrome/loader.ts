/*
 * Loader du premier chargement (#loader dans Base.astro, styles dans global.css). Le CSS l'affiche dès la première
 * peinture, sous html.js et au premier chargement seulement : html[data-kind] absent ou « first ». Les pages suivantes
 * reçoivent « nav » d'app.ts et ne le montrent jamais. Filet : si le JS n'a pas pris la main au bout de 6 s, le CSS le
 * masque.
 *
 * La mise au point : pas d'écran à part. Un aplat bleu le temps que la page soit prête (PageInstance.ready, plafonné
 * à MAX_WAIT), puis il s'efface sur la page ; sur l'accueil, le hero y est très flou et sombre, et chaque pas de la
 * progression est donné aux abonnés (onLoaderProgress) : home.ts en fait la mise au point du hero. Par-dessus, le nom
 * à la place de celui du header et, en bas, une barre de chargement dont le pourcentage suit la tête. runLoader (app.ts, une fois) prend la main : la progression
 * monte seule jusqu'à CRAWL.to, puis attend la page et les polices, et finit à 100 (l'image est nette). Sortie : le
 * nom et le compteur s'effacent, le loader est retiré.
 * afterLoader() résout à ce moment : le module de page y cale son entrée (le nom du hero, le header). Le défilement est
 * bloqué jusque-là (html.is-loading ; un module qui crée Lenis l'arrête lui-même jusqu'à afterLoader).
 * Mouvement réduit : pas de course, un fondu court.
 */
import { gsap } from "gsap";
import { isReduced } from "../lib/root";

/** Plafond d'attente de la page, en ms : au-delà, le loader part quand même, rien ne reste caché */
const MAX_WAIT = 6000;
/** La progression sans attendre la page : elle n'atteint 100 que la page prête */
const CRAWL = { duration: 2.2, to: 0.86 } as const;
/** En s : l'aplat qui s'efface sur la page prête, la fin de la mise au point, la sortie du nom et du compteur */
const EXIT = { reveal: 0.8, count: 1.1, out: 0.45 } as const;
const LOCK = "is-loading";

let gone: Promise<void> = Promise.resolve();
const listeners = new Set<(progress: number) => void>();

/** Résout quand le loader s'en va, tout de suite s'il n'y en a pas (navigation, pas de JS au départ) */
export function afterLoader(): Promise<void> {
  return gone;
}

/**
 * Suit la progression du loader (0 à 1) tant qu'il tourne ; sans loader, n'appelle jamais. Renvoie la fonction qui
 * désabonne (dans destroy).
 */
export function onLoaderProgress(listener: (progress: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Appelé une fois par app.ts, au premier chargement ; ready : la page affichée est prête */
export function runLoader(ready: Promise<unknown>): void {
  const el = document.getElementById("loader");
  if (!el) return;
  // pas affiché (pas le premier chargement), ou filet CSS déjà passé (JS arrivé après 6 s)
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    el.remove();
    return;
  }
  el.style.animation = "none";
  const root = document.documentElement;
  root.classList.add(LOCK);

  let release!: () => void;
  gone = new Promise<void>((resolve) => (release = resolve));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    // la dernière valeur : l'image nette, même si la progression a été coupée
    for (const listener of listeners) listener(1);
    listeners.clear();
    release();
    root.classList.remove(LOCK);
    el.remove();
  };

  const bg = el.querySelector<HTMLElement>("[data-loader-bg]");
  const digits = el.querySelector<HTMLElement>("[data-loader-count]");
  const label = el.querySelector<HTMLElement>("[data-loader-label]");
  const track = el.querySelector<HTMLElement>("[data-loader-track]");
  const fill = el.querySelector<HTMLElement>("[data-loader-fill]");
  const metas = Array.from(el.querySelectorAll<HTMLElement>("[data-loader-meta]"));
  const progress = { value: 0 };
  const paint = () => {
    const p = progress.value;
    if (digits) digits.textContent = String(Math.round(p * 100));
    if (fill) gsap.set(fill, { scaleX: p });
    // le pourcentage finit à la tête de la barre, sans sortir de la piste (calé à gauche au départ, à droite à 100)
    if (label && track) {
      const width = track.clientWidth;
      gsap.set(label, { x: gsap.utils.clamp(0, Math.max(0, width - label.offsetWidth), p * width - label.offsetWidth) });
    }
    for (const listener of listeners) listener(p);
  };

  const reduced = isReduced();
  const crawl = reduced ? null : gsap.to(progress, { value: CRAWL.to, duration: CRAWL.duration, ease: "power2.out", onUpdate: paint });
  const page = Promise.race([Promise.resolve(ready).catch(() => undefined), wait(MAX_WAIT)]);
  const fonts = document.fonts.ready.catch(() => undefined);
  const crawled = crawl ? new Promise<void>((resolve) => crawl.eventCallback("onComplete", () => resolve())) : Promise.resolve();

  // la page prête : l'aplat s'efface, la page apparaît dessous (sur l'accueil, floue, en train de se mettre au point)
  void page.then(() => {
    if (!done && bg) gsap.to(bg, { opacity: 0, duration: reduced ? 0.3 : EXIT.reveal, ease: "power1.inOut" });
  });

  Promise.all([page, fonts, crawled])
    .then(() => {
      crawl?.kill();
      if (reduced) {
        progress.value = 1;
        paint();
        gsap.to(el, { opacity: 0, duration: 0.3, ease: "none", onComplete: finish });
        return;
      }
      gsap
        .timeline({ onComplete: finish, onInterrupt: finish })
        // la fin de la progression : la mise au point s'achève, l'image est nette (l'aplat a fini de s'effacer)
        .to(progress, { value: 1, duration: EXIT.count, ease: "power2.inOut", onUpdate: paint }, `+=${EXIT.reveal * 0.5}`)
        // le nom (relayé par celui du header) et la barre s'effacent
        .to(metas, { opacity: 0, duration: EXIT.out, ease: "power1.in" }, "+=0.1");
    })
    .catch(finish);
}
