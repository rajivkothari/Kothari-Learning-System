// Tower Rescue: Quake Control V0.1 (one repair). Pure: no React, so the stages, the one evidence
// path and resume are tested headless (flow.test.ts, resume over the real runtime).
//
//   intro     SAFETY DRILL: a pretend earthquake test has finished, everyone is safe. START.
//   diagnose  a report (towerRescue.json clues) and three systems. Tapping a system that runs shows it
//             running; the one the report means is found. Reading, never evidence: nothing is sent.
//   repair    the stopped lift needs N power and has P. Power cells are the item's options; installing
//             one is the committed answer, the ONLY evidence (session.submit). A wrong cell shows its
//             consequence on the meter (too low, or the safety switch pops it), then pops back out and
//             stays greyed; a right cell powers the lift. Help is the activity's ladder (session.help).
//   powered   FULL POWER: RUN TEST.
//   testing   the lift runs, its doors open, the robot delivers its package (the screen plays it).
//   done      SYSTEM RESTORED. The mission was already complete; next() and finish() close it.
//
// Theme code never scores: right or wrong comes from the runtime's answer. The meter only draws the
// present power plus the installed cell against the needed power, which is the consequence to see.
import { fill } from '../../../content/missionCopy';
import { TOWER_RESCUE, type TowerRescueCopy } from '../../content/minigames';
import type { ChallengeView, HelpOffer, MiniGameSession, MiniGameSound } from '../types';

export type Stage = 'loading' | 'intro' | 'diagnose' | 'repair' | 'powered' | 'testing' | 'done' | 'unsupported';
export type LineKey = keyof TowerRescueCopy['lines'];

export interface Cell {
  id: string;
  value: number;
}

export interface RepairItem {
  key: string;
  needed: number;
  present: number;
  cells: Cell[];
}

export interface TowerRescueView {
  stage: Stage;
  /** The report on screen and the system it means. */
  clue: TowerRescueCopy['clues'][number];
  /** Systems checked that are running (diagnose). */
  checked: string[];
  item: RepairItem | null;
  /** Cells installed wrong on this item: greyed, never sent twice. */
  tried: string[];
  /** The last wrong cell, for the meter's consequence (cleared when the next one goes in). */
  miss: { cellId: string; value: number; dir: 'low' | 'high' } | null;
  /** The cell that powered the lift (powered, testing, done). */
  installed: Cell | null;
  help: HelpOffer | null;
  /** Help given on this item: the gap lit, the power bar counted, the right cell shown. */
  hint: { kind: string; revealed: number | null } | null;
  line: { key: LineKey; vars: Record<string, string | number> };
  busy: boolean;
}

interface Saved {
  v: 1;
  found: boolean;
  checked: string[];
  tried: string[];
  /** A cell sent but not yet answered (saved BEFORE submit): restore knows what the runtime counted. */
  pending: string | null;
  item: RepairItem | null;
  installed: Cell | null;
}

export interface TowerRescueFlow {
  view(): TowerRescueView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  begin(): void;
  inspect(systemId: string): void;
  install(cellId: string): Promise<void>;
  hint(): Promise<void>;
  runTest(): void;
  /** The screen finished playing the test: close the mission. */
  testPlayed(): Promise<void>;
  dispose(): void;
}

const systemName = (copy: TowerRescueCopy, id: string) => copy.systems.find((s) => s.id === id)?.name ?? id;
/** The report for this play session: chosen from the instance id, so a resumed game keeps its report. */
export function clueFor(instanceId: string, copy: TowerRescueCopy = TOWER_RESCUE): TowerRescueCopy['clues'][number] {
  let h = 0;
  for (let i = 0; i < instanceId.length; i++) h = (h * 31 + instanceId.charCodeAt(i)) >>> 0;
  return copy.clues[h % copy.clues.length]!;
}

