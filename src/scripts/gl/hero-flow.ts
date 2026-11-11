/*
 * Le portrait du hero en WebGL (three.js) : la souris le traîne comme la pose longue de la photo. Chargé à la demande
 * par pages/home.ts (import() : three.js reste hors du JS initial, dans son propre chunk).
 *
 * Deux passes à chaque image :
 * 1. le champ de mouvement (flowmap) : deux cibles FLOW_SIZE² en demi-flottants, en ping-pong. La vitesse lissée du
 *    pointeur est déposée le long de son trajet depuis l'image précédente (rg, en écrans par seconde), par un pinceau
 *    sans bord : retombée gaussienne, rayon qui ondule (bruit) ; un geste rapide laisse une traînée continue, pas une
 *    suite de disques (le cercle du pinceau se voyait, retour d'Axel du 11 novembre 2026) ; le champ suit un peu sa propre vitesse (advection :
 *    la traînée continue un instant), se diffuse (il reste doux : pas d'escalier une fois agrandi) et s'éteint
 *    (DISSIPATION par 1/60 s, quelle que soit la fréquence de l'écran) ;
 * 2. l'image : le dégradé « mesh » de la DA (bleu nuit, ardoise, bleu, bleu ciel, crème : --color-mesh-*, global.css)
 *    et le portrait par-dessus en mode écran (son noir laisse voir le dégradé, ses clairs restent clairs). Chaque pixel
 *    moyenne TAPS échantillons des deux le long de la vitesse locale, en lumière linéaire, sans teinte propre : la
 *    traînée étire l'image, elle ne la colore pas. Plus un léger déplacement et un grain fixe. uIntro (1 → 0) est
 *    l'entrée du hero (playIntro) : une mise au point. Le portrait part flou (BLUR_TAPS échantillons sur une spirale
 *    dorée, jusqu'à BLUR hauteurs de rayon) et un peu sombre, et devient net ; le dégradé, déjà doux, n'est pas flouté.
 *
 * La texture : la variante WebP de la largeur que le <picture> a choisie (srcset et sizes), chargée hors de la page,
 * envoyée en RGBA8 brut, sans mipmaps (2560 px pour un écran d'au plus 2880 pixels physiques : pas de réduction qui
 * en aurait besoin), décodée de sRGB en linéaire dans le shader. Le chemin le plus simple qui soit : une texture sRGB
 * à mipmaps générés, prise sur l'<img> de la page, était lue noire (contrôle à 4/255, 11 novembre 2026). Le canvas se
 * pose sur le <picture> au même cadrage (object-cover centré sur focus, comme object-position). La boucle
 * (gsap.ticker, la seule horloge du site) ne tourne que pendant un geste ou l'entrée, puis s'endort sur une image nette : rien ne
 * bouge seul (WCAG 2.2.2), rien ne tourne hors de l'écran.
 * Échec : createHeroFlow résout null et le <picture> reste, avec la raison en console (« [hero] … ») : pas de WebGL,
 * image illisible, shader refusé par le pilote, ou image de contrôle noire (une passe rendue hors écran avant de poser
 * le canvas : un canvas noir ne remplace jamais la photo). Contexte perdu ensuite : onLost.
 */
import { gsap } from "gsap";
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Color,
  LinearSRGBColorSpace,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { MQ, matches } from "../lib/root";

