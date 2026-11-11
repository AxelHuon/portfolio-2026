/*
 * Enregistrement unique de SplitText (masques, autoSplit, onSplit). Importer SplitText d'ici, jamais de
 * gsap/SplitText ailleurs. Dans destroy : split.revert(). Un masque (mask: "lines") rogne les accents et les
 * jambages selon la police : régler son padding pour la police du projet.
 */
import { gsap } from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

export { SplitText };
