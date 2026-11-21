// Elevator Quest's voice script: every spoken line, who says it, the exact words, how to perform it,
// and the moment it plays. The words live in content/themes/elevator-quest/voice.json; this module is
// its schema, its validator, and the lookups the director uses. Pure: no React, no Expo, no audio.
//
// Three voices that live in the tower (docs/ELEVATOR_QUEST_VOICE.md):
//   elevator  the lift's own announcer: arrivals, direction, doors, overload, hall calls
//   lifty     the maintenance robot, at story beats only
//   crew      the repair crew over the radio, at story beats and hall calls
//
// How the words reach the screen (`onScreen`), so speech is never the only carrier:
//   copy     the line IS an existing copy line (floor15.json `lines.<copy>`); the text shows it anyway,
//            and the spoken words are exactly the copy's (the validator checks it)
//   caption  new words: shown as a caption beside Lifty's line while the clip plays (no clip, no caption)
//   world    the announcer: the information is already in the world (the landing sign, the doors, the
//            lit button, the load meter). Elevator lines only.
//
// Each line is said by its key, `voice.<id>`, the narrationKey of its recording in the audio manifest.
// A key without a recording is silent and the game is exactly as it was without it.
import { z } from 'zod';

import coreMissions from '../../../../content/missions/core.json';
import voiceJson from '../../../../content/themes/elevator-quest/voice.json';
import { protectedNames } from '../../content/ipGuard';
import { COPY, LINES, line as copyLine } from './floor15';
import { BASEMENT, LANDINGS, type LandingCatalog } from './landings';

export const VOICE_ROLES = ['elevator', 'lifty', 'crew'] as const;
export type VoiceRole = (typeof VOICE_ROLES)[number];

/** When a line plays. Each moment belongs to one or more roles (MOMENT_ROLES). */
export const VOICE_MOMENTS = [
  // The Elevator
  'arrival',
  'departUp',
  'departDown',
  'express',
  'doorsOpening',
  'doorsClosing',
  'overload',
  'hallCall',
  // Story beats (Lifty and the crew)
  'coldOpen',
  'intro',
  'wake',
  'hallCallRadio',
  'crewBeat',
  'crewBeatReply',
  'finale',
  'restored',
  'rank',
  'rankAgain',
  'freeRideReturn',
  'basementAside',
] as const;
export type VoiceMoment = (typeof VOICE_MOMENTS)[number];

const MOMENT_ROLES: Record<VoiceMoment, readonly VoiceRole[]> = {
  arrival: ['elevator'],
  departUp: ['elevator'],
  departDown: ['elevator'],
  express: ['elevator'],
  doorsOpening: ['elevator'],
  doorsClosing: ['elevator'],
  overload: ['elevator'],
  hallCall: ['elevator'],
  coldOpen: ['crew'],
  intro: ['lifty'],
  wake: ['lifty'],
  hallCallRadio: ['crew'],
  crewBeat: ['crew'],
  crewBeatReply: ['lifty'],
  finale: ['crew', 'lifty'],
  restored: ['crew', 'lifty'],
  rank: ['lifty'],
  rankAgain: ['lifty'],
  freeRideReturn: ['lifty'],
  basementAside: ['lifty'],
};

/** Moments the director plays one line for, per role: the script must have exactly one. */
const SINGLE: readonly [VoiceRole, VoiceMoment][] = [
  ['elevator', 'departUp'],
  ['elevator', 'departDown'],
  ['elevator', 'express'],
  ['elevator', 'doorsOpening'],
  ['elevator', 'doorsClosing'],
  ['elevator', 'overload'],
  ['elevator', 'hallCall'],
  ['crew', 'coldOpen'],
  ['lifty', 'intro'],
  ['lifty', 'wake'],
  ['crew', 'finale'],
  ['lifty', 'finale'],
  ['lifty', 'restored'],
  ['crew', 'restored'],
  ['lifty', 'rank'],
  ['lifty', 'rankAgain'],
  ['lifty', 'freeRideReturn'],
  ['lifty', 'basementAside'],
];

