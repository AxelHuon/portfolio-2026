# Portfolio d'Axel Huon (Astro)

Portfolio de développeur front-end, construit sur le boilerplate Astro des sites vitrines (architecture, SEO, cycle
de vie JS), sans CMS : le contenu est écrit en code. L'accueil s'ouvre sur un portrait en pose longue que la souris
traîne en WebGL (three.js), puis présente les services (web apps, sites vitrines, e-commerce). Le site est en anglais (textes, titres, adresses : `/about`, `/projects`,
`/contact`, `/legal`) ; le code et ses commentaires restent en français.

Ce que le site a d'office :
- un site statique (Astro), généré au build, déployé sur Cloudflare à chaque push ;
- le SEO (titres, descriptions, canonical, Open Graph, JSON-LD, sitemap, robots.txt, redirections 301) ;
- un cycle de vie JS prêt pour GSAP et Lenis avec le ClientRouter (transitions entre pages, nettoyage par page) ;
- un loader au premier chargement, et le hero WebGL de l'accueil (three.js chargé à la demande) ;
- l'accessibilité de base (lien d'évitement, focus après navigation, menu au clavier, mouvement réduit) ;
- les en-têtes de sécurité et de cache, et un contrôle des budgets (JS, CSS, polices, liens, images).

## Stack

| | |
|---|---|
| Site | Astro 7.4.2 (statique, ClientRouter), TypeScript 6.0.3, Tailwind 4.3.3 |
| Animation | GSAP 3.15 (plugins compris, licence gratuite y compris commerciale), Lenis 1.3.26 |
| WebGL | three.js 0.186.1 (`@types/three` 0.186.0), seulement dans le chunk différé du hero |
| Police | Fontshare : Satoshi (400, 500) partout, servie depuis le site |
| Hébergement | Cloudflare Workers, assets statiques (Workers Builds à chaque push sur `main`) |
| Outils | Node 24 (`.node-version`), pnpm 10 (`packageManager`), versions exactes (`pnpm add -E`) |

TypeScript reste en 6 : `@astrojs/check` 0.9.12 n'accepte que les versions 5 et 6. Cloudflare plutôt que Vercel ou
Netlify : le plan Hobby de Vercel interdit l'usage commercial, et le plan gratuit de Netlify coupe le site quand ses
crédits sont épuisés.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm install` | dépendances |
| `pnpm dev` | serveur de développement |
| `pnpm build` | `astro build` dans `dist/` |
| `pnpm check` | `astro check` (types du site) |
| `pnpm check:budgets` | budgets et structure du build, après `pnpm build` |

## À compléter

- `site.config.mjs` : le domaine (`SITE_URL`).
- `src/data/site.ts` : contact, réseaux, mentions légales (encore les valeurs d'exemple).
- `src/data/content.ts` : l'à-propos et les projets (encore ceux de la démo, images de `public/img/demo/`) ; les
  textes des services (`services`) sont un premier jet.
- `wrangler.jsonc` : `name` (le Worker Cloudflare).
- Icônes : `node scripts/assets/icons.mjs` (depuis `src/assets/logo.svg`, sur `#06122b` : favicon SVG et ICO,
  apple-touch-icon, icônes du manifeste dont une maskable). Le logo du header et du loader lit le même SVG
  (`src/components/Logo.astro`).
- Image de partage : `node scripts/assets/images.mjs sources/partage.jpg og original "" v2 --og`
  (`public/og-v2.jpg`, puis `site.ogImage` et `public/_headers`).
- **Cloudflare.** Workers & Pages → Create → importer le dépôt : commande de build `pnpm build`, déploiement
  `npx wrangler deploy`. Aucune variable n'est nécessaire. Puis le domaine personnalisé.

## Architecture

