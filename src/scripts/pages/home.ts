/*
 * Module de la page d'accueil. Le hero : le portrait passe en WebGL (gl/hero-flow.ts, three.js chargé à la demande),
 * traîné par la souris comme la pose longue de la photo ; à l'arrivée, il fait sa mise au point (du flou au net) pendant
 * que le nom monte, à la place du compteur du loader. Tout arrive de quelque part : l'image recule en place (zoom et
 * rotation de caméra), le nom monte lettre par lettre, le métier glisse depuis la droite, au premier chargement le
 * header descend du haut. Rien ne bouge ensuite sans la souris.
 * - Premier chargement : ready dit au loader quand le canvas est prêt. Le loader s'efface alors sur le hero, très flou
 *   et sombre, et sa progression en fait la mise au point (onLoaderProgress → setIntro) en même temps qu'un dézoom
 *   (l'image, agrandie de DEZOOM, revient à sa taille autour du visage). L'entrée du texte et du menu attend sa sortie
 *   (afterLoader), Lenis aussi. Le nom du header ne s'anime pas : il relaie celui du loader, posé au même endroit.
 * - Navigation : l'entrée part dès que le canvas est prêt ; le texte n'attend pas plus de TEXT_WAIT.
 * - Mouvement réduit (gsap.matchMedia) : ni WebGL ni entrée, le <picture> et le texte restent tels quels.
 * États du hero (data-gl) : « pending » (servi ainsi : sous html.js le portrait est caché, filet CSS à 2,4 s), « on »
 * (le canvas est posé dessus), « off » (le <picture> reste).
 * Le texte caché ([data-reveal], global.css) est pris en main ici : son filet CSS est annulé, GSAP le montre.
 */
import { gsap } from "gsap";
import { afterLoader, onLoaderProgress } from "../chrome/loader";
import type { HeroFlow } from "../gl/hero-flow";
import { EASE } from "../lib/ease";
import { createSmoothScroll } from "../lib/lenis";
import { MQ, matches } from "../lib/root";
import type { Kind, PageInstance } from "../types";

/**
 * Entrée, en s : la mise au point, la montée des lettres du nom (durée, décalage entre deux lettres, départ : le
 * chiffre du loader vient de sortir), le recul de l'image, la descente du header
 */
const INTRO = {
  flow: 1.8,
  char: 1.2,
  charStagger: 0.045,
  charDelay: 0.3,
  zoom: 2.8,
  header: 1,
  headerDelay: 0.6,
} as const;
/**
 * L'image au départ de l'entrée : agrandie, basse et un peu tournée, elle recule en place (vers le visage, focus de
 * content.ts). À 1,3, elle couvre toujours le hero malgré la rotation, du début à la fin du mouvement.
 */
