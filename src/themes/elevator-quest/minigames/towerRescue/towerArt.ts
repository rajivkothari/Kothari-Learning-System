// Tower Rescue's production art (D195): which pieces the art set has, and where each one goes. Pure: no
// React. The screen draws every piece inside the view that already animates it (the car, a door leaf,
// the fan, the breaker), so the D193 timings and transforms carry the art unchanged. A piece the set
// lacks (or that failed to load) draws its vector instead; pieces that only work together (the car
// with both door leaves, a housing with its rotor) draw all or nothing.
import { minigameArt, type ArtEntry, type ArtSet, type ArtSource, type MiniGameArtRole, type NormBox } from '../../art/manifest';

export const TOWER_ART_ROLES = ['room', 'shaft', 'shaft-compact', 'fan-bay', 'fan-bay-compact', 'fan', 'gear', 'car', 'door-left', 'door-right', 'cell', 'bay', 'clamp-left', 'clamp-right', 'breaker', 'robot-neutral', 'robot-ready', 'robot-success', 'robot-delivery'] as const satisfies readonly MiniGameArtRole[];
export type TowerArtRole = (typeof TOWER_ART_ROLES)[number];
export type ImageSource = number | { uri: string };
export interface TowerPiece {
  entry: ArtEntry;
  source: ImageSource;
}
export type TowerArt = Partial<Record<TowerArtRole, TowerPiece>>;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A bundled module id or a URL, as a native image source; anything else is not drawable. */
export function imageSource(src: ArtSource | null): ImageSource | null {
  if (typeof src === 'number') return src;
  if (typeof src === 'string') return { uri: src };
  if (src && typeof src === 'object' && 'uri' in src && typeof (src as { uri: unknown }).uri === 'string') return { uri: (src as { uri: string }).uri };
  return null;
}

/** The pieces this set can draw; `failed` holds the ids of images that did not load. */
export function towerArt(set: ArtSet, failed: ReadonlySet<string> = new Set()): TowerArt {
  const out: TowerArt = {};
  for (const role of TOWER_ART_ROLES) {
    const entry = minigameArt(set, 'towerrescue', role);
    if (!entry || failed.has(entry.id)) continue;
    const source = imageSource(set.source(entry.id));
    if (source !== null) out[role] = { entry, source };
  }
  return out;
}

/** The car draws as art only with both leaves (a car with vector doors would look broken). */
export const carArt = (art: TowerArt) => (art.car && art['door-left'] && art['door-right'] ? { car: art.car, left: art['door-left'], right: art['door-right'] } : null);

export const within = (r: Rect, b: NormBox): Rect => ({ x: r.x + b.x * r.w, y: r.y + b.y * r.h, w: b.w * r.w, h: b.h * r.h });
export const pointIn = (r: Rect, p: { x: number; y: number }) => ({ x: r.x + p.x * r.w, y: r.y + p.y * r.h });

/** An image fitted whole inside a box, never stretched: centred across, and centred or on the floor. */
export function contain(entry: Pick<ArtEntry, 'width' | 'height'>, box: { w: number; h: number }, align: 'center' | 'bottom' = 'center'): Rect {
  const s = Math.min(box.w / entry.width, box.h / entry.height);
  const w = entry.width * s;
  const h = entry.height * s;
  return { x: (box.w - w) / 2, y: align === 'bottom' ? box.h - h : (box.h - h) / 2, w, h };
}

/** An image covering a box (cropped at its edges), centred: the room wall behind the systems. */
export function cover(entry: Pick<ArtEntry, 'width' | 'height'>, box: { w: number; h: number }): Rect {
  const s = Math.max(box.w / entry.width, box.h / entry.height);
  return { x: (box.w - entry.width * s) / 2, y: (box.h - entry.height * s) / 2, w: entry.width * s, h: entry.height * s };
}

export interface Housing {
  piece: TowerPiece;
  rect: Rect;
  compact: boolean;
}
/**
 * A system's housing in its bay: the tall frame or the compact one, whichever is nearer the bay's own
 * shape (a tall landscape bay takes the tall frame; a short portrait bay the compact one, instead of a
 * tall frame shrunk to a sliver). Null without art, or when the housing's rotor (the gear or the fan)
 * is missing: then the system draws its vectors.
 */
export function housing(art: TowerArt, kind: 'lift' | 'fans', box: { w: number; h: number }): Housing | null {
  if (!(box.w > 0 && box.h > 0) || !art[kind === 'lift' ? 'gear' : 'fan']) return null;
  const options = [
    { piece: art[kind === 'lift' ? 'shaft' : 'fan-bay'], compact: false },
    { piece: art[kind === 'lift' ? 'shaft-compact' : 'fan-bay-compact'], compact: true },
  ].filter((o): o is { piece: TowerPiece; compact: boolean } => o.piece !== undefined);
  if (options.length === 0) return null;
  const off = (e: ArtEntry) => Math.abs(Math.log(box.h / box.w / (e.height / e.width)));
  const best = options.reduce((a, b) => (off(b.piece.entry) < off(a.piece.entry) ? b : a));
  return { ...best, rect: contain(best.piece.entry, box, 'bottom') };
}

