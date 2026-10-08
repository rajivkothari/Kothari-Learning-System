// Words for the mini-game host (M9): the entrance, BACK TO ELEVATOR, the loading and trouble views.
// They live in content/themes/elevator-quest/minigames/host.json (validated by validateHostCopy).
import { MINI_GAME_HOST } from '../content/minigames';

export interface HostCopy {
  /** The game's name, by catalog titleKey. */
  games: Record<string, string>;
  /** The landing's PLAY button, by titleKey. */
  entrance: Record<string, string>;
  /** The same button when an unfinished game waits, by titleKey. */
  resume: Record<string, string>;
  /** The button's word where the window has no room for the game's name (its accessibility label still names the game). */
  play: string;
  /** For screen readers: what the entrance does. */
  entranceHint: string;
  back: string;
  /** For screen readers: what BACK TO ELEVATOR does. */
  backHint: string;
  loading: string;
  /** The game's mission is not installed (development builds before the content lands). */
  missing: string;
  /** Storage failed while opening. */
  trouble: string;
  /** A placeholder screen's line (until the game's own screen lands). */
  placeholder: string;
}

const { games, entrance, resume, play, entranceHint, back, backHint, loading, missing, trouble, placeholder } = MINI_GAME_HOST;

export const HOST_COPY: HostCopy = {
  games,
  entrance,
  resume,
  play,
  entranceHint,
  back,
  backHint,
  loading,
  missing,
  trouble,
  placeholder,
};

/** The entrance's words for a game: PLAY, or back to the game that waits. */
export const entranceLabel = (titleKey: string, unfinished: boolean, copy: HostCopy = HOST_COPY): string => (unfinished ? copy.resume[titleKey] : copy.entrance[titleKey]) ?? copy.entrance[titleKey] ?? titleKey;
