// Tower Rescue (V0.1 D185; ten levels D196). Pure: no React, so the stages, the evidence path and
// resume are tested headless (flow.test.ts and levels.test.ts, over the real runtime).
//
// Each play session is one level: a runtime mission of one to three steps (levels.ts). The loop is
// the same in every level:
//   intro     the level's card: its name and goal. START.
//   diagnose  (levels with a play diagnosis) a report and three systems. Tapping a running system
//             shows it running; the one the report means is found. Reading as play, never evidence.
//   repair    the step's station (levels.ts): power cells, a pair, a dial, gears, floors, or a
//             report to read. The learner's choice is the committed answer, the ONLY evidence
//             (session.submit). A wrong choice shows its consequence (the meter, the dial, the floor
//             the robot reached, the sensor that tests fine, the safety switch) and stays greyed; help
//             is the activity's ladder (session.help).
//   stepDone  a step of a longer level is fixed: the screen plays it, then advance() opens the next.
//   powered   the last step is fixed: RUN TEST.
//   testing   the repaired machine runs (the screen plays it).
//   done      SYSTEM RESTORED. The mission was already complete; next() and finish() close it.
//
// Theme code never scores: right or wrong comes from the runtime's answer. What a wrong choice shows
// is computed from the givens only (present plus the cell against the need, the two cells' sum, the
// dial's count), the consequence to see. Sound is the screen's (D193). Finished levels are kept in
// the game's notes (never evidence) for the level map, together with the runtime's own record.
import { fill } from '../../../content/missionCopy';
import { TOWER_RESCUE, type TowerRescueCopy } from '../../content/minigames';
import type { ChallengeView, HelpOffer, MiniGameSession } from '../types';
import { levelOf, levelsOf, stationFor, type LevelInfo, type Station } from './levels';

export type Stage = 'loading' | 'intro' | 'diagnose' | 'repair' | 'stepDone' | 'powered' | 'testing' | 'done' | 'unsupported';
export type LineKey = keyof TowerRescueCopy['lines'];
/** What the repaired machine does on RUN TEST. */
export type Payoff = 'lift' | 'fans' | 'route' | 'chief';
export type Clue = TowerRescueCopy['clues'][number];

/** A choice the learner can make at a station: a cell, a pair, a setting, a floor, a part, a system. */
export interface Choice {
  id: string;
  value: number | string;
}
/** A power cell (the cells and pair stations). */
export type Cell = Choice & { value: number };

export interface RepairItem {
  key: string;
  station: Station;
  /** The item's givens (the engine's prompt, minus an authored answer). */
  prompt: Readonly<Record<string, number | string>>;
  choices: Choice[];
  /** Cells and pair: the power needed (a pair's target) and present (0 for a pair). */
  needed: number;
  present: number;
  /** Cells and pair: the power cells on offer (for a pair, the numbers; its choices are the pairs). */
  cells: Cell[];
}

export interface TowerRescueView {
  stage: Stage;
  level: LevelInfo;
  /** The play diagnosis's report, or null for a level without one. */
  clue: Clue | null;
  /** The system this level repairs, once it is known (the report, the level, or the inspection's answer). */
  system: string | null;
  /** Systems checked that are running (diagnose). */
  checked: string[];
  /** The step now (0-based) and how many the level has. */
  step: { index: number; count: number };
  item: RepairItem | null;
  /** Choices made wrong on this item: greyed, never sent twice. */
  tried: string[];
  /** The last wrong choice, for its consequence (cleared when the next one goes in). */
  miss: { cellId: string; value: number | string; dir: 'low' | 'high' | null } | null;
  /** The choice that fixed the last step (stepDone, powered, testing, done). */
  installed: Choice | null;
  /** Each fixed step's answer, by step index: the floor the robot goes to, the system found. */
  answers: Record<number, number | string>;
  /** A power step (cells or a pair) of this level is fixed: the system has its power back. */
  poweredUp: boolean;
  help: HelpOffer | null;
  /** Help given on this item: the givens lit, the ladder, the right choice shown. */
  hint: { kind: string; revealed: number | string | null } | null;
  line: { key: LineKey; vars: Record<string, string | number> };
  payoff: Payoff;
  /** Missions of the levels this learner has finished (the level map). */
  finished: string[];
  busy: boolean;
}

