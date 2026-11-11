/*
 * Courbes nommées du site, enregistrées une fois (app.ts l'importe en premier). Les courbes de la DA du projet
 * viennent ici, avec leur équivalent CSS --ease-* dans src/styles/global.css si le CSS en a besoin.
 * CustomEase veut un chemin complet : 3 points par segment cubique après C, sinon il le refuse.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// exemple de courbe de marque (cubic-bezier(.7, 0, .2, 1)) : à remplacer par celles du projet
CustomEase.create("brand", "M0,0 C0.7,0 0.2,1 1,1");

export const EASE = { brand: "brand", in: "power3.in", out: "power3.out", inOut: "power3.inOut" } as const;
