// The gift line after a reload: said at the browser's first touch if the dialog is still open, once.
import { sayOrAtFirstTouch, type GiftAudio } from './gift';

function audio(open: boolean) {
  const said: string[][] = [];
  let ready: (() => void)[] = [];
  let gate = open;
  const a: GiftAudio = {
    sequence: (keys) => { if (!gate) return false; said.push([...keys]); return true; },
    whenReady: (fn) => { ready.push(fn); return () => { ready = ready.filter((x) => x !== fn); }; },
  };
  return { a, said, touch: () => { gate = true; const w = ready; ready = []; w.forEach((f) => f()); }, waiting: () => ready.length };
}

const KEYS = ['effect:gift', 'voice:A royal gift for you!'];

test('said at once when sound can play, with nothing left waiting', () => {
  const x = audio(true);
  sayOrAtFirstTouch(x.a, KEYS, 250, () => true);
  expect(x.said).toEqual([KEYS]);
  expect(x.waiting()).toBe(0);
});

test('after a reload the line waits for the first touch, and is said then while the dialog is open', () => {
  const x = audio(false);
  sayOrAtFirstTouch(x.a, KEYS, 250, () => true);
  expect(x.said).toEqual([]);
  x.touch();
  expect(x.said).toEqual([KEYS]);
});

test('not said at the touch when the dialog has closed, nor after a cancel', () => {
  const x = audio(false);
  sayOrAtFirstTouch(x.a, KEYS, 250, () => false);
  x.touch();
  expect(x.said).toEqual([]);
  const y = audio(false);
  const cancel = sayOrAtFirstTouch(y.a, KEYS, 250, () => true);
  cancel();
  y.touch();
  expect(y.said).toEqual([]);
});
