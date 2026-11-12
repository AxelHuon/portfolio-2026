/*
 * Le menu (Header.astro) : le bouton « Menu » ouvre un petit panneau sous elle (les liens, l'e-mail, les profils). Un
 * disclosure non modal : aria-expanded sur le bouton, le panneau en hidden quand il est fermé ; la page reste
 * utilisable derrière.
 * Apparition (GSAP ; demande d'Axel, 12 novembre 2026 : du mouvement, qui arrive d'en bas, sans le flou d'avant) : le
 * panneau monte en fondu, puis ses lignes ([data-menu-item] : les liens, puis le pied) montent à leur tour, l'une
 * après l'autre (le « + » du bouton pivote en « × » par le CSS, sur aria-expanded). La fermeture joue l'apparition à
 * l'envers, plus vite (tout redescend), puis rend le panneau hidden. Mouvement réduit : sans animation.
 * Échap ferme et rend le focus au bouton ; un clic hors du panneau et du bouton, ou le focus qui en sort, ferment. Le
 * focus va au premier lien à l'ouverture.
 * Le header n'est pas persistant (remplacé à chaque navigation) : app.ts monte le menu à chaque arrivée sur une page et
 * le démonte avant le swap (un lien suivi ferme donc le menu).
 */
import { gsap } from "gsap";
import { EASE } from "../lib/ease";
import { isReduced } from "../lib/root";

/**
 * L'apparition : durée (s) ; d'où montent le panneau et ses lignes (px) ; l'écart entre deux lignes, et le retard de
 * la première sur le panneau (s). La fermeture va FASTER fois plus vite. Durée passée de 0,6 à 0,45 s (retour d'Axel,
 * 12 novembre 2026 : « un chouïa plus rapide »).
 */
const OPEN = { duration: 0.45, rise: 24, itemRise: 14, stagger: 0.04, itemsDelay: 0.06 } as const;
const FASTER = 1.6;

/** Branche le menu de la page affichée ; renvoie la fonction qui le débranche (avant le swap) */
export function mountMenu(): () => void {
  const toggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const panel = document.getElementById("site-menu");
  if (!toggle || !panel) return () => {};

  let open = false;
  let timeline: gsap.core.Timeline | null = null;

  const build = () =>
    gsap
      .timeline({
        paused: true,
        onReverseComplete: () => {
          if (!open) panel.hidden = true;
        },
      })
      .fromTo(panel, { y: OPEN.rise, opacity: 0 }, { y: 0, opacity: 1, duration: OPEN.duration, ease: EASE.out })
      .fromTo(
        panel.querySelectorAll("[data-menu-item]"),
        { y: OPEN.itemRise, opacity: 0 },
        { y: 0, opacity: 1, duration: OPEN.duration, ease: EASE.out, stagger: OPEN.stagger },
        OPEN.itemsDelay,
      );

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close(true);
  };
  // un clic ou le focus hors du panneau et du bouton ferment le menu
  const outside = (target: EventTarget | null) => target instanceof Node && !panel.contains(target) && !toggle.contains(target);
  const onPointerDown = (event: PointerEvent) => {
    if (outside(event.target)) close(false);
  };
  const onFocusIn = (event: FocusEvent) => {
    if (outside(event.target)) close(false);
  };

  const show = () => {
    if (open) return;
    open = true;
    toggle.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    timeline ??= build();
    // mouvement réduit : l'état ouvert d'un coup
    if (isReduced()) timeline.pause().progress(1);
    else timeline.timeScale(1).play();
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn);
    panel.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
  };

  const close = (restoreFocus: boolean): void => {
    if (!open) return;
    open = false;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("focusin", onFocusIn);
    // à l'envers et plus vite ; le panneau redevient hidden à la fin (onReverseComplete)
    if (timeline && timeline.progress() > 0 && !isReduced()) timeline.timeScale(FASTER).reverse();
    else {
      timeline?.pause().progress(0);
      panel.hidden = true;
    }
    if (restoreFocus) toggle.focus();
  };

  const onToggle = () => (open ? close(true) : show());
  toggle.addEventListener("click", onToggle);

  return () => {
    close(false);
    timeline?.kill();
    panel.hidden = true;
    toggle.removeEventListener("click", onToggle);
  };
}
