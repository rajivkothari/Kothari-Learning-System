// The mini-game session adapter (M9): one runtime mission instance per play session, behind the
// MiniGameSession contract (types.ts). No React. The game never sees the runtime.
//
// Instance: the learner's unfinished instance of the game's mission resumes (findActiveMission);
// one whose content changed under it ends as abandoned (as Floor 15's does, D106) and a new one
// starts; otherwise a new one starts.
//
// Evidence goes through submit() only. Every command carries an idempotent id built from the
// instance and the checkpoint revision it was built against (`<instance>:mg:r<revision>:<kind>`),
// plus that revision as `basedOn`: a second tap, a re-entry or a restart that sends an answer again
// is answered from the stored result (duplicate) or refused as stale, and writes nothing.
//
// A right answer moves the engine on at once; the session holds the next item back ("solved")
// until the game has played its moment and calls next(). So that a right answer committed just
// before the app closed is not lost to the game, the answer in flight is noted (a setting) before
// it is sent: on the next open, if exactly one command committed since, it is sent again with the
// same id, which only reads back the stored result, and a right one is "solved" again. An answer
// that never committed is dropped (the child answers again, as everywhere in the game).
//
// Gameplay state (saveGame) is a per-learner setting tied to the instance: never evidence. Writes
// coalesce (the newest state wins), so a game may save as often as it likes.
import { recordedAssistance, type ActivityView, type AnswerValue, type AssistanceLevel, type MissionView, type PresentationIntent, type Response } from '../../../engine';
import type { CommandOutcome, GameRuntime, SubmitInput } from '../../../runtime/gameRuntime';
import type { ChallengeView, Evidence, HelpOffer, HelpView, MiniGameCheck, MiniGameEntry, MiniGameProgress, MiniGameSession, SubmitResult } from './types';

/** Settings keys the mini-games use. Start Over never carries them to a new learner (sessionCore). */
export const GAME_SETTING_PREFIX = 'eq.mg.';
export const saveKey = (gameId: string) => `${GAME_SETTING_PREFIX}${gameId}.save`;
export const inflightKey = (gameId: string) => `${GAME_SETTING_PREFIX}${gameId}.inflight`;
/** A game's saved state may be at most this long (JSON characters). */
export const SAVE_LIMIT = 32 * 1024;

export interface MiniGameSessionDeps {
  runtime: GameRuntime;
  learnerId: string;
  game: MiniGameEntry;
  clock: { now(): number };
  /** A fresh instance id (default `<game>-<learner>-<time>`). */
  newInstanceId?: () => string;
  log?: (kind: string, data?: Record<string, unknown>) => void;
}

/** The host's handle: the session the game gets, and close(), which only the host calls. */
export interface MiniGameSessionHandle {
  session: MiniGameSession;
  /** The game is closing (BACK TO ELEVATOR, Start Over, leaving): waits for a command or save in flight, then forgets the checkpoint in memory. The instance stays as it is for next time. Idempotent. */
  close(): Promise<void>;
}

interface Inflight {
  v: 1;
  instanceId: string;
  commandId: string;
  basedOn: number;
  response: Response;
  /** What a right answer is recorded as (computed from the item before it was sent). */
  evidence: AssistanceLevel;
}

type Held = { value: AnswerValue; evidence: Evidence };

const parse = (text: string | undefined): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const isInflight = (x: unknown): x is Inflight => {
  const r = x as Partial<Inflight> | null;
  return Boolean(r && r.v === 1 && typeof r.instanceId === 'string' && typeof r.commandId === 'string' && typeof r.basedOn === 'number' && r.response && typeof r.evidence === 'string');
};

const inputOf = (r: Response): { optionId: string } | { value: AnswerValue } => (r.mode === 'choice' ? { optionId: r.optionId } : { value: r.value });

const resultOf = (intents: readonly PresentationIntent[]) => intents.find((i): i is Extract<PresentationIntent, { type: 'RESPONSE_RESULT' }> => i.type === 'RESPONSE_RESULT') ?? null;
const rejectionOf = (intents: readonly PresentationIntent[]) => intents.find((i): i is Extract<PresentationIntent, { type: 'RESPONSE_REJECTED' }> => i.type === 'RESPONSE_REJECTED') ?? null;

