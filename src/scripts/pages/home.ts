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
 *
 * Puis les services (index.astro), sur la scène « le portrait se range » (SCENE ; choix d'Axel, 11 novembre 2026,
 * reprise le 12) : le hero reste collé derrière les services, et une timeline (scrub) le rogne (clip-path), entre le
 * haut de la page et l'arrivée des services en haut de l'écran, jusqu'à la place vide de leur colonne de gauche
 * (data-portrait-slot) : une carte arrondie, où l'image se décale pour centrer le visage. Le nom et le métier
 * s'effacent, le fondu du bas aussi ; autour de la carte, le blanc de la scène ; la colonne des services (leur texte
 * bleu) arrive une fois la carte presque formée. Rien n'est assisté : tout suit le défilement (la glissade de la
 * branche a été retirée). Les titres des services montent de leur masque en arrivant (RISE, data-rise). Sur un écran
 * étroit ou bas : le hero, puis les services en blanc, sans scène. Tout est défait par mm.revert() (ScrollTrigger
 * compris).
 *
 * Puis les projets (index.astro, .work ; demande d'Axel, 12 novembre 2026) : une toile infinie de leurs images
 * (gl/work-canvas.ts, chargée quand la section approche : WORK.preload ; choisie dans une veille, après une tornade et
 * une mise au point en profondeur refusées ; fond blanc ; au survol, l'image se bombe sous le pointeur). La transition (demandes d'Axel, 12 novembre 2026 :
 * « rester en scroll block sur services, voir les éléments disparaître », puis plus vite, sans changement de couleur) :
 * quand le bas des services touche celui de l'écran, ils sont épinglés un écran (leur conteneur, [data-services-pin] :
 * ScrollTrigger pin, sans place réservée) ; les projets montent par-dessus pendant que la carte du portrait, puis le
 * titre, les services et l'appel s'en vont vers le haut (PIN), et leurs cartes apparaissent du centre vers les bords
 * (--work-reveal) ; puis la scène des projets se colle (CSS sticky) et la toile défile avec la page ; on la glisse aussi dans tous les sens. Le projet survolé (sur la toile ou
 * dans l'index, data-state) est nommé par une étiquette qui suit le pointeur ; un clic sur une carte suit le lien du
 * projet. Tant que la toile n'est pas prête, ou après un échec : la grille de cartes en HTML.
 */
import { gsap } from "gsap";
import { afterLoader, onLoaderProgress } from "../chrome/loader";
import type { HeroFlow } from "../gl/hero-flow";
import type { WorkCanvas } from "../gl/work-canvas";
import { EASE } from "../lib/ease";
import { createSmoothScroll } from "../lib/lenis";
import { ScrollTrigger } from "../lib/plugins/scroll-trigger";
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
/** La mise au point selon la progression du loader (0 à 1) : encore floue à 90 %, nette seulement à 100 */
const focusAt = (progress: number) => 1 - progress * progress;
/** Le dézoom du premier chargement : l'image part agrandie de DEZOOM et revient à sa taille avec la mise au point */
const DEZOOM = 0.22;
/** En navigation, le texte n'attend pas le canvas au-delà de ce délai (ms) */
const TEXT_WAIT = 900;
/**
 * La scène hero → services, « le portrait se range » (choix d'Axel, 11 novembre 2026, gardée sur la branche
 * scene/portrait-se-range et reprise le 12 novembre à sa demande) : ses conditions (le CSS de index.astro les reprend :
 * à changer ensemble), l'arrondi de la carte (px, celui du panneau du menu), la part de la course où la carte est
 * formée, et [début, fin] de l'arrivée de la colonne des services (la carte presque formée : leur texte bleu ne passe
 * pas sur la photo). Sans la glissade de la branche : le défilement reste à la main (retour d'Axel, 11 novembre 2026)
 */
const SCENE = {
  query: "(prefers-reduced-motion: no-preference) and (min-width: 64rem) and (min-height: 34rem)",
  radius: 16,
  formed: 0.75,
  content: [0.4, 0.75],
} as const;
/** Les titres des services qui montent de leur masque : durée (s), décalage entre deux, seuil (haut du titre) */
const RISE = { duration: 1.1, stagger: 0.08, start: "top 88%" } as const;
/**
 * La fin des services, épinglée (demandes d'Axel, 12 novembre 2026 : « rester en scroll block sur services, voir les
 * éléments disparaître », puis, le même jour, plus vite, sans le changement de couleur) : la
 * durée de l'épinglage (en écrans : le temps que les projets montent par-dessus), la montée des éléments qui s'en vont
 * (en écrans), et [début, fin], en part de l'épinglage, du départ de la carte du portrait, puis de celui du texte (le
 * titre, les services, l'appel, l'un après l'autre). Sans la scène (téléphone, tablette), les services, empilés, sont
 * plus hauts que l'écran : le texte part plus tôt (stacked), et la section finit par un blanc (index.astro) qui place
 * l'appel aux deux tiers de l'écran quand l'épinglage commence ; ainsi tout est parti avant que les projets, qui
 * montent du bas, n'arrivent dessous (retour d'Axel, 12 novembre 2026 : sur téléphone, la feuille des projets coupait
 * E-commerce et l'appel presque aussitôt affichés)
 */
const PIN = { length: 1, rise: 0.08, card: [0, 0.35], text: [0.05, 0.6], stacked: [0, 0.4] } as const;
/**
 * Les projets : la distance (rootMargin) à laquelle la toile se charge (assez tôt pour être prête à l'arrivée : la
 * section change alors de hauteur, hors de l'écran) ; la scène collée, en écrans (le CSS de index.astro en fixe la
 * hauteur, à changer ensemble) : pan, la toile qui défile avec la page, puis morph, la fin de la section (la sphère, la
 * Terre qui se range à côté de la section About : gl/work-canvas.ts, GLOBE) ; [début, fin] de l'arrivée de l'étiquette
 * « Paris », dans la fin de la section, une fois la Terre posée face à Paris (elle reste ensuite), et du bouton de la
 * pause de la vague du globe (là avec la Terre)
 */
const WORK = { preload: "300% 0px", pan: 1.5, morph: 3, paris: [0.6, 0.66], globe: [0.5, 0.58] } as const;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function init(kind: Kind): PageInstance {
  let alive = true;
  const smooth = createSmoothScroll({ scrollTrigger: ScrollTrigger });
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

  // la scène : le hero se range en carte à gauche des services, au rythme du défilement (sans glissade)
  const services = document.querySelector<HTMLElement>("[data-services]");
  const slot = document.querySelector<HTMLElement>("[data-portrait-slot]");
  if (hero && services && slot) {
    mm.add(SCENE.query, () => {
      const frame = hero.querySelector<HTMLElement>("[data-hero-frame]");
      const shade = hero.querySelector<HTMLElement>("[data-hero-shade]");
      const text = hero.querySelector<HTMLElement>("[data-hero-text]");
      const main = services.querySelector<HTMLElement>("[data-services-main]");
      const focus = { x: Number(hero.dataset.focusX ?? 0.5), y: Number(hero.dataset.focusY ?? 0.5) };

      /**
       * La carte, en px dans le hero (collé en haut : ce sont aussi ceux de l'écran) : la place de la colonne de
       * gauche une fois collée (son top CSS), et le décalage de l'image qui y centre le visage. Le visage est à focus
       * de l'écran (object-position = focus) ; le décalage est borné pour que l'image couvre toujours la carte.
       */
      const card = () => {
        const rect = slot.getBoundingClientRect();
        const top = Number.parseFloat(getComputedStyle(slot).top) || 0;
        const width = hero.clientWidth;
        const height = hero.clientHeight;
        const right = width - rect.left - rect.width;
        const bottom = height - top - rect.height;
        return {
          clip: `inset(${top}px ${right}px ${bottom}px ${rect.left}px round ${SCENE.radius}px)`,
          x: gsap.utils.clamp(rect.left + rect.width - width, rect.left, rect.left + rect.width / 2 - focus.x * width),
          y: gsap.utils.clamp(top + rect.height - height, top, top + rect.height / 2 - focus.y * height),
        };
      };

      // de la page en haut (le hero) aux services en haut de l'écran ; la carte est formée à SCENE.formed, la colonne
      // des services arrive ensuite à côté d'elle
      const [contentFrom, contentTo] = SCENE.content;
      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: services, start: "top bottom", end: "top top", scrub: true, invalidateOnRefresh: true },
        })
        .fromTo(
          hero,
          { clipPath: "inset(0px 0px 0px 0px round 0px)" },
          { clipPath: () => card().clip, duration: SCENE.formed, ease: "power1.out" },
          0,
        )
        .fromTo(frame ?? {}, { x: 0, y: 0 }, { x: () => card().x, y: () => card().y, duration: SCENE.formed, ease: "power1.out" }, 0)
        .fromTo(text ?? {}, { opacity: 1, y: 0 }, { opacity: 0, y: 60, duration: 0.3, ease: "power1.in" }, 0)
        .fromTo(shade ?? {}, { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.1)
        .fromTo(main ?? {}, { opacity: 0 }, { opacity: 1, duration: contentTo - contentFrom }, contentFrom)
        .set({}, {}, 1);
    });
  }

  // la section des services : son titre et ceux des services montent de leur masque en arrivant
  mm.add(MQ.motion, (context) => {
    // cachés d'avance, sous leur masque ; ceux déjà passés au chargement montent aussitôt (batch)
    gsap.set("[data-rise]", { yPercent: 105 });
    ScrollTrigger.batch("[data-rise]", {
      start: RISE.start,
      once: true,
      // dans le contexte : défait avec lui (mm.revert)
      onEnter: (targets) =>
        context.add(() =>
          gsap.to(targets, { yPercent: 0, duration: RISE.duration, ease: "expo.out", stagger: RISE.stagger }),
        ),
    });
  });

  // la fin des services, épinglée un écran : les projets, blancs aussi, montent par-dessus (pinSpacing false : la
  // suite de la page continue de défiler sous les services fixés) pendant que leurs éléments s'en vont vers le haut,
  // l'un après l'autre, comme poussés ; la carte du portrait part la première. Le conteneur est épinglé, pas la
  // section (sa colonne est animée par la scène)
  const servicesPin = document.querySelector<HTMLElement>("[data-services-pin]");
  if (services && servicesPin) {
    // refait en passant d'un côté à l'autre de SCENE (le texte ne part pas au même rythme)
    mm.add({ motion: MQ.motion, scene: SCENE.query }, (context) => {
      if (!context.conditions?.motion) return;
      const texts = services.querySelectorAll<HTMLElement>(".services-head, .service, .services-cta");
      const timeline = gsap.timeline({
        defaults: { ease: "power1.in" },
        scrollTrigger: {
          trigger: servicesPin,
          pin: true,
          pinSpacing: false,
          // le bas de la section touche celui de l'écran ; fini quand les projets sont en haut
          start: "bottom bottom",
          end: () => `+=${PIN.length * window.innerHeight}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      const [cardFrom, cardTo] = PIN.card;
      if (hero) timeline.to(hero, { opacity: 0, y: () => -PIN.rise * window.innerHeight, duration: cardTo - cardFrom }, cardFrom);
      const [textFrom, textTo] = context.conditions?.scene ? PIN.text : PIN.stacked;
      timeline.to(
        texts,
        {
          opacity: 0,
          y: () => -PIN.rise * window.innerHeight,
          duration: (textTo - textFrom) / 2,
          stagger: { amount: (textTo - textFrom) / 2 },
        },
        textFrom,
      );
      timeline.set({}, {}, 1);
    });
  }

  // les projets : la toile infinie (gl/work-canvas.ts), chargée quand la section approche ; sans elle, la grille
  const work = document.querySelector<HTMLElement>("[data-work]");
  const workStage = work?.querySelector<HTMLElement>("[data-work-stage]");
  const workGl = work?.querySelector<HTMLElement>("[data-work-gl]");
  if (work && workStage && workGl) {
    mm.add(MQ.motion, () => {
      const items = Array.from(work.querySelectorAll<HTMLElement>("[data-work-item]"));
      const textures = items.map((item) => item.dataset.workTexture ?? "");
      const links = items.map((item) => item.querySelector<HTMLAnchorElement>("a[href]"));
      const names = items.map((item) => item.querySelector(".work-name-inner")?.textContent?.trim() ?? "");
      const cursor = work.querySelector<HTMLElement>("[data-work-cursor]");
      const cursorName = cursor?.querySelector<HTMLElement>("[data-work-cursor-name]");
      const state = { reveal: 0, scroll: 0, morph: 0 };
      let gallery: WorkCanvas | null = null;
      let live = true;

      // l'entrée (la scène monte à l'écran : les cartes apparaissent, puis le titre et l'index, par le CSS), le
      // défilement pendant que la scène est collée (la toile défile avec), puis la fin de la section (le titre et
      // l'invitation s'effacent, l'étiquette « Paris » arrive, par le CSS)
      const [parisIn, parisShown] = WORK.paris;
      const apply = () => {
        work.style.setProperty("--work-reveal", state.reveal.toFixed(3));
        work.style.setProperty("--work-morph", state.morph.toFixed(4));
        const paris = gsap.utils.clamp(0, 1, (state.morph - parisIn) / (parisShown - parisIn));
        work.style.setProperty("--work-paris", paris.toFixed(3));
        // le bouton de la pause de la vague : là avec la Terre (à mi-course), cliquable une fois visible
        const globeShown = gsap.utils.clamp(0, 1, (state.morph - WORK.globe[0]) / (WORK.globe[1] - WORK.globe[0]));
        work.style.setProperty("--work-globe", globeShown.toFixed(3));
        work.toggleAttribute("data-globe", globeShown > 0.5);
        gallery?.setReveal(state.reveal);
        gallery?.setScroll(state.scroll);
        gallery?.setMorph(state.morph);
      };
      const onEntry = (self: ScrollTrigger) => {
        state.reveal = self.progress;
        apply();
      };
      // la scène collée : d'abord la toile qui défile (pan), puis la fin de la section (morph), en part de sa longueur
      const onScroll = (self: ScrollTrigger) => {
        const length = Math.max(0, self.end - self.start);
        const pan = (length * WORK.pan) / (WORK.pan + WORK.morph);
        const scrolled = length * self.progress;
        state.scroll = Math.min(scrolled, pan);
        state.morph = length > pan ? gsap.utils.clamp(0, 1, (scrolled - pan) / (length - pan)) : 0;
        apply();
      };
      ScrollTrigger.create({ trigger: work, start: "top bottom", end: "top top", onRefresh: onEntry, onUpdate: onEntry });
      ScrollTrigger.create({ trigger: work, start: "top top", end: "bottom bottom", onRefresh: onScroll, onUpdate: onScroll });

      // le projet survolé (sur la toile ou dans l'index) : éclairé dans l'index, nommé par l'étiquette
      let labelShown = false;
      const show = (project: number | null) => {
        items.forEach((item, index) => {
          if (index === project) item.dataset.state = "active";
          else delete item.dataset.state;
        });
        if (!cursor || !cursorName) return;
        if (project === null) {
          delete cursor.dataset.visible;
          labelShown = false;
          return;
        }
        cursorName.textContent = names[project] ?? "";
        if (links[project]) cursor.dataset.link = "";
        else delete cursor.dataset.link;
      };
      // l'étiquette suit le pointeur avec un peu de retard ; elle n'apparaît que sur une carte de la toile
      const followX = cursor ? gsap.quickTo(cursor, "x", { duration: 0.35, ease: "power3.out" }) : null;
      const followY = cursor ? gsap.quickTo(cursor, "y", { duration: 0.35, ease: "power3.out" }) : null;
      const onStageMove = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || !cursor) return;
        const rect = workStage.getBoundingClientRect();
        const x = event.clientX - rect.left + 16;
        const y = event.clientY - rect.top + 16;
        // à sa première apparition, l'étiquette se pose sous le pointeur au lieu d'y glisser
        if (labelShown) {
          followX?.(x);
          followY?.(y);
        } else {
          followX?.(x, x);
          followY?.(y, y);
        }
      };
      workStage.addEventListener("pointermove", onStageMove);

      // l'index : survoler ou atteindre au clavier un projet éclaire ses cartes
      const listeners = items.map((item, index) => {
        const on = () => {
          gallery?.highlight(index);
          show(index);
        };
        const off = () => {
          gallery?.highlight(null);
          show(null);
        };
        item.addEventListener("pointerenter", on);
        item.addEventListener("pointerleave", off);
        item.addEventListener("focusin", on);
        item.addEventListener("focusout", off);
        return () => {
          item.removeEventListener("pointerenter", on);
          item.removeEventListener("pointerleave", off);
          item.removeEventListener("focusin", on);
          item.removeEventListener("focusout", off);
        };
      });

      // la pause de la vague du globe (WCAG 2.2.2) : son état, son nom pour les lecteurs d'écran
      const pauseButton = work.querySelector<HTMLButtonElement>("[data-work-pause]");
      let paused = false;
      const onPause = () => {
        paused = !paused;
        gallery?.setPaused(paused);
        if (!pauseButton) return;
        pauseButton.setAttribute("aria-pressed", String(paused));
        const label = paused ? pauseButton.dataset.labelPlay : pauseButton.dataset.labelPause;
        if (label) pauseButton.setAttribute("aria-label", label);
      };
      pauseButton?.addEventListener("click", onPause);

      // sur un écran étroit, la France se pose au-dessus du texte de la section About : la place libre au-dessus de sa
      // fiche, une fois la Terre posée (la section, remontée d'un écran, est alors alignée sur la scène), en part de
      // l'écran ; remesurée à chaque refresh (taille de l'écran, police chargée)
      const about = document.querySelector<HTMLElement>("[data-about]");
      const aboutCard = about?.querySelector<HTMLElement>("[data-about-card]");
      const measureRoom = () => {
        if (!gallery || !about || !aboutCard || !workStage.clientHeight) return;
        const offset = aboutCard.getBoundingClientRect().top - about.getBoundingClientRect().top;
        gallery.setRoom(offset / workStage.clientHeight);
      };
      ScrollTrigger.addEventListener("refresh", measureRoom);

      const fail = () => {
        work.dataset.gl = "off";
        ScrollTrigger.refresh();
      };
      const load = async () => {
        const mod = await import("../gl/work-canvas").catch(() => null);
        if (!live) return;
        const created = mod
          ? await mod
              .createWorkCanvas({
                container: workGl,
                textures,
                land: work.dataset.globeLand ?? "",
                state: { ...state },
                onHover: (project) => {
                  show(project);
                  if (project !== null && cursor) {
                    cursor.dataset.visible = "";
                    labelShown = true;
                  }
                },
                // un clic sur une carte : le lien du projet (nouvel onglet), s'il est en ligne
                onOpen: (project) => links[project]?.click(),
                onLost: fail,
                // l'étiquette de Paris suit la Terre (à côté de ses anneaux) quand elle se range
                onGlobe: ({ x, y, reach }) => {
                  work.style.setProperty("--paris-x", `${(x + reach).toFixed(1)}px`);
                  work.style.setProperty("--paris-y", `${y.toFixed(1)}px`);
                },
              })
              .catch(() => null)
          : null;
        if (!live) {
          created?.destroy();
          return;
        }
        if (!created) return fail();
        gallery = created;
        // la pause a pu être demandée pendant le chargement
        if (paused) gallery.setPaused(true);
        // la grille laisse place à la scène collée : la section change de hauteur, les positions sont recalculées
        work.dataset.gl = "on";
        ScrollTrigger.refresh();
        apply();
      };
      const near = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          near.disconnect();
          void load();
        },
        { rootMargin: WORK.preload },
      );
      near.observe(work);

      return () => {
        live = false;
        near.disconnect();
        ScrollTrigger.removeEventListener("refresh", measureRoom);
        workStage.removeEventListener("pointermove", onStageMove);
        for (const remove of listeners) remove();
        gallery?.destroy();
        gallery = null;
        show(null);
        work.dataset.gl = "pending";
        work.style.removeProperty("--work-reveal");
        work.style.removeProperty("--work-morph");
        work.style.removeProperty("--work-paris");
        work.style.removeProperty("--paris-x");
        work.style.removeProperty("--work-globe");
        work.removeAttribute("data-globe");
        pauseButton?.removeEventListener("click", onPause);
        work.style.removeProperty("--paris-y");
      };
    });
  }

  // les positions dépendent de la police (hauteur des lignes) : recalculées une fois Satoshi chargée
  void document.fonts.ready.then(() => {
    if (alive) ScrollTrigger.refresh();
  });

  return {
    ready,
    destroy() {
      alive = false;
      mm.revert();
      smooth?.destroy();
    },
  };
}
