// A name check for content and art metadata. Pure: no React, no I/O.
//
// Themed floors (D127) borrow a broad genre only. Their names, ids, file names, prompts and notes
// must not name the franchises they could be mistaken for. This is a text check, not image
// recognition: a reviewer still looks at every picture (docs/ART_ASSET_SPEC.md, rights manifest).
//
// "Link" is matched with a capital L only, as a whole word, so ordinary "link" and "linked" pass.

const CASE_INSENSITIVE =
  /\b(zelda|hyrule|hylian|triforce|hogwarts|harry potter|inside out|pixar|disney|marvel|pok[eé]mon|minecraft|mojang|creeper|lego|roblox|mario|luigi|nintendo|bowser|demon hunters?|huntr\/x|animal crossing|zootopia|frozen|paw patrol|bluey|sonic|fortnite|star wars|barbie|hot wheels|peppa|thomas the tank|sesame|muppets?)\b/gi;
const CASE_SENSITIVE = /\bLink\b/g;

/** The protected names found in a text, lower-cased, without repeats. */
export function protectedNames(text: string): string[] {
  const hits = [...text.matchAll(CASE_INSENSITIVE)].map((m) => m[0].toLowerCase());
  if (CASE_SENSITIVE.test(text)) hits.push('link');
  CASE_SENSITIVE.lastIndex = 0;
  return [...new Set(hits)];
}