/** What a right answer to this item is recorded as: the help it had, and "retry" after a miss (the engine's own rule). */
export function evidenceFor(activity: Pick<ActivityView, 'wrongTries' | 'scaffolds' | 'rescue'>): AssistanceLevel {
  const help: AssistanceLevel[] = activity.scaffolds.shown.map((s) => s.assistance);
  if (activity.rescue?.status === 'done') help.push('guided');
  return recordedAssistance({ wrongTries: activity.wrongTries, helpReceived: help });
}

function offerOf(activity: ActivityView): HelpOffer | null {
  const s = activity.scaffolds.available[0];
  return s ? { stepId: s.stepId, kind: s.kind, assistance: s.assistance, offered: s.mode === 'offer' } : null;
}

export function challengeOf(activity: ActivityView): ChallengeView {
  return {
    key: activity.itemSignature,
    stepId: activity.stepId,
    activityId: activity.activityId,
    concept: activity.concept,
    challenge: activity.challenge,
    prompt: { ...activity.prompt },
    answer: activity.answer,
    options: activity.options.map((o) => ({ id: o.id, value: o.value })),
    item: { ...activity.item },
    wrongTries: activity.wrongTries,
    help: offerOf(activity),
    helpShown: activity.scaffolds.shown.map((s) => ({ stepId: s.stepId, kind: s.kind, assistance: s.assistance })),
    revealed: activity.scaffolds.revealedValue,
  };
}

