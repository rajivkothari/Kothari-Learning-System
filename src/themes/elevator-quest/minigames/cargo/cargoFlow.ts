// Cargo Commander's flow over the mini-game session. No React: the screen subscribes to it, the
// tests drive it with FW's mock session.
//
// Evidence integrity (types.ts): WEIGH is the only thing that calls session.submit, and only for a
// load whose value was not weighed before (cargoState.weigh). Loading and unloading, opening the
// toolkit, the freight's run and NEXT DELIVERY never record anything; loading only saves gameplay
// (session.saveGame, a setting, never evidence). Help is session.help() (the activity's ladder:
// hints, then SHOW ME). Nothing here scores: the runtime says whether a load was right.
//
// Child-paced (D122): a right load ships (the doors close, the freight runs), then NEXT DELIVERY
// waits for the learner. No timer ever moves a delivery on. Saving is debounced while loading.
import type { AssistanceLevel } from '../../../../engine';
import type { ChallengeView, HelpOffer, MiniGameSession, MiniGameSound } from '../types';
import { applyAction, demonstrate, initialCargo, restoreCargo, saveCargo, shipped, weigh, weighFailed, weighResult, type CargoAction, type CargoState } from './cargoState';
import { deliveryKey, missionFromItem, type CargoMission } from './mission';
import { tierOf } from './tiers';

export interface CargoHint {
  kind: string;
  assistance: AssistanceLevel;
  /** SHOW ME's value (the load put in for the learner), else null. */
  revealed: number | null;
}

/**
 * resume: back to a half-loaded delivery. fresh: after several misses the runtime brought a new
 * delivery. trouble: a WEIGH could not be saved (nothing was recorded; WEIGH again).
 */
export type CargoNotice = 'resume' | 'fresh' | 'trouble' | null;

export interface CargoFlowView {
  /** starting: reading the session. playing: a delivery is on screen. done: every delivery is made. unsupported: an item this screen cannot draw. */
  status: 'starting' | 'playing' | 'done' | 'unsupported';
  mission: CargoMission | null;
  cargo: CargoState | null;
  /** The next help step, or null when the ladder is used up. */
  helpOffer: HelpOffer | null;
  /** The help given on this delivery most recently (it stays in Lifty's line until the delivery changes). */
  hint: CargoHint | null;
  /** A session command is in flight: the controls wait (touch feedback still shows at once). */
  busy: boolean;
  notice: CargoNotice;
  /** The last delivery shipped and it was the last one (the mission is complete). */
  last: boolean;
  /** Loads committed right in this game so far (presentation only). */
  solved: number;
}

export interface CargoFlowOptions {
  session: MiniGameSession;
  sound: Pick<MiniGameSound, 'play' | 'loop'>;
  /** Reduced Motion: the freight's run is a still change, without its travel sound. */
  reducedMotion: () => boolean;
  /** A clock (the gauge tick's limit) and a scheduler (the debounced save), injected: the screen passes real ones, tests fake ones. */
  now: () => number;
  schedule: (fn: () => void, ms: number) => () => void;
  /** Gameplay log (playtest builds): never evidence. */
  log?: (event: string, data?: Record<string, unknown>) => void;
}

const SAVE_DEBOUNCE_MS = 300;
/** The gauge's tick never repeats faster than this (a run of taps is one soft tick at a time). */
export const GAUGE_TICK_GAP_MS = 180;

export interface CargoFlow {
  view(): CargoFlowView;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  /** A crate, a sack or a box on or off: free exploration, never evidence. */
  act(action: CargoAction): void;
  /** WEIGH: the committed answer for a new load; the reading again for a load already weighed. */
  weigh(): Promise<void>;
  /** The help control: the next step on the activity's ladder. */
  help(): Promise<void>;
  /** The freight's run has finished on screen (at once under Reduced Motion). */
  arrived(): void;
  /** NEXT DELIVERY (after a run): the next item. On the last run: the game is finished. */
  next(): Promise<void>;
  /** Save now (before BACK TO ELEVATOR, or when the app goes to the background). */
  flush(): Promise<void>;
  dispose(): void;
}

