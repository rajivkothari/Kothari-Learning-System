// DEVELOPER TOOLING ONLY. Scripted sessions for looking at a game's screen in the browser before
// (or without) its content: the dev scenarios `minigame-word-golf-mock` and `minigame-cargo-mock`
// open the game with one of these instead of the runtime's session. Nothing here is ever recorded.
// The prompt fields follow EC's generators (literacy.spelling@1, quantity.twoDigit@1); the word ids
// are the spelling pack's own (w01 cab, w12 ship, w32 cable), so their clues and narration are real.
import { createMockSession, type MockSession } from './mockSession';

export function wordGolfMock(): MockSession {
  return createMockSession({
    gameId: 'word-golf',
    items: [
      { concept: 'spelling', activityId: 'spelling.short-vowels', prompt: { wordId: 'w01', length: 3, tiles: 'bcatm', pattern: 'a', syllables: 1 }, answer: 'cab' },
      { concept: 'spelling', activityId: 'spelling.digraphs', prompt: { wordId: 'w12', length: 4, tiles: 'shepil', pattern: 'sh', syllables: 1 }, answer: 'ship' },
      { concept: 'spelling', activityId: 'spelling.two-syllable', prompt: { wordId: 'w32', length: 5, tiles: 'lcabeot', pattern: 'le', syllables: 2 }, answer: 'cable' },
    ],
    ladder: [
      { stepId: 'phonics', kind: 'phonicsHint', assistance: 'verbalHint' },
      { stepId: 'pattern', kind: 'revealPattern', assistance: 'guided' },
      { stepId: 'show', kind: 'showAnswer', assistance: 'demonstrated' },
    ],
    latencyMs: 60,
  });
}

export function cargoMock(): MockSession {
  return createMockSession({
    gameId: 'cargo-commander',
    items: [
      { concept: 'twoDigit', activityId: 'cargo.deliveries.approachable', prompt: { kind: 'twoDeliveries', a: 24, b: 31 }, answer: 55, answerSpec: { mode: 'value', min: 1, max: 169 } },
      { concept: 'twoDigit', activityId: 'cargo.room-left.solid', prompt: { kind: 'capacityRemaining', capacity: 90, loaded: 47 }, answer: 43, answerSpec: { mode: 'value', min: 1, max: 169 } },
      { concept: 'twoDigit', activityId: 'cargo.exact.approachable', prompt: { kind: 'exactLoad', target: 57, parts: '23,34,41' }, answer: 57, answerSpec: { mode: 'value', min: 1, max: 299 } },
    ],
    ladder: [
      { stepId: 'tens', kind: 'tensAndOnes', assistance: 'visualSupport' },
      { stepId: 'jump', kind: 'jumpStrategy', assistance: 'guided' },
      { stepId: 'show', kind: 'showAnswer', assistance: 'demonstrated' },
    ],
    latencyMs: 60,
  });
}