/**
 * Lifty's own lines: at each of these moments the director shows one fixed copy line (floor15.json
 * `lines.<key>`) and says the script's line with it as Lifty's own voice, with no caption. So the
 * script's line there must be that very copy line (onScreen "copy", this key), or the voice would say
 * words the screen does not show. director/voice.test.ts checks the director against the script.
 */
export const LIFTY_COPY: Partial<Record<VoiceMoment, string>> = {
  intro: 'intro',
  wake: 'introDone',
  finale: 'finale',
  restored: 'complete',
  rank: 'rankEarned',
  rankAgain: 'completeAgain',
  freeRideReturn: 'freeRide',
  basementAside: 'basementLater',
};

/** Short enough to finish before play moves on: the announcer in a breath, a story line in about eight seconds. */
export const MAX_CHARS: Record<VoiceRole, number> = { elevator: 40, lifty: 120, crew: 120 };
export const MAX_WORDS: Record<VoiceRole, number> = { elevator: 6, lifty: 22, crew: 22 };

/** Praise that names nothing (docs/GAME_DESIGN.md bans it): never in a new line. */
const GENERIC_PRAISE = /\b(great|good|nice) (job|work)\b|\bwell done\b|\bawesome\b|\bamazing\b|\bsuper(star)?\b|\byou('re| are) (so )?(smart|clever|a genius)\b|\bgood (boy|girl)\b/i;

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'] as const;

/** A floor number as the announcer says it (1 to 20). */
export const floorWord = (n: number): string | null => NUMBER_WORDS[n - 1] ?? null;
/** A place name as spoken: the sign's capitals in title case ("PRIMARY POWER" -> "Primary Power"). */
export const spokenName = (name: string) => name.split(/\s+/).map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
/** The arrival announcement for a numbered floor or B1, from the name the game shows. */
export function announcement(place: number | typeof BASEMENT, name: string): string {
  return place === BASEMENT ? `Basement one. ${spokenName(name)}.` : `Floor ${floorWord(place) ?? String(place)}. ${spokenName(name)}.`;
}

const Id = z.string().regex(/^(elevator|lifty|crew)\.[a-z][A-Za-z0-9]*$/);

const VoiceLineSchema = z
  .object({
    id: Id,
    role: z.enum(VOICE_ROLES),
    moment: z.enum(VOICE_MOMENTS),
    /** The exact words the actor says. */
    text: z.string().min(2).max(160),
    /** For the actor: pace, feeling, where the breath goes. */
    direction: z.string().min(20).max(400),
    /** When it plays, in words, for the recording engineer and the reviewer. */
    when: z.string().min(10).max(300),
    onScreen: z.enum(['copy', 'caption', 'world']),
    /** onScreen "copy": the floor15.json `lines` key whose filled words this line says. */
    copy: z.string().min(1).nullable(),
    /** Arrivals: the floor, or "B1". */
    floor: z.number().int().optional(),
    place: z.literal(BASEMENT).optional(),
    /** Crew beats (and Lifty's reply to one): the mission step whose first job it opens. */
    step: z.string().min(1).optional(),
  })
  .strict();
export type VoiceLine = z.infer<typeof VoiceLineSchema>;

export const VoiceScriptSchema = z
  .object({
    schemaVersion: z.literal(1),
    theme: z.literal('elevator-quest'),
    /** The audio manifest pack the recordings belong to. */
    pack: z.string().regex(/^[a-z0-9-]+$/),
    /** Where the recordings go, for the recording engineer. */
    files: z.string().min(1),
    roles: z.record(z.enum(VOICE_ROLES), z.object({ label: z.string().min(1), direction: z.string().min(20) }).strict()),
    lines: z.array(VoiceLineSchema).min(1),
  })
  .strict();
export type VoiceScript = z.infer<typeof VoiceScriptSchema>;

export interface VoiceIssue {
  code: string;
  path: string;
  message: string;
}

/** The key a line is said by (its recording's narrationKey in the audio manifest). */
export const voiceKey = (id: string) => `voice.${id}`;

export interface VoiceContext {
  landings: LandingCatalog;
  /** A floor15.json line, filled as the game fills it (repairFloor). Null when there is none. */
  copy: (key: string) => string | null;
  /** Mission step ids, in order. */
  steps: readonly string[];
  /**
   * The steps a crew beat can open: those with a job. The director says a beat with the first job of
   * the step it enters; the intro and the finale are story steps with lines of their own, and a beat
   * written for one of them would never be said.
   */
  beatSteps: readonly string[];
}

/**
 * Validate the script: the schema, unique ids, each role's moments, an announcement for every stop
 * that names it exactly as the game does, copy lines that say exactly the copy's words, and new lines
 * that are short, captioned, free of placeholders, generic praise and protected names.
 */
export function validateVoiceScript(raw: unknown, ctx: VoiceContext): { ok: boolean; issues: VoiceIssue[]; script: VoiceScript | null } {
  const parsed = VoiceScriptSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: `schema.${i.code}`, path: i.path.join('.'), message: i.message })), script: null };
  const script = parsed.data;
  const issues: VoiceIssue[] = [];
  const err = (code: string, path: string, message: string) => issues.push({ code, path, message });

  for (const role of VOICE_ROLES) if (!script.roles[role]) err('voice.missingRole', `roles.${role}`, `No direction for the ${role} voice`);

  const seen = new Set<string>();
  script.lines.forEach((l, i) => {
    const at = `lines.${i}(${l.id})`;
    if (seen.has(l.id)) err('voice.duplicateId', at, `"${l.id}" appears twice`);
    seen.add(l.id);
    if (!l.id.startsWith(`${l.role}.`)) err('voice.idRole', at, `The id must start with its role ("${l.role}.")`);
    if (!MOMENT_ROLES[l.moment].includes(l.role)) err('voice.momentRole', at, `The ${l.role} voice does not speak at "${l.moment}"`);
    if (/\{[a-zA-Z]+\}/.test(l.text)) err('voice.placeholder', at, 'Spoken words are fixed: no placeholders');
    if (l.text.length > MAX_CHARS[l.role]) err('voice.tooLong', at, `${l.text.length} characters (the ${l.role} voice keeps to ${MAX_CHARS[l.role]})`);
    if (l.text.split(/\s+/).length > MAX_WORDS[l.role]) err('voice.tooLong', at, `More than ${MAX_WORDS[l.role]} words`);
    const names = protectedNames(`${l.text} ${l.direction} ${l.when}`);
    if (names.length) err('voice.protectedName', at, `Names a protected brand: ${names.join(', ')}`);

    // How the words reach the screen.
    if (l.onScreen === 'copy') {
      if (!l.copy) err('voice.copyMissing', at, 'A copy line names its floor15.json line');
      else {
        const words = ctx.copy(l.copy);
        if (words === null) err('voice.copyUnknown', at, `No copy line "${l.copy}"`);
        else if (words !== l.text) err('voice.copyMismatch', at, `Says "${l.text}" but the screen says "${words}"`);
      }
    } else if (l.copy !== null) err('voice.copyUnexpected', at, 'Only an onScreen "copy" line names a copy line');
    if (l.onScreen === 'world' && l.role !== 'elevator') err('voice.uncaptioned', at, 'Lifty and the crew are never heard without their words on screen: use "copy" or "caption"');
    // The director shows what the script promises only in these ways: nothing for the announcer (the
    // world shows it), a caption for the crew and for a reply to the crew, one fixed copy line for each
    // of Lifty's own moments. Anything else would be heard and not shown, or captioned and never shown.
    if (l.role === 'elevator' && l.onScreen !== 'world') err('voice.announcerWorld', at, 'An announcement is never captioned: the world shows it (onScreen "world")');
    if ((l.role === 'crew' || l.moment === 'crewBeatReply') && l.onScreen === 'copy') err('voice.captionRequired', at, 'The crew, and a reply to the crew, are shown as a caption (onScreen "caption"): no copy line is shown with them');
    const own = l.role === 'lifty' ? LIFTY_COPY[l.moment] : undefined;
    if (own !== undefined && (l.onScreen !== 'copy' || l.copy !== own)) err('voice.copyKey', at, `At "${l.moment}" the screen shows the copy line "${own}": the voice says that line (onScreen "copy", copy "${own}")`);
    if (l.onScreen !== 'copy' && GENERIC_PRAISE.test(l.text)) err('voice.genericPraise', at, 'Praise names what was done');

    // Arrivals and beats.
    if (l.moment === 'arrival') {
      if ((l.floor === undefined) === (l.place === undefined)) err('voice.arrivalPlace', at, 'An arrival names a floor or B1, not both');
    } else if (l.floor !== undefined || l.place !== undefined) err('voice.arrivalPlace', at, 'Only an arrival names a floor');
    const beat = l.moment === 'crewBeat' || l.moment === 'crewBeatReply';
    if (beat && (!l.step || !ctx.beatSteps.includes(l.step))) err('voice.beatStep', at, `A crew beat opens a mission step that has a job (${ctx.beatSteps.join(', ')})`);
    if (!beat && l.step !== undefined) err('voice.beatStep', at, 'Only a crew beat names a step');
  });

  // Every stop announced once, by the name the game shows.
  const arrivals = script.lines.filter((l) => l.moment === 'arrival');
  for (const f of ctx.landings.floors) {
    const mine = arrivals.filter((l) => l.floor === f.floor);
    if (mine.length !== 1) err('voice.arrivalCount', `floor ${f.floor}`, `${mine.length} announcements for Floor ${f.floor} (one is needed)`);
    else if (mine[0]!.text !== announcement(f.floor, f.name)) err('voice.arrivalWords', `floor ${f.floor}`, `"${mine[0]!.text}" should be "${announcement(f.floor, f.name)}"`);
  }
  for (const l of arrivals) if (l.floor !== undefined && !ctx.landings.floors.some((f) => f.floor === l.floor)) err('voice.arrivalPlace', l.id, `No Floor ${l.floor} in the tower`);
  const b1 = arrivals.filter((l) => l.place === BASEMENT);
  if (ctx.landings.basement) {
    if (b1.length !== 1) err('voice.arrivalCount', 'B1', `${b1.length} announcements for B1 (one is needed)`);
    else if (b1[0]!.text !== announcement(BASEMENT, ctx.landings.basement.name)) err('voice.arrivalWords', 'B1', `"${b1[0]!.text}" should be "${announcement(BASEMENT, ctx.landings.basement.name)}"`);
  } else if (b1.length) err('voice.arrivalPlace', 'B1', 'The tower has no B1');

  // What the director plays.
  for (const [role, moment] of SINGLE) {
    const n = script.lines.filter((l) => l.role === role && l.moment === moment).length;
    if (n !== 1) err('voice.momentCount', `${role}.${moment}`, `${n} lines (the director plays exactly one)`);
  }
  if (!script.lines.some((l) => l.moment === 'hallCallRadio')) err('voice.momentCount', 'crew.hallCallRadio', 'No radio line for a hall call');
  const beats = script.lines.filter((l) => l.moment === 'crewBeat').map((l) => l.step);
  if (new Set(beats).size !== beats.length) err('voice.beatStep', 'crewBeat', 'Two crew beats open the same step');
  for (const l of script.lines.filter((x) => x.moment === 'crewBeatReply')) if (!beats.includes(l.step)) err('voice.beatStep', l.id, 'A reply follows a crew beat of the same step');

  return { ok: issues.length === 0, issues, script };
}

