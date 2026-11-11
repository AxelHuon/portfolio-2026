import type { Kind } from "./scripts/types";

declare global {
  interface Window {
    /**
     * Posé sur popstate par le script inline de Base.astro : vrai quand le navigateur anime déjà le retour (geste
     * de retour d'iOS et de Safari). La navigation se fait alors sans transition (kind « cut »).
     */
    __uaVT?: boolean;
  }

  interface DocumentEventMap {
    /** émis par app.ts au départ d'une navigation, après le choix du kind (un module peut s'y préparer) */
    "site:leave": CustomEvent<{ kind: Kind; to: URL }>;
  }
}

export {};
