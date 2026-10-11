// Word Garden recordings by slot (wordGarden/content.ts: slot, recordingList; the checklist with what is
// still missing is content/themes/magical-kingdom/wordGarden.recordings.json). Unrecorded slots play nothing
// and the text stays on screen. Letter sounds are added only after an owner audition (D188). Add each clip as `'slot:<slot>': require(...)` once recorded and heard.
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
};