/** The mission's story steps (content/missions/core.json `kind: narrative`): the intro and the finale. */
const NARRATIVE_STEPS = new Set(((coreMissions as { missions: { id: string; steps: { kind: string; id: string }[] }[] }).missions.find((m) => m.id === COPY.missionId)?.steps ?? []).filter((x) => x.kind === 'narrative').map((x) => x.id));

/** The game's own context: the landings, the Floor 15 copy and the mission's steps. */
export const VOICE_CONTEXT: VoiceContext = {
  landings: LANDINGS,
  copy: (key) => (COPY.lines[key] === undefined ? null : copyLine(key)),
  steps: COPY.progress.map((p) => p.stepId),
  beatSteps: COPY.progress.map((p) => p.stepId).filter((id) => !NARRATIVE_STEPS.has(id)),
};

export const VOICE: VoiceScript = VoiceScriptSchema.parse(voiceJson);

const byId = new Map(VOICE.lines.map((l) => [l.id, l]));
const one = (role: VoiceRole, moment: VoiceMoment): string | null => {
  const l = VOICE.lines.find((x) => x.role === role && x.moment === moment);
  return l ? voiceKey(l.id) : null;
};

/** The line behind a key (voice.<id>), or null. */
export const voiceLine = (key: string): VoiceLine | null => (key.startsWith('voice.') ? (byId.get(key.slice(6)) ?? null) : null);

