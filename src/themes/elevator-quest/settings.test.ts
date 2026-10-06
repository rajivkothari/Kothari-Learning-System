// Audit P1: the OS "reduce motion" switch is the starting default only when nothing is stored.
import { parseSettings, resolveMotion } from './sessionCore';

describe('initial motion setting', () => {
  it('a stored choice always wins over the OS', () => {
    expect(resolveMotion({ motion: 'normal' }, true)).toEqual({ motion: 'normal', source: 'stored' });
    expect(resolveMotion({ motion: 'reduced' }, false)).toEqual({ motion: 'reduced', source: 'stored' });
    expect(resolveMotion({ motion: 'reduced' }, null)).toEqual({ motion: 'reduced', source: 'stored' });
  });

  it('with nothing stored, the OS switch decides', () => {
    expect(resolveMotion({}, true)).toEqual({ motion: 'reduced', source: 'os' });
    expect(resolveMotion({}, false)).toEqual({ motion: 'normal', source: 'default' });
  });

  it('an unreadable OS setting or a garbled stored value falls back to normal motion', () => {
    expect(resolveMotion({}, null)).toEqual({ motion: 'normal', source: 'default' });
    expect(resolveMotion({ motion: 'sideways' }, true)).toEqual({ motion: 'reduced', source: 'os' });
  });

  it('parseSettings applies it and leaves sound settings alone', () => {
    expect(parseSettings({}, true).motion).toBe('reduced');
    expect(parseSettings({ motion: 'normal' }, true).motion).toBe('normal');
    expect(parseSettings({ output: 'quiet' }, true).audio.output).toBe('quiet');
    expect(parseSettings({}).motion).toBe('normal');
  });
});
