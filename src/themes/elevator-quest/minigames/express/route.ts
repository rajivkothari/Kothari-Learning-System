// Elevator Express V0.1: the one route. Pure, deterministic and hand-shaped (no randomness): the same
// street every time, so a playtest can compare runs. World units are points at scale 1; the cart drives
// right at a constant speed and x is the cart's nose in the world.
//
// What is on it: a row of buildings (some want a parcel: arcade throws, never evidence), four stops
// where the run pauses for one decision (the mission's four steps, in order), the building each
// decision's kit goes to, the five-building street the reading note talks about, and things on the
// road in three lanes (cones, puddles, ramps, wandering robots: harmless bumps; bolts to collect).
import { EXPRESS } from '../../content/minigames';

export const SPEED = 250; // world points per second
export const LANES = 3;
export const END = 18_400;
/** A door can be hit while it is this far ahead of the cart (forgiving: about two seconds of road). */
export const REACH = { min: 60, max: 420 } as const;
/** How far back the helper robot tows the cart when it drove past the kit's building. */
export const TOW_BACK = 640;
/** A ramp keeps the cart in the air this far: it sails over whatever is in its lane. */
export const AIR = 300;

export type StopKind = 'floor' | 'place' | 'power';
/** The mission's steps in order (content/missions/core.json express-route); route.test.ts checks it. */
export const STOP_KINDS: readonly StopKind[] = ['floor', 'place', 'power', 'floor'];

export type ThingKind = 'cone' | 'puddle' | 'ramp' | 'robot' | 'bolt';
export interface Thing {
  id: string;
  kind: ThingKind;
  x: number;
  lane: number;
}

export type BuildingRole = 'scenery' | 'parcel' | 'target' | 'street';
export interface Building {
  id: string;
  x: number;
  width: number;
  floors: number;
  hue: number;
  role: BuildingRole;
  /** target: the stop whose kit goes here. street: the place id (a reading-note building). */
  stop?: number;
  place?: string;
}

export interface Stop {
  index: number;
  kind: StopKind;
  /** The cart stops here and the decision appears. */
  x: number;
}

const WIDTH = [200, 230, 190, 250, 210];
const FLOORS = [6, 8, 5, 9, 7];
const STOP_X = [2_400, 6_600, 10_900, 15_100];

export const door = (b: Building) => b.x + b.width / 2;

function buildRoute() {
  const stops: Stop[] = STOP_KINDS.map((kind, index) => ({ index, kind, x: STOP_X[index]! }));
  const buildings: Building[] = [];
  let x = 360;
  let n = 0;
  let parcel = 0;
  const near = (at: number, span: number) => stops.some((s) => at > s.x - 200 && at < s.x + span);
  while (x < END - 300) {
    const stop = stops.find((s) => s.kind === 'place' && x >= s.x + 200 && !buildings.some((b) => b.role === 'street'));
    if (stop) {
      // The reading street: right after the stop, the five named buildings in order.
      for (const place of EXPRESS.street) {
        buildings.push({ id: `street-${place}`, x, width: 210, floors: 6, hue: buildings.length % 5, role: 'street', place });
        x += 240;
      }
      continue;
    }
    const w = WIDTH[n % WIDTH.length]!;
    const target = stops.find((s) => s.kind !== 'place' && x + w / 2 >= s.x + 640 && !buildings.some((b) => b.stop === s.index));
    const role: BuildingRole = target ? 'target' : !near(x, 1_900) && n % 3 === 1 ? 'parcel' : 'scenery';
    if (role === 'parcel') parcel++;
    buildings.push({ id: `b${n}`, x, width: w, floors: target ? 12 : FLOORS[n % FLOORS.length]!, hue: n % 5, role, ...(target ? { stop: target.index } : {}) });
    x += w + 34;
    n++;
  }
  // Road things: one every 340 points, in a lane pattern that always leaves a free lane, never in the
  // calm stretch around a stop or right before a kit's building (aiming should not fight a bump).
  const pattern: ThingKind[] = ['cone', 'bolt', 'puddle', 'bolt', 'ramp', 'robot', 'bolt', 'cone', 'puddle', 'bolt'];
  const things: Thing[] = [];
  let i = 0;
  for (let at = 900; at < END - 400; at += 340) {
    const calm = stops.some((s) => at > s.x - 360 && at < s.x + (s.kind === 'place' ? 1_700 : 1_100));
    if (calm) continue;
    const kind = pattern[i % pattern.length]!;
    things.push({ id: `t${i}`, kind, x: at, lane: (i * 2 + Math.floor(i / 3)) % LANES });
    i++;
  }
  return { stops, buildings, things, parcels: parcel };
}

export const ROUTE = buildRoute();

/** The building a stop's kit goes to: its target, or (the reading stop) the street building chosen. */
export function kitBuilding(stop: number, place: string | null): Building | null {
  if (place) return ROUTE.buildings.find((b) => b.role === 'street' && b.place === place) ?? null;
  return ROUTE.buildings.find((b) => b.role === 'target' && b.stop === stop) ?? null;
}

/** Whether a door is within throwing reach of a cart at x. */
export const inReach = (doorX: number, x: number) => doorX - x >= REACH.min && doorX - x <= REACH.max;

/** Things the cart's nose crossed going from `from` to `to` in `lane` (not while airborne). */
export function crossed(from: number, to: number, lane: number, airborneUntil: number): Thing[] {
  if (to <= from) return [];
  return ROUTE.things.filter((t) => t.x > from && t.x <= to && t.lane === lane && t.x > airborneUntil);
}

/** The parcel buildings within reach at x that have not had their parcel yet. */
export function parcelsInReach(x: number, delivered: readonly string[]): Building[] {
  return ROUTE.buildings.filter((b) => b.role === 'parcel' && !delivered.includes(b.id) && inReach(door(b), x));
}