interface Saved {
  v: 2;
  found: boolean;
  checked: string[];
  tried: string[];
  /** A choice sent but not yet answered (saved BEFORE submit): restore knows what the runtime counted. */
  pending: string | null;
  item: RepairItem | null;
  installed: Choice | null;
  answers: Record<number, number | string>;
  poweredUp?: boolean;
}
/** The V0.1 save (one repair, D185): still read, so a repair left open before D196 resumes. */
interface SavedV1 {
  v: 1;
  found: boolean;
  checked: string[];
  tried: string[];
  pending: string | null;
  item: { key: string; needed: number; present: number; cells: Cell[] } | null;
  installed: Cell | null;
}
interface Notes {
  v: 1;
  finished: string[];
}

export interface TowerRescueFlow {
  view(): TowerRescueView;
  subscribe(l: () => void): () => void;
  start(): Promise<void>;
  begin(): void;
  inspect(systemId: string): void;
  /** Install a cell, send a pair, set the dial, send the lift to a floor, or pick an answer: the committed choice. */
  install(choiceId: string): Promise<void>;
  /** After a step of a longer level is fixed and the screen has played it: on to the next step. */
  advance(): Promise<void>;
  hint(): Promise<void>;
  runTest(): void;
  /** The screen finished playing the test: close the mission. */
  testPlayed(): Promise<void>;
  dispose(): void;
}

const systemName = (copy: TowerRescueCopy, id: string) => copy.systems.find((s) => s.id === id)?.name ?? id;
const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
/** The report for this play session: chosen from the instance id, so a resumed game keeps its report. */
export function clueFor(instanceId: string, copy: TowerRescueCopy = TOWER_RESCUE, list: readonly Clue[] = copy.clues): Clue {
  return list[hashOf(instanceId) % list.length]!;
}
/** The level's play diagnosis report, or null when it has none. */
export function levelClue(level: LevelInfo, instanceId: string, copy: TowerRescueCopy = TOWER_RESCUE): Clue | null {
  if (!level.clues) return null;
  return clueFor(instanceId, copy, level.clues === 'fans' ? copy.fanClues : copy.clues);
}

/** What the repaired machine does on RUN TEST: the chief's finale, a trip to a floor when the level ends with one (a route or the gears), the fans, else a lift. */
export function payoffOf(level: LevelInfo, lastStation: Station | null, system: string | null, copy: TowerRescueCopy = TOWER_RESCUE): Payoff {
  if (level.id === 'chief') return 'chief';
  if (lastStation === 'route' || lastStation === 'gears') return 'route';
  return copy.systems.find((s) => s.id === system)?.kind === 'fans' ? 'fans' : 'lift';
}

/** The item a station shows, or null when it is none of them (wrong content). */
export function repairFrom(c: ChallengeView): RepairItem | null {
  const station = stationFor(c.activityId, c.prompt);
  if (!station || c.answer.mode !== 'choice' || c.options.length < 2) return null;
  const choices = c.options.flatMap((o) => (typeof o.value === 'number' || typeof o.value === 'string' ? [{ id: o.id, value: o.value }] : []));
  if (choices.length !== c.options.length) return null;
  // An authored item's prompt carries its answer: never kept where a view could show it.
  const { answer: _answer, ...rest } = c.prompt as Record<string, unknown>;
  const prompt = Object.fromEntries(Object.entries(station === 'sensor' || station === 'checklist' || station === 'inspect' ? rest : c.prompt).filter(([, v]) => typeof v === 'number' || typeof v === 'string')) as Record<string, number | string>;
  const num = (k: string) => (typeof prompt[k] === 'number' ? (prompt[k] as number) : 0);
  if (station === 'cells') {
    if (choices.some((x) => typeof x.value !== 'number')) return null;
    return { key: c.key, station, prompt, choices, needed: num('capacity'), present: num('aboard'), cells: choices as Cell[] };
  }
  if (station === 'pair') {
    const count = num('count');
    const cells: Cell[] = Array.from({ length: count }, (_, i) => ({ id: `n${i + 1}`, value: num(`n${i + 1}`) }));
    return { key: c.key, station, prompt, choices, needed: num('target'), present: 0, cells };
  }
  return { key: c.key, station, prompt, choices, needed: 0, present: 0, cells: [] };
}

