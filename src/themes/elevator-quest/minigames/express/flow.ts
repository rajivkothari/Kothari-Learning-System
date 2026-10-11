// Elevator Express V0.1: the run. Pure (no React), clock passed in, so a whole route plays headless in
// tests over the real runtime.
//
//   intro     GO! (also after coming back: the run waits for the child, never starts on its own)
//   driving   the cart rolls right on its own; UP and DOWN change lanes; bumps, splashes, ramps and
//             bolts happen; THROW sends a parcel at a parcel building, or the kit at its building
//   task      at each of the route's four stops the run stops for one decision (the mission's step):
//             a floor (count up or down), a place on the street (read the note), a power cell. The
//             tapped option is the committed answer: the ONLY evidence (session.submit). A right
//             answer packs the kit; the run goes on and the kit must be thrown at its building.
//   done      the route is over; the mission closes.
//
// Never evidence: driving, steering, bumps, ramps, bolts, throws, hits and misses. A kit thrown wide
// comes back with the helper robot (no new decision); a kit's building passed by tows the cart back.
// Help is the activity's own ladder (session.help); the runtime assigns the assistance.
//
// Notes (session.saveNotes): a local developer playtest tally across routes; never evidence.
import { fill } from '../../../content/missionCopy';
import { EXPRESS, type ExpressCopy } from '../../content/minigames';
import type { ChallengeView, HelpOffer, MiniGameSession, MiniGameSound } from '../types';
import { AIR, END, LANES, ROUTE, SPEED, TOW_BACK, crossed, door, inReach, kitBuilding, parcelsInReach, type StopKind } from './route';

export type Stage = 'loading' | 'intro' | 'driving' | 'task' | 'done' | 'unsupported';
export type LineKey = keyof ExpressCopy['lines'];

export interface Task {
  kind: StopKind;
  key: string;
  options: { id: string; value: number | string }[];
  /** floor: start, change, direction. power: needed, present. place: the note's item id. */
  start: number;
  change: number;
  direction: 'up' | 'down';
  needed: number;
  present: number;
  note: string;
}

export interface Carry {
  stop: number;
  kind: StopKind;
  value: number | string;
  buildingId: string;
  doorX: number;
}

export interface Throw {
  n: number;
  from: number;
  to: number;
  at: number;
  /** The building hit, or null (a wide throw). */
  hit: string | null;
  kit: boolean;
}

export interface Notes {
  v: 1;
  starts: number;
  resumes: number;
  completions: number;
  exits: number;
  /** Kit throws that missed, and buildings driven past (each brought back by the robot). */
  deliveryRetries: number;
  help: number;
  attempts: number;
  wrong: number;
  ms: number;
}
const NO_NOTES: Notes = { v: 1, starts: 0, resumes: 0, completions: 0, exits: 0, deliveryRetries: 0, help: 0, attempts: 0, wrong: 0, ms: 0 };

export interface ExpressView {
  stage: Stage;
  /** The cart's nose at time `at`; while running it moves at SPEED. */
  x: number;
  at: number;
  running: boolean;
  /** Robot tow in progress until this time (the run resumes by itself). */
  towUntil: number;
  lane: number;
  airborneUntil: number;
  /** Next stop (0..4): the number of kits delivered. */
  stop: number;
  task: Task | null;
  tried: string[];
  help: HelpOffer | null;
  hint: { kind: string; revealed: number | string | null } | null;
  carrying: Carry | null;
  delivered: string[];
  bolts: number;
  /** Bumped or collected road things (each reacts once). */
  touched: string[];
  lastThrow: Throw | null;
  /** The last building that got its kit (the screen plays its elevator). */
  fixed: { buildingId: string; floor: number | null; at: number } | null;
  line: { key: LineKey; vars: Record<string, string | number> };
  busy: boolean;
  notes: Notes;
}

interface Saved {
  v: 1;
  x: number;
  lane: number;
  stop: number;
  carrying: Carry | null;
  delivered: string[];
  bolts: number;
  touched: string[];
  tried: string[];
}