const ZOOM_FROM = { scale: 1.3, yPercent: 8, rotation: -3, transformOrigin: "72% 40%" } as const;
/** La mise au point selon la progression du loader (0 à 1) : encore floue à 86 %, nette seulement à 100 */
const focusAt = (progress: number) => 1 - progress * progress;
/** Le dézoom du premier chargement : l'image part agrandie de DEZOOM et revient à sa taille avec la mise au point */
const DEZOOM = 0.22;
/** En navigation, le texte n'attend pas le canvas au-delà de ce délai (ms) */
const TEXT_WAIT = 900;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function init(kind: Kind): PageInstance {
  let alive = true;
  const smooth = createSmoothScroll();
  if (kind === "first" && smooth) {
    smooth.lenis.stop();
    void afterLoader().then(() => {
      if (alive) smooth.lenis.start();
    });
  }

  const hero = document.querySelector<HTMLElement>("[data-hero]");
  const mm = gsap.matchMedia();
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  let runs = 0;

  if (hero) {
    mm.add(MQ.motion, (context) => {
      const firstRun = runs++ === 0;
      const media = hero.querySelector<HTMLElement>("[data-hero-media]");
      const img = media?.querySelector("img") ?? null;
      const text = hero.querySelector<HTMLElement>("[data-reveal]");
      const chars = hero.querySelectorAll<HTMLElement>("[data-reveal-char]");
      const fades = hero.querySelectorAll<HTMLElement>("[data-reveal-fade]");
      // le header ne s'anime qu'au premier chargement (le loader le cache) : en navigation, il est déjà là
      const headerItems =
        kind === "first" ? document.querySelectorAll<HTMLElement>("#site-header [data-header-actions] > *") : [];
      let live = true;
      /** le canvas posé, pour le cleanup (glReady le donne aussi, une fois prêt) */
      const gl: { flow: HeroFlow | null } = { flow: null };
      let loaderGone = false;
      void afterLoader().then(() => (loaderGone = true));
      // premier chargement : la progression du loader fait la mise au point du hero (dès que le canvas est là) et son
      // dézoom, autour du visage (focus de content.ts, comme object-position)
      const origin = `${Number(hero.dataset.focusX ?? 0.5) * 100}% ${Number(hero.dataset.focusY ?? 0.5) * 100}%`;
      if (kind === "first" && media) gsap.set(media, { scale: 1 + DEZOOM, transformOrigin: origin });
      const stopFocus = onLoaderProgress((progress) => {
        gl.flow?.setIntro(focusAt(progress));
        if (media) gsap.set(media, { scale: 1 + DEZOOM * focusAt(progress) });
      });

      // le texte : filet CSS annulé, caché le temps de l'entrée (seulement la première fois : déjà vu ensuite)
      if (text) text.style.animation = "none";
      if (firstRun && text) {
        gsap.set(text, { opacity: 1 });
        gsap.set(chars, { yPercent: 115, rotation: 8 });
        gsap.set(fades, { opacity: 0, x: 80 });
      }
      // le recul de caméra et la mise au point : seulement en arrivant d'une autre page (au premier chargement, le loader
      // pose la photo à sa place, elle ne doit plus bouger)
      const camera = firstRun && kind !== "first";
      // l'image et le header à leur point de départ (cachés derrière le loader, ou par l'état « pending » du hero)
      if (camera && media) gsap.set(media, ZOOM_FROM);
      gsap.set(headerItems, { opacity: 0, y: -40 });

      const off = () => {
        hero.dataset.gl = "off";
      };

      const glReady = (async (): Promise<HeroFlow | null> => {
        if (!media || !img) return null;
        const mod = await import("../gl/hero-flow").catch(() => null);
        if (!live || !mod) return null;
        // le portrait est déjà à l'écran (filet CSS passé, loader parti) : pas d'entrée, le canvas le remplace net
        const shown = loaderGone && getComputedStyle(img).opacity !== "0";
        const focus = { x: Number(hero.dataset.focusX ?? 0.5), y: Number(hero.dataset.focusY ?? 0.5) };
        // flou au départ : au premier chargement (le loader le met au point) et en arrivant d'une autre page (playIntro)
        const intro = firstRun && !shown;
        const created = await mod.createHeroFlow({ media, img, focus, intro, onLost: off }).catch(() => null);
        if (!live) {
          created?.destroy();
          return null;
        }
        gl.flow = created;
        hero.dataset.gl = created ? "on" : "off";
        return created;
      })().finally(markReady);

      void (async () => {
        await afterLoader();
        await Promise.race([glReady, wait(TEXT_WAIT)]);
        if (!live) return;
        context.add(() => {
          // l'image recule en place, comme une caméra, pendant sa mise au point
          if (camera && media) gsap.to(media, { scale: 1, yPercent: 0, rotation: 0, duration: INTRO.zoom, ease: "expo.out" });
          // premier chargement sans loader qui ait tourné (JS arrivé après son filet) : le dézoom n'a pas eu lieu
          if (kind === "first" && media) gsap.to(media, { scale: 1, duration: INTRO.zoom, ease: "expo.out" });
          if (firstRun && text) {
            gsap.to(chars, {
              yPercent: 0,
              rotation: 0,
              duration: INTRO.char,
              ease: "expo.out",
              stagger: INTRO.charStagger,
              delay: INTRO.charDelay,
            });
            gsap.to(fades, { opacity: 1, x: 0, duration: 1.2, ease: "expo.out", stagger: 0.1, delay: INTRO.charDelay + 0.4 });
          }
          gsap.to(headerItems, {
            opacity: 1,
            y: 0,
            duration: INTRO.header,
            ease: EASE.out,
            stagger: 0.06,
            delay: INTRO.headerDelay,
          });
        });
        const flow = await glReady;
        if (!live || !flow?.introPending) return;
        context.add(() => flow.playIntro(INTRO.flow));
      })();

      return () => {
        live = false;
        stopFocus();
        if (kind === "first" && media) gsap.set(media, { clearProps: "transform" });
        gl.flow?.destroy();
        gl.flow = null;
        off();
      };
    });
    // mouvement réduit : rien à préparer
    if (!matches(MQ.motion)) {
      hero.dataset.gl = "off";
      markReady();
    }
  } else {
    markReady();
  }

  return {
    ready,
    destroy() {
      alive = false;
      mm.revert();
      smooth?.destroy();
    },
  };
}
