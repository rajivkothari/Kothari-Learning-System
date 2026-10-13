// Test helpers for Word Golf: a player that finds a good putt, and a mock session with three words.
// Tests only (headless controller tests, screen tests). Never imported by the game.
import { createMockSession, type MockSession } from '../testing/mockSession';
import type { PuttGreen } from './fairway';
import { angleTo, simulateShot, type Vec } from './physics';

const deg = Math.PI / 180;
const POWERS = [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];

/** A putt that drops from `ball` (putting units), else one that leaves a putt that drops. */
export function goodPutt(g: PuttGreen, ball: Vec): { angle: number; power: number } {
  const at = angleTo(ball, g.cup);
  for (const power of POWERS) if (simulateShot(g, ball, { angle: at, power }).outcome === 'cup') return { angle: at, power };
  for (let a = -180; a < 180; a += 2)
    for (const power of POWERS) {
      const shot = { angle: a * deg, power };
      const r = simulateShot(g, ball, shot);
      if (r.outcome === 'cup') return shot;
      if (r.outcome === 'rest' && POWERS.some((p) => simulateShot(g, r.rest, { angle: angleTo(r.rest, g.cup), power: p }).outcome === 'cup')) return shot;
    }
  return { angle: at, power: 0.5 };
}

export const TEST_WORDS = [
  { wordId: 'w-gear', word: 'gear', tiles: 'rgeasb', pattern: 'ea', patternAt: 1, syllables: 1, miss: 'gaer' },
  { wordId: 'w-bolt', word: 'bolt', tiles: 'tlobmk', pattern: 'lt', patternAt: 2, syllables: 1, miss: 'blot' },
  { wordId: 'w-cable', word: 'cable', tiles: 'elbacdo', pattern: 'le', patternAt: 3, syllables: 2, miss: 'calbe' },
] as const;

/** A scripted session for a hole (default hole 1, the `word-golf` mission): the test words in order, one per turn. */
export function wordGolfMock(opts: { missionId?: string; words?: number; completedMissions?: readonly string[]; latencyMs?: number; resumed?: { state: unknown; answered?: number; held?: boolean }; freshAfter?: number } = {}): MockSession {
  return createMockSession({
    gameId: 'word-golf',
    missionId: opts.missionId ?? 'word-golf',
    ...(opts.completedMissions ? { completedMissions: opts.completedMissions } : {}),
    items: TEST_WORDS.slice(0, opts.words ?? TEST_WORDS.length).map((w) => ({
      concept: 'spelling',
      activityId: 'spelling.test',
      prompt: { wordId: w.wordId, length: w.word.length, tiles: w.tiles, pattern: w.pattern, patternAt: w.patternAt, syllables: w.syllables },
      answer: w.word,
      misconceptions: [{ value: w.miss, tag: 'spelling.letterOrder' }],
    })),
    ...(opts.latencyMs !== undefined ? { latencyMs: opts.latencyMs } : {}),
    ...(opts.resumed ? { resumed: opts.resumed } : {}),
    ...(opts.freshAfter !== undefined ? { freshAfter: opts.freshAfter } : {}),
  });
}

/** The tile ids that spell `word` on a tray of `tiles` (first free tile per letter). */
export function tilesFor(tiles: string, word: string): number[] {
  const used = new Set<number>();
  return [...word].map((ch) => {
    const id = [...tiles].findIndex((t, i) => t === ch && !used.has(i));
    used.add(id);
    return id;
  });
}
