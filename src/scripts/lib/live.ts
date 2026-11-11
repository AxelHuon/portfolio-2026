/*
 * Région aria-live="polite" de Base.astro (#live) : les annonces qui n'ont pas leur propre région (adresse copiée,
 * filtre appliqué…). Le changement de page est annoncé par le ClientRouter lui-même (astro-route-announcer) : ne
 * jamais l'annoncer ici. La région n'est pas persistante : une annonce faite juste avant un swap est perdue.
 */

let timer = 0;

/** Annonce un texte (micro-texte de uiText) ; un même texte répété est réannoncé */
export function announce(text: string): void {
  const region = document.getElementById("live");
  if (!region) return;
  clearTimeout(timer);
  region.textContent = "";
  // même délai que l'annonceur d'Astro : un lecteur d'écran doit voir la région changer
  timer = window.setTimeout(() => {
    region.textContent = text;
  }, 60);
}
