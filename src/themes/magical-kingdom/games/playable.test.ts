// Which royal games a child can follow by ear, given what is recorded.
import { CHOICE_GAME_IDS, narrationClips, rhymeAskId } from './choiceContent';
import { GAME_IDS } from './content';
import { missingByEar, playableByEar, type RoyalPlay } from './playable';

const ALL: RoyalPlay[] = [...GAME_IDS, ...CHOICE_GAME_IDS, 'quest'];
const everything = { has: () => true };
/** Today: the kingdom's own narration and the Word Garden are recorded, no `game:` clip is. */
const noGameClips = { has: (k: string) => !k.startsWith('game:') };

describe('playableByEar', () => {
  it('every game can be played by ear once everything is recorded', () => {
    for (const play of ALL) expect([play, playableByEar(play, everything)]).toEqual([play, true]);
  });

  it('with no game clips the letter games can, and the picture games and the quest cannot', () => {
    expect(ALL.filter((p) => playableByEar(p, noGameClips))).toEqual(['bowling', 'golf']);
    // A story needs its telling and its question.
    expect(missingByEar('story', noGameClips)).toEqual(expect.arrayContaining(['game:story.a.1', 'game:story.a.3', 'game:q.a1', 'game:q.c2']));
    // Chests need the word and the ask; Word Garden words are already recorded.
    expect(missingByEar('sort', noGameClips)).toEqual(expect.arrayContaining(['game:word.moon', 'game:line.sort.ask']));
    expect(missingByEar('sort', noGameClips)).not.toContain('slot:word:cat');
  });

  it('a rhyme turn needs its whole ask, or the fragment and the word, and the word of each picture', () => {
    const scripted = new Set(narrationClips().map((c) => `game:${c.id}`));
    const whole = { has: (k: string) => !k.startsWith('game:') || (scripted.has(k) && k !== 'game:line.rhyme.ask') };
    expect(playableByEar('rhyme', whole)).toBe(true);
    const stitched = { has: (k: string) => !k.startsWith('game:line.rhyme.ask.') };
    expect(playableByEar('rhyme', stitched)).toBe(true);
    const neither = { has: (k: string) => k !== 'game:line.rhyme.ask' && k !== `game:${rhymeAskId('fox')}` };
    expect(missingByEar('rhyme', neither)).toEqual([`game:${rhymeAskId('fox')}`]);
    expect(missingByEar('rhyme', { has: (k: string) => k !== 'game:word.key' })).toEqual(['game:word.key']);
  });

  it('a letter game needs every ask it can say; golf’s play line is not essential', () => {
    expect(missingByEar('golf', { has: (k: string) => k !== 'voice:Find the first letter in fox.' })).toEqual(['voice:Find the first letter in fox.']);
    expect(playableByEar('golf', { has: (k: string) => k !== 'game:line.golf.play' })).toBe(true);
  });
});