/** A pair choice's two numbers ("3+5"). */
export const pairParts = (value: number | string): [number, number] | null => {
  const m = /^(\d+)\+(\d+)$/.exec(String(value));
  return m ? [Number(m[1]), Number(m[2])] : null;
};
/** The pair choice made of two of the numbers, or null. */
export const pairChoice = (item: RepairItem, a: number, b: number): Choice | null => item.choices.find((x) => x.value === `${Math.min(a, b)}+${Math.max(a, b)}`) ?? null;

/** A dial's settings: the shown ones and the gap (null). */
export function dialSettings(item: RepairItem): (number | null)[] {
  const { first, step, length, missing } = item.prompt;
  if (typeof first !== 'number' || typeof step !== 'number' || typeof length !== 'number' || typeof missing !== 'number') return [];
  const sign = item.prompt.direction === 'down' ? -1 : 1;
  return Array.from({ length }, (_, i) => (i === missing ? null : first + sign * step * i));
}

/** Where a route or gears move ends for a chosen floor: how far from the start, the consequence to draw. */
export const travelOf = (item: RepairItem, floor: number) => (typeof item.prompt.start === 'number' ? floor - item.prompt.start : 0);

function askLine(item: RepairItem): TowerRescueView['line'] {
  const p = item.prompt;
  switch (item.station) {
    case 'cells':
      return { key: 'repair', vars: { needed: item.needed, present: item.present } };
    case 'pair':
      return { key: 'pairAsk', vars: { target: item.needed } };
    case 'dial':
      return { key: 'dialAsk', vars: { step: p.step ?? '' } };
    case 'gears':
      return { key: 'gearsAsk', vars: { start: p.start ?? '', ones: p.ones ?? '' } };
    case 'route': {
      const up = p.direction !== 'down';
      if (typeof p.change2 === 'number') return { key: up ? 'routeUpDown' : 'routeDownUp', vars: { start: p.start ?? '', change: p.change ?? '', back: p.change2 } };
      return { key: up ? 'routeUp' : 'routeDown', vars: { start: p.start ?? '', change: p.change ?? '' } };
    }
    default:
      return { key: 'readAsk', vars: {} };
  }
}

function helpLine(item: RepairItem, kind: string, copy: TowerRescueCopy): TowerRescueView['line'] {
  const p = item.prompt;
  const reading = item.station === 'sensor' || item.station === 'checklist' || item.station === 'inspect';
  if (kind === 'showAnswer') return { key: reading ? 'readShowMe' : 'showMe', vars: {} };
  const ladder = kind === 'numberLine';
  switch (item.station) {
    case 'cells':
      return { key: ladder ? 'powerBar' : 'gap', vars: { needed: item.needed, present: item.present } };
    case 'pair':
      return ladder ? { key: 'pairDots', vars: {} } : { key: 'pairGivens', vars: { target: item.needed } };
    case 'dial':
      return ladder ? { key: 'dialLadder', vars: { step: p.step ?? '' } } : { key: 'dialGivens', vars: {} };
    case 'gears':
      return ladder ? { key: 'gearsLadder', vars: { start: p.start ?? '' } } : { key: 'gearsGivens', vars: { start: p.start ?? '', ones: p.ones ?? '' } };
    case 'route':
      return ladder ? { key: 'routeLadder', vars: {} } : { key: 'routeGivens', vars: { start: p.start ?? '' } };
    default:
      void copy;
      return { key: 'readClue', vars: {} };
  }
}