/** Résolution du champ de mouvement : il est flou par nature, 128² suffit et coûte peu */
const FLOW_SIZE = 128;
/** Ce qui reste du champ après 1/60 s : 0,955 → 1 % au bout d'1,7 s */
const DISSIPATION = 0.955;
/** Advection du champ par sa propre vitesse (fraction de la vitesse par seconde) : faible, elle raidit les fronts */
const ADVECT = 0.3;
/** Diffusion du champ par 1/60 s (part de la moyenne des voisins) : le garde doux à 128² */
const DIFFUSE = 0.5;
/** Rayon du pinceau, en hauteurs du hero (retombée gaussienne : à ce rayon, il ne reste que 5 %) */
const RADIUS = 0.2;
/** Ondulation du rayon, en part du rayon (bruit) : le bord du pinceau n'est jamais un cercle */
const WOBBLE = 0.5;
/** Longueur de la traînée par unité de vitesse (écran par seconde), en fraction du hero (0,16 jugé trop flou) */
const STRENGTH = 0.07;
/** Les couleurs du dégradé si le CSS manque (--color-mesh-*, src/styles/global.css) */
const MESH_FALLBACK = { deep: "#0a2552", slate: "#4a5f7f", mid: "#2f6fd6", light: "#5f8fd8", warm: "#eae1c1" } as const;
/** Vitesse plafonnée (écrans par seconde) : un geste brusque ne déchire pas l'image */
const MAX_SPEED = 2.5;
/** Lissage de la vitesse, par 1/60 s : vite vers le geste, plus lentement vers l'arrêt */
const FOLLOW = { move: 0.35, rest: 0.1 } as const;
/** Sans pointermove depuis ce délai (ms), le pointeur est tenu pour arrêté */
const STILL_AFTER = 48;
/** Calme depuis ce délai (s) : la boucle s'endort (le champ est alors sous 1 %) */
const SETTLE = 2;
/** Échantillons le long de la traînée */
const TAPS = 14;
/** Flou de l'entrée : son rayon au départ (en hauteurs du hero) et ses échantillons (spirale dorée) */
const BLUR = 0.07;
const BLUR_TAPS = 24;
/**
 * Résolution du canvas pendant le flou, en part de la normale : une image floue n'a pas besoin de ses pixels, et le
 * flou plein écran à pleine résolution (×2 sur Retina) faisait décrocher la transition (11 novembre 2026). Elle
 * revient à la normale sous INTRO_SHARP de uIntro : le flou restant cache le changement.
 */
const INTRO_SCALE = 0.5;
const INTRO_SHARP = 0.08;
/** Amplitude du grain, appliqué après l'encodage sRGB */
const GRAIN = 0.03;
/** Image de contrôle (px) et seuil : sa valeur la plus claire, sur 255, doit dépasser le grain (± 4) */
const PROBE = { width: 32, height: 18, min: 12 } as const;

/** Une image décodée, prête pour WebGL */
async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

const fail = (reason: string, detail?: unknown) => {
  console.warn(`[hero] WebGL désactivé, la photo reste : ${reason}`, ...(detail === undefined ? [] : [detail]));
  return null;
};

export interface Focus {
  x: number;
  y: number;
}

export interface HeroFlowOptions {
  /** le conteneur du <picture> : le canvas y est ajouté, au-dessus */
  media: HTMLElement;
  /** l'<img> du <picture> : sa variante choisie donne la largeur de la texture */
  img: HTMLImageElement;
  /** le point gardé au recadrage (content.ts, home.focus), de 0 à 1 depuis le haut à gauche */
  focus: Focus;
  /** vrai : la première image est floue, en attente de playIntro ; faux : nette d'emblée */
  intro: boolean;
  /** contexte WebGL perdu : le canvas est retiré, la page remet le <picture> */
  onLost?: () => void;
}