/** Measured on the approved car (D195): its roof's top edge, as a fraction of the image (24 of 256 px). */
export const CAR_ROOF = 0.094;
/** Measured on the approved fan (D195): the blade tips' reach across the image (185 of 256 px). */
export const FAN_REACH = 0.72;

export interface CarPlacement {
  /** The car image's side (square). */
  size: number;
  /** The car image's left and top at rest, on the floor of the channel. */
  x: number;
  y: number;
  /** How far up it travels to the top of the channel. */
  travel: number;
  /** The doorway, in the car image's own coordinates. */
  doorway: Rect;
  /** The channel the car runs in, in the housing box's coordinates. */
  channel: Rect;
}
/**
 * The lift car in its housing. The car sits in front of the frame's rails, as wide as the frame's
 * inside (wider than the channel between the rails) so the robot and its package still read at tablet
 * size. Its floor rests on the channel's floor; at the end of the rise its roof stops just under the
 * motor gear (`ceiling`), never over it.
 */
export function carPlacement(h: Housing, car: ArtEntry, ceiling: number): CarPlacement {
  const channel = within(h.rect, h.piece.entry.stage!);
  const anchor = car.anchor!;
  const restFloor = channel.y + channel.h;
  const room = restFloor - ceiling;
  const size = Math.min(h.rect.w * (h.compact ? 0.88 : 0.82), (room * (h.compact ? 0.8 : 0.6)) / (anchor.y - CAR_ROOF));
  return {
    size,
    x: channel.x + channel.w / 2 - anchor.x * size,
    y: restFloor - anchor.y * size,
    travel: Math.max(0, room - (anchor.y - CAR_ROOF) * size),
    doorway: within({ x: 0, y: 0, w: size, h: size }, car.doorway!),
    channel,
  };
}

/** The motor gear's lowest point in the housing: where the car's roof stops. */
export const gearFloor = (h: Housing, gear: ArtEntry) => {
  const r = rotorPlacement(h, gear, 'lift');
  return r.y + r.h * 0.96 + 2;
};

/**
 * The robot standing in the doorway (feet on the car floor), in the car image's coordinates. Sized so
 * that at the delivery's full scale (`peak`, the D193 step-out) it still stands inside the car's frame.
 */
export function robotPlacement(doorway: Rect, robot: ArtEntry, peak: number): Rect {
  const size = (doorway.h * 0.98) / peak;
  const anchor = robot.anchor!;
  return { x: doorway.x + doorway.w / 2 - anchor.x * size, y: doorway.y + doorway.h - anchor.y * size, w: size, h: size };
}

/** A rotor centred on its pivot in the housing: the motor gear on its mount, the fan in its opening. */
export function rotorPlacement(h: Housing, rotor: ArtEntry, kind: 'lift' | 'fans'): Rect {
  const pivot = pointIn(h.rect, h.piece.entry.anchor!);
  const size = kind === 'fans' ? (Math.min(h.piece.entry.stage!.w * h.rect.w, h.piece.entry.stage!.h * h.rect.h) * 0.96) / FAN_REACH : h.rect.w * 0.3;
  const a = rotor.anchor!;
  return { x: pivot.x - a.x * size, y: pivot.y - a.y * size, w: size, h: size };
}

/** The landing lamps on the shaft: beside the channel, at the frame's crossbars (fractions of the channel). */
export const SHAFT_LAMPS = [0.22, 0.51, 0.84] as const;

export interface BayPlacement {
  socket: Rect;
  clampLeft: Rect;
  clampRight: Rect;
  breaker: Rect;
  /** The seated cell: in front of the socket, a little larger than its opening (the clamps grip its sides). */
  cell: Rect;
}
/** The POWER BAY's pieces for a bay image `side` wide: the clamps at the socket's sides, the breaker on its hinge. */
export function bayPlacement(side: number, bay: ArtEntry, clamp: ArtEntry | null, breaker: ArtEntry | null, seated: number): BayPlacement {
  const box = { x: 0, y: 0, w: side, h: side };
  const socket = within(box, bay.stage!);
  const ch = socket.h * 1.3;
  const cw = clamp ? (ch * clamp.width) / clamp.height : 0;
  const cy = socket.y + socket.h / 2 - ch / 2;
  const bs = side * 0.46;
  const hinge = bay.anchor ? pointIn(box, bay.anchor) : { x: side * 0.85, y: side * 0.17 };
  const pivot = breaker?.anchor ?? { x: 0.5, y: 0.75 };
  const cell = side * seated;
  return {
    socket,
    clampLeft: { x: socket.x - cw * 0.62, y: cy, w: cw, h: ch },
    clampRight: { x: socket.x + socket.w - cw * 0.38, y: cy, w: cw, h: ch },
    breaker: { x: hinge.x - pivot.x * bs, y: hinge.y - pivot.y * bs, w: bs, h: bs },
    cell: { x: (side - cell) / 2, y: socket.y + socket.h / 2 - cell / 2, w: cell, h: cell },
  };
}

/** The robot head for the guide's 52 by 44 slot, cropped from a full-body pose (Codex's guide reference). */
export const GUIDE_HEAD = { x: 95, y: 13, w: 199, h: 169 } as const;