function wrongLine(item: RepairItem, choice: Choice, copy: TowerRescueCopy): { line: TowerRescueView['line']; dir: 'low' | 'high' | null } {
  switch (item.station) {
    case 'cells': {
      const dir = item.present + Number(choice.value) < item.needed ? 'low' : 'high';
      return { dir, line: { key: dir === 'low' ? 'tooLow' : 'tooHigh', vars: {} } };
    }
    case 'pair': {
      const [a, b] = pairParts(choice.value) ?? [0, 0];
      const dir = a + b < item.needed ? 'low' : 'high';
      return { dir, line: { key: dir === 'low' ? 'pairLow' : 'pairHigh', vars: { a, b, sum: a + b } } };
    }
    case 'dial': {
      const s = dialSettings(item);
      const gap = s.indexOf(null);
      const before = gap > 0 ? s[gap - 1] : null;
      const step = typeof item.prompt.step === 'number' ? item.prompt.step : 0;
      const sign = item.prompt.direction === 'down' ? -1 : 1;
      const dir = typeof before === 'number' ? (sign * (Number(choice.value) - before) < step ? 'low' : 'high') : null;
      return { dir, line: { key: 'dialWrong', vars: {} } };
    }
    case 'gears':
      return { dir: null, line: { key: 'gearsWrong', vars: { value: choice.value } } };
    case 'route':
      return { dir: null, line: { key: 'routeWrong', vars: { value: choice.value } } };
    case 'sensor':
      return { dir: null, line: { key: 'sensorWrong', vars: { value: choice.value } } };
    case 'checklist':
      return { dir: null, line: { key: 'checklistWrong', vars: {} } };
    case 'inspect':
      return { dir: null, line: { key: 'inspectWrong', vars: { system: systemName(copy, String(choice.value)) } } };
  }
}

export function lineText(view: Pick<TowerRescueView, 'line'>, copy: TowerRescueCopy = TOWER_RESCUE): string {
  return fill(copy.lines[view.line.key], view.line.vars);
}

const asV2 = (raw: unknown): Saved | null => {
  const r = raw as Partial<Saved> | Partial<SavedV1> | null;
  if (!r || typeof r !== 'object') return null;
  if (r.v === 2) return r as Saved;
  if (r.v === 1) {
    // The V0.1 save (a cells repair): the same fields, its item as a cells item.
    const old = r as SavedV1;
    const item: RepairItem | null = old.item ? { key: old.item.key, station: 'cells', prompt: { capacity: old.item.needed, aboard: old.item.present }, choices: old.item.cells, needed: old.item.needed, present: old.item.present, cells: old.item.cells } : null;
    return { v: 2, found: old.found, checked: old.checked ?? [], tried: old.tried ?? [], pending: old.pending ?? null, item, installed: old.installed ?? null, answers: {} };
  }
  return null;
};

