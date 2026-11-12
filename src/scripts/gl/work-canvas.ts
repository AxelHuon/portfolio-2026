/*
 * Les projets de l'accueil sur une toile infinie (three.js ; choix d'Axel, 12 novembre 2026, après une tornade puis une
 * mise au point en profondeur refusées : « 6 », la toile infinie de la veille, d'après le tutoriel Codrops « Infinite
 * Canvas », janvier 2026). Chargé à la demande par pages/home.ts (import()) : three.js reste hors du JS initial, dans
 * son chunk, partagé avec le hero.
 *
 * Une grille de grandes images des projets, sans bord : les colonnes sont décalées d'une demi-carte, et deux cartes
 * voisines ne montrent jamais le même projet (projectOf). On la parcourt :
 * - au glisser (souris : dans tous les sens ; toucher : à l'horizontale, le défilement vertical reste au navigateur),
 *   avec de l'élan au lâcher (GLIDE) ; pendant qu'on la tient, elle recule un peu (ZOOM) ;
 * - au défilement de la page (setScroll : la scène est collée, la toile défile avec elle, SCROLL) ;
 * elle est un peu bombée, comme posée sur une sphère : ses bords reculent (CURVE), plus encore avec la vitesse.
 * Le survol (demande d'Axel, 12 novembre 2026 : « une mini distorsion en fonction de la souris », après un flou des
 * autres cartes puis une traînée façon hero refusés) : la carte sous le pointeur se bombe autour de lui, sa forme
 * comme son image (bords compris), comme sous une goutte d'eau, la bosse suivant la souris avec un peu de retard et
 * s'étirant dans le sens du geste (DISTORT) ; en sortant, tout se relâche. On voit laquelle est en avant (FOCUS) : elle
 * grandit un peu, les autres rétrécissent et pâlissent vers le blanc. onHover donne le projet sous le pointeur
 * (l'étiquette de la page), un clic sans glisser onOpen ; highlight() met en avant un projet de la même façon (l'index
 * de la page, au clavier). L'entrée (setReveal), quand la scène monte à l'écran : les cartes apparaissent du centre vers
 * les bords (REVEAL). La fin de la section (setMorph ; GLOBE) : la toile s'enroule en sphère (dans le vertex shader :
 * longitude et latitude proportionnelles à la place sur la toile), qui rapetisse en tournant ; ses cartes se fondent
 * dans la Terre en points (un plan plein écran, la sphère calculée par pixel, le masque des terres de
 * scripts/assets/globe-mask.mjs), qui tourne avec elles et s'arrête face à Paris ; puis on zoome sur la France, l'axe
 * pivotant, pendant que la section About monte, son texte à gauche sur l'Atlantique (onGlobe : la page pose l'étiquette
 * de Paris).
 *
 * Rendu : une caméra orthographique en pixels CSS ; un lot de cartes (assez pour couvrir l'écran, la courbure et le
 * recul compris) replacées à chaque image sur les cases visibles ; la courbure et le recul dans le vertex shader, la
 * distorsion dans le fragment shader, le pointeur ramené sur la grille par l'inverse de la courbure (pick). Textures :
 * la variante WebP 1080 des couvertures (data-work-texture), en RGBA8 avec mipmaps, lues telles quelles (sRGB), sur un
 * canvas transparent (la section est blanche).
 * La boucle (gsap.ticker, la seule horloge du site) ne tourne que pendant un mouvement (glisser, élan, défilement,
 * survol qui se pose ou se relâche) et s'endort ensuite : rien ne bouge seul (WCAG 2.2.2), rien ne tourne hors de
 * l'écran.
 * Échec : createWorkCanvas résout null et la raison va en console (« [work] … ») : la page garde sa grille en HTML.
 * Comme le hero, une image de contrôle rendue hors écran, relue : jamais de canvas noir. Contexte perdu : onLost.
 */
