/*
 * Enregistrement unique de ScrollTrigger. Importer ScrollTrigger d'ici, jamais de gsap/ScrollTrigger ailleurs : un
 * seul gsap.registerPlugin pour tout le site. Importé seulement par les modules de page qui s'en servent (et
 * lib/lenis.ts) : il reste hors du JS initial.
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export { ScrollTrigger };
