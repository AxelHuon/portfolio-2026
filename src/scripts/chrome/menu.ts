/*
 * Menu mobile (Header.astro) : un dialogue non modal (role="dialog" sans aria-modal) pour que le header et son bouton
 * Fermer restent utilisables. Ouvert : le reste de la page est inerte, Tab boucle sur le menu puis le header, Échap
 * ferme et rend le focus au bouton. Le header n'est pas persistant (remplacé à chaque navigation, son aria-current
 * vient du serveur) : app.ts monte le menu à chaque arrivée sur une page et le démonte avant le swap.
 * Sans animation : la DA du projet en ajoutera une (le menu reste peint tant que [data-open] est posé).
 */
import { MQ } from "../lib/root";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest("[inert], [hidden]"),
  );
}

/** Branche le menu de la page affichée ; renvoie la fonction qui le débranche (avant le swap) */
export function mountMenu(): () => void {
  const header = document.getElementById("site-header");
  const menu = document.getElementById("mobile-menu");
  const toggle = header?.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  if (!header || !menu || !toggle) return () => {};

  let open = false;
  let inerted: HTMLElement[] = [];

  // inert : tout sauf le header et le menu (régions live comprises, pour qu'elles parlent encore)
  const setOutsideInert = () => {
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement) || el === header || el === menu || el.inert) continue;
      if (el.matches("script, template, style, [aria-live], .astro-route-announcer")) continue;
      el.inert = true;
      inerted.push(el);
    }
  };
  const releaseInert = () => {
    for (const el of inerted) el.inert = false;
    inerted = [];
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "Tab") return;
    const ring = [...visibleFocusables(menu), ...visibleFocusables(header)];
    if (!ring.length) return;
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? ring.indexOf(active) : -1;
    event.preventDefault();
    const next = index === -1 ? (event.shiftKey ? ring.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + ring.length) % ring.length;
    ring[next]?.focus();
  };

  const openMenu = () => {
    if (open) return;
    open = true;
    menu.hidden = false;
    menu.dataset.open = "";
    toggle.setAttribute("aria-expanded", "true");
    setOutsideInert();
    document.addEventListener("keydown", onKeydown);
    menu.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
  };

  const close = (restoreFocus: boolean) => {
    if (!open) return;
    open = false;
    toggle.setAttribute("aria-expanded", "false");
    releaseInert();
    document.removeEventListener("keydown", onKeydown);
    menu.hidden = true;
    delete menu.dataset.open;
    if (restoreFocus) toggle.focus();
  };

  const onToggle = () => (open ? close(true) : openMenu());
  // passage en grand écran menu ouvert : le menu n'existe plus, on le ferme sans bouger le focus
  const small = matchMedia(MQ.small);
  const onResize = (event: MediaQueryListEvent) => {
    if (!event.matches) close(false);
  };
  toggle.addEventListener("click", onToggle);
  small.addEventListener("change", onResize);

  return () => {
    close(false);
    toggle.removeEventListener("click", onToggle);
    small.removeEventListener("change", onResize);
  };
}
