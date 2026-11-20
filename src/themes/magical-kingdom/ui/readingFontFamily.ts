// Andika (SIL Open Font License), the face for letters and words a child reads: its letter shapes are the ones
// taught in early reading (a one-storey a and g, a clear difference between l, I and 1). Files, source and hashes:
// assets/themes/magical-kingdom/fonts/manifest.json (readingFont.test.ts checks them). Pure: no React, no Expo.

/** The family name inside both font files, and the name the native build embeds them under (app.json). */
export const READING_FAMILY = 'Andika';
/** The bold file's own name. The browser build loads each file under its own name (one file a family until SDK 58). */
export const READING_BOLD_FACE = 'Andika-Bold';

export type ReadingFontStyle = { fontFamily?: string; fontWeight?: '400' | '700' };
/** Styles to spread last into a text style. Both are empty until the typeface can be drawn, so text never waits for it. */
export type ReadingFont = { regular: ReadingFontStyle; bold: ReadingFontStyle };

export const NO_READING_FONT: ReadingFont = { regular: {}, bold: {} };
