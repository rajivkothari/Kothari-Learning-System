// Game narration recordings by clip id (content/themes/magical-kingdom/games-narration.json is the script;
// the files are assets/themes/magical-kingdom/audio/games-v1/<id>.mp3 with their manifest). Each clip is
// registered as `'game:<id>': require('../../../../assets/themes/magical-kingdom/audio/games-v1/<id>.mp3')`.
// An unregistered clip plays nothing and the game goes on without it. Empty until the clips are recovered
// or regenerated (REBUILD_SPEC.md "Recordings"): the assets work fills this map.
export const GAME_SOURCES: Record<string, number> = {};
