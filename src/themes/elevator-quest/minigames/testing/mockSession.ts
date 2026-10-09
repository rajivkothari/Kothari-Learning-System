// A scripted MiniGameSession for building and testing a game's screen before (or without) the
// engine content: the same contract and the same rules as the real session (session.ts), held in
// memory. Pure TypeScript: usable in Jest (theme and app projects) and in the browser dev build.
//
//   const s = createMockSession({ gameId: 'word-golf', items: [{ concept: 'spelling', prompt: { wordId: 'w.cat', length: 3, tiles: 'catmo' }, answer: 'cat' }] });
//   s.check({ mode: 'value', value: 'CAT' })  -> { correct: true, misconception: null }   (text: case-insensitive)
//   await s.submit({ mode: 'value', value: 'cat' })  -> { status: 'answered', correct: true, evidence: 'independent', ... }
//   await s.next()  -> the next item, or null when done
//   s.calls / s.recorded: what the game asked for, and what the real runtime would have recorded.
//
// Never used by a production build: the host only ever builds the real session.
import { recordedAssistance, type AnswerSpec, type AnswerValue, type AssistanceLevel, type Response } from '../../../../engine';
import type { ChallengeView, Evidence, HelpOffer, HelpView, MiniGameCheck, MiniGameId, MiniGameProgress, MiniGameSession, SubmitResult } from '../types';

export interface MockItem {
  concept: string;
  /** The right answer. Text compares case-insensitively; a number exactly. Mock only: the real view never carries it. */
  answer: AnswerValue;
  prompt?: ChallengeView['prompt'];
  activityId?: string;
  stepId?: string;
  /** Default: text for a string answer ({ mode: 'text', maxLength: 12 }), a value in 0..999 for a number. */
  answerSpec?: AnswerSpec;
  options?: { id: string; value: AnswerValue }[];
  /** A wrong answer that carries a misconception tag. */
  misconceptions?: { value: AnswerValue; tag: string }[];
}

export interface MockOptions {
  gameId: MiniGameId;
  items: MockItem[];
  /** The help ladder on every item (default: the spelling ladder of the M9 handoff). */
  ladder?: { stepId: string; kind: string; assistance: AssistanceLevel }[];
  /** After this many misses an item is replaced with a fresh one (default 3, like the engine's regenerate). The mock reuses the item with a new key. */
  freshAfter?: number;
  /** Narrative steps: a story beat before item `at` (0 = before the first). */
  story?: { at: number; eventKey: string }[];
  /** Commit latency in ms (default 0: resolves on the next microtask). */
  latencyMs?: number;
  /**
   * Start as a resumed instance with this saved state. `answered`: items answered right in earlier
   * visits (it starts at the next one). `held`: the last of those is a right answer the session still
   * holds (phase "solved"), as the real session reads back an answer committed just before the app
   * closed, or one the game left before calling next(). progress().solved still starts at 0, like
   * the real session's (it counts this visit only).
   */
  resumed?: { state: unknown; answered?: number; held?: boolean };
  learnerId?: string;
  instanceId?: string;
}

export interface MockCall {
  method: 'challenge' | 'check' | 'submit' | 'help' | 'next' | 'saveGame' | 'loadGame' | 'finish';
  args: unknown[];
}

export interface MockSession extends MiniGameSession {
  /** Every call the game made, in order (challenge and progress reads are not logged). */
  readonly calls: readonly MockCall[];
  /** What the real runtime would have recorded as learning evidence: one row per resolved item. */
  readonly recorded: readonly { key: string; correct: boolean; evidence: Evidence }[];
  /** The state the last saveGame stored. */
  readonly saved: unknown;
  /** True once finish() ran. */
  readonly finished: boolean;
}

const DEFAULT_LADDER: NonNullable<MockOptions['ladder']> = [
  { stepId: 'replay', kind: 'replayClue', assistance: 'clue' },
  { stepId: 'phonics', kind: 'phonicsHint', assistance: 'verbalHint' },
  { stepId: 'reveal', kind: 'revealLetter', assistance: 'guided' },
  { stepId: 'show', kind: 'showAnswer', assistance: 'demonstrated' },
];