const toHint = (h: { kind: string; assistance: AssistanceLevel } | undefined, revealed: unknown): CargoHint | null =>
  h ? { kind: h.kind, assistance: h.assistance, revealed: h.assistance === 'demonstrated' && typeof revealed === 'number' ? revealed : null } : null;

export function createCargoFlow(opts: CargoFlowOptions): CargoFlow {
  const { session, sound } = opts;
  const { now, schedule } = opts;
  const log = opts.log ?? (() => {});
  const listeners = new Set<() => void>();
  let view: CargoFlowView = { status: 'starting', mission: null, cargo: null, helpOffer: null, hint: null, busy: false, notice: null, last: false, solved: 0 };
  let cancelSave: (() => void) | null = null;
  let lastTick = -Infinity;
  let disposed = false;

  const set = (patch: Partial<CargoFlowView>) => {
    view = { ...view, ...patch };
    for (const l of listeners) l();
  };

  const persist = async () => {
    cancelSave?.();
    cancelSave = null;
    if (!view.cargo || disposed) return;
    try {
      await session.saveGame({ v: 1, cargo: saveCargo(view.cargo) });
    } catch (e) {
      // A gameplay save is a convenience: the delivery itself is safe in the runtime.
      log('cargo.saveFailed', { message: String(e) });
    }
  };
  const persistSoon = () => {
    cancelSave?.();
    cancelSave = schedule(() => {
      cancelSave = null;
      void persist();
    }, SAVE_DEBOUNCE_MS);
  };

  /** The delivery the session shows now, as a fresh (or restored) load. */
  const present = (c: ChallengeView, saved: unknown, notice: CargoNotice) => {
    const p = session.progress();
    const mission = missionFromItem(c, deliveryKey(c.key, p.solved));
    if (!mission) {
      log('cargo.unsupported', { activityId: c.activityId, concept: c.concept });
      set({ status: 'unsupported', mission: null, cargo: null, helpOffer: null, hint: null, notice: null });
      return;
    }
    const cargo = saved === undefined ? initialCargo(mission) : restoreCargo(saved, mission);
    const resumed = saved !== undefined && (cargo.load.crates.length > 0 || cargo.load.sacks > 0 || cargo.load.boxes > 0 || cargo.weighed.length > 0);
    set({ status: 'playing', mission, cargo, helpOffer: c.help, hint: toHint(c.helpShown[c.helpShown.length - 1], c.revealed), notice: resumed ? 'resume' : notice, last: false, solved: p.solved });
    // The tier is the session's plan (tiers.ts chose the instance); logged for the playtest report, never shown.
    log('cargo.delivery', { kind: mission.kind, tier: tierOf(c.activityId), givens: mission.givens, resumed });
  };

  /** Read the session again: story beats are acknowledged (cargo has none to show), a solved item moves on. */
  const settle = async (saved: unknown, notice: CargoNotice): Promise<void> => {
    for (let guard = 0; guard < 8; guard += 1) {
      const p = session.progress();
      if (p.done) {
        set({ status: 'done', mission: null, cargo: null, helpOffer: null, hint: null, notice: null, solved: p.solved, busy: false });
        return;
      }
      if (p.phase === 'story' || p.phase === 'solved') {
        // A story beat (no words to show here), or a right load whose run was lost to a restart: the
        // runtime already recorded it, so the next delivery comes up.
        await session.next();
        continue;
      }
      const c = session.challenge();
      if (!c) return;
      present(c, saved, notice);
      return;
    }
  };

  const flow: CargoFlow = {
    view: () => view,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async start() {
      set({ busy: true });
      let saved: unknown;
      try {
        const raw = await session.loadGame();
        saved = raw && typeof raw === 'object' && 'cargo' in raw ? (raw as { cargo: unknown }).cargo : undefined;
      } catch {
        saved = undefined;
      }
      await settle(saved, null);
      set({ busy: false });
      // A finished game that was not closed (the app stopped during its last run): close it now.
      if (view.status === 'done') await session.finish();
    },

    act(action) {
      const { mission, cargo } = view;
      if (!mission || !cargo || view.busy) return;
      const before = cargo;
      const after = applyAction(mission, cargo, action);
      if (after === before) return;
      const adding = action.type === 'loadCrate' || action.type === 'addSack' || action.type === 'addBox';
      sound.play(adding ? 'cratePlace' : 'cratePick');
      const t = now();
      if (t - lastTick >= GAUGE_TICK_GAP_MS) {
        lastTick = t;
        sound.play('gaugeTick');
      }
      set({ cargo: after, notice: view.notice === 'trouble' ? null : view.notice });
      persistSoon();
    },

    async weigh() {
      const { mission, cargo } = view;
      if (!mission || !cargo || view.busy) return;
      const step = weigh(mission, cargo);
      if (step.state === cargo) return;
      if (step.submit === null) {
        // The same load again: the reading, nothing sent.
        set({ cargo: step.state });
        return;
      }
      set({ cargo: step.state, busy: true, notice: null });
      sound.play('gaugeTick');
      let res: Awaited<ReturnType<MiniGameSession['submit']>>;
      try {
        res = await session.submit({ mode: 'value', value: step.submit });
      } catch (e) {
        log('cargo.weighFailed', { message: String(e) });
        set({ cargo: weighFailed(step.state), busy: false, notice: 'trouble' });
        return;
      }
      if (disposed) return;
      if (res.status === 'refused') {
        log('cargo.weighRefused', { reason: res.reason });
        if (res.reason === 'stale' || res.reason === 'noChallenge') {
          set({ busy: false });
          await settle(undefined, 'fresh');
          return;
        }
        set({ cargo: weighFailed(step.state), busy: false, notice: res.reason === 'closed' ? null : 'trouble' });
        return;
      }
      log('cargo.weighed', { value: step.submit, correct: res.correct, evidence: res.evidence, revisions: step.state.revisions });
      if (res.correct) {
        set({ cargo: weighResult(mission, step.state, true), busy: false, last: res.done, solved: view.solved + 1, helpOffer: null });
        if (!opts.reducedMotion()) sound.loop('freightMove', true);
        await persist();
        return;
      }
      if (res.fresh) {
        // Too many tries on this one: the runtime resolved it and brought a new delivery.
        set({ busy: false });
        await settle(undefined, 'fresh');
        await persist();
        return;
      }
      set({ cargo: weighResult(mission, step.state, false), busy: false, helpOffer: session.challenge()?.help ?? null });
      await persist();
    },

    async help() {
      const { mission, cargo } = view;
      if (!mission || !cargo || view.busy || !view.helpOffer || cargo.phase !== 'loading') return;
      set({ busy: true });
      let h: Awaited<ReturnType<MiniGameSession['help']>> = null;
      try {
        h = await session.help();
      } catch (e) {
        log('cargo.helpFailed', { message: String(e) });
      }
      if (disposed) return;
      if (!h) {
        set({ busy: false, helpOffer: session.challenge()?.help ?? null });
        return;
      }
      const hint = toHint(h, h.revealed);
      const shown = hint?.revealed !== null && hint?.revealed !== undefined ? demonstrate(mission, view.cargo ?? cargo, hint.revealed) : (view.cargo ?? cargo);
      if (shown !== cargo) sound.play('cratePlace');
      log('cargo.help', { kind: h.kind, assistance: h.assistance });
      set({ busy: false, hint, helpOffer: h.next, cargo: shown });
      await persist();
    },

    arrived() {
      const { cargo } = view;
      if (!cargo || cargo.phase !== 'shipping') return;
      sound.loop('freightMove', false);
      sound.play('deliveryComplete');
      set({ cargo: shipped(cargo) });
      void persist();
    },

    async next() {
      const { cargo } = view;
      if (!cargo || cargo.phase !== 'shipped' || view.busy) return;
      set({ busy: true });
      if (view.last) {
        await session.finish();
        set({ status: 'done', mission: null, cargo: null, helpOffer: null, hint: null, busy: false, notice: null });
        return;
      }
      try {
        await session.next();
      } catch (e) {
        log('cargo.nextFailed', { message: String(e) });
      }
      set({ busy: false });
      await settle(undefined, null);
      await persist();
    },

    flush: () => persist(),

    dispose() {
      disposed = true;
      cancelSave?.();
      cancelSave = null;
      sound.loop('freightMove', false);
      listeners.clear();
    },
  };
  return flow;
}
