// Cargo Commander's words: the brief, Lifty's line (cues, hints) and the labels. Pure: no React.
//
// The words live in content JSON (content/themes/elevator-quest/minigames/cargo.json, EC; loaded and
// validated by content/minigames.ts, which also checks that a line never gives the answer). Lines are filled from the givens only; the one exception is SHOW ME, whose
// line names the load it put in. Numbers and a few content words (TOTAL, REMAINING, MORE, ...) are
// marked: weight and an underline as well as the warm accent, never colour alone (M8.1).
import { CARGO, cargoBrief, type CargoScreenCopy } from '../../content/minigames';
import type { Mark } from '../../ui/emphasis';
import type { CargoFlowView, CargoHint, CargoNotice } from './cargoFlow';
import { isFillerKind, type CargoMission } from './mission';

/** The screen's words (EC's content/themes/elevator-quest/minigames/cargo.json, validated by its loader). */
export type CargoCopy = CargoScreenCopy;
export const CARGO_COPY: CargoCopy = CARGO.copy;

/** Fill `{name}` placeholders. A placeholder with no value stays visible (tests catch it). */
export const fillLine = (template: string, vars: Readonly<Record<string, string | number>>) => template.replace(/\{([a-zA-Z]+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Numbers and the copy's emphasis words, as ranges to mark. */
export function cargoMarks(text: string, words: readonly string[]): Mark[] {
  const alternatives = ['\\d+', ...words.map((w) => w.replace(/[^A-Z]/g, ''))].filter(Boolean).join('|');
  return [...text.matchAll(new RegExp(`\\b(${alternatives})\\b`, 'g'))].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
}

/** The delivery's brief: EC's cargoBrief for the item's prompt (the same words the content checks), else filled from the givens. */
export function briefFor(copy: CargoCopy, mission: CargoMission): string {
  if (copy === CARGO_COPY) {
    const b = cargoBrief(mission.prompt);
    if (b) return b.text;
  }
  return fillLine(copy.briefs[mission.kind], mission.givens);
}

const tensOnes = (n: number) => ({ n, tens: Math.floor(n / 10), tensValue: Math.floor(n / 10) * 10, ones: n % 10 });

/** The numbers a tens-and-ones hint splits: the givens the learner works with. */
function hintNumbers(mission: CargoMission): number[] {
  switch (mission.kind) {
    case 'exactLoad':
      return mission.crates.map((c) => c.weight);
    case 'twoDeliveries':
      return [mission.givens.a!, mission.givens.b!];
    case 'twoStep':
      return [mission.givens.capacity!, mission.givens.a!, mission.givens.b!];
    case 'compare':
      return [mission.givens.heavy!, mission.givens.light!];
    default:
      return [mission.goal, mission.base];
  }
}

/** The words for a help step (by the activity's help kind). Only SHOW ME names the answer. */
export function hintLine(copy: CargoCopy, mission: CargoMission, hint: CargoHint): string {
  if (hint.revealed !== null) {
    if (!isFillerKind(mission.kind)) return fillLine(copy.hints.showCrates, { answer: hint.revealed });
    return fillLine(copy.hints.showFiller, { tens: Math.floor(hint.revealed / 10), ones: hint.revealed % 10, answer: hint.revealed });
  }
  if (hint.kind === 'jumpStrategy') {
    if (mission.kind === 'exactLoad') return fillLine(copy.hints.jumpCrates, { target: mission.goal });
    if (mission.kind === 'twoDeliveries') {
      const [a, b] = [mission.givens.a!, mission.givens.b!];
      return fillLine(copy.hints.jumpAdd, { a, tens: Math.floor(b / 10), ones: b % 10 });
    }
    // Count up from what is on the scale to where it must come: to the next ten, then tens and ones.
    const from = mission.base;
    const nextTen = Math.min(mission.goal, Math.ceil((from + 1) / 10) * 10);
    return fillLine(copy.hints.jumpUp, { from, nextTen, to: mission.goal });
  }
  // tensAndOnes, and any help kind this screen has no special words for.
  const each = hintNumbers(mission).map((n) => fillLine(copy.hints.tensAndOnesEach, tensOnes(n)));
  return [copy.hints.tensAndOnes, ...each].join(' ');
}

const noticeCue = (copy: CargoCopy, n: CargoNotice) => (n === 'resume' ? copy.cues.resume : n === 'fresh' ? copy.cues.fresh : n === 'trouble' ? copy.cues.trouble : null);

/** Lifty's line for the moment: what just happened, then the help given, else what to do. */
export function cueLine(copy: CargoCopy, view: CargoFlowView): string {
  if (view.status === 'done') return copy.cues.allDone;
  if (view.status === 'unsupported') return copy.cues.unsupported;
  const { mission, cargo } = view;
  if (!mission || !cargo) return '';
  if (cargo.phase === 'shipping') return copy.cues.right;
  if (cargo.phase === 'shipped') return view.last ? copy.cues.allDone : copy.cues.delivered;
  if (cargo.phase === 'weighing') return copy.cues.weighing;
  const r = cargo.readout?.result;
  const after = r === 'heavy' ? copy.cues.tooHeavy : r === 'light' ? copy.cues.notEnough : r === 'notRight' ? copy.cues.notRight : null;
  const hint = view.hint ? hintLine(copy, mission, view.hint) : null;
  // A reading and the hint already given both stay: the direction first, then the help.
  if (after) return hint && view.hint?.revealed === null ? `${after} ${hint}` : after;
  if (hint) return hint;
  return noticeCue(copy, view.notice) ?? copy.cues.start;
}

/** The longest line Lifty may need for a delivery (the layout sizes his box once for it). */
export function longestCue(copy: CargoCopy, mission: CargoMission | null): number {
  const base = Math.max(...Object.values(copy.cues).map((c) => c.length));
  if (!mission) return base;
  const hints = (['tensAndOnes', 'jumpStrategy'] as const).map((kind) => hintLine(copy, mission, { kind, assistance: 'clue', revealed: null }).length);
  const show = hintLine(copy, mission, { kind: 'showAnswer', assistance: 'demonstrated', revealed: isFillerKind(mission.kind) ? 99 : mission.goal }).length;
  return Math.max(base, show, ...hints.map((h) => h + copy.cues.notEnough.length + 1));
}

/** What the screen reader hears for the tens and the ones in the freight (counts are what is seen, never a total). */
export const a11yLoad = (copy: CargoCopy, load: { sacks: number; boxes: number }) => ({
  sacks: load.sacks > 0 ? fillLine(copy.a11y.sacksAboard, { count: load.sacks }) : copy.a11y.noSacks,
  boxes: load.boxes > 0 ? fillLine(copy.a11y.boxesAboard, { count: load.boxes }) : copy.a11y.noBoxes,
});