export interface HeroFlow {
  /** une entrée attend encore playIntro (options.intro) */
  readonly introPending: boolean;
  /** l'entrée : la mise au point, du flou au net (durée en s) */
  playIntro(duration: number): gsap.core.Tween;
  /**
   * L'entrée pilotée de l'extérieur (la progression du loader) : 1 flou et sombre, 0 net. playIntro n'est alors plus
   * attendu.
   */
  setIntro(value: number): void;
  destroy(): void;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FLOW_FRAGMENT = /* glsl */ `
  #define WOBBLE ${WOBBLE.toFixed(3)}

  uniform sampler2D tFlow;
  uniform vec2 uMouse;
  uniform vec2 uMousePrev;
  uniform vec2 uVelocity;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uDissipation;
  uniform float uAdvect;
  uniform float uDiffuse;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // bruit de valeur lissé, entre 0 et 1
  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  // distance du point p au segment ab
  float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec3 previous = texture2D(tFlow, vUv).rgb;
    vec2 from = vUv - previous.rg * uAdvect;
    // diffusion : la moyenne des voisins garde le champ doux. Sans elle, un champ entraîné par sa propre vitesse forme
    // des fronts raides, d'un texel à l'autre, en escalier une fois agrandi à l'écran (vu le 11 novembre 2026)
    vec3 around = 0.25 * (
      texture2D(tFlow, from + vec2(uTexel.x, 0.0)).rgb + texture2D(tFlow, from - vec2(uTexel.x, 0.0)).rgb +
      texture2D(tFlow, from + vec2(0.0, uTexel.y)).rgb + texture2D(tFlow, from - vec2(0.0, uTexel.y)).rgb
    );
    vec3 flow = mix(texture2D(tFlow, from).rgb, around, uDiffuse) * uDissipation;

    // en hauteurs du hero (les distances sont rondes à l'écran) : le trajet du pointeur depuis l'image précédente
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 p = vUv * aspect;
    vec2 head = uMouse * aspect;
    float d = segment(p, uMousePrev * aspect, head);
    // un rayon qui ondule, dont le motif suit le geste : jamais deux fois le même contour
    float radius = uRadius * (1.0 - WOBBLE * 0.5 + WOBBLE * valueNoise(p * 7.0 + head * 3.0));
    float speed = length(uVelocity);
    // retombée gaussienne (aucun bord) ; un pointeur immobile n'efface pas la traînée : le dépôt suit la vitesse
    float amount = exp(-3.0 * d * d / (radius * radius)) * min(speed * 4.0, 1.0);
    flow.rg = mix(flow.rg, uVelocity, amount);

    gl_FragColor = vec4(flow.rg, 0.0, 1.0);
  }
`;

const IMAGE_FRAGMENT = /* glsl */ `
  #define TAPS ${TAPS}
  #define BLUR_TAPS ${BLUR_TAPS}
  #define BLUR ${BLUR.toFixed(3)}
  #define GRAIN ${GRAIN.toFixed(3)}
  // l'angle d'or (radians) : les échantillons du flou se répartissent sans motif sur le disque
  #define GOLDEN_ANGLE 2.39996323

  uniform sampler2D tMap;
  uniform sampler2D tFlow;
  uniform vec2 uCover;
  uniform vec2 uOffset;
  uniform float uAspect;
  uniform float uStrength;
  uniform float uIntro;
  uniform float uSeed;
  uniform float uGradient;
  // les couleurs du dégradé, en sRGB (--color-mesh-*, global.css)
  uniform vec3 uDeep;
  uniform vec3 uSlate;
  uniform vec3 uMid;
  uniform vec3 uLight;
  uniform vec3 uWarm;
  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // une tache de couleur gaussienne : aucun bord, à aucune échelle
  float blob(vec2 p, vec2 center, float radius) {
    vec2 d = (p - center) / radius;
    return exp(-2.5 * dot(d, d));
  }

  // un point du hero (uv) en unités de sa plus petite dimension : les taches restent rondes, et à la même échelle
  // sur un écran large comme sur un téléphone en hauteur (en hauteurs d'écran, elles noyaient le visage sur mobile)
  vec2 meshPoint(vec2 uv) {
    return vec2(uv.x * uAspect, uv.y) / min(uAspect, 1.0);
  }

  // le dégradé « mesh », mêmes taches et même ordre que .mesh (global.css), mélangé en sRGB comme dans un outil de
  // design, rendu en linéaire. Réglé sur des aperçus calculés hors ligne (11 novembre 2026) : la tache claire balaie
  // le coin en haut à droite, loin du visage
  vec3 mesh(vec2 uv) {
    vec2 p = meshPoint(uv);
    // déformation douce et fixe : des taches organiques, pas des cercles
    p += 0.05 * vec2(sin(p.y * 3.1 + 1.7), sin(p.x * 2.3 + 0.4));
    vec3 c = uDeep;
    c = mix(c, uSlate, 0.6 * blob(p, meshPoint(vec2(0.02, 0.0)), 0.6));
    c = mix(c, uMid, 0.9 * blob(p, meshPoint(vec2(0.28, 0.62)), 0.9));
    c = mix(c, uLight, 0.6 * blob(p, meshPoint(vec2(1.0, 0.86)), 0.75));
    c = mix(c, uWarm, 0.3 * blob(p, meshPoint(vec2(0.46, 0.18)), 0.38));
    // haut assombri : le header reste lisible
    c = mix(c, uDeep, 0.45 * smoothstep(0.8, 1.0, uv.y));
    return sRGBTransferEOTF(vec4(c, 1.0)).rgb;
  }

  // le portrait recadré comme object-cover (uv de l'écran → uv de la texture), décodé de sRGB en linéaire : la
  // texture est envoyée brute ; sRGBTransferEOTF vient du préfixe de three.js (colorspace_pars_fragment)
  vec3 portrait(vec2 uv) {
    return sRGBTransferEOTF(texture(tMap, uOffset + uv * uCover)).rgb;
  }

  // le portrait flou : un disque de rayon radius (en hauteurs du hero), échantillonné sur une spirale dorée tournée
  // au hasard à chaque pixel (le reste de bruit se lit comme du grain, et disparaît avec le flou)
  vec3 portraitBlur(vec2 uv, float radius) {
    float turn = hash12(gl_FragCoord.xy + uSeed) * 6.2831853;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float r = sqrt((float(i) + 0.5) / float(BLUR_TAPS)) * radius;
      float a = float(i) * GOLDEN_ANGLE + turn;
      sum += portrait(uv + vec2(cos(a) * r / uAspect, sin(a) * r));
    }
    return sum / float(BLUR_TAPS);
  }

  void main() {
    vec2 velocity = texture2D(tFlow, vUv).rg;
    vec2 drag = velocity * uStrength;
    // l'image suit un peu le geste
    vec2 uv = vUv - velocity * uStrength * 0.3;

    vec3 photo;
    vec3 base;
    if (uIntro > 0.001) {
      // l'entrée (mise au point) prime : la traînée ne reprend qu'une fois l'image nette
      photo = portraitBlur(vUv, BLUR * uIntro);
      base = mesh(vUv);
    } else if (dot(drag, drag) < 1e-8) {
      photo = portrait(uv);
      base = mesh(uv);
    } else {
      // décalage par pixel : casse les marches entre échantillons (rendu comme du grain dans la traînée)
      float jitter = hash12(gl_FragCoord.xy + uSeed);
      vec3 photoSum = vec3(0.0);
      vec3 baseSum = vec3(0.0);
      float total = 0.0;
      for (int i = 0; i < TAPS; i++) {
        float t = (float(i) + jitter) / float(TAPS);
        // la traînée s'efface vers sa queue ; même poids pour les trois canaux : elle ne se colore pas
        float weight = 1.0 - t * 0.7;
        vec2 q = uv - drag * t;
        photoSum += portrait(q) * weight;
        baseSum += mesh(q) * weight;
        total += weight;
      }
      photo = photoSum / total;
      base = baseSum / total;
    }

    // exposition : la photo part un peu sombre et s'éclaire avec la mise au point
    vec3 exposed = photo * (1.0 - 0.45 * uIntro);
    // écran : le noir de la photo laisse voir le dégradé, ses clairs restent clairs (uGradient = 0 : la photo seule,
    // pour le contrôle)
    vec3 color = 1.0 - (1.0 - base * uGradient) * (1.0 - exposed);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // grain fixe après l'encodage sRGB : régulier à l'œil, des sombres aux clairs
    gl_FragColor.rgb += (hash12(gl_FragCoord.xy * 1.37 + uSeed * 7.0) - 0.5) * GRAIN;
  }
`;

/** Crée le hero WebGL ; null si WebGL ou l'image manquent (le <picture> reste alors) */
export async function createHeroFlow(options: HeroFlowOptions): Promise<HeroFlow | null> {
  const { media, img, focus } = options;
  // la variante choisie par le <picture> (currentSrc n'est sûr qu'une fois l'image chargée), en WebP
  await img.decode().catch(() => undefined);
  const src = (img.currentSrc || img.src).replace(/\.avif$/, ".webp");
  let source: HTMLImageElement;
  try {
    source = await loadImage(src);
  } catch (error) {
    return fail(`le portrait ne se charge pas (${src})`, error);
  }
  if (!source.naturalWidth || !source.naturalHeight) return fail(`le portrait est vide (${src})`);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
  } catch (error) {
    return fail("WebGL 2 indisponible", error);
  }
  // un shader refusé par le pilote : three.js ne dessine rien et le canvas reste noir ; on le note pour s'arrêter
  const shaderErrors: string[] = [];
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    shaderErrors.push(
      [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join("\n"),
    );
  };
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  const pixelRatio = Math.min(window.devicePixelRatio || 1, matches(MQ.fine) ? 2 : 1.5);
  let renderScale = options.intro ? INTRO_SCALE : 1;
  renderer.setPixelRatio(pixelRatio * renderScale);

