/*
 * Réglages du site, en code : identité, navigation, titres et descriptions des pages, micro-textes, contact,
 * mentions légales, JSON-LD. Le contenu (accueil, à propos, projets) est dans src/data/content.ts. Ce module
 * n'importe pas ce contenu : un script client peut l'importer sans tirer tout le contenu dans le JS de toutes les
 * pages.
 * Le site est en anglais (demande d'Axel, 11 novembre 2026) : tous les textes visibles, les titres et descriptions,
 * les adresses des pages. Les commentaires du code restent en français.
 * Les textes sont repris tels quels (casse, tirets) ; les capitales passent par le CSS, jamais par ces chaînes.
 * Contact et mentions légales : encore les valeurs d'exemple du boilerplate, à remplacer.
 */

/** html[data-page] : le module src/scripts/pages/<page>.ts, le lien courant du menu, les défauts de pageMeta */
export type PageId = "home" | "about" | "projects" | "contact" | "legal" | "404";
export type NavId = "about" | "projects" | "contact";

export interface OgImage {
  /** chemin depuis la racine du site : JPEG RGB, 1200 × 630, moins de 300 Ko (WhatsApp) */
  src: string;
  width: number;
  height: number;
  alt: string;
}

export const site = {
  name: "Axel Huon",
  /** le métier, sous le nom : loader (Base.astro) et accueil (content.ts, home.role) */
  role: "Front-end developer",
  lang: "en",
  /** = --color-background (src/styles/global.css) : barre du navigateur, manifeste, fond des icônes opaques */
  themeColor: "#06122b",
  /** image de partage par défaut : nom versionné (servie immutable, public/_headers), changer d'image = changer de nom */
  ogImage: { src: "/og-v1.jpg", width: 1200, height: 630, alt: "Axel Huon" } satisfies OgImage,
  /** schema.org : "Organization", "Person" (indépendant), "LocalBusiness" (commerce) */
  entity: "Person",
} as const;

export interface NavItem {
  id: NavId;
  label: string;
  href: `/${string}`;
}

/** Liens internes écrits sans barre finale ni .html : sinon chaque clic et chaque préchargement passe par un 301 */
export const nav: readonly NavItem[] = [
  { id: "about", label: "About", href: "/about" },
  { id: "projects", label: "Projects", href: "/projects" },
  { id: "contact", label: "Contact", href: "/contact" },
];

export const legalLink = { label: "Legal notice", href: "/legal" } as const;

export interface PageMeta {
  title: string;
  description: string;
}

/**
 * Un titre de 30 à 60 caractères avec le métier, une description par page. Record<PageId, …> : une page sans titre ni
 * description ne compile pas.
 */
export const pageMeta: Record<PageId, PageMeta> = {
  home: {
    title: `${site.name} — Front-end developer`,
    description: "Portfolio of Axel Huon, front-end developer: websites, web apps and e-commerce, with smooth animations.",
  },
  about: { title: `About — ${site.name}`, description: "Background and way of working of Axel Huon, front-end developer." },
  projects: { title: `Projects — ${site.name}`, description: "A selection of websites and web apps built by Axel Huon." },
  contact: { title: `Contact — ${site.name}`, description: "Get in touch with Axel Huon about a web project or a collaboration." },
  legal: { title: `Legal notice — ${site.name}`, description: "Publisher, hosting provider and personal data." },
  "404": { title: `Page not found — ${site.name}`, description: "This page doesn't exist or has been moved." },
};

/** Titre et description de la fiche d'un projet */
export function projectMeta(project: { title: string; summary: string }): PageMeta {
  return { title: `${project.title} — Projects — ${site.name}`, description: project.summary };
}

export const contact = {
  email: "axelhuonpro@gmail.com",
  /** affiché tel quel ; le lien tel: retire les espaces */
  phone: "+33 1 23 45 67 89",
  address: ["1 rue de l'Exemple", "75000 Paris, France"],
  /** profils publics : liens de Contact et du menu (rel="me") et sameAs du JSON-LD */
  socials: [
    { label: "GitHub", href: "https://github.com/AxelHuon" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/axel-huon-6ba3901ba/" },
  ],
} as const;

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Mentions légales (LCEN, article 6) : éditeur, directeur de la publication, hébergeur */
export const legal = {
  publisher: "Axel Huon",
  registration: "SIRET 000 000 000 00000",
  address: contact.address,
  director: "Axel Huon",
  host: {
    name: "Cloudflare, Inc.",
    address: "101 Townsend St, San Francisco, CA 94107, USA",
    phone: "+1 (650) 319-8930",
  },
  /** crédits affichés en bas des mentions (une ligne chacun) ; vide : la section n'apparaît pas */
  credits: [] as readonly string[],
} as const;

/** Micro-textes d'interface, tous ici */
export const uiText = {
  skip: "Skip to content",
  mainNav: "Main navigation",
  menu: "Menu",
  close: "Close",
  /** suffixe masqué des liens qui s'ouvrent dans un nouvel onglet */
  newTab: "(opens in a new tab)",
  /** l'invitation sous la toile des projets de l'accueil */
  dragToExplore: "Drag to explore",
  /** le bouton de la vague du globe, à la fin des projets (WCAG 2.2.2) */
  pauseAnimation: "Pause the animation",
  playAnimation: "Play the animation",
  recentProjects: "Recent projects",
  allProjects: "All projects",
  backToProjects: "Back to projects",
  notFound: "This page doesn't exist or has been moved.",
  backHome: "Back to home",
} as const;

/** « 2025-03-01 » → « March 2025 » (dates du contenu en ISO, formatées au rendu dans la langue du site) */
export function formatMonth(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(site.lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * JSON-LD de toutes les pages, en @graph : l'entité (Axel Huon) partout, WebSite sur l'accueil seulement (Google en
 * tire le nom du site). extra : les nœuds d'une page (CreativeWork, BreadcrumbList d'une fiche projet).
 * schema.org : une Person a une image, une Organization un logo.
 */
export function siteJsonLd(origin: URL | string, isHome: boolean, extra: object[] = []) {
  const home = new URL("/", origin).href;
  const entity = {
    "@type": site.entity,
    "@id": `${home}#entity`,
    name: site.name,
    url: home,
    [site.entity === "Person" ? "image" : "logo"]: new URL("/icon-512.png", origin).href,
    email: contact.email,
    telephone: contact.phone,
    sameAs: contact.socials.map((social) => social.href),
  };
  const website = {
    "@type": "WebSite",
    "@id": `${home}#website`,
    name: site.name,
    url: home,
    inLanguage: site.lang,
    publisher: { "@id": `${home}#entity` },
  };
  return { "@context": "https://schema.org", "@graph": [...(isHome ? [website] : []), entity, ...extra] };
}
