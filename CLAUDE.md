# Portfolio d'Axel Huon (Astro)

Architecture, commandes et mise en place : `README.md`. Réponses et commentaires en français.

## Vérifier sans lancer le site

- Ne jamais lancer `pnpm dev`, `pnpm preview` ni un navigateur : le site est lancé et validé par Axel.
- Vérifications permises : `pnpm build`, `pnpm check`, `pnpm check:budgets` (après le build).

## Règles du code

- Le site est en anglais (textes visibles, titres, descriptions, adresses des pages, `lang="en"`) ; commentaires du
  code et docs en français.
- Versions exactes (`pnpm add -E`), Node 24, pnpm 10, TypeScript 6 (pas 7).
- Le contenu (`src/data/content.ts`) n'est importé que par les `.astro`, jamais par `src/scripts`.
- Liens internes sans `.html` ni barre finale (`/about`).
- Médias dans `public/`, noms versionnés (`-v1`), affichés par `<Picture>` ; jamais `astro:assets`.
- Icônes : Phosphor seulement, par `<Icon name>` (`src/components/Icon.astro`) ; jamais un caractère (↗) ni un dessin CSS.
- Un module par page pour le JS (`src/scripts/pages/<data-page>.ts`, `init(kind)` → `{ destroy() }`) : jamais de
  `<script>` de page dans un `.astro`, jamais d'écoute `astro:*` dans une page, `destroy` défait tout.
- Plugins GSAP importés depuis `src/scripts/lib/plugins/` ; mouvement réduit par `gsap.matchMedia()` ; n'animer
  que `transform`, `opacity`, `clip-path`. Skills GSAP dans `.claude/skills`.
- three.js seulement dans `src/scripts/gl/`, chargé par `import()` depuis un module de page (jamais dans le JS
  initial) ; une seule horloge, `gsap.ticker` ; `destroy` libère le contexte WebGL.
- Un script `is:inline` est identique sur toutes les pages (le ClientRouter ne rejoue pas un script déjà vu).
- Commentaires `.astro` en `{/* … */}` ; textes tels quels, capitales par le CSS, micro-textes dans `uiText`.
- Secrets dans `.env` seulement (ignoré par git), jamais affichés ni versionnés.
