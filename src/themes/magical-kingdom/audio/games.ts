// Game narration recordings by clip id (content/themes/magical-kingdom/games-narration.json is the script;
// the files will be assets/themes/magical-kingdom/audio/games-v1/<id>.mp3 with their manifest). Each clip is
// registered as `'game:<id>': require('../../../../assets/themes/magical-kingdom/audio/games-v1/<id>.mp3')`.
// An unregistered clip plays nothing and the game goes on without it (its line stays on screen as text).
//
// Empty on purpose (2026-11-20). The 61 takes generated once still sit in their ElevenLabs flow, but they could
// not be downloaded: the connector gives a take's audio only for the run's session id, and those ids were lost
// with the first build. They are not being generated again with that recipe: the owner judged it poor, and a new
// recording follows an audition by ear (DECISIONS.md D209).
export const GAME_SOURCES: Record<string, number> = {};
