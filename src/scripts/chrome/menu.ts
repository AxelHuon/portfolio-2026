/*
 * Le menu (Header.astro) : le bouton « Menu » ouvre un petit panneau sous elle (les liens, l'e-mail, les profils). Un
 * disclosure non modal : aria-expanded sur le bouton, le panneau en hidden quand il est fermé ; la page reste
 * utilisable derrière.
 * Apparition (GSAP) : le panneau passe du flou au net en fondu, comme la mise au point du loader (le « + » du bouton
 * pivote en « × » par le CSS, sur aria-expanded). Le flou (filter) déroge à la règle « transform, opacity, clip-path » : voulu par Axel
 * (11 novembre 2026), sur un petit panneau et le temps d'une demi-seconde ; il est retiré une fois le panneau net (un
 * filtre resté posé peut adoucir le texte). La fermeture joue l'apparition à l'envers, plus vite, puis rend le panneau
 * hidden. Mouvement réduit : sans animation.
 * Échap ferme et rend le focus au bouton ; un clic hors du panneau et du bouton, ou le focus qui en sort, ferment. Le
 * focus va au premier lien à l'ouverture.
 * Le header n'est pas persistant (remplacé à chaque navigation) : app.ts monte le menu à chaque arrivée sur une page et
 * le démonte avant le swap (un lien suivi ferme donc le menu).
 */
import { gsap } from "gsap";
import { isReduced } from "../lib/root";

/** L'apparition : durée (s) et flou de départ (px) ; la fermeture va FASTER fois plus vite */
const OPEN = { duration: 0.5, blur: 12 } as const;
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
      .fromTo(
        panel,
        { opacity: 0, filter: `blur(${OPEN.blur}px)` },
        {
          opacity: 1,
          filter: "blur(0px)",
          duration: OPEN.duration,
          ease: "power2.out",
          onComplete: () => gsap.set(panel, { clearProps: "filter" }),
        },
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