export function createTowerRescueFlow(opts: { session: MiniGameSession; copy?: TowerRescueCopy; log?: (event: string, data?: Record<string, unknown>) => void }): TowerRescueFlow {
  const { session } = opts;
  const copy = opts.copy ?? TOWER_RESCUE;
  const log = opts.log ?? (() => undefined);
  const listeners = new Set<() => void>();
  const level = levelOf(session.missionId, levelsOf(copy));
  const clue = levelClue(level, session.instanceId, copy);
  let disposed = false;
  let found = false;
  let pending: string | null = null;
  let notes: string[] = [];
  let view: TowerRescueView = {
    stage: 'loading',
    level,
    clue,
    system: clue?.offline ?? level.system ?? null,
    checked: [],
    step: { index: 0, count: 1 },
    item: null,
    tried: [],
    miss: null,
    installed: null,
    answers: {},
    poweredUp: false,
    help: null,
    hint: null,
    line: { key: 'intro', vars: {} },
    payoff: 'lift',
    finished: [...session.completedMissions],
    busy: false,
  };
  const set = (patch: Partial<TowerRescueView>) => {
    view = { ...view, ...patch };
    for (const l of [...listeners]) l();
  };
  const systemNow = () => view.system ?? clue?.offline ?? level.system ?? null;
  const doneLine = (): TowerRescueView['line'] =>
    view.payoff === 'chief' ? { key: 'chiefDone', vars: {} } : view.payoff === 'route' ? { key: 'routeDone', vars: {} } : view.payoff === 'fans' ? { key: 'fansDone', vars: {} } : { key: 'testDone', vars: { system: systemName(copy, systemNow() ?? 'passenger') } };
  const readyLine = (item: RepairItem | null, installed: Choice | null): TowerRescueView['line'] => {
    if (view.payoff === 'route' || view.payoff === 'chief') return { key: 'routeReady', vars: { value: installed?.value ?? '' } };
    if (item?.station === 'sensor') return { key: 'sensorFound', vars: {} };
    if (view.payoff === 'fans') return { key: 'fansRestored', vars: {} };
    return { key: 'restored', vars: {} };
  };
  const stepLine = (item: RepairItem | null, installed: Choice | null): TowerRescueView['line'] => {
    if (item?.station === 'checklist') return { key: 'safetyDone', vars: {} };
    if (item?.station === 'inspect' && installed) return { key: 'inspectFound', vars: { system: systemName(copy, String(installed.value)) } };
    return { key: 'stepDone', vars: {} };
  };
  /** The system an inspection answer found, or the one already known. */
  const systemAfter = (item: RepairItem | null, installed: Choice | null) => (item?.station === 'inspect' && installed ? String(installed.value) : view.system);
  const stepNow = () => {
    const p = session.progress();
    return { index: Math.min(p.step.index, Math.max(0, p.step.count - 1)), count: Math.max(1, p.step.count) };
  };

  const persist = async () => {
    if (disposed) return;
    const saved: Saved = { v: 2, found, checked: view.checked, tried: view.tried, pending, item: view.item, installed: view.installed, answers: view.answers, poweredUp: view.poweredUp };
    try {
      await session.saveGame(saved);
    } catch (e) {
      // A gameplay save is a convenience: the answer itself is safe in the runtime.
      log('towerRescue.saveFailed', { message: String(e) });
    }
  };
  const remember = async () => {
    if (notes.includes(level.mission)) return;
    notes = [...notes, level.mission];
    set({ finished: [...new Set([...view.finished, level.mission])] });
    try {
      await session.saveNotes({ v: 1, finished: notes } satisfies Notes);
    } catch (e) {
      log('towerRescue.notesFailed', { message: String(e) });
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
    const revealed = typeof c.revealed === 'number' || typeof c.revealed === 'string' ? c.revealed : null;
    const steps = stepNow();
    set({ item, step: steps, help: c.help, hint: last ? { kind: last.kind, revealed } : null, payoff: steps.index === steps.count - 1 ? payoffOf(level, item.station, view.system, copy) : view.payoff });
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
        saved = asV2(await session.loadGame());
      } catch {
        saved = null;
      }
      try {
        const n = (await session.loadNotes()) as Partial<Notes> | null;
        notes = n && n.v === 1 && Array.isArray(n.finished) ? n.finished.filter((m): m is string => typeof m === 'string') : [];
      } catch {
        notes = [];
      }
      const answers = saved?.answers ?? {};
      const system = saved?.item?.station === 'inspect' && saved.installed ? String(saved.installed.value) : Object.values(answers).find((v) => copy.systems.some((s) => s.id === v)) ?? view.system;
      set({ finished: [...new Set([...session.completedMissions, ...notes])], answers, poweredUp: Boolean(saved?.poweredUp), system: typeof system === 'string' ? system : view.system });
      const p = session.progress();
      if (p.done) {
        const item = saved?.item ?? null;
        set({ stage: 'done', busy: false, installed: saved?.installed ?? null, item, payoff: payoffOf(level, item?.station ?? null, view.system, copy) });
        set({ line: doneLine() });
        await remember();
        await session.finish();
        return;
      }
      const held = session.solvedAnswer();
      if (p.phase === 'solved' && held) {
        // Fixed before the app closed (or before leaving): the step's moment waits.
        found = true;
        const item = saved?.item ?? null;
        const installed = saved?.installed ?? (typeof held.value === 'number' || typeof held.value === 'string' ? { id: 'held', value: held.value } : null);
        const steps = { index: Math.max(0, p.step.count > 0 ? p.step.index - 1 : 0), count: Math.max(1, p.step.count) };
        const last = p.complete;
        const sys = systemAfter(item, installed);
        if (item?.station === 'cells' || item?.station === 'pair') set({ poweredUp: true });
        set({ item, installed, system: sys, checked: saved?.checked ?? [], busy: false, step: last ? { index: Math.max(0, steps.count - 1), count: steps.count } : steps });
        if (last) {
          set({ payoff: payoffOf(level, item?.station ?? null, sys, copy) });
          set({ stage: 'powered', line: readyLine(item, installed) });
        } else set({ stage: 'stepDone', line: stepLine(item, installed) });
        return;
      }
      const c = session.challenge();
      if (!c || !toItem(c)) {
        set({ busy: false });
        return;
      }
      found = saved?.found ?? false;
      let tried = saved && saved.item?.key === c.key ? saved.tried.filter((id) => c.options.some((o) => o.id === id)) : [];
      // A choice sent just before the app closed: counted by the runtime if it has more misses than we knew.
      if (saved?.pending && saved.item?.key === c.key && c.wrongTries > tried.length && !tried.includes(saved.pending)) tried = [...tried, saved.pending];
      tried = tried.slice(0, c.wrongTries);
      const later = view.step.index > 0;
      const resumed = later || (saved !== null && (found || saved.checked.length > 0 || tried.length > 0));
      const working = found || later || (!clue && resumed);
      if (working) found = true;
      set({
        stage: working ? 'repair' : resumed && clue ? 'diagnose' : 'intro',
        checked: saved?.checked ?? [],
        tried,
        busy: false,
        line: working ? askLine(view.item!) : resumed ? { key: 'resume', vars: {} } : { key: 'intro', vars: {} },
      });
    },

    begin() {
      if (view.stage !== 'intro') return;
      if (clue) set({ stage: 'diagnose', line: { key: 'diagnose', vars: {} } });
      else {
        found = true;
        set({ stage: 'repair', line: view.item ? askLine(view.item) : { key: 'diagnose', vars: {} } });
        void persist();
      }
    },

    inspect(systemId) {
      if (view.stage !== 'diagnose' || view.busy || !clue) return;
      if (systemId === clue.offline) {
        found = true;
        set({ stage: 'repair', line: { key: 'found', vars: { system: systemName(copy, clue.offline) } } });
      } else {
        set({ checked: view.checked.includes(systemId) ? view.checked : [...view.checked, systemId], line: { key: 'wrongSystem', vars: { system: systemName(copy, systemId) } } });
      }
      void persist();
    },

    async install(choiceId) {
      const item = view.item;
      if (view.stage !== 'repair' || view.busy || !item || view.tried.includes(choiceId)) return;
      const choice = item.choices.find((x) => x.id === choiceId);
      if (!choice) return;
      pending = choiceId;
      set({ busy: true, miss: null });
      await persist();
      if (disposed) return;
      const res = await session.submit({ mode: 'choice', optionId: choiceId });
      if (disposed) return;
      pending = null;
      if (res.status === 'refused') {
        log('towerRescue.refused', { reason: res.reason });
        set({ busy: false });
        await persist();
        return;
      }
      if (res.correct) {
        const answers = { ...view.answers, [view.step.index]: choice.value };
        const system = systemAfter(item, choice);
        if (item.station === 'cells' || item.station === 'pair') set({ poweredUp: true });
        if (res.done) {
          set({ installed: choice, answers, system, payoff: payoffOf(level, item.station, system, copy) });
          set({ stage: 'powered', busy: false, line: readyLine(item, choice) });
        } else set({ stage: 'stepDone', installed: choice, answers, system, busy: false, line: stepLine(item, choice) });
      } else if (res.fresh) {
        const c = session.challenge();
        set({ tried: [], miss: null, hint: null, busy: false });
        if (c) toItem(c);
        set({ line: { key: 'fresh', vars: {} } });
      } else {
        const { dir, line } = wrongLine(item, choice, copy);
        const c = session.challenge();
        set({ tried: [...view.tried, choiceId], miss: { cellId: choiceId, value: choice.value, dir }, help: c?.help ?? view.help, busy: false, line });
      }
      await persist();
    },

    async advance() {
      if (view.stage !== 'stepDone' || view.busy) return;
      set({ busy: true });
      const c = await session.next();
      if (disposed) return;
      set({ tried: [], miss: null, hint: null, installed: null, busy: false });
      if (!c || !toItem(c)) {
        set({ busy: false });
        return;
      }
      set({ stage: 'repair', line: askLine(view.item!) });
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
      const revealed = typeof h.revealed === 'number' || typeof h.revealed === 'string' ? h.revealed : null;
      set({ busy: false, help: h.next, hint: { kind: h.kind, revealed }, line: helpLine(item, h.kind, copy) });
    },

    runTest() {
      if (view.stage !== 'powered') return;
      set({ stage: 'testing', line: { key: 'testing', vars: {} } });
    },

    async testPlayed() {
      if (view.stage !== 'testing') return;
      set({ stage: 'done', line: doneLine() });
      // The answer was recorded at install; next() releases it, finish() closes the instance.
      if (session.progress().phase === 'solved') await session.next();
      await remember();
      if (session.progress().done) await session.finish();
    },

    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
  return flow;
}
