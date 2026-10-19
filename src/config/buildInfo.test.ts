import { buildLabel, readBuildInfo } from './buildInfo';

describe('build info', () => {
  it('shows nothing without a SHA (native builds)', () => {
    expect(readBuildInfo({})).toBeNull();
    expect(buildLabel(null)).toBeNull();
  });

  it('names the short SHA, the channel and the build time', () => {
    const info = readBuildInfo({ sha: '1e9f426037c0138ff7593d25caf0dcbec48fe9fb', channel: 'playtest', time: '2026-10-19T14:03:22.000Z' });
    expect(buildLabel(info)).toBe('Build 1e9f426 · playtest · 2026-10-19 14:03 UTC');
  });

  it('keeps the dirty mark and defaults the channel to local', () => {
    expect(buildLabel(readBuildInfo({ sha: '1e9f426037c0-dirty' }))).toBe('Build 1e9f426-dirty · local');
  });
});
