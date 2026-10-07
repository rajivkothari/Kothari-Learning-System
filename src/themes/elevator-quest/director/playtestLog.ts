// Developer-only playtest log. Local memory only: no analytics SDK, no network, nothing
// leaves the device unless an adult copies or shares the text report.
import type { LearnerState, OpportunityUpgrade } from '../../../engine';

export interface LogEntry {
  t: number;
  kind: string;
  data: Record<string, unknown>;
}

export interface PlaytestLog {
  record(t: number, kind: string, data?: Record<string, unknown>): void;
  entries(): readonly LogEntry[];
  /** Per-tap timing samples recorded by the UI (milliseconds). */
  timing(name: 'touchToHandler' | 'handlerToSoundRequest' | 'evaluation' | 'commit', ms: number): void;
  timings(): Record<string, number[]>;
  clear(): void;
}

export function createPlaytestLog(limit = 5000): PlaytestLog {
  let list: LogEntry[] = [];
  let samples: Record<string, number[]> = {};
  return {
    record(t, kind, data = {}) {
      list.push({ t, kind, data });
      if (list.length > limit) list = list.slice(-limit);
    },
    entries: () => list,
    timing(name, ms) {
      (samples[name] ??= []).push(ms);
      if (samples[name]!.length > 500) samples[name] = samples[name]!.slice(-500);
    },
    timings: () => samples,
    clear() {
      list = [];
      samples = {};
    },
  };
}

export interface ReportContext {
  device: Record<string, string | number | boolean | null>;
  skillsBefore: LearnerState | null;
  skillsNow: LearnerState | null;
  progression: readonly OpportunityUpgrade[];
  unlocks: readonly string[];
}

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const fmt = (n: number | null) => (n === null ? 'n/a' : n < 10 ? n.toFixed(2) : n.toFixed(0));

function skillLines(state: LearnerState | null): string[] {
  if (!state) return ['  (not captured)'];
  return Object.values(state.skills).map(
    (s) => `  ${s.skillId}: ${s.level} (peak ${s.peakLevel}), accuracy ${s.dimensions.accuracy.successes}/${s.dimensions.accuracy.scored}, independence ${s.dimensions.independence.rate.toFixed(2)}`,
  );
}

/** Plain-text report an adult can copy or share. */
export function buildReport(log: PlaytestLog, ctx: ReportContext): string {
  const e = log.entries();
  const of = (kind: string) => e.filter((x) => x.kind === kind);
  const first = e[0]?.t ?? 0;
  const last = e.at(-1)?.t ?? first;
  const rel = (t: number) => `${((t - first) / 1000).toFixed(1)}s`;

  const tasks = of('task');
  const done = of('task.done');
  const answers = of('answer');
  const wrong = answers.filter((a) => a.data.correct === false);
  const lines: string[] = [];
  lines.push('ELEVATOR QUEST PLAYTEST REPORT (developer only, local)');
  lines.push(`Duration: ${((last - first) / 1000).toFixed(0)}s, ${e.length} log entries`);
  lines.push('');
  lines.push('Device / render:');
  for (const [k, v] of Object.entries(ctx.device)) lines.push(`  ${k}: ${String(v)}`);
  lines.push('');
  lines.push('Steps:');
  for (const t of tasks) {
    const finished = done.find((d) => d.t >= t.t && d.data.stepId === t.data.stepId);
    lines.push(`  ${rel(t.t)} ${String(t.data.stepId)} [${String(t.data.kind)}] ${JSON.stringify({ ...t.data, stepId: undefined, kind: undefined })}${finished ? ` done in ${((Number(finished.data.ms) || 0) / 1000).toFixed(1)}s` : ''}`);
  }
  lines.push('');
  lines.push(`Answers: ${answers.length}, wrong: ${wrong.length}`);
  for (const a of answers) lines.push(`  ${rel(a.t)} value ${String(a.data.value)} -> ${a.data.correct === true ? 'correct' : a.data.correct === false ? 'wrong' : 'unchecked'}${a.data.misconception ? ` (${String(a.data.misconception)})` : ''}${a.data.changedPlan ? ' after a change of plan' : ''}`);
  lines.push(`Selected floors: ${of('panel.press').map((p) => `${String(p.data.floor)}${p.data.accepted ? '' : '(x)'}`).join(' ') || 'none'}`);
  lines.push(`Wrong-floor rides: ${wrong.filter((w) => typeof w.data.value === 'number').map((w) => String(w.data.value)).join(', ') || 'none'}`);
  lines.push(`Help used: ${of('help').map((h) => `${String(h.data.kind)} (${String(h.data.assistance)})`).join(', ') || 'none'}`);
  // Corrections (D149): after a miss, the learner counted their own job through, then got a fresh one.
  const followUps = of('correction.followUp');
  lines.push(`Corrections: ${of('correction.start').length} started, ${of('correction.complete').length} counted through`);
  lines.push(`  next job after a correction: ${followUps.map((f) => `${String(f.data.stepId)} ${f.data.correct === true ? (f.data.helpUsed ? 'right, with help' : 'right first try, no help') : 'missed again'}`).join('; ') || 'none yet'}`);
  lines.push(`Misconceptions: ${wrong.map((w) => w.data.misconception).filter(Boolean).join(', ') || 'none'}`);
  lines.push(`Door presses: ${of('door.press').length}, cargo moves: ${of('cargo.load').length + of('cargo.unload').length}`);
  lines.push(`Restarts / resumes: ${of('mission.activate').length - 1 + of('app.resume').length}`);
  lines.push(`Rides: ${of('elevator.depart').length} (${of('elevator.depart').filter((d) => d.data.kind === 'answer').length} answers)`);
  lines.push(`Audio cues: ${of('audio').reduce((n, a) => n + (Number(a.data.count) || 0), 0)}`);
  lines.push('');
  lines.push('Timing (JS-side, ms; touch-to-visible press is UI-thread and measured in the Device Lab):');
  for (const [name, xs] of Object.entries(log.timings())) lines.push(`  ${name}: n=${xs.length} p50=${fmt(pct(xs, 0.5))} p90=${fmt(pct(xs, 0.9))} max=${fmt(xs.length ? Math.max(...xs) : null)}`);
  const commits = of('commit').map((c) => Number(c.data.ms)).filter((n) => Number.isFinite(n));
  lines.push(`  durable commit (director view): n=${commits.length} p50=${fmt(pct(commits, 0.5))} p90=${fmt(pct(commits, 0.9))}`);
  lines.push('');
  lines.push('Skill evidence before:');
  lines.push(...skillLines(ctx.skillsBefore));
  lines.push('Skill evidence now:');
  lines.push(...skillLines(ctx.skillsNow));
  lines.push('');
  lines.push(`Progression events: ${ctx.progression.map((p) => `${p.key}->${p.toTier}`).join(', ') || 'none'}`);
  lines.push(`Unlocks: ${ctx.unlocks.join(', ') || 'none'}`);
  lines.push('');
  lines.push('Event log:');
  for (const x of e) lines.push(`  ${rel(x.t)} ${x.kind} ${JSON.stringify(x.data)}`);
  return lines.join('\n');
}
