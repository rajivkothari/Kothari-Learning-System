/**
 * @jest-environment node
 */
/// <reference types="node" />
// Developer tools never reach a production child build: off by flag, and stubbed out of the
// bundle by metro.config.js. (scripts/check-bundle.js checks real exported bundles.)
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { devToolsEnabled } from '../config/flags';
import { DevToolsShell } from './DevToolsStub';

const root = path.join(__dirname, '..', '..');

function resolveInProduction(moduleName: string, env: Record<string, string> = {}): string {
  const script = `
    const config = require(${JSON.stringify(path.join(root, 'metro.config.js'))});
    const ctx = { resolveRequest: () => ({ type: 'sourceFile', filePath: 'UPSTREAM' }) };
    const r = config.resolver.resolveRequest ? config.resolver.resolveRequest(ctx, ${JSON.stringify(moduleName)}, 'android') : { filePath: 'UPSTREAM' };
    process.stdout.write(r.filePath);`;
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('EXPO_PUBLIC_')));
  return execFileSync(process.execPath, ['-e', script], { cwd: root, env: { ...clean, NODE_ENV: 'production', ...env } }).toString();
}

describe('developer tools exclusion', () => {
  it('are off unless this is a development build or EXPO_PUBLIC_DEV_TOOLS=1', () => {
    expect(devToolsEnabled({ dev: false, flag: undefined })).toBe(false);
    expect(devToolsEnabled({ dev: false, flag: '0' })).toBe(false);
    expect(devToolsEnabled({ dev: false, flag: 'true' })).toBe(false);
    expect(devToolsEnabled({ dev: false, flag: '1' })).toBe(true);
    expect(devToolsEnabled({ dev: true, flag: undefined })).toBe(true);
  });

  it('production bundles get an empty stub in place of the tools (and of the Device Lab)', () => {
    expect(resolveInProduction('./src/devtools/DevToolsShell')).toMatch(/DevToolsStub\.tsx$/);
    expect(resolveInProduction('./src/dev/device-lab/DeviceLabScreen')).toMatch(/DeviceLabStub\.tsx$/);
    expect(resolveInProduction('./src/themes/elevator-quest/ElevatorQuestApp')).toBe('UPSTREAM');
    // The web playtest export opts in explicitly.
    expect(resolveInProduction('./src/devtools/DevToolsShell', { EXPO_PUBLIC_DEV_TOOLS: '1' })).toBe('UPSTREAM');
    expect(DevToolsShell()).toBeNull();
  }, 30_000);
});
