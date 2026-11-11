/*
 * Loader du premier chargement (#loader dans Base.astro, styles dans global.css). Le CSS l'affiche dès la première
 * peinture, sous html.js et au premier chargement seulement : html[data-kind] absent ou « first ». Les pages suivantes
 * reçoivent « nav » d'app.ts et ne le montrent jamais. Filet : si le JS n'a pas pris la main au bout de 6 s, le CSS le
 * masque.
 *
 * Le nom et le métier, « Portfolio © année », un grand compteur à la place du nom du hero et une ligne de progression ;
 * derrière, des stries de lumière (createStreaks) traversent l'écran comme sur une pose longue de nuit, de plus en plus
 * nombreuses avec la progression. runLoader (app.ts, une fois) prend la main : la progression monte seule jusqu'à
 * CRAWL.to, puis attend la page (PageInstance.ready, plafonné à MAX_WAIT) et les polices, et finit à 100. Sortie : les
 * stries filent (accélérées), le chiffre et les textes sortent par le haut, et le loader se dissout (opacité).
 * afterLoader() résout quand le loader commence à se dissoudre : le module de page y cale son entrée. Le défilement
 * est bloqué pendant ce temps (html.is-loading ; un module qui crée Lenis l'arrête lui-même jusqu'à afterLoader).
 * Mouvement réduit : pas de course, un fondu court.
 */
import { gsap } from "gsap";
import { isReduced } from "../lib/root";

/** Plafond d'attente de la page, en ms : au-delà, le loader part quand même, rien ne reste caché */
const MAX_WAIT = 6000;
/** La progression sans attendre la page : elle n'atteint 100 que la page prête */
const CRAWL = { duration: 1.4, to: 0.86 } as const;
/** Sortie, en s : fin du compte, sortie du chiffre et des textes, dissolution du loader */
const EXIT = { count: 0.45, out: 0.6, dissolve: 0.9 } as const;
/**
 * Les stries : leur nombre, leur longueur (en part de la largeur de l'écran), leur durée de traversée (s), la part en
 * bleu d'accent et en 2 px, leur opacité, et l'accélération de la sortie
 */
const STREAKS = {
  count: 22,
  length: [0.12, 0.42],
  duration: [0.9, 2.2],
  accent: 0.3,
  thick: 0.2,
  opacity: [0.25, 0.9],
  rush: 3,
} as const;
const LOCK = "is-loading";

let gone: Promise<void> = Promise.resolve();

/** Résout quand le loader commence à s'effacer, tout de suite s'il n'y en a pas (navigation, pas de JS au départ) */
export function afterLoader(): Promise<void> {
  return gone;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface Streaks {
  /** allume les stries jusqu'à la part p (0 à 1) de leur nombre */
  light(p: number): void;
  /** toutes allumées et accélérées : la sortie */
  rush(): void;
  kill(): void;
}

/**
 * Des stries de lumière, créées dans le conteneur : chacune traverse l'écran de gauche à droite en boucle, à une
 * hauteur, une longueur et une vitesse tirées au hasard (repeatRefresh : à chaque passage, une autre hauteur). Elles
 * attendent, en pause, que la progression les allume. Seul transform est animé.
 */
function createStreaks(container: HTMLElement): Streaks {
  const random = gsap.utils.random;
  const tweens: gsap.core.Tween[] = [];
  const width = () => container.clientWidth;
  const height = () => container.clientHeight;
  for (let i = 0; i < STREAKS.count; i++) {
    const streak = document.createElement("span");
    streak.className = Math.random() < STREAKS.accent ? "loader-streak loader-streak-accent" : "loader-streak";
    const length = random(STREAKS.length[0], STREAKS.length[1]) * width();
    streak.style.width = `${length}px`;
    if (Math.random() < STREAKS.thick) streak.style.height = "2px";
    streak.style.opacity = String(random(STREAKS.opacity[0], STREAKS.opacity[1]));
    container.append(streak);
    tweens.push(
      gsap.fromTo(
        streak,
        { x: -length, y: () => random(0.08, 0.92) * height() },
        {
          x: () => width() + 20,
          duration: random(STREAKS.duration[0], STREAKS.duration[1]),
          delay: random(0, 0.5),
          ease: "none",
          repeat: -1,
          repeatDelay: random(0.05, 0.6),
          repeatRefresh: true,
          paused: true,
        },
      ),
    );
  }
  let lit = 0;
  return {
    light(p) {
      const count = Math.min(tweens.length, Math.ceil(p * tweens.length));
      for (; lit < count; lit++) tweens[lit]?.play();
    },
    rush() {
      this.light(1);
      for (const tween of tweens) tween.timeScale(STREAKS.rush);
    },
    kill() {
      for (const tween of tweens) tween.kill();
    },
  };
}

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
    release();
    root.classList.remove(LOCK);
    streaks?.kill();
    el.remove();
  };

  const digits = el.querySelector<HTMLElement>("[data-loader-count]");
  const line = el.querySelector<HTMLElement>("[data-loader-line]");
  const metas = Array.from(el.querySelectorAll<HTMLElement>("[data-loader-meta]"));
  const reduced = isReduced();
  const container = el.querySelector<HTMLElement>("[data-loader-streaks]");
  // pas de stries en mouvement réduit
  const streaks = container && !reduced ? createStreaks(container) : null;
  const progress = { value: 0 };
  const paint = () => {
    if (digits) digits.textContent = String(Math.round(progress.value * 100));
    if (line) gsap.set(line, { scaleX: progress.value });
    streaks?.light(progress.value);
  };

  const crawl = reduced ? null : gsap.to(progress, { value: CRAWL.to, duration: CRAWL.duration, ease: "power2.out", onUpdate: paint });
  const page = Promise.race([Promise.resolve(ready).catch(() => undefined), wait(MAX_WAIT)]);
  const fonts = document.fonts.ready.catch(() => undefined);
  const crawled = crawl ? new Promise<void>((resolve) => crawl.eventCallback("onComplete", () => resolve())) : Promise.resolve();

  Promise.all([page, fonts, crawled])
    .then(() => {
      crawl?.kill();
      if (reduced) {
        progress.value = 1;
        paint();
        gsap.to(el, { opacity: 0, duration: 0.3, ease: "none", onStart: release, onComplete: finish });
        return;
      }
      const only = <T>(node: T | null): T[] => (node ? [node] : []);
      gsap
        .timeline({ onComplete: finish, onInterrupt: finish })
        .to(progress, { value: 1, duration: EXIT.count, ease: "power2.inOut", onUpdate: paint })
        // les stries filent
        .call(() => streaks?.rush())
        // le chiffre sort par le haut (le nom du hero montera par le bas, au même endroit), les textes s'envolent,
        // la ligne s'éteint
        .to(only(digits), { yPercent: -110, duration: EXIT.out, ease: "power3.in" }, "+=0.15")
        .to(metas, { y: -16, opacity: 0, duration: EXIT.out, ease: "power3.in", stagger: 0.06 }, "<")
        .to(only(line), { opacity: 0, duration: EXIT.out * 0.6, ease: "none" }, "<")
        // le loader se dissout sur la page : l'entrée de l'accueil (mise au point) part en même temps
        .call(release, undefined, "-=0.2")
        .to(el, { opacity: 0, duration: EXIT.dissolve, ease: "power1.inOut" }, "<");
    })
    .catch(finish);
}