import { gsap } from "gsap";
import {
  Color,
  LinearFilter,
  LinearSRGBColorSpace,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { MQ, matches } from "../lib/root";

/**
 * La grille, en pixels CSS : la largeur des cartes (ratio 3:2 des couvertures) selon celle de l'écran, entre min et
 * max ; l'écart entre deux cartes, en part de leur largeur ; le rayon des coins
 */
const GRID = { width: 0.27, narrow: 0.68, min: 240, max: 560, gap: 0.12, corner: 10 } as const;
/** La courbure : au repos, ajoutée par 1 000 px/s de vitesse, et au plus (part de recul des coins de l'écran) */
const CURVE = { base: 0.07, speed: 0.05, max: 0.16 } as const;
/** Le recul pendant qu'on tient la toile, et son suivi (par 1/60 s) */
const ZOOM = { held: 0.88, follow: 0.12 } as const;
/** L'élan au lâcher : l'amortissement (par s) et le seuil d'arrêt (px/s) ; la vitesse du geste, lissée (par 1/60 s) */
const GLIDE = { friction: 4.5, stop: 8, follow: 0.35 } as const;
/** Le suivi de la position (par 1/60 s) : le glisser répond vite, le défilement est déjà lissé par Lenis */
const FOLLOW = 0.22;
/** Le défilement de la page : la toile en défile cette part (un peu moins que la page : elle semble plus loin) */
const SCROLL = 0.9;
/**
 * La mini distorsion du survol, sur la forme de la carte (ses bords compris, demande d'Axel, 12 novembre 2026) et sur
 * son image : le rayon de la bosse autour du pointeur (en hauteurs de carte) ; push, la forme : ses points s'écartent
 * du pointeur (part de leur distance à lui, au centre de la bosse) ; shape, la forme suit aussi le geste (part du
 * déport) ; bulge et zoom, l'image : tirée vers le pointeur (elle y grossit, comme sous une goutte) et zoomée à peine ;
 * le déport dans le sens du geste (en uv de carte par uv/s de vitesse, plafonné) ; l'arrivée et le départ de l'effet,
 * et le retard de la bosse sur la souris (par 1/60 s)
 */
const DISTORT = {
  radius: 0.6,
  push: 0.16,
  shape: 1.6,
  bulge: 0.08,
  zoom: 0.03,
  drift: 0.035,
  maxDrift: 0.06,
  follow: 0.1,
  track: 0.16,
} as const;
/**
 * La carte en avant (survol, ou index de la page au clavier) : elle grandit de lift ; les autres rétrécissent de shrink
 * et pâlissent vers le blanc (dim : ce qui reste d'elles) ; le suivi (par 1/60 s)
 */
const FOCUS = { lift: 0.04, shrink: 0.035, dim: 0.55, follow: 0.12 } as const;
/** L'entrée : les cartes apparaissent du centre vers les bords (part de l'entrée prise par l'écart), en grandissant */
const REVEAL = { spread: 0.5, from: 0.86 } as const;
/**
 * La fin de la section (setMorph, 0 → 1 ; demande d'Axel, 12 novembre 2026 : la toile se rétracte en sphère, qui
 * rapetisse en tournant, devient la Terre, puis on va vers Paris et la section About). En part de la
 * course, [début, fin] de chaque temps : l'enroulement (la toile, plane, s'enroule sur une sphère : sa courbure va de 0 à
 * 1 / rayon), la rétraction (le rayon passe de start à radius, en part de la plus petite dimension de l'écran, et la
 * toile se réduit à scale : des cartes plus petites sur la sphère), la rotation (turns tours, qui commencent une fois
 * la toile presque enroulée), le fondu des cartes vers la Terre, la Terre qui se penche jusqu'à la latitude de Paris
 * (elle tourne avec les cartes et s'arrête face à Paris), puis le zoom sur la France (demande d'Axel, 12 novembre 2026,
 * après une Terre qui se rangeait à gauche : « zoome sur la France et tourne l'axe ») : avant que le texte de la section
 * About n'arrive, la Terre grossit (son rayon : radius fois la largeur de l'écran, ou son petit côté sur un écran étroit,
 * pour qu'un téléphone tourné ne grossisse pas démesurément ; 1,45 jugé un peu trop zoomé) en se décalant (le centre du
 * disque, donc Paris : x et y, en part de l'écran, depuis son centre ; y vers le haut) et pivote de roll degrés autour
 * de Paris. Sur un écran large, l'Atlantique, à l'ouest, occupe la gauche, où la section pose son texte ; sur un écran
 * étroit (narrow), la France est en haut et le texte en bas. Sous le texte, les points s'effacent en dégradé vers le blanc pendant le zoom (clear, demande d'Axel du même
 * jour : le texte n'était pas lisible sur les gros points de la mer ; puis un dégradé plus long et plus doux, les points
 * passant la moitié de l'écran) : plus aucun jusqu'à clear[0] de l'écran (en largeur depuis la gauche, ou en hauteur
 * depuis le bas sur un écran étroit), puis de retour, peu à peu, jusqu'à clear[1] ; Paris jamais. La Terre en points (choix d'Axel sur
 * maquettes) : un point tous les spacing degrés (0,9 : des points plus petits, retour d'Axel du 12 novembre 2026, à
 * 1,8 la France ne se reconnaissait pas), de rayon dot (part de l'écart), bleu foncé sur la terre, à ocean
 * d'opacité sur la mer ; Paris (le bleu ciel refusé, puis un point bleu foncé trop gros qui se fondait dans la France,
 * retours d'Axel du 12 novembre 2026), un point à peine plus gros que les autres (paris.dot, part de l'écart : même en
 * battant, il ne touche pas ses voisins), dans le bleu vif du dégradé du hero (--color-mesh-mid), qui bat
 */
const GLOBE = {
  wrap: [0, 0.32],
  shrink: [0.12, 0.46],
  spin: [0.22, 0.62],
  turns: 1.25,
  earth: [0.42, 0.56],
  tilt: [0.46, 0.62],
  focus: [0.6, 0.84],
  wide: { radius: 1.25, x: 0.2, y: 0.02 },
  narrow: { radius: 2, x: 0.06, y: 0.2 },
  roll: -16,
  clear: { wide: [0.2, 0.68], narrow: [0.38, 0.66] },
  start: 0.62,
  radius: 0.3,
  scale: 0.36,
  spacing: 0.9,
  dot: 0.36,
  ocean: 0.1,
  paris: { lat: 48.8566, lon: 2.3522, dot: 0.42 },
} as const;
/**
 * La vague (demande d'Axel, 12 novembre 2026 : « un effet de vague sur les points, une pulsation organique », à la place
 * de deux anneaux fins jugés sans effet) : des crêtes partent de Paris et traversent les points, qui grossissent à leur
 * passage (grow : part de leur rayon ; il reste sous la moitié de l'écart, les points ne se touchent pas) et, sur la
 * mer, foncent (sea : leur opacité au sommet) ; length, l'écart entre deux crêtes et speed, leur vitesse (en écarts de
 * points, par seconde), reach, la distance où elles s'éteignent (en degrés), jitter, le décalage de chaque point (part
 * d'une période : pas deux fois la même vague) ; beat, le battement du point de Paris (part de son rayon). Elle bat en
 * continu tant que la Terre est à l'écran (demande d'Axel, le même jour : « pas au scroll, en continu ») ; la page la met
 * en pause (setPaused : son bouton, WCAG 2.2.2), et elle s'apaise ou reprend en douceur (follow, par 1/60 s)
 */
const WAVE = { grow: 0.3, sea: 0.22, length: 12, speed: 9, reach: 45, jitter: 0.18, beat: 0.25, follow: 0.06 } as const;
/** Au-delà de ce déplacement (px), un appui est un glisser, pas un clic */
const CLICK = 6;
/** Image de contrôle (px) et sa valeur minimale (sur 255) : des couvertures lues noires n'y dépasseraient pas */
const PROBE = { width: 48, height: 32, min: 6 } as const;

const VERTEX = /* glsl */ `
  #define RADIUS ${DISTORT.radius.toFixed(4)}
  #define PUSH ${DISTORT.push.toFixed(4)}
  #define SHAPE ${DISTORT.shape.toFixed(4)}

  uniform vec2 uView;
  uniform float uZoom;
  uniform float uCurve;
  uniform float uScale;
  uniform vec2 uSize;
  uniform float uHover;
  uniform vec2 uMouse;
  uniform vec2 uDrift;
  uniform float uBend;
  uniform float uSpin;
  varying vec2 vUv;
  varying float vFacing;

  void main() {
    vUv = uv;
    // la carte, de -0,5 à 0,5 (mise à sa taille par sa matrice)
    vec2 local = position.xy;
    if (uHover > 0.001) {
      // en hauteurs de carte : la bosse reste ronde sur une carte plus large que haute
      vec2 aspect = vec2(uSize.x / uSize.y, 1.0);
      vec2 mouse = uMouse - 0.5;
      float falloff = 1.0 - smoothstep(0.0, RADIUS, length((local - mouse) * aspect));
      falloff *= falloff;
      // les points autour du pointeur s'en écartent : la forme gonfle là, bords compris ; et suivent un peu le geste
      local += (local - mouse) * PUSH * falloff * uHover;
      local += uDrift * SHAPE * falloff * uHover;
    }
    // la carte (grandie ou réduite autour de son centre), placée sur la toile, puis le recul de la toile
    vec2 p = (modelMatrix * vec4(local * uScale, 0.0, 1.0)).xy * uZoom;
    // la fin de la section : la toile enroulée sur une sphère de rayon 1 / uBend (longitude et latitude proportionnelles
    // à la place sur la toile), qui tourne de uSpin ; vue de face, sa moitié arrière (et ce qui passe les pôles) cachée
    float facing = 1.0;
    if (uBend > 1e-7) {
      float lon = p.x * uBend + uSpin;
      float lat = p.y * uBend;
      facing = abs(lat) < 1.5707963 ? cos(lon) * cos(lat) : -1.0;
      lat = clamp(lat, -1.5707963, 1.5707963);
      p = vec2(sin(lon) * cos(lat), sin(lat)) / uBend;
    }
    vFacing = facing;
    // la toile bombée : plus un point est loin du centre de l'écran, plus il recule vers lui (1 dans les coins)
    vec2 n = p / (0.5 * uView);
    p *= 1.0 - uCurve * 0.5 * dot(n, n);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  #define ZOOM ${DISTORT.zoom.toFixed(4)}
  #define RADIUS ${DISTORT.radius.toFixed(4)}
  #define BULGE ${DISTORT.bulge.toFixed(4)}

  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uCorner;
  uniform float uHover;
  uniform vec2 uMouse;
  uniform float uLight;
  uniform float uAlpha;
  varying vec2 vUv;
  varying float vFacing;

  // distance au bord d'un rectangle aux coins arrondis (négative dedans) ; « half » est un mot réservé du GLSL ES
  float roundedBox(vec2 p, vec2 halfSize, float radius) {
    vec2 q = abs(p) - halfSize + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  }

  void main() {
    float edge = roundedBox((vUv - 0.5) * uSize, 0.5 * uSize, uCorner);
    float aa = max(fwidth(edge), 1e-4);
    float alpha = uAlpha * (1.0 - smoothstep(-aa, aa, edge)) * smoothstep(0.0, 0.12, vFacing);
    if (alpha < 0.004) discard;

    vec2 uv = vUv;
    if (uHover > 0.001) {
      // en hauteurs de carte : la bosse reste ronde sur une carte plus large que haute
      vec2 aspect = vec2(uSize.x / uSize.y, 1.0);
      vec2 d = (vUv - uMouse) * aspect;
      float falloff = 1.0 - smoothstep(0.0, RADIUS, length(d));
      falloff *= falloff;
      // les points proches du pointeur sont tirés vers lui : l'image y grossit, comme sous une goutte
      uv -= (d / aspect) * BULGE * falloff * uHover;
      // un zoom à peine, autour du centre : l'image ne sort jamais de son cadre
      uv = 0.5 + (uv - 0.5) * (1.0 - ZOOM * uHover);
    }
    vec3 color = texture2D(uMap, uv).rgb;
    // uLight < 1 : la carte pâlit vers le blanc du fond
    gl_FragColor = vec4(mix(vec3(1.0), color, uLight), alpha);
  }
`;

/** Un plan plein écran, écrit directement en coordonnées d'écran (la Terre) */
const PASS_VERTEX = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/**
 * La Terre en points. Chaque pixel du disque : son point de la sphère (vue de face), ramené dans le repère de la Terre
 * (penchée de uTilt, tournée pour que la longitude uFront soit de face), puis le point de la grille le plus proche
 * (un tous les SPACING de latitude, l'écart en longitude élargi vers les pôles pour garder des points ronds) ; sur la
 * terre (le masque, lu au centre du point) bleu foncé, sur la mer à peine visible. Paris, un point à part, un peu plus
 * gros, en bleu vif (le point de la grille qui tombe dessus, et lui seul, s'efface), qui bat ; et la vague (WAVE) : des crêtes qui
 * partent de Paris et font grossir les points à leur passage (uTime, uWave). Les distances sont des angles : les points restent ronds et nets. Le bord du disque s'estompe
 * (le globe tourne vers l'arrière).
 */
const EARTH_FRAGMENT = /* glsl */ `
  #define EARTH_PI 3.14159265
  #define SPACING ${((GLOBE.spacing * Math.PI) / 180).toFixed(6)}
  #define DOT ${GLOBE.dot.toFixed(4)}
  #define OCEAN ${GLOBE.ocean.toFixed(4)}
  #define PARIS_DOT ${(((GLOBE.spacing * Math.PI) / 180) * GLOBE.paris.dot).toFixed(6)}
  #define WAVE_K ${((2 * Math.PI) / (WAVE.length * ((GLOBE.spacing * Math.PI) / 180))).toFixed(4)}
  #define WAVE_W ${((2 * Math.PI * WAVE.speed) / WAVE.length).toFixed(4)}
  #define WAVE_REACH ${((WAVE.reach * Math.PI) / 180).toFixed(4)}
  #define WAVE_GROW ${WAVE.grow.toFixed(4)}
  #define WAVE_SEA ${WAVE.sea.toFixed(4)}
  #define WAVE_JITTER ${(WAVE.jitter * 2 * Math.PI).toFixed(4)}
  #define WAVE_BEAT ${WAVE.beat.toFixed(4)}

  uniform sampler2D tLand;
  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uFront;
  uniform float uTilt;
  uniform float uRoll;
  uniform vec2 uViewport;
  uniform float uClear;
  uniform vec2 uClearRange;
  uniform float uClearVertical;
  uniform vec3 uParis;
  uniform vec3 uInk;
  uniform vec3 uMark;
  uniform float uTime;
  uniform float uWave;
  uniform float uAlpha;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // le disque pivote de uRoll autour de son centre (Paris, une fois la Terre posée) : l'axe de la Terre penche
    vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
    float cr = cos(uRoll);
    float sr = sin(uRoll);
    p = vec2(p.x * cr + p.y * sr, -p.x * sr + p.y * cr);
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    vec3 v = vec3(p, sqrt(1.0 - r2));
    // le repère de la Terre : redressée de uTilt (autour de x), puis tournée de uFront (autour de y)
    float ct = cos(uTilt);
    float st = sin(uTilt);
    vec3 e = vec3(v.x, v.y * ct + v.z * st, -v.y * st + v.z * ct);
    float cf = cos(uFront);
    float sf = sin(uFront);
    e = vec3(e.x * cf + e.z * sf, e.y, -e.x * sf + e.z * cf);
    float lat = asin(clamp(e.y, -1.0, 1.0));
    float lon = atan(e.x, e.z);

    // le point de la grille le plus proche, et la distance (angle) jusqu'à lui
    float latC = floor(lat / SPACING + 0.5) * SPACING;
    float stepLon = SPACING / max(cos(latC), 0.05);
    float lonC = floor(lon / stepLon + 0.5) * stepLon;
    float d = length(vec2((lon - lonC) * cos(lat), lat - latC));
    vec3 center = vec3(cos(latC) * sin(lonC), sin(latC), cos(latC) * cos(lonC));
    // la vague : des crêtes partent de Paris (la distance du point à lui, en angle), un peu décalées d'un point à l'autre,
    // et s'éteignent en s'éloignant ; une crête pointue (cube), des creux larges
    float fromParis = length(center - uParis);
    float phase = fromParis * WAVE_K - uTime * WAVE_W + hash12(vec2(latC, lonC) * 57.0) * WAVE_JITTER;
    float crest = pow(0.5 + 0.5 * sin(phase), 3.0) * exp(-fromParis / WAVE_REACH) * uWave;
    float aa = max(fwidth(d), 1e-6);
    float dotRadius = SPACING * DOT * (1.0 + WAVE_GROW * crest);
    float inDot = 1.0 - smoothstep(dotRadius - aa, dotRadius + aa, d);
    float land = step(0.5, texture2D(tLand, vec2((lonC + EARTH_PI) / (2.0 * EARTH_PI), (latC + 0.5 * EARTH_PI) / EARTH_PI)).r);
    // Paris : son point à lui, qui bat ; le point de la grille qui tombe dessus, et lui seul, s'efface
    float dp = length(e - uParis);
    float aap = max(fwidth(dp), 1e-6);
    float parisRadius = PARIS_DOT * (1.0 + WAVE_BEAT * (0.5 + 0.5 * sin(uTime * WAVE_W)) * uWave);
    float inParis = 1.0 - smoothstep(parisRadius - aap, parisRadius + aap, dp);
    float clear = step(0.6 * SPACING, fromParis);
    // sur la mer, la crête fonce aussi les points pâles : la vague se voit partout
    float dotAlpha = inDot * mix(mix(OCEAN, WAVE_SEA, crest), 1.0, land) * clear;

    // le bord du disque s'estompe ; sous le texte de la section About (à gauche, ou en bas sur un écran étroit), les
    // points s'effacent en dégradé pendant le zoom (uClear) ; Paris reste
    float limb = smoothstep(0.0, 0.22, v.z);
    vec2 screen = gl_FragCoord.xy / uViewport;
    // depuis la gauche (écran large) ou depuis le bas (écran étroit : le texte est en bas)
    float along = mix(screen.x, screen.y, uClearVertical);
    float keep = mix(1.0, smoothstep(uClearRange.x, uClearRange.y, along), uClear);
    float alpha = max(dotAlpha * limb * keep, inParis) * uAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uInk, uMark, inParis), alpha);
  }
`;

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

const fail = (reason: string, detail?: unknown) => {
  console.warn(`[work] WebGL désactivé, la grille reste : ${reason}`, ...(detail === undefined ? [] : [detail]));
  return null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
/** Le suivi exponentiel, indépendant de la fréquence de l'écran (follow : par 1/60 s) */
const approach = (follow: number, dt: number) => 1 - Math.pow(1 - follow, dt * 60);

export interface WorkCanvasOptions {
  /** le conteneur, à la taille de la scène : le canvas y est ajouté */
  container: HTMLElement;
  /** l'image de chaque projet, dans l'ordre (URL d'une variante WebP) */
  textures: readonly string[];
  /** le masque des terres du globe (équirectangulaire, blanc sur noir : scripts/assets/globe-mask.mjs) */
  land: string;
  /** l'état au moment de la création : l'entrée (0 → 1), le défilement (px), la fin de la section (0 → 1) */
  state: { reveal: number; scroll: number; morph: number };
  /** le projet sous le pointeur (null : aucun) */
  onHover?: (project: number | null) => void;
  /** un clic, sans glisser, sur une carte */
  onOpen?: (project: number) => void;
  /** contexte WebGL perdu : le canvas est retiré, la page remet sa grille */
  onLost?: () => void;
  /**
   * La Terre affichée : Paris (son centre, en px depuis le haut à gauche du conteneur) et l'écart maximal de ses
   * anneaux (px) ; appelée à chaque image où elle change
   */
  onGlobe?: (paris: { x: number; y: number; reach: number }) => void;
}

export interface WorkCanvas {
  /** l'entrée : 0 (rien) → 1 (toutes les cartes là) */
  setReveal(value: number): void;
  /** le défilement de la page pendant que la scène est collée (px) */
  setScroll(value: number): void;
  /** la fin de la section : 0 (la toile) → 1 (la Terre rangée à côté de la section About) */
  setMorph(value: number): void;
  /** met en pause la vague du globe, qui bat sinon en continu (WCAG 2.2.2) */
  setPaused(paused: boolean): void;
  /** met un projet en avant, les autres reculés et pâlis (null : tous égaux) ; l'index de la page, au clavier */
  highlight(project: number | null): void;
  destroy(): void;
}

export async function createWorkCanvas(options: WorkCanvasOptions): Promise<WorkCanvas | null> {
  const { container, textures } = options;
  const count = textures.length;
  if (count === 0) return fail("aucun projet");

  let images: HTMLImageElement[];
  let landImage: HTMLImageElement;
  try {
    [landImage, ...images] = await Promise.all([options.land, ...textures].map(loadImage));
  } catch (error) {
    return fail("une couverture ou le masque du globe ne se charge pas", error);
  }

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (error) {
    return fail("WebGL 2 indisponible", error);
  }
  const shaderErrors: string[] = [];
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    shaderErrors.push(
      [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join("\n"),
    );
  };
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  // le toucher : le défilement vertical reste au navigateur, le glisser horizontal est à la toile
  canvas.style.touchAction = "pan-y";
  canvas.style.cursor = "grab";
  const pixelRatio = Math.min(window.devicePixelRatio || 1, matches(MQ.fine) ? 2 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  // les cartes, puis la Terre par-dessus : un seul effacement par image
  renderer.autoClear = false;

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maps = images.map((image) => {
    const map = new Texture(image);
    map.colorSpace = NoColorSpace;
    map.minFilter = LinearMipmapLinearFilter;
    map.magFilter = LinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
    return map;
  });

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  // une carte de 1 × 1, mise à la taille des cartes (scale) ; assez de segments pour que la courbure la plie et que la
  // bosse du survol s'y arrondisse
  const geometry = new PlaneGeometry(1, 1, 32, 22);
  const view = new Vector2(1, 1);
  const size = new Vector2(1, 1);
  const base = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uView: { value: view },
      uZoom: { value: 1 },
      uCurve: { value: CURVE.base },
      uScale: { value: 1 },
      uMap: { value: null },
      uSize: { value: size },
      uCorner: { value: GRID.corner },
      uHover: { value: 0 },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uDrift: { value: new Vector2() },
      uBend: { value: 0 },
      uSpin: { value: 0 },
      uLight: { value: 1 },
      uAlpha: { value: 1 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  // la Terre : le masque, lu tel quel (sans mipmaps : le shader le lit au centre des points), les couleurs du CSS
  const land = new Texture(landImage);
  land.colorSpace = NoColorSpace;
  land.minFilter = LinearFilter;
  land.magFilter = LinearFilter;
  land.generateMipmaps = false;
  land.needsUpdate = true;
  const root = getComputedStyle(document.documentElement);
  const cssColor = (name: string, fallback: string) =>
    new Color().setStyle(root.getPropertyValue(name).trim() || fallback, LinearSRGBColorSpace);
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const parisLat = toRadians(GLOBE.paris.lat);
  const parisLon = toRadians(GLOBE.paris.lon);
  const earthMaterial = new ShaderMaterial({
    vertexShader: PASS_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
    uniforms: {
      tLand: { value: land },
      uCenter: { value: new Vector2() },
      uRadius: { value: 1 },
      uFront: { value: 0 },
      uTilt: { value: 0 },
      uRoll: { value: 0 },
      uViewport: { value: new Vector2(1, 1) },
      uClear: { value: 0 },
      uClearRange: { value: new Vector2(0, 1) },
      uClearVertical: { value: 0 },
      uParis: {
        value: new Vector3(Math.cos(parisLat) * Math.sin(parisLon), Math.sin(parisLat), Math.cos(parisLat) * Math.cos(parisLon)),
      },
      uInk: { value: cssColor("--color-ink", "#12306a") },
      uMark: { value: cssColor("--color-mesh-mid", "#2f6fd6") },
      uTime: { value: 0 },
      uWave: { value: 0 },
      uAlpha: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const passGeometry = new PlaneGeometry(2, 2);
  const earthScene = new Scene();
  earthScene.add(Object.assign(new Mesh(passGeometry, earthMaterial), { frustumCulled: false }));

  type Card = { mesh: Mesh; material: ShaderMaterial };
  const cards: Card[] = [];
  /** Agrandit le lot de cartes jusqu'à needed (jamais réduit : les cartes en trop sont cachées) */
  const ensure = (needed: number) => {
    while (cards.length < needed) {
      const material = base.clone();
      // uniforms partagés : la vue, la taille, le recul et la courbure sont les mêmes pour toutes
      material.uniforms.uView = base.uniforms.uView;
      material.uniforms.uSize = base.uniforms.uSize;
      material.uniforms.uZoom = base.uniforms.uZoom;
      material.uniforms.uCurve = base.uniforms.uCurve;
      material.uniforms.uBend = base.uniforms.uBend;
      material.uniforms.uSpin = base.uniforms.uSpin;
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);
      cards.push({ mesh, material });
    }
  };

  /** un écran assez large pour deux colonnes (resize) : la Terre se range à gauche, sinon en haut */
  let wideScreen = true;
  /** la grille : taille des cartes et pas entre deux cases (px), mis à jour par resize */
  const grid = { width: 1, height: 1, stepX: 1, stepY: 1 };
  /** Le projet d'une case : deux voisines (côtés et diagonales) ne montrent jamais le même */
  const projectOf = (i: number, j: number) => (((i * 2 + j) % count) + count) % count;
  /** Le décalage vertical d'une colonne (une sur deux, d'une demi-case) */
  const shiftOf = (i: number) => ((i % 2) + 2) % 2 === 1 ? grid.stepY / 2 : 0;
  /** Le centre de la case (i, j) sur la toile (y vers le haut, j vers le bas) */
  const cellX = (i: number) => i * grid.stepX;
  const cellY = (i: number, j: number) => -j * grid.stepY - shiftOf(i);

  /** la position de la toile : le point de la toile au centre de l'écran (glisser), et le défilement */
  const drag = { x: 0, y: 0 };
  const target = { reveal: options.state.reveal, scroll: options.state.scroll, morph: options.state.morph };
  const current = {
    x: 0,
    y: 0,
    reveal: target.reveal,
    scroll: target.scroll,
    morph: target.morph,
    zoom: 1,
    curve: CURVE.base as number,
    light: 0,
  };
  /**
   * La vague : son temps (s, n'avance que pendant qu'elle bat), sa force (0 → 1), sa pause (le bouton de la page) ; la
   * Terre affichée (la vague ne bat que sur elle)
   */
  const wave = { time: 0, amount: 0, paused: false };
  let earthShown = 0;
  /** La vague doit battre : la Terre est là, et la page ne l'a pas mise en pause */
  const waving = () => earthShown > 0.01 && !wave.paused;
  /** La fin de la section commencée : plus de glisser ni de survol */
  const morphing = () => current.morph > 0.002;

  /** La part d'un temps [début, fin] de la fin de la section où en est la course */
  const part = (range: readonly [number, number]) => clamp((current.morph - range[0]) / (range[1] - range[0]), 0, 1);
  const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** La fin de la section, pour l'état courant : la sphère des cartes, puis la Terre */
  const globe = () => {
    const short = Math.min(view.x, view.y);
    const shrink = inOut(part(GLOBE.shrink));
    const radius = (GLOBE.start + (GLOBE.radius - GLOBE.start) * shrink) * short;
    const wrap = inOut(part(GLOBE.wrap));
    const turn = inOut(part(GLOBE.spin));
    const total = GLOBE.turns * Math.PI * 2;
    // la Terre se range : dans la colonne de gauche (ou en haut sur un écran étroit), son centre décalé de celui de
    // l'écran (px, y vers le haut)
    // le zoom sur la France : le rayon grandit en progression géométrique, le disque se décale (Paris à droite, l'Atlantique
    // à gauche) et pivote
    const focus = inOut(part(GLOBE.focus));
    const framing = wideScreen ? GLOBE.wide : GLOBE.narrow;
    const zoomed = framing.radius * (wideScreen ? view.x : Math.min(view.x, view.y));
    const earth = part(GLOBE.earth);
    return {
      wrap,
      bend: wrap / radius,
      scale: 1 + (GLOBE.scale - 1) * shrink,
      spin: turn * total,
      cards: 1 - earth * earth * (3 - 2 * earth),
      earth: earth * earth * (3 - 2 * earth),
      // la Terre tourne avec les cartes, et s'arrête face à Paris
      front: parisLon + total * (1 - turn),
      tilt: parisLat * inOut(part(GLOBE.tilt)),
      radius: radius * Math.pow(zoomed / radius, focus),
      x: framing.x * view.x * focus,
      y: framing.y * view.y * focus,
      roll: toRadians(GLOBE.roll) * focus,
      focus,
    };
  };
  let speed = 0;
  const glide = { x: 0, y: 0 };
  /** le projet mis en avant par la page (clavier), gardé pendant que le recul des autres retombe */
  let featured: number | null = null;
  let featuredShown: number | null = null;

  /**
   * Le survol : la case visée et le pointeur sur elle (uv de carte, la cible et la bosse qui la suit avec retard, sa
   * vitesse), la force de l'effet ; la case quittée garde sa bosse le temps de se relâcher
   */
  type Cell = { i: number; j: number };
  const hoverState = {
    cell: null as Cell | null,
    amount: 0,
    target: new Vector2(0.5, 0.5),
    mouse: new Vector2(0.5, 0.5),
    drift: new Vector2(),
    leaving: null as Cell | null,
    leavingAmount: 0,
    leavingMouse: new Vector2(0.5, 0.5),
  };
  const sameCell = (a: Cell | null, i: number, j: number) => a !== null && a.i === i && a.j === j;

  /** Le centre de l'écran sur la toile */
  const centerX = () => current.x;
  const centerY = () => current.y - current.scroll * SCROLL;

  const zero = new Vector2();
  const layout = () => {
    const sphere = globe();
    const zoom = current.zoom * sphere.scale;
    // la toile visible : l'écran, agrandi par le recul et la courbure, plus une case de marge ; enroulée, la moitié de
    // la sphère tournée vers nous (le centre de l'écran y est la longitude 0 : la toile décalée de la rotation)
    const reach = 1 / (zoom * (1 - CURVE.max));
    let halfW = (view.x / 2) * reach + grid.stepX;
    let halfH = (view.y / 2) * reach + grid.stepY;
    let offset = 0;
    if (sphere.bend > 1e-7) {
      const quarter = Math.PI / 2 / (sphere.bend * zoom);
      halfW = Math.min(halfW, quarter + grid.stepX);
      halfH = Math.min(halfH, quarter + grid.stepY);
      offset = -sphere.spin / (sphere.bend * zoom);
    }
    const cx = centerX() + offset;
    const cy = centerY();
    const i0 = Math.floor((cx - halfW) / grid.stepX);
    const i1 = Math.ceil((cx + halfW) / grid.stepX);
    const diagonal = Math.hypot(view.x / 2, view.y / 2);
    let used = 0;
    for (let i = i0; i <= i1; i++) {
      const shift = shiftOf(i);
      const j0 = Math.floor((-(cy + halfH) - shift) / grid.stepY);
      const j1 = Math.ceil((-(cy - halfH) - shift) / grid.stepY);
      for (let j = j0; j <= j1; j++) {
        ensure(used + 1);
        const card = cards[used++];
        if (!card) continue;
        const project = projectOf(i, j);
        const x = cellX(i) - cx + offset;
        const y = cellY(i, j) - cy;
        card.mesh.visible = true;
        card.mesh.position.set(x, y, 0);
        card.mesh.scale.set(grid.width, grid.height, 1);
        const uniforms = card.material.uniforms;
        uniforms.uMap.value = maps[project];
        // l'entrée : du centre de l'écran vers les bords
        const distance = Math.min(Math.hypot(x * zoom, y * zoom) / diagonal, 1);
        const shown = ease((current.reveal - distance * REVEAL.spread) / (1 - REVEAL.spread));
        uniforms.uAlpha.value = shown * sphere.cards;
        // le survol : la case visée se bombe sous le pointeur, celle qu'on vient de quitter se relâche
        let held = 0;
        if (sameCell(hoverState.cell, i, j)) {
          held = hoverState.amount;
          (uniforms.uMouse.value as Vector2).copy(hoverState.mouse);
          (uniforms.uDrift.value as Vector2).copy(hoverState.drift);
        } else if (sameCell(hoverState.leaving, i, j)) {
          held = hoverState.leavingAmount;
          (uniforms.uMouse.value as Vector2).copy(hoverState.leavingMouse);
          (uniforms.uDrift.value as Vector2).copy(zero);
        }
        uniforms.uHover.value = held;
        // en avant : la carte survolée (et, au clavier, le projet de l'index) ; les autres reculent et pâlissent,
        // d'autant moins que la carte s'avance ou se retire (pas de saut d'une carte à l'autre)
        const ahead = featuredShown === project ? 1 : held;
        const behind = current.light * (1 - ahead);
        uniforms.uScale.value =
          (REVEAL.from + (1 - REVEAL.from) * shown) * (1 + FOCUS.lift * ahead - FOCUS.shrink * behind);
        uniforms.uLight.value = 1 - (1 - FOCUS.dim) * behind;
      }
    }
    for (let k = used; k < cards.length; k++) {
      const card = cards[k];
      if (card) card.mesh.visible = false;
    }
    base.uniforms.uZoom.value = zoom;
    base.uniforms.uCurve.value = current.curve * (1 - sphere.wrap);
    base.uniforms.uBend.value = sphere.bend;
    base.uniforms.uSpin.value = sphere.spin;
    // la Terre, en pixels du canvas (y vers le haut)
    earthMaterial.uniforms.uAlpha.value = sphere.earth;
    earthMaterial.uniforms.uRadius.value = sphere.radius * pixelRatio;
    (earthMaterial.uniforms.uCenter.value as Vector2).set((view.x / 2 + sphere.x) * pixelRatio, (view.y / 2 + sphere.y) * pixelRatio);
    earthMaterial.uniforms.uFront.value = sphere.front;
    earthMaterial.uniforms.uTilt.value = sphere.tilt;
    earthMaterial.uniforms.uRoll.value = sphere.roll;
    earthMaterial.uniforms.uClear.value = sphere.focus;
    const [clearFrom, clearTo] = wideScreen ? GLOBE.clear.wide : GLOBE.clear.narrow;
    (earthMaterial.uniforms.uClearRange.value as Vector2).set(clearFrom, clearTo);
    earthMaterial.uniforms.uClearVertical.value = wideScreen ? 0 : 1;
    earthMaterial.uniforms.uTime.value = wave.time;
    earthMaterial.uniforms.uWave.value = wave.amount;
    earthShown = sphere.earth;
    // Paris, une fois la Terre posée face à lui : au centre du disque ; l'étiquette juste à côté de son point
    if (sphere.earth > 0.001) {
      const reach = sphere.radius * toRadians(GLOBE.spacing * GLOBE.paris.dot) * (1 + WAVE.beat) + 6;
      options.onGlobe?.({ x: view.x / 2 + sphere.x, y: view.y / 2 - sphere.y, reach });
    }
    return sphere;
  };

  const resize = () => {
    view.set(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    renderer.setSize(view.x, view.y, false);
    renderer.getDrawingBufferSize(earthMaterial.uniforms.uViewport.value as Vector2);
    camera.left = -view.x / 2;
    camera.right = view.x / 2;
    camera.top = view.y / 2;
    camera.bottom = -view.y / 2;
    camera.updateProjectionMatrix();
    wideScreen = matches("(min-width: 48rem)");
    const share = wideScreen ? GRID.width : GRID.narrow;
    grid.width = clamp(view.x * share, GRID.min, GRID.max);
    grid.height = grid.width / 1.5;
    grid.stepX = grid.width * (1 + GRID.gap);
    grid.stepY = grid.height + grid.width * GRID.gap;
    size.set(grid.width, grid.height);
  };

  /**
   * Le pointeur (coordonnées client) ramené sur la toile, puis sur sa case, et sa place sur la carte (uv, y vers le
   * haut) : null entre deux cartes
   */
  const pick = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left - rect.width / 2;
    const sy = rect.height / 2 - (clientY - rect.top);
    // l'inverse de la courbure (quelques pas suffisent : elle est faible)
    let px = sx;
    let py = sy;
    for (let step = 0; step < 4; step++) {
      const nx = px / (0.5 * view.x);
      const ny = py / (0.5 * view.y);
      const factor = 1 - current.curve * 0.5 * (nx * nx + ny * ny);
      px = sx / factor;
      py = sy / factor;
    }
    const wx = px / current.zoom + centerX();
    const wy = py / current.zoom + centerY();
    const i = Math.round(wx / grid.stepX);
    const j = Math.round((-wy - shiftOf(i)) / grid.stepY);
    const u = (wx - cellX(i)) / grid.width + 0.5;
    const v = (wy - cellY(i, j)) / grid.height + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { i, j, project: projectOf(i, j), u, v };
  };

  let awake = false;
  let visible = true;
  let destroyed = false;
  let lost = false;

  const render = () => {
    const sphere = layout();
    renderer.clear();
    if (sphere.cards > 0.001) renderer.render(scene, camera);
    if (sphere.earth > 0.001) renderer.render(earthScene, camera);
  };

  /** le glisser en cours : le pointeur, sa dernière position, le chemin parcouru (clic ou glisser) */
  let hold: { id: number; x: number; y: number; travel: number; touch: boolean; time: number } | null = null;
  /** le chemin du dernier appui, lu par le clic qui le suit */
  let lastTravel = 0;
  const velocity = { x: 0, y: 0 };
  const previousMouse = new Vector2();

  const tick = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs, 50) / 1000;
    if (dt <= 0) return;
    // l'élan, après le lâcher
    if (!hold && (glide.x || glide.y)) {
      drag.x += glide.x * dt;
      drag.y += glide.y * dt;
      const keep = Math.exp(-GLIDE.friction * dt);
      glide.x *= keep;
      glide.y *= keep;
      if (Math.hypot(glide.x, glide.y) < GLIDE.stop) glide.x = glide.y = 0;
    }
    const beforeX = centerX();
    const beforeY = centerY();
    const follow = approach(FOLLOW, dt);
    current.x += (drag.x - current.x) * follow;
    current.y += (drag.y - current.y) * follow;
    current.scroll += (target.scroll - current.scroll) * follow;
    current.reveal += (target.reveal - current.reveal) * follow;
    current.morph += (target.morph - current.morph) * follow;
    const beating = waving();
    wave.amount += ((beating ? 1 : 0) - wave.amount) * approach(WAVE.follow, dt);
    if (!beating && wave.amount < 0.002) wave.amount = 0;
    if (wave.amount > 0) wave.time += dt;
    current.zoom += ((hold ? ZOOM.held : 1) - current.zoom) * approach(ZOOM.follow, dt);
    const moved = Math.hypot(centerX() - beforeX, centerY() - beforeY) / dt;
    speed += (moved - speed) * approach(0.2, dt);
    current.curve = Math.min(CURVE.base + (speed / 1000) * CURVE.speed, CURVE.max);
    // les autres cartes reculent dès qu'une carte est en avant (survol ou clavier)
    const focused = hoverState.cell !== null || featured !== null;
    current.light += ((focused ? 1 : 0) - current.light) * approach(FOCUS.follow, dt);
    if (featured !== null) featuredShown = featured;
    else if (current.light < 0.01) featuredShown = null;

    // le survol : l'effet se pose (ou se relâche), la bosse rattrape le pointeur, son déport suit sa vitesse
    const effect = approach(DISTORT.follow, dt);
    hoverState.amount += ((hoverState.cell ? 1 : 0) - hoverState.amount) * effect;
    hoverState.leavingAmount -= hoverState.leavingAmount * effect;
    if (hoverState.leavingAmount < 0.001) hoverState.leaving = null;
    previousMouse.copy(hoverState.mouse);
    hoverState.mouse.lerp(hoverState.target, approach(DISTORT.track, dt));
    // le déport : la vitesse de la bosse (uv/s), dans le sens du geste, plafonné
    hoverState.drift.set((hoverState.mouse.x - previousMouse.x) / dt, (hoverState.mouse.y - previousMouse.y) / dt);
    hoverState.drift.multiplyScalar(DISTORT.drift);
    if (hoverState.drift.length() > DISTORT.maxDrift) hoverState.drift.setLength(DISTORT.maxDrift);

    const settled =
      !hold &&
      !glide.x &&
      !glide.y &&
      Math.abs(drag.x - current.x) < 0.1 &&
      Math.abs(drag.y - current.y) < 0.1 &&
      Math.abs(target.scroll - current.scroll) < 0.1 &&
      Math.abs(target.reveal - current.reveal) < 0.001 &&
      Math.abs(target.morph - current.morph) < 0.0002 &&
      !waving() &&
      wave.amount === 0 &&
      Math.abs(1 - current.zoom) < 0.001 &&
      speed < 1 &&
      Math.abs((hoverState.cell !== null || featured !== null ? 1 : 0) - current.light) < 0.01 &&
      Math.abs((hoverState.cell ? 1 : 0) - hoverState.amount) < 0.002 &&
      hoverState.leaving === null &&
      hoverState.mouse.distanceTo(hoverState.target) < 0.0005;
    if (settled) {
      current.x = drag.x;
      current.y = drag.y;
      current.scroll = target.scroll;
      current.reveal = target.reveal;
      current.morph = target.morph;
      current.zoom = 1;
      current.light = hoverState.cell !== null || featured !== null ? 1 : 0;
      if (featured === null) featuredShown = null;
      speed = 0;
      current.curve = CURVE.base;
      hoverState.amount = hoverState.cell ? 1 : 0;
      hoverState.mouse.copy(hoverState.target);
      hoverState.drift.set(0, 0);
    }
    render();
    if (settled) sleep();
  };

  function wake(): void {
    if (destroyed || lost || !visible || awake) return;
    awake = true;
    gsap.ticker.add(tick);
  }

  function sleep(): void {
    if (!awake) return;
    awake = false;
    gsap.ticker.remove(tick);
  }

  // ── le pointeur : glisser (avec élan), survol, clic ────────────────────────────────────────────────────────

  let hovered: number | null = null;
  const hover = (project: number | null) => {
    if (project === hovered) return;
    hovered = project;
    options.onHover?.(project);
  };
  /** La case survolée change : l'ancienne se relâche, la nouvelle part du point d'entrée du pointeur */
  const setHoverCell = (cell: Cell | null, u = 0.5, v = 0.5) => {
    const same = cell !== null && sameCell(hoverState.cell, cell.i, cell.j);
    if (same) {
      hoverState.target.set(u, v);
      return;
    }
    if (hoverState.cell) {
      hoverState.leaving = hoverState.cell;
      hoverState.leavingAmount = hoverState.amount;
      hoverState.leavingMouse.copy(hoverState.mouse);
    }
    hoverState.cell = cell;
    hoverState.amount = 0;
    hoverState.target.set(u, v);
    hoverState.mouse.set(u, v);
    hoverState.drift.set(0, 0);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || hold || morphing()) return;
    lastTravel = 0;
    hold = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0, touch: event.pointerType === "touch", time: performance.now() };
    velocity.x = velocity.y = 0;
    glide.x = glide.y = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    wake();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (hold && event.pointerId === hold.id) {
      const now = performance.now();
      const dt = Math.max((now - hold.time) / 1000, 1 / 240);
      // le contenu suit la main : la toile part à l'opposé (ramené au recul) ; au toucher, à l'horizontale seulement
      const dx = event.clientX - hold.x;
      const dy = hold.touch ? 0 : event.clientY - hold.y;
      hold.travel += Math.hypot(event.clientX - hold.x, event.clientY - hold.y);
      hold.x = event.clientX;
      hold.y = event.clientY;
      hold.time = now;
      drag.x -= dx / current.zoom;
      drag.y += dy / current.zoom;
      const follow = approach(GLIDE.follow, dt);
      velocity.x += (-dx / current.zoom / dt - velocity.x) * follow;
      velocity.y += (dy / current.zoom / dt - velocity.y) * follow;
      // un glisser n'est pas un survol : l'effet se relâche
      if (hold.travel > CLICK) {
        hover(null);
        setHoverCell(null);
      }
      wake();
      return;
    }
    if (event.pointerType !== "mouse") return;
    const hit = morphing() ? null : pick(event.clientX, event.clientY);
    canvas.style.cursor = morphing() ? "default" : hit ? "pointer" : "grab";
    hover(hit ? hit.project : null);
    setHoverCell(hit ? { i: hit.i, j: hit.j } : null, hit?.u, hit?.v);
    wake();
  };
  const release = (event: PointerEvent, cancelled: boolean) => {
    if (!hold || event.pointerId !== hold.id) return;
    // pas d'élan si le geste s'était arrêté avant le lâcher
    const stopped = performance.now() - hold.time > 80;
    if (!cancelled && !stopped) {
      glide.x = velocity.x;
      glide.y = velocity.y;
    }
    lastTravel = hold.travel;
    hold = null;
    canvas.style.cursor = "grab";
    wake();
  };
  const onPointerUp = (event: PointerEvent) => release(event, false);
  const onPointerCancel = (event: PointerEvent) => release(event, true);
  const onClick = (event: MouseEvent) => {
    if (lastTravel > CLICK || morphing()) return;
    const hit = pick(event.clientX, event.clientY);
    if (hit) options.onOpen?.(hit.project);
  };
  const onPointerLeave = () => {
    if (hold) return;
    hover(null);
    setHoverCell(null);
    wake();
  };

  const onResize = () => {
    resize();
    if (!awake && !lost && !destroyed) render();
  };
  const resizeObserver = new ResizeObserver(onResize);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (!visible) sleep();
    else if (!lost && !destroyed) {
      // revenu à l'écran : les valeurs ont pu changer sans boucle
      current.scroll = target.scroll;
      current.reveal = target.reveal;
      render();
      if (waving()) wake();
    }
  });

  const onContextLost = () => {
    lost = true;
    sleep();
    canvas.remove();
    options.onLost?.();
  };

  /** Libère tout ce qui vit sur le GPU (destroy, ou échec du contrôle) */
  const releaseGpu = () => {
    geometry.dispose();
    base.dispose();
    for (const card of cards) card.material.dispose();
    for (const map of maps) map.dispose();
    land.dispose();
    earthMaterial.dispose();
    passGeometry.dispose();
    renderer.dispose();
    // libère le contexte tout de suite : chaque retour sur l'accueil en crée un (les navigateurs en limitent le nombre)
    renderer.forceContextLoss();
  };

  /** Contrôle : la toile (ses cartes), rendue dans une petite cible hors écran et relue ; noire, on s'arrête */
  const check = (): string | null => {
    // toujours les cartes, entièrement là et à plat : chargée en plein globe (la page rechargée là, le défilement
    // restauré), la Terre, placée pour l'écran, tombait hors de la petite cible et le contrôle sortait noir (vu le 12
    // novembre 2026)
    const { reveal, morph } = current;
    current.reveal = 1;
    current.morph = 0;
    const probe = new WebGLRenderTarget(PROBE.width, PROBE.height, { type: UnsignedByteType });
    renderer.setRenderTarget(probe);
    render();
    current.reveal = reveal;
    current.morph = morph;
    const pixels = new Uint8Array(PROBE.width * PROBE.height * 4);
    renderer.readRenderTargetPixels(probe, 0, 0, PROBE.width, PROBE.height, pixels);
    renderer.setRenderTarget(null);
    probe.dispose();
    if (shaderErrors.length) return `shader refusé par le pilote\n${shaderErrors.join("\n")}`;
    let brightest = 0;
    for (let i = 0; i < pixels.length; i += 4) brightest = Math.max(brightest, pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
    if (brightest >= PROBE.min) return null;
    return `image de contrôle noire (valeur maximale ${brightest}/255 ; erreur GL ${renderer.getContext().getError()})`;
  };

  resize();
  const problem = check();
  if (problem) {
    releaseGpu();
    return fail(problem);
  }
  render();
  container.append(canvas);
  if (import.meta.env.DEV) console.info(`[work] WebGL actif (${count} projets)`);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);
  resizeObserver.observe(container);
  visibility.observe(container);

  return {
    setReveal(value) {
      target.reveal = clamp(value, 0, 1);
      if (!visible) current.reveal = target.reveal;
      wake();
    },
    setScroll(value) {
      target.scroll = value;
      if (!visible) current.scroll = target.scroll;
      wake();
    },
    setPaused(paused) {
      wave.paused = paused;
      wake();
    },
    setMorph(value) {
      target.morph = clamp(value, 0, 1);
      if (!visible) current.morph = target.morph;
      // la fin de la section commence : le survol et le glisser s'arrêtent
      if (target.morph > 0.002) {
        hover(null);
        setHoverCell(null);
      }
      wake();
    },
    highlight(project) {
      featured = project;
      wake();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sleep();
      resizeObserver.disconnect();
      visibility.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      releaseGpu();
      canvas.remove();
    },
  };
}