/**
 * What the screen shows for a line while it plays: a crew line as a radio caption, a new Lifty line as
 * its words. Nothing for a copy line (its words are on screen already) or the announcer (the world shows it).
 */
export function voiceCaption(key: string): string {
  const l = voiceLine(key);
  if (!l || l.onScreen !== 'caption') return '';
  return l.role === 'crew' ? LINES.radioCaption(l.text) : l.text;
}

/** The director's lookups. Every one returns keys; a key without a recording simply says nothing. */
export const VOICE_CUES = {
  arrival(place: number | typeof BASEMENT): string | null {
    const l = VOICE.lines.find((x) => x.moment === 'arrival' && (place === BASEMENT ? x.place === BASEMENT : x.floor === place));
    return l ? voiceKey(l.id) : null;
  },
  depart: (direction: 'up' | 'down') => one('elevator', direction === 'up' ? 'departUp' : 'departDown'),
  express: one('elevator', 'express'),
  doorsOpening: one('elevator', 'doorsOpening'),
  doorsClosing: one('elevator', 'doorsClosing'),
  overload: one('elevator', 'overload'),
  hallCall: one('elevator', 'hallCall'),
  coldOpen: one('crew', 'coldOpen'),
  intro: one('lifty', 'intro'),
  wake: one('lifty', 'wake'),
  /** The radio calls, used in turn. */
  hallCallRadio: VOICE.lines.filter((l) => l.moment === 'hallCallRadio').map((l) => voiceKey(l.id)),
  /** The crew's beat that opens a step, and Lifty's reply to it, in that order. */
  beat(stepId: string): string[] {
    return VOICE.lines.filter((l) => (l.moment === 'crewBeat' || l.moment === 'crewBeatReply') && l.step === stepId).sort((a, b) => (a.moment === 'crewBeat' ? -1 : 0) - (b.moment === 'crewBeat' ? -1 : 0)).map((l) => voiceKey(l.id));
  },
  /** Whether a key is Lifty's reply to a crew beat: said with the job's own first words, never at the hall call. */
  isBeatReply: (key: string): boolean => voiceLine(key)?.moment === 'crewBeatReply',
  crewFinale: one('crew', 'finale'),
  finale: one('lifty', 'finale'),
  restored: one('lifty', 'restored'),
  crewRestored: one('crew', 'restored'),
  rank: one('lifty', 'rank'),
  rankAgain: one('lifty', 'rankAgain'),
  freeRide: one('lifty', 'freeRideReturn'),
  basementAside: one('lifty', 'basementAside'),
};

/** Every key the script can say (what the recording pack must eventually cover). */
export const VOICE_KEYS: readonly string[] = VOICE.lines.map((l) => voiceKey(l.id));
