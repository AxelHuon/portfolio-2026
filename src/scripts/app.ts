/*
 * Cycle de vie du site avec le ClientRouter d'Astro. Le script de Base.astro appelle start() une fois ; ensuite :
 *   astro:before-preparation  choix du kind, sortie (transition.ts) en même temps que le fetch de la page suivante
 *   astro:before-swap         destroy du module de page, démontage du menu, attributs de <html> reposés
 *   astro:after-swap          menu monté sur le nouveau header, entrée (transition.ts)
 *   astro:page-load           focus sur le h1, module de la page (src/scripts/pages/<html data-page>.ts)
 * Au premier chargement, le loader (chrome/loader.ts) couvre la page jusqu'à ce que son module soit prêt
 * (PageInstance.ready). Une page sans module est permise. Les modules ne s'abonnent jamais aux évènements astro:* : init et destroy
 * suffisent. Ce module n'a aucun effet à son évaluation (il partage le chunk « base » avec d'autres scripts).
 *
 * Pièges du routeur, gérés ici :
 * - le swap efface tous les attributs de <html> posés côté client (swapRootAttributes) : stampRoot les repose sur
 *   le nouveau document ;
 * - le premier astro:page-load part au load de window (après les images) : le premier chargement se fait dans
 *   start(), swapPending fait ignorer ce page-load ;
 * - un clic sur le lien de la page affichée referait fetch et swap : samePage l'arrête ;
 * - après un déploiement, Cloudflare ne sert plus les anciens chunks : la page se recharge une fois (reloadForUpdate).
 */
import type { TransitionBeforePreparationEvent, TransitionBeforeSwapEvent } from "astro:transitions/client";
import "./lib/ease"; // en premier : CustomEase et courbes nommées enregistrés une fois
import { runLoader } from "./chrome/loader";
import { mountMenu } from "./chrome/menu";
import { initIntent } from "./lib/intent";
import { isReduced } from "./lib/root";
import { finishTransition, markSwap } from "./lib/timeline";
import { restoreMain, runEnter, runExit } from "./transition";
import type { Kind, PageInstance, PageModule } from "./types";

const root = document.documentElement;
const loaders = import.meta.glob<PageModule>("./pages/*.ts");

let kind: Kind = "first";
/** le page-load de window.load (premier chargement) est ignoré */
let swapPending = false;
/** une navigation attend son swap */
let awaitingSwap = false;
let page: PageInstance | undefined;
let unmountMenu: (() => void) | undefined;
/** jeton : un init arrivé après une nouvelle navigation est ignoré */
let nav = 0;

function asInstance(result: PageInstance | void): PageInstance | undefined {
  return typeof result === "object" && result !== null ? result : undefined;
}

function destroyPage(next: Kind): void {
  nav++;
  try {
    page?.destroy(next);
  } catch (error) {
    console.error("[site] destroy", error);
  }
  page = undefined;
}

const RELOAD_KEY = "site:reload";
const RELOAD_GUARD_MS = 10000;

/** Recharge la page une fois (garde de 10 s contre une boucle) ; faux si le stockage manque ou si la garde tient */
function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // stockage indisponible : pas de garde contre une boucle, donc pas de rechargement automatique
    return false;
  }
  location.reload();
  return true;
}

async function loadPage(id: string, pageKind: Kind): Promise<void> {
  const token = ++nav;
  try {
    const mod = await (loaders[`./pages/${id}.ts`]?.() ?? Promise.resolve<PageModule>({ init() {} }));
    if (token === nav && id === root.dataset.page) page = asInstance(mod.init(pageKind));
  } catch (error) {
    console.error(`[site] module de page « ${id} »`, error);
    // chunk introuvable : une nouvelle version a été déployée
    if (error instanceof TypeError) reloadForUpdate();
  }
}

function mountChrome(): void {
  unmountMenu?.();
  unmountMenu = mountMenu();
}

/** Après une navigation : le focus va au h1 de la page (un seul par page, dans main), sinon à main */
function focusAfterSwap(): void {
  const target = document.querySelector<HTMLElement>("#main h1") ?? document.getElementById("main");
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

function samePage(e: TransitionBeforePreparationEvent): boolean {
  return e.navigationType !== "traverse" && !e.formData && e.to.href === location.href;
}

/** Le routeur intercepte l'ancre #main du lien d'évitement : le focus est posé à la main */
function onSkip(event: MouseEvent): void {
  if (event.target instanceof Element && event.target.closest(".skip")) document.getElementById("main")?.focus();
}

function stampRoot(next: HTMLElement, navKind: Kind): void {
  next.classList.add("js");
  next.dataset.kind = navKind;
}

function onBeforePreparation(e: TransitionBeforePreparationEvent): void {
  if (samePage(e)) {
    // même URL : n'aboutit jamais (la suivante l'abandonne) ; celle qui attendait son swap vient d'être abandonnée
    e.loader = () => new Promise<void>((resolve) => e.signal.addEventListener("abort", () => resolve(), { once: true }));
    if (awaitingSwap) {
      awaitingSwap = false;
      finishTransition();
      restoreMain();
    }
    return;
  }
  finishTransition();
  awaitingSwap = true;
  kind = e.navigationType === "traverse" && window.__uaVT ? "cut" : isReduced() ? "reduced" : "nav";
  const navKind = kind;
  document.dispatchEvent(new CustomEvent("site:leave", { detail: { kind: navKind, to: e.to } }));
  const load = e.loader;
  e.loader = async () => {
    await Promise.all([load(), runExit(navKind)]);
  };
}

function onBeforeSwap(e: TransitionBeforeSwapEvent): void {
  swapPending = true;
  destroyPage(kind);
  unmountMenu?.();
  unmountMenu = undefined;
  stampRoot(e.newDocument.documentElement, kind);
}

function onAfterSwap(): void {
  awaitingSwap = false;
  markSwap();
  mountChrome();
  try {
    runEnter(kind);
  } catch (error) {
    console.error("[site] entrée", error);
    finishTransition();
    restoreMain();
  }
}

function onPageLoad(): void {
  if (!swapPending) return;
  swapPending = false;
  focusAfterSwap();
  void loadPage(root.dataset.page ?? "", kind);
}

/** Retour depuis le bfcache : une transition interrompue ne doit rien laisser de caché */
function onPageShow(event: PageTransitionEvent): void {
  if (!event.persisted) return;
  awaitingSwap = false;
  finishTransition();
  restoreMain();
}

let started = false;

/** Appelé une fois par le script de Base.astro */
export function start(): void {
  if (started) return;
  started = true;
  addEventListener("vite:preloadError", (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
  stampRoot(root, "first");
  initIntent();
  mountChrome();
  markSwap();
  const first = loadPage(root.dataset.page ?? "", "first");
  runLoader(first.then(() => page?.ready));
  document.addEventListener("astro:before-preparation", onBeforePreparation);
  document.addEventListener("astro:before-swap", onBeforeSwap);
  document.addEventListener("astro:after-swap", onAfterSwap);
  document.addEventListener("astro:page-load", onPageLoad);
  document.addEventListener("click", onSkip);
  addEventListener("pageshow", onPageShow);
}
