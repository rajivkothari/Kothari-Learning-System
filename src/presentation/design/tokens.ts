// Shared visual design system. Pure TypeScript: no React, no Skia, no learning logic.
//
// A world supplies a ThemeTokens object. Components read roles ("surface.raised",
// "accent.primary", "type.display"), never raw colors, so a new world restyles the game by
// supplying new tokens. Extension points:
//   - palette roles and surface levels:  a world's colors
//   - type roles (display / ui / reading): Story World swaps the DISPLAY face only
//   - motion and accomplishment scales:   pacing, with a reduced-motion equivalent for each
// See docs/ART_DIRECTION.md.

export type Hex = `#${string}`;

export interface TypeRole {
  /** Font family per platform. System faces only: no font asset dependency yet. */
  family: { ios: string; android: string; web: string };
  weight: '400' | '500' | '600' | '700' | '800' | '900';
  /** Base size in pt for the medium step. */
  size: number;
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
}

export interface MotionScale {
  /** Feedback on touch-down. Always immediate in both modes. */
  touchMs: number;
  quickMs: number;
  standardMs: number;
  slowMs: number;
  /** Lighting ramps (power restore, serviced button release). */
  lightMs: number;
}

export interface ThemeTokens {
  id: string;
  palette: {
    /** Deepest background, behind everything. */
    void: Hex;
    /** Surface levels: 0 = recessed, 1 = base, 2 = raised, 3 = floating (sheets, cards). */
    surface: [Hex, Hex, Hex, Hex];
    ink: Hex;
    inkMuted: Hex;
    /** Main accent: indicators, selected buttons, the mission objective. */
    accentPrimary: Hex;
    /** Secondary accent: clues, help, practice boards. */
    accentSecondary: Hex;
    /** Neutral working light. */
    light: Hex;
    /** Calm success. */
    success: Hex;
    /** Genuine warnings only (overload). Never for a wrong answer. */
    warning: Hex;
    /** Genuine danger only. Unused in Floor 15. Never for a wrong answer. */
    danger: Hex;
    /** Material bases for cel shading (each gets three value bands). */
    metal: Hex;
    paint: Hex;
    floor: Hex;
  };
  state: {
    idle: { face: Hex; ring: Hex; label: Hex };
    pressed: { depthPx: number; scale: number };
    selected: { face: Hex; ring: Hex; label: Hex; glow: number };
    current: { marker: Hex; rim: Hex };
    clue: { ring: Hex; widthPx: number };
    disabled: { opacity: number; label: Hex };
  };
  type: { display: TypeRole; ui: TypeRole; reading: TypeRole };
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; lg: number; pill: number };
  outline: { hairline: number; standard: number; heavy: number };
  shadow: { color: Hex; offsetY: number; blur: number; opacity: number };
  glow: { soft: number; strong: number };
  /** Where the key light comes from (cel highlights land on this side). */
  lighting: { key: 'top' | 'topLeft' | 'topRight'; ambient: number };
  icon: { sm: number; md: number; lg: number };
  /** docs/ACCESSIBILITY.md: gameplay targets at least 64 x 64 pt. */
  minTouchTarget: number;
  motion: { normal: MotionScale; reduced: MotionScale };
  /** Parallax pattern period in px at depth 1 (the far shaft wall). Reduced motion: none. */
  parallax: { normal: number; reduced: number };
  /** How much the world celebrates, by size of accomplishment. Glow strength 0..1 and duration. */
  accomplishment: Record<'small' | 'medium' | 'large', { glow: number; ms: number; reducedMs: number }>;
}

const SYSTEM_CONDENSED = { ios: 'AvenirNextCondensed-Heavy', android: 'sans-serif-condensed', web: '"Avenir Next Condensed", "Arial Narrow", system-ui, sans-serif' };
const SYSTEM_SANS = { ios: 'System', android: 'sans-serif', web: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };
const SYSTEM_SERIF = { ios: 'Georgia', android: 'serif', web: 'Georgia, "Times New Roman", serif' };

