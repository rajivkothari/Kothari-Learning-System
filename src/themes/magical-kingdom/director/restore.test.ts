import { restoreComfort } from './restore';

test('Comfort comes back from the settings, with the safe side when nothing is saved', () => {
  expect(restoreComfort({}, null)).toEqual({ quiet: false, still: true, slowVoice: true });
  expect(restoreComfort({}, false)).toEqual({ quiet: false, still: false, slowVoice: true });
  expect(restoreComfort({ 'kingdom.quiet': 'true', 'kingdom.motion': 'gentle', 'kingdom.voice': 'usual' }, true)).toEqual({ quiet: true, still: false, slowVoice: false });
  expect(restoreComfort({ 'kingdom.motion': 'still' }, false).still).toBe(true);
});
