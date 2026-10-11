// Word Garden recordings by slot (wordGarden/content.ts: slot, recordingList; the checklist with what is
// still missing is content/themes/magical-kingdom/wordGarden.recordings.json). Unrecorded slots play nothing
// and the text stays on screen. Add each clip as `'slot:<slot>': require(...)` once recorded and heard.
export const READING_SOURCES: Record<string, number> = {
  // Reused: the kingdom's recorded garden success line (narration-v1, same voice).
  'slot:line:bloom': require('../../../../assets/themes/magical-kingdom/audio/narration-v1/gardenSuccess.mp3'),
};