/** Engineer World: charcoal, graphite, steel, deep navy; amber, warm orange, cyan, cool white. */
export const ENGINEER_WORLD: ThemeTokens = {
  id: 'engineer-world',
  palette: {
    void: '#070B12',
    surface: ['#0B1019', '#121925', '#1B2433', '#243045'],
    ink: '#EEF3FA',
    inkMuted: '#A3AFC2',
    accentPrimary: '#FFB23F',
    accentSecondary: '#5FD3F3',
    light: '#E9F3FF',
    success: '#7BE0B0',
    warning: '#FFD34D',
    danger: '#FF5A4E',
    metal: '#5B6678',
    paint: '#22324D',
    floor: '#1A2029',
  },
  state: {
    idle: { face: '#1A212D', ring: '#7D8899', label: '#EEF3FA' },
    pressed: { depthPx: 3, scale: 0.95 },
    selected: { face: '#3A2508', ring: '#FFB23F', label: '#FFE1A8', glow: 0.9 },
    current: { marker: '#E9F3FF', rim: '#B9C6D8' },
    clue: { ring: '#5FD3F3', widthPx: 3 },
    disabled: { opacity: 0.38, label: '#7D8899' },
  },
  type: {
    display: { family: SYSTEM_CONDENSED, weight: '900', size: 28, lineHeight: 32, letterSpacing: 2, uppercase: true },
    ui: { family: SYSTEM_SANS, weight: '800', size: 15, lineHeight: 19, letterSpacing: 1, uppercase: true },
    reading: { family: SYSTEM_SANS, weight: '600', size: 20, lineHeight: 27, letterSpacing: 0, uppercase: false },
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { sm: 6, md: 12, lg: 18, pill: 999 },
  outline: { hairline: 1, standard: 2, heavy: 3 },
  shadow: { color: '#000000', offsetY: 3, blur: 6, opacity: 0.45 },
  glow: { soft: 8, strong: 16 },
  lighting: { key: 'topLeft', ambient: 0.35 },
  icon: { sm: 18, md: 24, lg: 32 },
  minTouchTarget: 64,
  motion: {
    normal: { touchMs: 0, quickMs: 160, standardMs: 320, slowMs: 600, lightMs: 450 },
    reduced: { touchMs: 0, quickMs: 80, standardMs: 120, slowMs: 200, lightMs: 150 },
  },
  parallax: { normal: 48, reduced: 0 },
  accomplishment: {
    small: { glow: 0.5, ms: 400, reducedMs: 150 },
    medium: { glow: 0.75, ms: 800, reducedMs: 250 },
    large: { glow: 1, ms: 1800, reducedMs: 400 },
  },
};

/** Build a world's tokens from another, replacing only what differs. */
export function deriveTokens(base: ThemeTokens, id: string, patch: { palette?: Partial<ThemeTokens['palette']>; display?: Partial<TypeRole>; state?: Partial<ThemeTokens['state']> }): ThemeTokens {
  return {
    ...base,
    id,
    palette: { ...base.palette, ...patch.palette },
    state: { ...base.state, ...patch.state },
    type: { ...base.type, display: { ...base.type.display, ...patch.display } },
  };
}

/**
 * Story World placeholder: proves the swap only (a storybook display face over the same body
 * text). Its palette is NOT designed yet; see docs/ART_DIRECTION.md before using it.
 */
export const STORY_WORLD: ThemeTokens = deriveTokens(ENGINEER_WORLD, 'story-world', {
  display: { family: SYSTEM_SERIF, weight: '700', letterSpacing: 0.5, uppercase: false },
  palette: { accentPrimary: '#FFC56B', accentSecondary: '#9FD7FF', paint: '#3A2A4D' },
});

export const PALETTES: Record<string, ThemeTokens> = { [ENGINEER_WORLD.id]: ENGINEER_WORLD, [STORY_WORLD.id]: STORY_WORLD };

export type Motion = 'normal' | 'reduced';

export function motionScale(t: ThemeTokens, motion: Motion): MotionScale {
  return motion === 'reduced' ? t.motion.reduced : t.motion.normal;
}

export function accomplishment(t: ThemeTokens, size: 'small' | 'medium' | 'large', motion: Motion): { glow: number; ms: number } {
  const a = t.accomplishment[size];
  return { glow: a.glow, ms: motion === 'reduced' ? a.reducedMs : a.ms };
}

/**
 * Parallax offset for a layer. `depth` 0 = gameplay plane (never moves), 1 = farthest layer.
 * `phase` is a continuous travel value (for example the car's position in floors). The offset
 * is a sawtooth in [0, strength * depth): draw the layer as a pattern that repeats every
 * `strength * depth` px and the scroll is seamless. Zero under reduced motion.
 */
export function parallaxOffset(t: ThemeTokens, motion: Motion, depth: number, phase: number): number {
  const period = parallaxPeriod(t, motion, depth);
  if (period === 0) return 0;
  return period * (phase - Math.floor(phase));
}

/** Repeat distance of a parallax layer's pattern. Zero means the layer is still. */
export function parallaxPeriod(t: ThemeTokens, motion: Motion, depth: number): number {
  const strength = motion === 'reduced' ? t.parallax.reduced : t.parallax.normal;
  return strength * Math.min(1, Math.max(0, depth));
}

// ---------- color math (for cel bands and contrast checks) ----------

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): Hex {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function mix(a: string, b: string, t: number): Hex {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as [number, number, number]);
}

export function luminance(hex: string): number {
  const lin = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Cel shading: three flat value bands for a material (shadow, base, light). Flat bands with a
 * hard edge read as illustrated, cost one fill each, and stay legible on small tablets.
 */
export function celBands(base: string, t: ThemeTokens = ENGINEER_WORLD): { shadow: Hex; base: Hex; light: Hex; edge: Hex } {
  return {
    shadow: mix(base, t.palette.void, 0.45),
    base: mix(base, base, 0),
    light: mix(base, t.palette.light, 0.28),
    edge: mix(base, t.palette.void, 0.7),
  };
}