export interface ExpressFlow {
  view(): ExpressView;
  subscribe(l: () => void): () => void;
  /** Where the cart is at `now` (no state change). */
  xAt(now: number): number;
  start(now: number): Promise<void>;
  go(now: number): void;
  tick(now: number): void;
  steer(dir: -1 | 1, now: number): void;
  throwIt(now: number): Promise<void>;
  choose(optionId: string, now: number): Promise<void>;
  hint(): Promise<void>;
  /** The app went to the background, or the child left: the run waits at GO!. */
  pause(now: number): void;
  /** BACK TO ELEVATOR: tally the visit and save. */
  leave(now: number): Promise<void>;
  dispose(): void;
}

const KIND_OF: Record<string, StopKind> = { 'express.move-up': 'floor', 'express.move-down': 'floor', 'reading.street.place': 'place', 'power-cells.fill': 'power' };
const THROW_GAP_MS = 400;
const TOW_MS = 1_400;

export function lineText(view: Pick<ExpressView, 'line'>, copy: ExpressCopy = EXPRESS): string {
  return fill(copy.lines[view.line.key], view.line.vars);
}

export function taskOf(c: ChallengeView): Task | null {
  const kind = KIND_OF[c.activityId];
  if (!kind || c.answer.mode !== 'choice' || c.options.length < 2) return null;
  const p = c.prompt;
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);
  return {
    kind,
    key: c.key,
    options: c.options.map((o) => ({ id: o.id, value: o.value as number | string })),
    start: num(p.start),
    change: num(p.change),
    direction: p.direction === 'down' ? 'down' : 'up',
    needed: num(p.capacity),
    present: num(p.aboard),
    note: typeof p.item === 'string' ? p.item : '',
  };
}

export const taskLine = (t: Task): ExpressView['line'] =>
  t.kind === 'floor' ? { key: t.direction === 'up' ? 'moveUp' : 'moveDown', vars: { start: t.start, change: t.change } } : t.kind === 'power' ? { key: 'power', vars: { needed: t.needed, present: t.present } } : { key: 'pickPlace', vars: {} };

