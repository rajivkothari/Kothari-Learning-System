import { isLoaded } from 'expo-font';
import { NO_READING_FONT, READING_FAMILY, type ReadingFont } from './readingFontFamily';

export type { ReadingFont } from './readingFontFamily';

// Native builds embed both files as one family with two weights (the expo-font config plugin in app.json), so the
// face is there from the first frame and nothing is loaded at runtime. A build made before the plugin was added has
// no such family: the styles then stay empty and text keeps the system face.
const NATIVE: ReadingFont = { regular: { fontFamily: READING_FAMILY, fontWeight: '400' }, bold: { fontFamily: READING_FAMILY, fontWeight: '700' } };

/** The reading typeface for letters and words a child reads: `{ regular, bold }` text styles, empty until it is available. */
export function useReadingFont(): ReadingFont {
  return isLoaded(READING_FAMILY) ? NATIVE : NO_READING_FONT;
}