  const map = new Texture(source);
  map.colorSpace = NoColorSpace;
  map.minFilter = LinearFilter;
  map.magFilter = LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;

  const target = () =>
    new WebGLRenderTarget(FLOW_SIZE, FLOW_SIZE, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
  let read = target();
  let write = target();

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);

  const flowMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FLOW_FRAGMENT,
    uniforms: {
      tFlow: { value: read.texture },
      uMouse: { value: new Vector2(-10, -10) },
      uMousePrev: { value: new Vector2(-10, -10) },
      uVelocity: { value: new Vector2() },
      uTexel: { value: new Vector2(1 / FLOW_SIZE, 1 / FLOW_SIZE) },
      uAspect: { value: 1 },
      uRadius: { value: RADIUS },
      uDissipation: { value: DISSIPATION },
      uAdvect: { value: 0 },
      uDiffuse: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  // un plan plein écran par passe, écrit directement en coordonnées d'écran : rien à cadrer, jamais écarté
  const quad = (material: ShaderMaterial) => Object.assign(new Mesh(geometry, material), { frustumCulled: false });
  const flowScene = new Scene();
  flowScene.add(quad(flowMaterial));

  // les couleurs du dégradé, lues dans le CSS et gardées en sRGB (LinearSRGBColorSpace : aucune conversion) : le
  // shader les mélange en sRGB, comme un outil de design, puis passe en linéaire
  const root = getComputedStyle(document.documentElement);
  const meshColor = (name: keyof typeof MESH_FALLBACK) =>
    new Color().setStyle(root.getPropertyValue(`--color-mesh-${name}`).trim() || MESH_FALLBACK[name], LinearSRGBColorSpace);
  const imageMaterial = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: IMAGE_FRAGMENT,
    uniforms: {
      tMap: { value: map },
      tFlow: { value: read.texture },
      uCover: { value: new Vector2(1, 1) },
      uOffset: { value: new Vector2() },
      uStrength: { value: STRENGTH },
      uIntro: { value: options.intro ? 1 : 0 },
      uSeed: { value: Math.random() * 100 },
      uAspect: { value: 1 },
      uGradient: { value: 1 },
      uDeep: { value: meshColor("deep") },
      uSlate: { value: meshColor("slate") },
      uMid: { value: meshColor("mid") },
      uLight: { value: meshColor("light") },
      uWarm: { value: meshColor("warm") },
    },
    depthTest: false,
    depthWrite: false,
  });
  const scene = new Scene();
  scene.add(quad(imageMaterial));

  // ── taille et cadrage ──────────────────────────────────────────────────────────────────────────────────────

  const size = { width: 1, height: 1 };
  const resize = () => {
    size.width = Math.max(1, media.clientWidth);
    size.height = Math.max(1, media.clientHeight);
    renderer.setSize(size.width, size.height, false);
    const screen = size.width / size.height;
    const image = source.naturalWidth / source.naturalHeight;
    const cover = imageMaterial.uniforms.uCover.value as Vector2;
    cover.set(screen < image ? screen / image : 1, screen < image ? 1 : image / screen);
    // focus.y part du haut, les uv de la texture du bas
    (imageMaterial.uniforms.uOffset.value as Vector2).set((1 - cover.x) * focus.x, (1 - cover.y) * (1 - focus.y));
    flowMaterial.uniforms.uAspect.value = screen;
    imageMaterial.uniforms.uAspect.value = screen;
  };

  // ── pointeur ───────────────────────────────────────────────────────────────────────────────────────────────

  const pointer = { x: 0, y: 0, at: 0, known: false };
  const measured = new Vector2();
  const still = new Vector2();
  const velocity = flowMaterial.uniforms.uVelocity.value as Vector2;
  const mouse = flowMaterial.uniforms.uMouse.value as Vector2;
  /** la position du pointeur à l'image précédente : le pinceau suit le trajet entre les deux */
  const mousePrev = flowMaterial.uniforms.uMousePrev.value as Vector2;
  let lastMove = -Infinity;

  const onPointerMove = (event: PointerEvent) => {
    const rect = media.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = 1 - (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      pointer.known = false;
      return;
    }
    // le pointeur est sur le hero : il est à l'écran, quoi qu'en dise encore l'IntersectionObserver
    visible = true;
    if (pointer.known) {
      const dt = Math.max(event.timeStamp - pointer.at, 8) / 1000;
      measured.set((x - pointer.x) / dt, (y - pointer.y) / dt);
      if (measured.length() > MAX_SPEED) measured.setLength(MAX_SPEED);
      lastMove = performance.now();
      wake();
    }
    // nouvelle entrée sur le hero : pas de trajet depuis l'ancienne position
    if (!pointer.known) mousePrev.set(x, y);
    pointer.x = x;
    pointer.y = y;
    pointer.at = event.timeStamp;
    pointer.known = true;
    mouse.set(x, y);
  };
  // un nouveau contact (doigt, stylet) ne compte pas comme un geste depuis la position précédente
  const onPointerReset = () => {
    pointer.known = false;
  };

  // ── rendu ──────────────────────────────────────────────────────────────────────────────────────────────────

  const render = (dt: number) => {
    flowMaterial.uniforms.tFlow.value = read.texture;
    flowMaterial.uniforms.uDissipation.value = Math.pow(DISSIPATION, dt * 60);
    flowMaterial.uniforms.uAdvect.value = ADVECT * dt;
    flowMaterial.uniforms.uDiffuse.value = 1 - Math.pow(1 - DIFFUSE, dt * 60);
    renderer.setRenderTarget(write);
    renderer.render(flowScene, camera);
    [read, write] = [write, read];
    mousePrev.copy(mouse);

    imageMaterial.uniforms.tFlow.value = read.texture;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  };

  const clearFlow = () => {
    for (const rt of [read, write]) {
      renderer.setRenderTarget(rt);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
  };

  let awake = false;
  let visible = true;
  let destroyed = false;
  let lost = false;
  let calm = 0;
  let intro: gsap.core.Tween | null = null;
  let introPending = options.intro;

  /** Change la résolution du canvas ; le rendu suit dans la même image (le canvas redimensionné est vide jusque-là) */
  const setRenderScale = (next: number) => {
    if (next === renderScale) return;
    renderScale = next;
    renderer.setPixelRatio(pixelRatio * renderScale);
    renderer.setSize(size.width, size.height, false);
  };

  const tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 50) / 1000;
    setRenderScale((imageMaterial.uniforms.uIntro.value as number) > INTRO_SHARP ? INTRO_SCALE : 1);
    const moving = performance.now() - lastMove < STILL_AFTER;
    const follow = moving ? FOLLOW.move : FOLLOW.rest;
    velocity.lerp(moving ? measured : still, 1 - Math.pow(1 - follow, dt * 60));
    render(dt);
    const busy = moving || intro?.isActive() === true || velocity.lengthSq() > 1e-4;
    calm = busy ? 0 : calm + dt;
    if (calm > SETTLE) sleep();
  };

  function wake(): void {
    if (destroyed || lost || !visible) return;
    calm = 0;
    if (awake) return;
    awake = true;
    gsap.ticker.add(tick);
  }

  /** La boucle s'arrête sur une image nette : le reste du champ (sous 1 %) est effacé */
  function sleep(): void {
    if (!awake) return;
    awake = false;
    gsap.ticker.remove(tick);
    if (destroyed || lost) return;
    velocity.set(0, 0);
    clearFlow();
    render(0);
  }

  const onResize = () => {
    resize();
    if (!awake && !lost) render(0);
  };
  const resizeObserver = new ResizeObserver(onResize);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (!visible) sleep();
    else if (intro?.isActive()) wake();
    // l'entrée a pu finir hors de l'écran : la dernière image peinte serait encore traînée
    else if (!awake && !lost && !destroyed) render(0);
  });

  const onContextLost = () => {
    lost = true;
    sleep();
    canvas.remove();
    options.onLost?.();
  };

  /** Libère tout ce qui vit sur le GPU (destroy, ou échec du contrôle) */
  const release = () => {
    geometry.dispose();
    flowMaterial.dispose();
    imageMaterial.dispose();
    read.dispose();
    write.dispose();
    map.dispose();
    renderer.dispose();
    // libère le contexte tout de suite : chaque retour sur l'accueil en crée un (les navigateurs en limitent le nombre)
    renderer.forceContextLoss();
  };

  /**
   * Contrôle : le portrait rendu net dans une petite cible hors écran, relu. Noir (texture non envoyée, shader refusé,
   * cible de rendu non prise en charge) : on s'arrête avant de poser le canvas sur la photo.
   */
  const check = (): string | null => {
    const probe = new WebGLRenderTarget(PROBE.width, PROBE.height, { type: UnsignedByteType, depthBuffer: false });
    // la photo seule, nette : sans le dégradé, une texture lue noire donnerait une image de contrôle noire
    const intro = imageMaterial.uniforms.uIntro.value as number;
    imageMaterial.uniforms.uIntro.value = 0;
    imageMaterial.uniforms.uGradient.value = 0;
    renderer.setRenderTarget(probe);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(PROBE.width * PROBE.height * 4);
    renderer.readRenderTargetPixels(probe, 0, 0, PROBE.width, PROBE.height, pixels);
    renderer.setRenderTarget(null);
    imageMaterial.uniforms.uIntro.value = intro;
    imageMaterial.uniforms.uGradient.value = 1;
    probe.dispose();
    if (shaderErrors.length) return `shader refusé par le pilote\n${shaderErrors.join("\n")}`;
    let brightest = 0;
    for (let i = 0; i < pixels.length; i += 4) brightest = Math.max(brightest, pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
    if (brightest >= PROBE.min) return null;
    const gl = renderer.getContext();
    return `image de contrôle noire (valeur maximale ${brightest}/255 ; texture ${source.naturalWidth} × ${source.naturalHeight}, ${src} ; erreur GL ${gl.getError()})`;
  };

  // première image, contrôlée, puis le canvas se pose sur le <picture> : jamais de canvas vide ou noir à l'écran
  resize();
  clearFlow();
  render(0);
  const problem = check();
  if (problem) {
    release();
    return fail(problem);
  }
  media.append(canvas);
  if (import.meta.env.DEV) console.info(`[hero] WebGL actif (${src})`);
  canvas.addEventListener("webglcontextlost", onContextLost);
  resizeObserver.observe(media);
  visibility.observe(media);
  addEventListener("pointermove", onPointerMove, { passive: true });
  addEventListener("pointerdown", onPointerReset, { passive: true });
  addEventListener("pointercancel", onPointerReset, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerReset);

  return {
    get introPending() {
      return introPending;
    },
    setIntro(value) {
      introPending = false;
      intro?.kill();
      intro = null;
      imageMaterial.uniforms.uIntro.value = Math.min(Math.max(value, 0), 1);
      wake();
    },
    playIntro(duration) {
      introPending = false;
      intro?.kill();
      const uniform = imageMaterial.uniforms.uIntro;
      intro = gsap.to(uniform, {
        value: 0,
        duration,
        // une mise au point : lente à partir, franche au milieu, douce à l'arrivée
        ease: "power2.inOut",
        onStart: wake,
        // la boucle a pu ne pas tourner (hors écran, onglet masqué) : l'image nette est dessinée quoi qu'il arrive,
        // le canvas ne reste jamais sur la première image, floue
        onComplete: () => {
          if (!awake && !lost && !destroyed) {
            setRenderScale(1);
            render(0);
          }
        },
      });
      wake();
      return intro;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      intro?.kill();
      gsap.ticker.remove(tick);
      awake = false;
      resizeObserver.disconnect();
      visibility.disconnect();
      removeEventListener("pointermove", onPointerMove);
      removeEventListener("pointerdown", onPointerReset);
      removeEventListener("pointercancel", onPointerReset);
      document.documentElement.removeEventListener("pointerleave", onPointerReset);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      release();
      canvas.remove();
    },
  };
}