const same = (a: AnswerValue, b: AnswerValue) => (typeof a === 'string' || typeof b === 'string' ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : a === b);

export function createMockSession(opts: MockOptions): MockSession {
  const ladder = opts.ladder ?? DEFAULT_LADDER;
  const freshAfter = opts.freshAfter ?? 3;
  const calls: MockCall[] = [];
  const recorded: { key: string; correct: boolean; evidence: Evidence }[] = [];
  const listeners = new Set<() => void>();
  const stories = [...(opts.story ?? [])].sort((a, b) => a.at - b.at);
  let index = 0;
  let generation = 0;
  let wrongTries = 0;
  let shown: { stepId: string; kind: string; assistance: AssistanceLevel }[] = [];
  let solved = 0;
  let phase: MiniGameProgress['phase'] = 'challenge';
  let storyAt: { stepId: string; eventKey: string } | null = null;
  let busy = false;
  let closed = false;
  let finished = false;
  let saved: unknown = opts.resumed?.state ?? null;
  let lastRight: { value: AnswerValue; evidence: Evidence } | null = null;

  const emit = () => {
    for (const l of listeners) l();
  };
  const wait = () => new Promise<void>((r) => (opts.latencyMs ? setTimeout(r, opts.latencyMs) : r()));
  const storyBefore = (at: number) => stories.find((s) => s.at === at) ?? null;

  const enterItem = (at: number) => {
    index = at;
    wrongTries = 0;
    shown = [];
    if (index >= opts.items.length) {
      phase = 'done';
      return;
    }
    const s = storyBefore(index);
    if (s && storyAt?.eventKey !== s.eventKey) {
      storyAt = { stepId: `story-${index}`, eventKey: s.eventKey };
      phase = 'story';
      return;
    }
    phase = 'challenge';
  };
  // A resumed game picks up at the item after the ones already answered (or holds the last of them).
  const answered = Math.min(opts.resumed?.answered ?? 0, opts.items.length);
  if (opts.resumed?.held && answered > 0) {
    enterItem(answered - 1);
    phase = 'solved';
    lastRight = { value: opts.items[answered - 1]!.answer, evidence: 'independent' };
  } else enterItem(answered);

  const specOf = (item: MockItem): AnswerSpec =>
    item.answerSpec ?? (item.options ? { mode: 'choice' } : typeof item.answer === 'number' ? { mode: 'value', min: 0, max: 999 } : ({ mode: 'text', maxLength: 12 } as unknown as AnswerSpec));
  const offer = (): HelpOffer | null => {
    const step = ladder[shown.length];
    return step ? { stepId: step.stepId, kind: step.kind, assistance: step.assistance, offered: wrongTries > 0 } : null;
  };
  const current = (): ChallengeView | null => {
    if (phase !== 'challenge') return null;
    const item = opts.items[index]!;
    const demonstrated = shown.some((s) => s.assistance === 'demonstrated');
    return {
      key: `mock:${opts.gameId}:${index}:gen${generation}`,
      stepId: item.stepId ?? `item-${index}`,
      activityId: item.activityId ?? `mock.${item.concept}`,
      concept: item.concept,
      challenge: 'practice',
      prompt: item.prompt ?? {},
      answer: specOf(item),
      options: item.options ?? [],
      item: { index: 0, count: 1 },
      wrongTries,
      help: offer(),
      helpShown: [...shown],
      revealed: demonstrated ? item.answer : null,
    };
  };
  const valueOf = (item: MockItem, r: Response): AnswerValue | null => {
    if (r.mode === 'choice') return item.options?.find((o) => o.id === r.optionId)?.value ?? null;
    return r.value;
  };
  const evaluate = (r: Response): MiniGameCheck | null => {
    if (phase !== 'challenge') return null;
    const item = opts.items[index]!;
    const spec = specOf(item) as { mode: string };
    if ((spec.mode === 'choice') !== (r.mode === 'choice')) return null;
    const v = valueOf(item, r);
    if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
    const correct = same(v, item.answer);
    return { correct, misconception: correct ? null : (item.misconceptions?.find((m) => same(m.value, v))?.tag ?? null) };
  };

  const session: MockSession = {
    gameId: opts.gameId,
    learnerId: opts.learnerId ?? 'learner-mock',
    instanceId: opts.instanceId ?? `${opts.gameId}-mock`,
    resumed: Boolean(opts.resumed),
    get calls() {
      return calls;
    },
    get recorded() {
      return recorded;
    },
    get saved() {
      return saved;
    },
    get finished() {
      return finished;
    },
    challenge: () => current(),
    story: () => (phase === 'story' ? storyAt : null),
    solvedAnswer: () => (phase === 'solved' ? lastRight : null),
    check(response) {
      calls.push({ method: 'check', args: [response] });
      return evaluate(response);
    },
    async submit(response): Promise<SubmitResult> {
      calls.push({ method: 'submit', args: [response] });
      if (closed) return { status: 'refused', reason: 'closed' };
      if (busy) return { status: 'refused', reason: 'busy' };
      if (phase !== 'challenge') return { status: 'refused', reason: 'noChallenge' };
      const result = evaluate(response);
      if (!result) return { status: 'refused', reason: 'invalid' };
      const key = current()!.key;
      busy = true;
      await wait();
      busy = false;
      if (result.correct) {
        const evidence = recordedAssistance({ wrongTries, helpReceived: shown.map((s) => s.assistance) });
        recorded.push({ key, correct: true, evidence });
        lastRight = { value: valueOf(opts.items[index]!, response)!, evidence };
        solved += 1;
        // Like the real session: the right answer waits for next(), also the last one (then "done").
        const done = index + 1 >= opts.items.length;
        phase = 'solved';
        emit();
        return { status: 'answered', correct: true, evidence, misconception: null, fresh: false, done };
      }
      wrongTries += 1;
      let fresh = false;
      if (wrongTries >= freshAfter) {
        recorded.push({ key, correct: false, evidence: 'incorrect' });
        generation += 1;
        wrongTries = 0;
        shown = [];
        fresh = true;
      }
      emit();
      return { status: 'answered', correct: false, evidence: 'incorrect', misconception: result.misconception, fresh, done: false };
    },
    async help(): Promise<HelpView | null> {
      calls.push({ method: 'help', args: [] });
      if (closed || busy || phase !== 'challenge') return null;
      const step = ladder[shown.length];
      if (!step) return null;
      busy = true;
      await wait();
      busy = false;
      shown = [...shown, step];
      emit();
      return { stepId: step.stepId, kind: step.kind, assistance: step.assistance, revealed: step.assistance === 'demonstrated' ? opts.items[index]!.answer : null, next: offer() };
    },
    async next() {
      calls.push({ method: 'next', args: [] });
      if (closed || busy) return null;
      if (phase === 'solved') {
        lastRight = null;
        enterItem(index + 1);
      }
      else if (phase === 'story') phase = 'challenge';
      else return current();
      emit();
      return current();
    },
    progress: () => {
      // Like the real session (one item per step here): a right answer moves the step on at once, also
      // while it is held; the mission is complete after the last one, and its step reads { 0, 0 } then.
      const complete = phase === 'done' || (phase === 'solved' && index + 1 >= opts.items.length);
      const count = opts.items.length;
      const step = complete ? { index: 0, count: 0 } : { index: phase === 'solved' ? index + 1 : Math.min(index, count - 1), count };
      return { phase, step, item: !complete && (phase === 'challenge' || phase === 'solved') ? { index: 0, count: 1 } : null, solved, complete, done: phase === 'done' };
    },
    async saveGame(state) {
      calls.push({ method: 'saveGame', args: [state] });
      if (closed) return;
      const text = JSON.stringify(state ?? null);
      if (text.length > 32_768) throw new Error('A mini-game save is at most 32 KB');
      saved = JSON.parse(text) as unknown;
    },
    async loadGame() {
      calls.push({ method: 'loadGame', args: [] });
      return saved === null ? null : (JSON.parse(JSON.stringify(saved)) as unknown);
    },
    async finish() {
      calls.push({ method: 'finish', args: [] });
      finished = true;
      closed = true;
      saved = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return session;
}
