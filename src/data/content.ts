/*
 * Le contenu du portfolio (accueil, à propos, projets), écrit ici en code et lu au build.
 * Seuls les fichiers .astro importent ce module : un script de src/scripts qui l'importerait mettrait tout le
 * contenu dans le JS initial de toutes les pages (chunk « base »).
 * Images : node scripts/assets/images.mjs écrit les variantes dans public/ et affiche l'objet Picture ; picture()
 * ci-dessous en reconstruit un depuis le nom, les largeurs et la hauteur de la plus grande.
 * Les projets et l'à-propos sont encore ceux de la démo (images de public/img/demo) : à remplacer.
 */
import { site, type OgImage } from "./site";

/**
 * Une image aux tailles du site, en AVIF et en WebP. avif et webp sont des srcset (« url 480w, … ») ; src et
 * width/height : la plus grande variante WebP (repli, et ratio réservé avant le chargement).
 */
export interface Picture {
  src: string;
  width: number;
  height: number;
  alt: string;
  avif: string;
  webp: string;
}

/** Point de l'image gardé au recadrage (object-position, et le même cadrage dans le shader du hero), de 0 à 1 */
export interface Focus {
  x: number;
  y: number;
}

export interface Project {
  slug: string;
  title: string;
  /** ISO (« 2025-03-01 ») ; formaté au rendu par formatMonth */
  date: string;
  summary: string;
  cover: Picture;
  /** image de partage de la fiche : JPEG 1200 × 630 */
  og: OgImage;
  /** un paragraphe par élément */
  body: string[];
  gallery: Picture[];
}

/**
 * Les variantes écrites par scripts/assets/images.mjs (« <stem>-<largeur>-<version>.avif|webp »). widths : dans
 * l'ordre croissant ; height : celle de la plus grande.
 */
function picture(stem: string, widths: readonly number[], height: number, alt: string, version = "v1"): Picture {
  const largest = widths[widths.length - 1] ?? 0;
  const set = (ext: "avif" | "webp") => widths.map((w) => `${stem}-${w}-${version}.${ext} ${w}w`).join(", ");
  return { src: `${stem}-${largest}-${version}.webp`, width: largest, height, alt, avif: set("avif"), webp: set("webp") };
}

const DEMO_WIDTHS = [480, 768, 1080, 1600] as const;
const demoCover = (name: string, alt: string) => picture(`/img/demo/${name}`, DEMO_WIDTHS, 1066, alt);
const demoPortrait = picture("/img/demo/portrait", [480, 768, 1080], 1350, "Demo image: beige and grey gradient, portrait");
const demoOg = (name: string, alt: string): OgImage => ({ src: `/img/demo/${name}-og-v1.jpg`, width: 1200, height: 630, alt });

export const home = {
  /**
   * Le portrait du hero (source : sources/portrait-pose-longue.png, 2560 × 1440). AVIF ré-encodés en qualité 70
   * (avifenc -q 70) au lieu des 55 du script : à 55 la barbe et le grain de peau fondaient en plein écran.
   */
  image: picture(
    "/img/hero/portrait",
    [768, 1280, 1920, 2560],
    1440,
    "Black and white portrait of Axel Huon, a motion trail sweeping to the left",
  ),
  /** le visage : sur un écran en portrait, le recadrage le garde à l'image (mesuré sur la source, x 0,6 à 0,8) */
  focus: { x: 0.72, y: 0.4 } satisfies Focus,
  role: site.role,
  /** les sites animés comme les apps du quotidien (retour d'Axel, 11 novembre 2026 : « des Instagram-like ») */
  intro: "Websites and web apps, from WebGL and motion to social platforms.",
};

export const about = {
  title: "About",
  body: [
    "First paragraph: background, how long, where.",
    "Second paragraph: way of working, what sets it apart.",
    "Third paragraph: clients, references, what comes next.",
  ],
  image: demoPortrait as Picture | null,
};

/** Dans l'ordre d'affichage : les trois premiers sont repris sur l'accueil */
export const projects: readonly Project[] = [
  {
    slug: "project-one",
    title: "Project one",
    date: "2025-09-01",
    summary: "A one-sentence summary: the client, the brief, the outcome.",
    cover: demoCover("projet-un", "Demo image: blue-grey gradient"),
    og: demoOg("projet-un", "Project one"),
    body: ["The context: who the client was and what they needed.", "The answer: what was built, the choices made, the outcome."],
    gallery: [demoPortrait, demoCover("projet-deux", "Demo image: sand gradient")],
  },
  {
    slug: "project-two",
    title: "Project two",
    date: "2025-04-01",
    summary: "A one-sentence summary: the client, the brief, the outcome.",
    cover: demoCover("projet-deux", "Demo image: sand gradient"),
    og: demoOg("projet-deux", "Project two"),
    body: ["The context: who the client was and what they needed.", "The answer: what was built, the choices made, the outcome."],
    gallery: [demoPortrait, demoCover("projet-trois", "Demo image: grey-green gradient")],
  },
  {
    slug: "project-three",
    title: "Project three",
    date: "2024-11-01",
    summary: "A one-sentence summary: the client, the brief, the outcome.",
    cover: demoCover("projet-trois", "Demo image: grey-green gradient"),
    og: demoOg("projet-trois", "Project three"),
    body: ["The context: who the client was and what they needed.", "The answer: what was built, the choices made, the outcome."],
    gallery: [demoPortrait, demoCover("projet-un", "Demo image: blue-grey gradient")],
  },
];

export function projectBySlug(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}
