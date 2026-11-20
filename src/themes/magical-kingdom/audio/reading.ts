// Word Garden recordings by slot (wordGarden/content.ts: slot, recordingList; the checklist with what is
// still missing is content/themes/magical-kingdom/wordGarden.recordings.json). Unrecorded slots play nothing
// and the text stays on screen. Add a word or line as `'slot:<slot>': require(...)` once recorded. A letter sound is added only by
// `node scripts/letter-sounds.js approve`, which writes down how it was approved (D188, D204, D205).
export const READING_SOURCES: Record<string, number> = {
  // Reused: the kingdom's recorded garden success line (narration-v1, same voice).
  'slot:line:bloom': require('../../../../assets/themes/magical-kingdom/audio/narration-v1/gardenSuccess.mp3'),
  // Word Garden narration v1 (2026-10-12): project voice, one take each, checked by transcription.
  'slot:word:cat': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/word.cat.mp3'),
  'slot:word:hat': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/word.hat.mp3'),
  'slot:word:map': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/word.map.mp3'),
  'slot:word:pig': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/word.pig.mp3'),
  'slot:word:sun': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/word.sun.mp3'),
  'slot:line:blend': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.blend.mp3'),
  'slot:line:blendReady': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.blendReady.mp3'),
  'slot:line:done': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.done.mp3'),
  'slot:line:retryBlend': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.retryBlend.mp3'),
  'slot:line:retryOrder': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.retryOrder.mp3'),
  'slot:line:retrySound': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.retrySound.mp3'),
  'slot:line:retrySpell': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.retrySpell.mp3'),
  'slot:line:showBlend': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.showBlend.mp3'),
  'slot:line:showSound': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.showSound.mp3'),
  'slot:line:showSpell': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.showSpell.mp3'),
  'slot:line:sound': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.sound.mp3'),
  'slot:line:spell': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/line.spell.mp3'),
  // Letter sounds: Open Letter Sounds (CC0, a synthetic voice), approved on the owner's instruction. Not yet heard by a person.
  'slot:sound:a': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.a.mp3'),
  'slot:sound:b': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.b.mp3'),
  'slot:sound:c': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.c.mp3'),
  'slot:sound:d': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.d.mp3'),
  'slot:sound:e': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.e.mp3'),
  'slot:sound:g': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.g.mp3'),
  'slot:sound:h': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.h.mp3'),
  'slot:sound:i': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.i.mp3'),
  'slot:sound:m': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.m.mp3'),
  'slot:sound:n': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.n.mp3'),
  'slot:sound:o': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.o.mp3'),
  'slot:sound:p': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.p.mp3'),
  'slot:sound:s': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.s.mp3'),
  'slot:sound:t': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.t.mp3'),
  'slot:sound:u': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.u.mp3'),
  'slot:sound:z': require('../../../../assets/themes/magical-kingdom/audio/word-garden-v1/sound.z.mp3'),
};