```
astro.config.mjs            site, URL sans .html, sitemap, 301, polices, découpage du JS
site.config.mjs             domaine, pages hors moteurs (lu par la config d'Astro, sans dépendance)
wrangler.jsonc              Cloudflare Workers, assets statiques
public/_headers             cache immutable des fichiers versionnés, CSP et en-têtes de sécurité
src/data/site.ts            réglages en code : identité, navigation, SEO, contact, mentions, micro-textes, JSON-LD
src/data/content.ts         le contenu (accueil, à propos, projets) : importé par les .astro seulement
src/layouts/Base.astro      le layout : SEO, polices, loader, ClientRouter, header, footer, démarrage des scripts
src/components/             Header (bouton « Menu » et petit panneau), Footer, Picture, ProjectCard, ExternalLink
src/pages/                  accueil, about, projects et fiches, contact, legal (mentions légales), 404, robots.txt, manifeste
src/styles/global.css       Tailwind 4, tokens du projet, loader, état caché avant une entrée, base accessible
src/scripts/app.ts          cycle de vie avec le ClientRouter
src/scripts/transition.ts   transition entre les pages (fondu neutre)
src/scripts/pages/          un module par page (init → destroy), chargé à la demande
src/scripts/gl/hero-flow.ts le hero WebGL (three.js), importé par pages/home.ts
src/scripts/chrome/         menu (panneau qui apparaît en fondu flou), loader du premier chargement
src/scripts/lib/            Lenis, courbes GSAP, plugins, media queries, préchargement, annonces
scripts/assets/             images en AVIF et WebP, icônes, image de partage
scripts/check-budgets.mjs   budgets et structure du build
.agents/skills, .claude/skills, skills-lock.json   skills GSAP pour les agents
```

## Le contenu

Tout est dans `src/data/content.ts` (types et valeurs), importé par les `.astro` seulement : un script de
`src/scripts` qui l'importerait mettrait tout le contenu dans le JS initial de toutes les pages. Les réglages qui ne
sont pas du contenu (identité, navigation, titres des pages, contact) sont dans `src/data/site.ts`.

## Les images

- `node scripts/assets/images.mjs <source> <sortie> <ratio> <largeurs> [version]` écrit les variantes dans `public/`
  (avifenc -q 55, cwebp -q 78) et affiche l'objet `Picture` ; `picture()` de `content.ts` le reconstruit depuis le
  nom, les largeurs et la hauteur. Outils : `brew install ffmpeg libavif webp`.
- Le portrait du hero (`public/img/hero/portrait-*-v1`, source `sources/portrait-pose-longue.png`) a ses AVIF
  ré-encodés en `avifenc -q 70` : à 55, la barbe et le grain de peau fondaient en plein écran.
- **Noms versionnés** : `/img`, `/media` et `/_astro` sont servis `immutable` pendant un an (`public/_headers`).
  Changer un fichier, c'est changer son nom (`-v2`). Les sources restent hors du dépôt, dans `sources/` (ignoré par
  git).
- **Affichage** : `<Picture image sizes>` (AVIF puis WebP, width et height). `sizes` doit dire la largeur affichée,
  c'est lui qui choisit la variante. L'image LCP d'une page : `loading="eager"`, `fetchpriority="high"` et un
  `<link rel="preload">` dans le slot `head` de Base, avec les mêmes `srcset` et `sizes`. `class` remplace le
  dimensionnement par défaut de l'`<img>` (`h-full w-full object-cover` pour couvrir le parent).
  Jamais d'`astro:assets` : les médias vivent dans `public/`.

## Polices et couleurs

- **Couleurs** : les tokens `@theme` de `src/styles/global.css` (`bg-background`, `text-foreground`, `text-muted`,
  `border-border`, `bg-accent`…). Un dégradé « mesh » de bleus (`--color-mesh-*` : bleu nuit, ardoise, bleu,
  bleu ciel, crème) est le fond du hero et du loader : le shader le lit dans le CSS, `.mesh` (global.css) le reproduit
  pour le loader et le hero sans WebGL ; positions des taches à changer aux deux endroits. La page est d'un bleu
  presque noir (`#06122b`), l'accent bleu ciel (`#9fdcff`) marque les états (barre du loader, lien courant, focus,
  sélection). `--color-background` = `site.themeColor` (barre du navigateur, manifeste, fond des icônes).
