import { useFonts } from 'expo-font';
import { NO_READING_FONT, READING_BOLD_FACE, READING_FAMILY, type ReadingFont } from './readingFontFamily';

export type { ReadingFont } from './readingFontFamily';

// The browser build has no config plugin: the two files ship with the export and are loaded once, from the same
// origin, when the first screen that reads asks for them. Each file is its own family here, so the bold style names
// the bold file and keeps weight 400: asking a browser for 700 of an already bold file would thicken it again.
const FILES = {
  [READING_FAMILY]: require('../../../../assets/themes/magical-kingdom/fonts/Andika-Regular.ttf'),
  [READING_BOLD_FACE]: require('../../../../assets/themes/magical-kingdom/fonts/Andika-Bold.ttf'),
};
const WEB: ReadingFont = { regular: { fontFamily: READING_FAMILY, fontWeight: '400' }, bold: { fontFamily: READING_BOLD_FACE, fontWeight: '400' } };

/** The reading typeface for letters and words a child reads: `{ regular, bold }` text styles, empty until it has loaded. */
export function useReadingFont(): ReadingFont {
  const [loaded] = useFonts(FILES);
  return loaded ? WEB : NO_READING_FONT;
}