/** Open (resume or start) the learner's play session of `game`. */
export async function openMiniGameSession(deps: MiniGameSessionDeps): Promise<MiniGameSessionHandle> {
  const { runtime, learnerId, game, clock } = deps;
  const log = (kind: string, data: Record<string, unknown> = {}) => deps.log?.(kind, { game: game.id, ...data });
  const put = (key: string, value: string) => runtime.putSetting(learnerId, key, value);

  // Any of the game's missions may have an unfinished instance (a game with one mission per tier).
  const missions = [...new Set([game.missionId, ...(game.missions ?? [])])];
  let instanceId: string | null = null;
  for (const m of missions) instanceId ??= await runtime.findActiveMission(learnerId, m);
  let resumed = false;
  if (instanceId) {
    const compat = await runtime.missionCompatibility(instanceId);
    if (compat.ok) resumed = true;
    else {
      // Content changed under it: it can no longer be shown as it was. Its evidence stays; a new game starts.
      await runtime.abandonMission(instanceId, { commandId: `abandon:${instanceId}` });
      log('minigame.abandoned', { instanceId, reason: compat.reason });
      await put(saveKey(game.id), '');
      instanceId = null;
    }
  }
  if (!instanceId) {
    const base = deps.newInstanceId?.() ?? `${game.id}-${learnerId}-${clock.now().toString(36)}`;
    const learner = game.chooseMission || game.chooseInstanceId ? await runtime.learnerState(learnerId) : null;
    const chosen = game.chooseMission && learner ? game.chooseMission(learner) : game.missionId;
    const missionId = missions.includes(chosen) ? chosen : game.missionId;
    // The id seeds the pools: a game may pick one whose pools give the tiers it wants (it keeps the base as its prefix).
    const picked = game.chooseInstanceId && learner ? game.chooseInstanceId(learner, base, missionId) : base;
    instanceId = picked.startsWith(base) ? picked : base;
    log('minigame.mission', { missionId, chosen, instanceId });
    await runtime.startMission({ learnerId, missionId, instanceId });
  }
  const id = instanceId;
  const activated = await runtime.activate(id);
  let view: MissionView = activated.view;
  let revision = activated.revision;
  let held: Held | null = null;
  let solved = 0;

  // A right answer committed just before the app closed: read its result back (same id: no write).
  const noted = parse((await runtime.settings(learnerId))[inflightKey(game.id)]);
  if (isInflight(noted)) {
    // Another instance's note (that game finished, or was abandoned) is only cleared.
    if (noted.instanceId === id && noted.basedOn + 1 === revision) {
      const outcome = await runtime.submit(id, { commandId: noted.commandId, basedOn: noted.basedOn, ...inputOf(noted.response) } as SubmitInput);
      const result = resultOf(outcome.intents);
      if (outcome.duplicate && result?.correct) {
        held = { value: result.value, evidence: noted.evidence };
        log('minigame.solvedRestored', { instanceId: id, commandId: noted.commandId });
      }
    }
    if (!held) await put(inflightKey(game.id), '');
  }
  log('minigame.session', { instanceId: id, resumed, revision, held: held !== null });

  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  let busy: Promise<unknown> | null = null;
  let closed = false;
  let saving: Promise<void> | null = null;
  let queued: string | null = null;

  const phase = (): MiniGameProgress['phase'] => {
    if (held) return 'solved';
    if (view.status !== 'active') return 'done';
    if (view.narrative) return 'story';
    return view.activity ? 'challenge' : 'done';
  };
  const commandId = (kind: string) => `${id}:mg:r${revision}:${kind}`;

  /** One command at a time; a failed commit reloads the durable checkpoint. */
  async function run<T>(task: () => Promise<T>): Promise<T> {
    const p = task();
    busy = p;
    emit();
    try {
      return await p;
    } finally {
      busy = null;
      emit();
    }
  }
  async function reload() {
    try {
      const r = await runtime.activate(id);
      view = r.view;
      revision = r.revision;
    } catch (e) {
      log('minigame.reloadFailed', { error: String(e) });
    }
  }
  const accept = (outcome: CommandOutcome) => {
    revision = outcome.revision;
    view = outcome.view;
  };

  async function flushSaves() {
    while (queued !== null) {
      const text = queued;
      queued = null;
      try {
        await put(saveKey(game.id), text);
      } catch (e) {
        log('minigame.saveFailed', { error: String(e) });
      }
    }
    saving = null;
  }

  const session: MiniGameSession = {
    gameId: game.id,
    learnerId,
    instanceId: id,
    resumed,

    challenge: () => (phase() === 'challenge' && view.activity ? challengeOf(view.activity) : null),
    story: () => (phase() === 'story' && view.narrative ? { stepId: view.narrative.stepId, eventKey: view.narrative.eventKey } : null),
    solvedAnswer: () => (held ? { ...held } : null),

    check(response): MiniGameCheck | null {
      if (closed || phase() !== 'challenge') return null;
      try {
        const c = runtime.check(id, response);
        if (!c.ok) return null;
        return { correct: c.evaluation.correct, misconception: c.evaluation.correct ? null : (c.evaluation.misconception ?? null) };
      } catch {
        return null;
      }
    },

    async submit(response): Promise<SubmitResult> {
      if (closed) return { status: 'refused', reason: 'closed' };
      if (busy) return { status: 'refused', reason: 'busy' };
      const activity = view.activity;
      if (phase() !== 'challenge' || !activity) return { status: 'refused', reason: 'noChallenge' };
      let ok = false;
      try {
        ok = runtime.check(id, response).ok;
      } catch {
        ok = false;
      }
      if (!ok) return { status: 'refused', reason: 'invalid' };
      const note: Inflight = { v: 1, instanceId: id, commandId: commandId('submit'), basedOn: revision, response, evidence: evidenceFor(activity) };
      return run(async (): Promise<SubmitResult> => {
        // Noted first (the runtime keeps writes in order), so a restart can read the result back.
        void put(inflightKey(game.id), JSON.stringify(note)).catch(() => undefined);
        let outcome: CommandOutcome;
        try {
          outcome = await runtime.submit(id, { commandId: note.commandId, basedOn: note.basedOn, ...inputOf(response) } as SubmitInput);
        } catch (e) {
          log('minigame.submitFailed', { error: String(e) });
          await reload();
          return { status: 'refused', reason: 'failed' };
        }
        const rejected = rejectionOf(outcome.intents);
        const result = resultOf(outcome.intents);
        accept(outcome);
        if (rejected || !result) {
          void put(inflightKey(game.id), '').catch(() => undefined);
          log('minigame.rejected', { reason: rejected?.reason ?? 'noResult' });
          return { status: 'refused', reason: rejected?.reason === 'stale' ? 'stale' : rejected?.reason === 'noActivity' || rejected?.reason === 'missionComplete' ? 'noChallenge' : 'invalid' };
        }
        const done = outcome.view.status === 'completed';
        log('minigame.answer', { correct: result.correct, stepId: result.stepId, revision, done });
        if (result.correct) {
          solved += 1;
          held = { value: result.value, evidence: note.evidence };
          return { status: 'answered', correct: true, evidence: note.evidence, misconception: null, fresh: false, done };
        }
        void put(inflightKey(game.id), '').catch(() => undefined);
        const fresh = outcome.intents.some((i) => i.type === 'ITEM_REGENERATED');
        return { status: 'answered', correct: false, evidence: 'incorrect', misconception: result.misconception, fresh, done: false };
      });
    },

    async help(): Promise<HelpView | null> {
      const activity = view.activity;
      if (closed || busy || phase() !== 'challenge' || !activity) return null;
      const offer = activity.scaffolds.available[0];
      if (!offer) return null;
      return run(async () => {
        let outcome: CommandOutcome;
        try {
          outcome = await runtime.useScaffold(id, { commandId: commandId(`help:${offer.stepId}`), scaffoldStepId: offer.stepId, basedOn: revision });
        } catch (e) {
          log('minigame.helpFailed', { error: String(e) });
          await reload();
          return null;
        }
        accept(outcome);
        const shown = outcome.intents.find((i): i is Extract<PresentationIntent, { type: 'SCAFFOLD_SHOWN' }> => i.type === 'SCAFFOLD_SHOWN');
        if (!shown) return null;
        log('minigame.help', { kind: shown.scaffold.kind, assistance: shown.scaffold.assistance });
        const after = shown.nextAvailable[0];
        return {
          stepId: shown.scaffold.stepId,
          kind: shown.scaffold.kind,
          assistance: shown.scaffold.assistance,
          revealed: shown.revealedValue,
          next: after ? { stepId: after.stepId, kind: after.kind, assistance: after.assistance, offered: after.mode === 'offer' } : null,
        };
      });
    },

    async next() {
      if (closed || busy) return null;
      if (held) {
        held = null;
        void put(inflightKey(game.id), '').catch(() => undefined);
        emit();
        return session.challenge();
      }
      if (phase() === 'story') {
        await run(async () => {
          try {
            accept(await runtime.acknowledge(id, { commandId: commandId('ack'), basedOn: revision }));
          } catch (e) {
            log('minigame.ackFailed', { error: String(e) });
            await reload();
          }
        });
      }
      return session.challenge();
    },

    progress() {
      const step = view.step ? { index: view.step.index, count: view.step.count } : { index: 0, count: 0 };
      const item = view.activity ? { ...view.activity.item } : null;
      const p = phase();
      return { phase: p, step, item, solved, done: view.status === 'completed' && p === 'done' };
    },

    async saveGame(state) {
      if (closed) return;
      const text = JSON.stringify({ v: 1, instanceId: id, state: state ?? null });
      if (text.length > SAVE_LIMIT) throw new Error(`A mini-game save is at most ${SAVE_LIMIT} characters (got ${text.length})`);
      queued = text;
      saving ??= flushSaves();
      return saving;
    },

    async loadGame() {
      const saved = parse((await runtime.settings(learnerId))[saveKey(game.id)]) as { v?: number; instanceId?: string; state?: unknown } | null;
      return saved && saved.v === 1 && saved.instanceId === id && saved.state !== undefined ? saved.state : null;
    },

    async finish() {
      if (closed) return;
      closed = true;
      await busy?.catch(() => undefined);
      await saving;
      held = null;
      await put(saveKey(game.id), '').catch(() => undefined);
      await put(inflightKey(game.id), '').catch(() => undefined);
      runtime.deactivate(id);
      log('minigame.finish', { instanceId: id, status: view.status });
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    session,
    async close() {
      if (closed) {
        await saving;
        return;
      }
      closed = true;
      await busy?.catch(() => undefined);
      await saving;
      runtime.deactivate(id);
      log('minigame.sessionClosed', { instanceId: id, revision });
      emit();
    },
  };
}