- **Police** : l'API Fonts d'Astro (`fonts` dans `astro.config.mjs`), fournisseur `fontshare`. Astro télécharge la
  police au build, la sert depuis `/_astro/fonts` (cache immutable, CSP `font-src 'self'`), et `<Font>` (Base.astro)
  la précharge avec une police de repli aux mêmes métriques : pas de saut à son arrivée. Satoshi partout : 400 pour le
  texte, 500 pour le nom, les titres et les liens (`font-sans`, et `font-display` qui en est l'alias). Changer de
  police : `name` (et `weights`) dans `astro.config.mjs`, les graisses préchargées dans Base.astro ; plafond de
  64 Kio de polices préchargées dans `check:budgets`.

## Le hero, les services et le loader

- **Loader** (`#loader` dans Base.astro, `chrome/loader.ts`) : la mise au point, sans écran à part. Un aplat bleu
  (`--color-loader`) le temps que la page soit prête (`PageInstance.ready`, plafonné à 6 s), puis il s'efface sur la
  page : sur l'accueil, le hero y est très flou, sombre et agrandi, et la progression du chargement en fait la mise
  au point et le dézoom autour du visage (`onLoaderProgress` → `home.ts`, `DEZOOM` → `setIntro` de `hero-flow.ts`). Par-dessus, le nom à la place exacte de celui du
  header (qui le relaie sans saut) et, en bas, une barre de chargement sur toute la largeur, son pourcentage en
  grand au-dessus, qui suit la tête de la barre. La progression monte
  seule jusqu'à 90 en 1,6 s, puis avance lentement jusqu'à 97 tant que la page et les polices ne sont pas prêtes
  (jamais figée) ; à 100, l'image est nette, le nom et la barre s'effacent. La page ne se révèle sous le loader qu'en
  haut : rechargée plus bas (le navigateur rend la position, sur la section blanche des services par exemple), l'aplat
  reste jusqu'à la sortie et s'efface avec le nom et la barre, qui ne se verraient pas sur du blanc
  et `afterLoader()` résout : le module de page y cale son entrée (le nom du hero lettre par lettre, le métier, le
  menu). Affiché par le CSS dès la première peinture, sous `html.js` et au premier chargement seulement. Filet CSS :
  masqué à 6 s si le JS ne prend pas la main.
- **Hero** (`pages/home.ts` → `gl/hero-flow.ts`) : le `<picture>` est toujours servi ; un canvas WebGL se pose dessus,
  au même cadrage (`home.focus` : `object-position` et shader). Deux passes : un champ de vitesse du pointeur
  (flowmap en ping-pong, diffusé pour rester doux, qui s'éteint) puis l'image, le dégradé et le portrait par-dessus
  en mode écran, moyennés le long de ce champ comme une pose longue (la traînée étire l'image sans la colorer). L'entrée est une
  mise au point : le portrait part flou (spirale dorée de 24 échantillons dans le shader, pas de filtre CSS) et
  devient net pendant que le nom monte lettre par lettre à la place du compteur ; l'image recule en place (zoom et
  rotation de caméra), le métier glisse depuis la droite. Au premier chargement, c'est la progression du loader qui
  fait la mise au point, sans zoom ; à la fin, le nom, le métier et le menu (qui descend du haut) entrent
  (`pages/home.ts`, `INTRO`, `ZOOM_FROM`). Rien ne bouge ensuite sans la souris. Pendant le flou, le canvas tourne à mi-résolution (`INTRO_SCALE`) : à pleine résolution, la
  transition décrochait. La boucle
  ne tourne que pendant un geste ou l'entrée, puis s'endort sur une image nette ; rien ne tourne hors de l'écran. Les
  réglages (rayon, longueur de traînée, dissipation, diffusion…) sont les constantes en tête de `hero-flow.ts`.
- **Repli** : sans JS, sans WebGL, en mouvement réduit, ou si le contexte est perdu, le `<picture>` reste
  (`data-gl="off"`).
- **Services** (`index.astro`, `services` de `content.ts`) : une feuille blanche, texte en bleu nuit, qui monte
  par-dessus le hero et finit par des coins arrondis sur le bleu nuit du footer. La transition suit le défilement
  (ScrollTrigger en `scrub`, rien d'assisté : `pages/home.ts`, `SCENE`) : la feuille monte un peu plus vite que la
  page, avec son contenu (`SCENE.lead` : 1,4 écran pendant que la page en défile un ; elle garde cette avance, une
  marge négative dessous y recolle le footer), donc le hero est recouvert plus tôt et le titre arrive avec le blanc.
  Son bord bombé (`.services-edge`) se gonfle puis s'aplatit (à plat au départ : en haut de la page, rien ne dépasse
  sur le hero). Dessous, le hero s'enfonce à peine et s'assombrit. Pas de fondu de couleur : bleu nuit et blanc
  mélangés donnent un gris sale. Les titres des services montent de leur masque en arrivant (`data-rise`). Sans JS ou
  en mouvement réduit, la feuille monte simplement. Les scènes essayées avant sont gardées sur les branches
  `scene/portrait-se-range` et `scene/panorama`. Le site ne défile jamais à l'horizontale (`overflow-x: clip` sur
  `html` et `body`, global.css : le bord bombé dépasse de l'écran).

## Animations (GSAP, Lenis, three.js)

Les règles, valables pour toute animation :
- **Un module par page** : `src/scripts/pages/<data-page>.ts` exporte `init(kind)`, qui renvoie `{ destroy(), ready? }`.
  Il est chargé à la demande, au premier chargement puis à chaque arrivée sur la page. `destroy` défait tout :
  tweens, timelines, `SplitText.revert()`, ScrollTrigger, Lenis, écouteurs, rAF, observers, timers, `mm.revert()`,
  contexte WebGL. Une page n'écoute jamais les évènements `astro:*`.
- **Mouvement réduit** : tout ce qui dépend de la fenêtre passe par `gsap.matchMedia()` (`MQ` de `lib/root.ts`).
  Lenis n'est pas créé en mouvement réduit, ni le WebGL. Tout ce qui bouge seul plus de 5 s a sa propre commande de
  pause (WCAG 2.2.2) : le hero ne bouge qu'en réponse au pointeur.
- **Plugins** : enregistrés une fois, dans `src/scripts/lib/plugins/<plugin>.ts`, et importés de là. Courbes
  nommées dans `lib/ease.ts`. N'animer que `transform`, `opacity` et `clip-path`.
- **three.js** : seulement dans `src/scripts/gl/`, importé par `import()` depuis un module de page : il reste hors du
  JS initial (chunk `hero-flow`, déclaré dans `DEFERRED` de `check-budgets`). Une seule horloge, `gsap.ticker`.
- **Transitions** : `src/scripts/transition.ts` (`runExit` dans `e.loader`, `runEnter` après le swap). Jamais
  `visibility` ni `autoAlpha` sur `main` à l'arrivée (le focus du h1 échouerait). Les View Transitions natives sont
  coupées (script inline de Base), pour que GSAP garde la main.
- **Pièges du ClientRouter** (gérés dans `app.ts`) : le swap efface les attributs de `<html>` posés côté client ; un
  script n'est exécuté qu'une fois par session, donc un `is:inline` doit être identique sur toutes les pages, et la
  logique d'une page va dans son module, jamais dans un `<script>` du `.astro` ; après un déploiement, les anciens
  chunks n'existent plus (rechargement automatique, une fois).
- **Contenu caché avant une animation** : `[data-reveal]` (global.css), seulement sous `html.js` et sans mouvement
  réduit, avec un filet CSS (une animation `step-end` de 2,4 s qui le rend visible) si le JS échoue. Le module annule
  le filet (`style.animation = "none"`) et le montre lui-même.
- **Skills** : les skills GSAP officielles sont dans `.claude/skills` (core, timeline, scrolltrigger, plugins,
  performance, utils) ; `threejs-shaders` est installée au niveau utilisateur (`~/.claude/skills`).

## Déploiement, cache et sécurité

- **URL** : réglages liés, à changer ensemble : `trailingSlash: "never"` et `build.format: "file"`
  (astro.config.mjs), `html_handling: "auto-trailing-slash"` (wrangler.jsonc), `_redirects` (écrit au build : les
  variantes en `.html` et à barre finale en 301), et des liens internes écrits `/about`, jamais `/about/` ni
  `.html` (vérifié par `check:budgets`).
- **CSP** : tout en `'self'` (images, polices et médias sont servis par le site ; le WebGL lit l'`<img>` du site). À
  ouvrir au besoin : un formulaire vers un service tiers (`form-action`, `connect-src`), une mesure d'audience
  (`script-src`, `connect-src`), un lecteur intégré (`frame-src`, derrière une façade « cliquer pour charger »).
- **Budgets** : `pnpm build && pnpm check:budgets`. Pour bloquer un déploiement qui les dépasse, la commande de
  build Cloudflare peut devenir `pnpm build && pnpm check:budgets`.

## À vérifier

- **Mentions légales** (LCEN) : éditeur, directeur de la publication, hébergeur avec son adresse et son téléphone ;
  page en `noindex` et hors du sitemap ; crédits photo. Le paragraphe « aucun cookie » n'est vrai que sans mesure
  d'audience ni lecteur intégré.
- **Accessibilité** : un seul `h1` et un `<title>` unique par page ; liens externes en nouvel onglet annoncés
  (`ExternalLink`) ; cibles d'au moins 24 px (44 px pour le menu et le contact) ; contrastes ; mouvement réduit
  respecté.

## Conventions

- Commentaires et docs en français. Chaque fichier commence par un bloc qui dit son rôle et ses raisons ; une
  valeur magique porte sa justification (avec la mesure et sa date). Messages des scripts préfixés (`[images]`), qui
  disent quoi faire et où.
- Les textes sont repris tels quels (casse, tirets) ; les capitales passent par le CSS (`text-transform`) ; les
  micro-textes d'interface sont tous dans `uiText`.
- Les commentaires d'un template `.astro` s'écrivent `{/* … */}` : un commentaire HTML part en production.
- Agents IA : voir `CLAUDE.md`.