/** The repair the item shows, or null when it is not a power-cell item (wrong content). */
export function repairFrom(c: ChallengeView): RepairItem | null {
  const needed = c.prompt.capacity;
  const present = c.prompt.aboard;
  if (typeof needed !== 'number' || typeof present !== 'number' || c.answer.mode !== 'choice' || c.options.length < 2) return null;
  const cells = c.options.flatMap((o) => (typeof o.value === 'number' ? [{ id: o.id, value: o.value }] : []));
  if (cells.length !== c.options.length) return null;
  return { key: c.key, needed, present, cells };
}

export function lineText(view: Pick<TowerRescueView, 'line'>, copy: TowerRescueCopy = TOWER_RESCUE): string {
  return fill(copy.lines[view.line.key], view.line.vars);
}

export function createTowerRescueFlow(opts: { session: MiniGameSession; sound: MiniGameSound; copy?: TowerRescueCopy; log?: (event: string, data?: Record<string, unknown>) => void }): TowerRescueFlow {
  const { session, sound } = opts;
  const copy = opts.copy ?? TOWER_RESCUE;
  const log = opts.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  let disposed = false;
  let found = false;
  let pending: string | null = null;
  let view: TowerRescueView = {
    stage: 'loading',
    clue: clueFor(session.instanceId, copy),
    checked: [],
    item: null,
    tried: [],
    miss: null,
    installed: null,
    help: null,
    hint: null,
    line: { key: 'intro', vars: {} },
    busy: false,
  };
  const set = (patch: Partial<TowerRescueView>) => {
    view = { ...view, ...patch };
    for (const l of [...listeners]) l();
  };
  const stopped = () => systemName(copy, view.clue.offline);
  const repairLine = (item: RepairItem) => ({ key: 'repair' as const, vars: { needed: item.needed, present: item.present } });

  const persist = async () => {
    if (disposed) return;
    const saved: Saved = { v: 1, found, checked: view.checked, tried: view.tried, pending, item: view.item, installed: view.installed };
    try {
      await session.saveGame(saved);
    } catch (e) {
      // A gameplay save is a convenience: the answer itself is safe in the runtime.
      log('towerRescue.saveFailed', { message: String(e) });
    }
  };

  const toItem = (c: ChallengeView): boolean => {
    const item = repairFrom(c);
    if (!item) {
      log('towerRescue.unsupported', { activityId: c.activityId });
      set({ stage: 'unsupported', item: null });
      return false;
    }
    const last = c.helpShown[c.helpShown.length - 1];
    set({ item, help: c.help, hint: last ? { kind: last.kind, revealed: typeof c.revealed === 'number' ? c.revealed : null } : null });
    return true;
  };

  const flow: TowerRescueFlow = {
    view: () => view,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    async start() {
      set({ busy: true });
      let saved: Saved | null = null;
      try {
        const raw = (await session.loadGame()) as Partial<Saved> | null;
        if (raw && raw.v === 1) saved = raw as Saved;
      } catch {
        saved = null;
      }
      const p = session.progress();
      if (p.done) {
        set({ stage: 'done', busy: false, installed: saved?.installed ?? null, item: saved?.item ?? null, line: { key: 'testDone', vars: { system: stopped() } } });
        await session.finish();
        return;
      }
      const held = session.solvedAnswer();
      if (p.phase === 'solved' && held) {
        // Repaired before the app closed (or before leaving): the lift is powered, the test waits.
        found = true;
        const item = saved?.item ?? null;
        const installed = saved?.installed ?? (typeof held.value === 'number' ? { id: 'held', value: held.value } : null);
        set({ stage: 'powered', item, installed, checked: saved?.checked ?? [], busy: false, line: { key: 'restored', vars: {} } });
        return;
      }
      const c = session.challenge();
      if (!c || !toItem(c)) {
        set({ busy: false });
        return;
      }
      found = saved?.found ?? false;
      let tried = saved && saved.item?.key === c.key ? saved.tried.filter((id) => c.options.some((o) => o.id === id)) : [];
      // A cell sent just before the app closed: counted by the runtime if it has more misses than we knew.
      if (saved?.pending && saved.item?.key === c.key && c.wrongTries > tried.length && !tried.includes(saved.pending)) tried = [...tried, saved.pending];
      tried = tried.slice(0, c.wrongTries);
      const resumed = saved !== null && (found || saved.checked.length > 0 || tried.length > 0);
      set({
        stage: found ? 'repair' : resumed ? 'diagnose' : 'intro',
        checked: saved?.checked ?? [],
        tried,
        busy: false,
        line: found ? repairLine(view.item!) : resumed ? { key: 'resume', vars: {} } : { key: 'intro', vars: {} },
      });
    },

    begin() {
      if (view.stage !== 'intro') return;
      set({ stage: 'diagnose', line: { key: 'diagnose', vars: {} } });
    },

    inspect(systemId) {
      if (view.stage !== 'diagnose' || view.busy) return;
      if (systemId === view.clue.offline) {
        found = true;
        sound.play('answerRight');
        set({ stage: 'repair', line: { key: 'found', vars: { system: stopped() } } });
      } else {
        sound.play('cratePlace');
        set({ checked: view.checked.includes(systemId) ? view.checked : [...view.checked, systemId], line: { key: 'wrongSystem', vars: { system: systemName(copy, systemId) } } });
      }
      void persist();
    },

    async install(cellId) {
      const item = view.item;
      if (view.stage !== 'repair' || view.busy || !item || view.tried.includes(cellId)) return;
      const cell = item.cells.find((x) => x.id === cellId);
      if (!cell) return;
      sound.play('cratePlace');
      pending = cellId;
      set({ busy: true, miss: null });
      await persist();
      if (disposed) return;
      const res = await session.submit({ mode: 'choice', optionId: cellId });
      if (disposed) return;
      pending = null;
      if (res.status === 'refused') {
        log('towerRescue.refused', { reason: res.reason });
        set({ busy: false });
        await persist();
        return;
      }
      if (res.correct) {
        sound.play('answerRight');
        set({ stage: 'powered', installed: cell, busy: false, line: { key: 'restored', vars: {} } });
      } else if (res.fresh) {
        sound.play('answerWrong');
        const c = session.challenge();
        set({ tried: [], miss: null, hint: null, busy: false });
        if (c) toItem(c);
        set({ line: { key: 'fresh', vars: {} } });
      } else {
        sound.play('answerWrong');
        const dir = item.present + cell.value < item.needed ? 'low' : 'high';
        const c = session.challenge();
        set({ tried: [...view.tried, cellId], miss: { cellId, value: cell.value, dir }, help: c?.help ?? view.help, busy: false, line: { key: dir === 'low' ? 'tooLow' : 'tooHigh', vars: {} } });
      }
      await persist();
    },

    async hint() {
      const item = view.item;
      if (view.stage !== 'repair' || view.busy || !item || !view.help) return;
      set({ busy: true });
      const h = await session.help();
      if (disposed) return;
      if (!h) {
        set({ busy: false });
        return;
      }
      const revealed = typeof h.revealed === 'number' ? h.revealed : null;
      const key: LineKey = h.kind === 'showAnswer' ? 'showMe' : h.kind === 'numberLine' ? 'powerBar' : 'gap';
      set({ busy: false, help: h.next, hint: { kind: h.kind, revealed }, line: { key, vars: { needed: item.needed, present: item.present } } });
    },

    runTest() {
      if (view.stage !== 'powered') return;
      sound.loop('freightMove', true);
      set({ stage: 'testing', line: { key: 'testing', vars: {} } });
    },

    async testPlayed() {
      if (view.stage !== 'testing') return;
      sound.loop('freightMove', false);
      sound.play('deliveryComplete');
      set({ stage: 'done', line: { key: 'testDone', vars: { system: stopped() } } });
      // The answer was recorded at install; next() releases it, finish() closes the instance.
      if (session.progress().phase === 'solved') await session.next();
      if (session.progress().done) await session.finish();
    },

    dispose() {
      disposed = true;
      sound.loop('freightMove', false);
      listeners.clear();
    },
  };
  return flow;
}
