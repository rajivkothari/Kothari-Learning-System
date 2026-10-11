// The 16 pt floor in the cabin's sheets and boards (audit follow-up, D182): no literal size and no scaled
// type role below TEXT_FLOOR.label in the files a child reads. Marks on game objects go through
// markSize (textRoles.ts); the playtest report (for the adult) is the one documented literal exception.
import fs from 'node:fs';
import path from 'node:path';

import { ENGINEER_WORLD as TOKENS } from '../../../presentation/design/tokens';
import { MARK_FLOOR, TEXT_FLOOR, markSize } from './textRoles';

const FILES = ['EngineerLog.tsx', 'RescueBoard.tsx', 'Sheets.tsx', 'Hud.tsx', 'CargoBay.tsx'];
const ROLE_SIZE = { UI: TOKENS.type.ui.size, READING: TOKENS.type.reading.size, DISPLAY: TOKENS.type.display.size } as const;
/** Lines allowed below the floor, by a comment that names the exception. */
const EXCEPTIONS = [/reportText:/];

const source = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the 16 pt floor in the boards and sheets a child reads', () => {
  it.each(FILES)('%s: no literal font size below the label floor', (f) => {
    const small = source(f)
      .split('\n')
      .filter((line) => !EXCEPTIONS.some((e) => e.test(line)))
      .flatMap((line) => [...line.replace(/\/\/.*$/, '').matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)].map((m) => ({ line: line.trim(), size: Number(m[1]) })))
      .filter((m) => m.size < TEXT_FLOOR.label);
    expect(small).toEqual([]);
  });

  it.each(FILES)('%s: no type role scaled below the label floor', (f) => {
    const small = [...source(f).replace(/\/\/.*$/gm, '').matchAll(/\b(UI|READING|DISPLAY)\((\d*\.?\d+)\)/g)]
      .map((m) => ({ call: m[0], size: Math.round(ROLE_SIZE[m[1] as keyof typeof ROLE_SIZE] * Number(m[2])) }))
      .filter((m) => m.size < TEXT_FLOOR.label);
    expect(small).toEqual([]);
  });

  it('a mark is sized to its object and never below MARK_FLOOR', () => {
    expect(markSize(64, 0.16)).toBe(MARK_FLOOR);
    expect(markSize(64, 0.19)).toBe(MARK_FLOOR);
    expect(markSize(84, 0.19)).toBe(16);
    expect(markSize(10, 0.1)).toBe(MARK_FLOOR);
  });
});