export function createExpressFlow(opts: { session: MiniGameSession; sound: MiniGameSound; log?: (event: string, data?: Record<string, unknown>) => void }): ExpressFlow {
  const { session, sound } = opts;
  const log = opts.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  let disposed = false;
  let enteredAt = 0;
  let v: ExpressView = {
    stage: 'loading',
    x: 0,
    at: 0,
    running: false,
    towUntil: 0,
    lane: 1,
    airborneUntil: -1,
    stop: 0,
    task: null,
    tried: [],
    help: null,
    hint: null,
    carrying: null,
    delivered: [],
    bolts: 0,
    touched: [],
    lastThrow: null,
    fixed: null,
    line: { key: 'intro', vars: {} },
    busy: false,
    notes: { ...NO_NOTES },
  };
  const set = (patch: Partial<ExpressView>) => {
    v = { ...v, ...patch };
    if (!disposed) for (const l of [...listeners]) l();
  };
  const xAt = (now: number) => (v.running ? Math.min(END, v.x + ((now - v.at) * SPEED) / 1000) : v.x);

  const persist = async () => {
    if (disposed) return;
    const saved: Saved = { v: 1, x: Math.round(v.x), lane: v.lane, stop: v.stop, carrying: v.carrying, delivered: v.delivered, bolts: v.bolts, touched: v.touched, tried: v.tried };
    try {
      await session.saveGame(saved);
    } catch (e) {
      // A gameplay save is a convenience: the answers themselves are safe in the runtime.
      log('express.saveFailed', { message: String(e) });
    }
  };
  const tally = async (patch: Partial<Notes>) => {
    const notes = { ...v.notes, ...patch };
    v = { ...v, notes };
    try {
      await session.saveNotes(notes);
    } catch (e) {
      log('express.notesFailed', { message: String(e) });
    }
  };
  const clock = (now: number) => {
    // Time in the game, counted in slices so a crash loses at most one slice.
    if (enteredAt > 0 && now > enteredAt) {
      const ms = v.notes.ms + (now - enteredAt);
      enteredAt = now;
      return ms;
    }
    return v.notes.ms;
  };

  const carryFor = (stop: number, kind: StopKind, value: number | string): Carry | null => {
    const b = kitBuilding(stop, kind === 'place' ? String(value) : null);
    return b ? { stop, kind, value, buildingId: b.id, doorX: door(b) } : null;
  };

  const showTask = (c: ChallengeView | null) => {
    const task = c ? taskOf(c) : null;
    if (!c || !task) {
      log('express.unsupported', { activityId: c?.activityId ?? null });
      set({ stage: 'unsupported', task: null, running: false });
      return;
    }
    const last = c.helpShown[c.helpShown.length - 1];
    const tried = v.task?.key === task.key ? v.tried : [];
    set({ stage: 'task', task, running: false, tried: tried.slice(0, c.wrongTries), help: c.help, hint: last ? { kind: last.kind, revealed: c.revealed as number | string | null } : null, line: taskLine(task) });
  };

  const arrive = (now: number) => {
    // The route is over: the mission closes once all four kits are home (it always is by here).
    set({ stage: 'done', running: false, x: END, at: now, line: { key: 'done', vars: { count: v.delivered.length } } });
    sound.loop('freightMove', false);
    sound.play('deliveryComplete');
    void (async () => {
      const complete = session.progress().complete;
      await tally({ completions: v.notes.completions + 1, ms: clock(now) });
      if (complete) await session.finish();
    })();
  };

  const flow: ExpressFlow = {
    view: () => v,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    xAt,

    async start(now) {
      set({ busy: true });
      enteredAt = now;
      let saved: Saved | null = null;
      try {
        const raw = (await session.loadGame()) as Partial<Saved> | null;
        if (raw && raw.v === 1 && typeof raw.x === 'number') saved = raw as Saved;
      } catch {
        saved = null;
      }
      let notes: Notes = { ...NO_NOTES };
      try {
        const raw = (await session.loadNotes()) as Partial<Notes> | null;
        if (raw && raw.v === 1) notes = { ...NO_NOTES, ...raw };
      } catch {
        // Unreadable notes start a fresh tally.
      }
      v = { ...v, notes };
      const p = session.progress();
      if (p.done) {
        set({ stage: 'done', busy: false, x: END, delivered: saved?.delivered ?? [], line: { key: 'done', vars: { count: saved?.delivered.length ?? 0 } } });
        await session.finish();
        return;
      }
      const resumed = saved !== null || p.solved > 0 || p.phase === 'solved';
      await tally(resumed ? { resumes: notes.resumes + 1 } : { starts: notes.starts + 1 });
      let carrying = saved?.carrying ?? null;
      const stop = saved?.stop ?? p.solved - (p.phase === 'solved' ? 1 : 0);
      const held = session.solvedAnswer();
      if (p.phase === 'solved' && held && !carrying) {
        // Answered just before the app closed: the kit is packed, nothing is asked again.
        carrying = carryFor(stop, STOP_KIND_AT(stop), held.value as number | string);
      }
      set({
        stage: 'intro',
        busy: false,
        x: Math.min(saved?.x ?? 0, END - 1),
        at: now,
        lane: saved?.lane ?? 1,
        stop: Math.max(0, stop),
        carrying,
        delivered: saved?.delivered ?? [],
        bolts: saved?.bolts ?? 0,
        touched: saved?.touched ?? [],
        tried: saved?.tried ?? [],
        line: { key: resumed ? 'resume' : 'intro', vars: {} },
      });
    },

    go(now) {
      if (v.stage !== 'intro') return;
      set({ stage: 'driving', running: true, at: now, line: { key: v.carrying ? lineForCarry(v.carrying) : 'go', vars: v.carrying ? carryVars(v.carrying) : {} } });
      sound.loop('freightMove', true);
      flow.tick(now);
    },

    tick(now) {
      if (disposed) return;
      if (v.stage !== 'driving') return;
      if (!v.running) {
        if (v.towUntil && now >= v.towUntil) set({ running: true, at: now, towUntil: 0 });
        return;
      }
      const from = v.x;
      let to = xAt(now);
      // Stop at the next decision.
      const stop = ROUTE.stops[v.stop];
      if (!v.carrying && stop && to >= stop.x) {
        to = stop.x;
        handleCrossings(from, to, now);
        set({ x: to, at: now, running: false });
        sound.loop('freightMove', false);
        const c = session.challenge();
        if (c) showTask(c);
        else if (session.progress().phase === 'solved') {
          const held = session.solvedAnswer();
          const carrying = held ? carryFor(v.stop, stop.kind, held.value as number | string) : null;
          set({ carrying, running: true, at: now });
        } else showTask(null);
        void persist();
        return;
      }
      // Drove past the kit's building: the robot tows the cart back (no new decision).
      if (v.carrying && to >= v.carrying.doorX + REACH_BEHIND) {
        handleCrossings(from, v.carrying.doorX + REACH_BEHIND, now);
        set({ x: v.carrying.doorX - TOW_BACK, at: now, running: false, towUntil: now + TOW_MS, line: { key: 'missed', vars: {} } });
        void tally({ deliveryRetries: v.notes.deliveryRetries + 1 });
        void persist();
        return;
      }
      handleCrossings(from, to, now);
      // Plain movement is silent: the screen scrolls on the UI thread; only events re-render.
      v = { ...v, x: to, at: now };
      if (to >= END) arrive(now);
    },

    steer(dir, now) {
      if (v.stage !== 'driving') return;
      flow.tick(now);
      const lane = Math.max(0, Math.min(LANES - 1, v.lane + dir));
      if (lane !== v.lane) set({ lane });
    },

    async throwIt(now) {
      if (v.stage !== 'driving' || !v.running || v.busy) return;
      if (v.lastThrow && now - v.lastThrow.at < THROW_GAP_MS) return;
      flow.tick(now);
      const x = v.x;
      const n = (v.lastThrow?.n ?? 0) + 1;
      if (v.carrying) {
        const carry = v.carrying;
        if (inReach(carry.doorX, x)) {
          // The kit is home: the elevator works again. The decision was recorded at the stop.
          sound.play('answerRight');
          const floor = carry.kind === 'floor' && typeof carry.value === 'number' ? carry.value : null;
          set({ lastThrow: { n, from: x, to: carry.doorX, at: now, hit: carry.buildingId, kit: true }, carrying: null, delivered: [...v.delivered, carry.buildingId], fixed: { buildingId: carry.buildingId, floor, at: now }, stop: v.stop + 1, tried: [], hint: null, line: { key: 'delivered', vars: {} }, busy: true });
          if (session.progress().phase === 'solved') await session.next();
          set({ busy: false });
        } else {
          // Wide: the helper robot brings the kit straight back. Never evidence, nothing asked again.
          sound.play('cratePlace');
          set({ lastThrow: { n, from: x, to: x + 300, at: now, hit: null, kit: true }, line: { key: 'missed', vars: {} } });
          void tally({ deliveryRetries: v.notes.deliveryRetries + 1 });
        }
        await persist();
        return;
      }
      const target = parcelsInReach(x, v.delivered)[0];
      if (target) {
        sound.play('cratePlace');
        set({ lastThrow: { n, from: x, to: door(target), at: now, hit: target.id, kit: false }, delivered: [...v.delivered, target.id], fixed: { buildingId: target.id, floor: null, at: now }, line: { key: 'arcadeHit', vars: {} } });
        await persist();
      } else set({ lastThrow: { n, from: x, to: x + 300, at: now, hit: null, kit: false } });
    },

    async choose(optionId, now) {
      const t = v.task;
      if (v.stage !== 'task' || !t || v.busy || v.tried.includes(optionId)) return;
      const option = t.options.find((o) => o.id === optionId);
      if (!option) return;
      set({ busy: true });
      const res = await session.submit({ mode: 'choice', optionId });
      if (disposed) return;
      if (res.status === 'refused') {
        log('express.refused', { reason: res.reason });
        set({ busy: false });
        return;
      }
      await tally({ attempts: v.notes.attempts + 1, wrong: v.notes.wrong + (res.correct ? 0 : 1) });
      if (res.correct) {
        sound.play('answerRight');
        const carrying = carryFor(v.stop, t.kind, option.value);
        set({ stage: 'driving', task: null, carrying, running: true, at: now, busy: false, hint: null, tried: [], line: carrying ? { key: lineForCarry(carrying), vars: carryVars(carrying) } : { key: 'go', vars: {} } });
        sound.loop('freightMove', true);
      } else if (res.fresh) {
        sound.play('answerWrong');
        set({ tried: [], hint: null, busy: false });
        showTask(session.challenge());
        set({ line: { key: 'fresh', vars: {} } });
      } else {
        sound.play('answerWrong');
        const c = session.challenge();
        const key: LineKey = t.kind === 'floor' ? 'wrongFloor' : t.kind === 'power' ? 'wrongCell' : 'wrongPlace';
        set({ tried: [...v.tried, optionId], help: c?.help ?? v.help, busy: false, line: { key, vars: { start: t.start } } });
      }
      await persist();
    },

    async hint() {
      const t = v.task;
      if (v.stage !== 'task' || !t || v.busy || !v.help) return;
      set({ busy: true });
      const h = await session.help();
      if (disposed) return;
      if (!h) {
        set({ busy: false });
        return;
      }
      await tally({ help: v.notes.help + 1 });
      const key: LineKey =
        h.kind === 'showAnswer' ? 'showMe' : t.kind === 'place' ? 'givensPlace' : h.kind === 'numberLine' ? (t.kind === 'floor' ? 'ladderFloor' : 'ladderPower') : t.kind === 'floor' ? 'givensFloor' : 'givensPower';
      set({ busy: false, help: h.next, hint: { kind: h.kind, revealed: h.revealed as number | string | null }, line: { key, vars: { start: t.start, change: t.change, needed: t.needed, present: t.present } } });
    },

    pause(now) {
      if (v.stage !== 'driving') return;
      const x = xAt(now);
      sound.loop('freightMove', false);
      set({ stage: 'intro', running: false, towUntil: 0, x: v.towUntil ? v.x : x, at: now, line: { key: 'resume', vars: {} } });
      void persist();
    },

    async leave(now) {
      if (v.stage === 'driving') flow.pause(now);
      await tally(v.stage === 'done' ? { ms: clock(now) } : { exits: v.notes.exits + 1, ms: clock(now) });
      enteredAt = 0;
      await persist();
    },

    dispose() {
      disposed = true;
      sound.loop('freightMove', false);
      listeners.clear();
    },
  };

  /** Hits and pickups on the road between two positions. Never evidence. */
  function handleCrossings(from: number, to: number, now: number) {
    const hit = crossed(from, to, v.lane, v.airborneUntil).filter((t) => !v.touched.includes(t.id));
    if (!hit.length) return;
    let bolts = v.bolts;
    let airborneUntil = v.airborneUntil;
    for (const t of hit) {
      if (t.kind === 'bolt') bolts++;
      if (t.kind === 'ramp') airborneUntil = t.x + AIR;
    }
    sound.play('cratePlace');
    set({ touched: [...v.touched, ...hit.map((t) => t.id)].slice(-80), bolts, airborneUntil });
    void now;
  }

  return flow;
}

const REACH_BEHIND = 40;

/** What a THROW at x would hit: the kit's building, a parcel building, or nothing. */
export function reachable(view: Pick<ExpressView, 'carrying' | 'delivered'>, x: number): 'kit' | 'parcel' | null {
  if (view.carrying) return inReach(view.carrying.doorX, x) ? 'kit' : null;
  return parcelsInReach(x, view.delivered).length ? 'parcel' : null;
}
const STOP_KIND_AT = (stop: number): StopKind => ROUTE.stops[Math.max(0, Math.min(ROUTE.stops.length - 1, stop))]!.kind;
const lineForCarry = (c: Carry): LineKey => (c.kind === 'floor' ? 'packedFloor' : c.kind === 'place' ? 'packedPlace' : 'packedCell');
const carryVars = (c: Carry): Record<string, string | number> => (c.kind === 'place' ? { place: EXPRESS.buildings[String(c.value)]?.name ?? String(c.value) } : { value: c.value });
