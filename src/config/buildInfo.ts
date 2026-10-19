// Which commit a browser build came from. scripts/web.js sets these at bundle time (EXPO_PUBLIC_*
// values are inlined by Metro). Native builds never set them, so they show nothing there.

export interface BuildInfo {
  /** Full commit SHA, with "-dirty" when the working tree had uncommitted changes. */
  sha: string;
  /** Where the build came from: "playtest" (the hosted deploy) or "local". */
  channel: string;
  /** ISO time the bundle was built. */
  time: string;
}

export function readBuildInfo(env: { sha?: string; channel?: string; time?: string }): BuildInfo | null {
  if (!env.sha) return null;
  return { sha: env.sha, channel: env.channel || 'local', time: env.time || '' };
}

export const BUILD_INFO: BuildInfo | null = readBuildInfo({
  sha: process.env.EXPO_PUBLIC_BUILD_SHA,
  channel: process.env.EXPO_PUBLIC_BUILD_CHANNEL,
  time: process.env.EXPO_PUBLIC_BUILD_TIME,
});

/** One short line: "Build 1a2b3c4 · playtest · 2026-10-19 14:03 UTC". */
export function buildLabel(info: BuildInfo | null = BUILD_INFO): string | null {
  if (!info) return null;
  const dirty = info.sha.endsWith('-dirty');
  const short = info.sha.replace(/-dirty$/, '').slice(0, 7) + (dirty ? '-dirty' : '');
  const when = info.time ? ` · ${info.time.slice(0, 16).replace('T', ' ')} UTC` : '';
  return `Build ${short} · ${info.channel}${when}`;
}
