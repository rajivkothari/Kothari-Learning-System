// A slow press is still a press. Every tap in Elevator Quest allows a finger to rest on a control for
// seconds before it lifts (`maxDuration(60_000)`): the gesture library's default tap gives up after
// half a second, and a child who presses and holds would see nothing happen. A scripted child playtest
// (2026-11) found the cargo crates and the shaft map's rows without it.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) return sources(file);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [file] : [];
  });
}

/** Each `Gesture.Tap()` with the chain of calls that follows it, up to the end of its statement. */
function taps(text: string): string[] {
  const out: string[] = [];
  for (let at = text.indexOf('Gesture.Tap()'); at !== -1; at = text.indexOf('Gesture.Tap()', at + 1)) {
    let depth = 0;
    let end = at;
    for (; end < text.length; end++) {
      const c = text[end]!;
      if (c === '(' || c === '{') depth += 1;
      else if (c === ')' || c === '}') depth -= 1;
      else if (c === ';' && depth === 0) break;
      if (depth < 0) break;
    }
    out.push(text.slice(at, end));
  }
  return out;
}

describe('every tap takes a long press', () => {
  const found = sources(ROOT).flatMap((file) => taps(fs.readFileSync(file, 'utf8')).map((chain) => ({ file: path.relative(ROOT, file), chain })));

  it('finds the taps (the floor buttons, the door buttons, the landing things, the crates, the shaft map, the games)', () => {
    const files = new Set(found.map((t) => t.file));
    for (const f of ['ui/FloorButton.tsx', 'ui/ButtonPanel.tsx', 'ui/Hotspot.tsx', 'ui/CargoBay.tsx', 'ui/ShaftMap.tsx']) expect([...files]).toContain(f);
  });

  it('each one allows the finger a minute before it lifts', () => {
    const short = found.filter((t) => !/\.maxDuration\(60_000\)/.test(t.chain)).map((t) => t.file);
    expect(short).toEqual([]);
  });
});
