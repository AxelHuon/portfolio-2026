/*
 * Module chargé à la demande, hors du JS initial (Vite en fait un chunk à part). get() là où tout doit rester
 * synchrone, load() pour le demander (une seule requête à la fois). Un chargement qui échoue résout null : le code
 * qui l'attend se passe de lui, rien ne reste caché ni bloqué.
 */

export interface Lazy<T> {
  /** Le module s'il est déjà là (synchrone), sinon null */
  get(): T | null;
  /** Demande le module (une seule requête à la fois) ; null si le chargement échoue */
  load(): Promise<T | null>;
  /** Le module, déjà importé statiquement par un autre script */
  provide(mod: T): void;
}

/** Accesseur d'un module chargé à la demande (import() dans `importer`, pour que Vite en fasse un chunk) */
export function lazy<T>(importer: () => Promise<T>): Lazy<T> {
  let mod: T | null = null;
  let request: Promise<T | null> | null = null;
  return {
    get: () => mod,
    load() {
      if (mod) return Promise.resolve(mod);
      request ??= importer().then(
        (loaded) => (mod = loaded),
        () => {
          // réseau coupé : une prochaine demande retentera
          request = null;
          return null;
        },
      );
      return request;
    },
    provide(loaded) {
      mod = loaded;
    },
  };
}
