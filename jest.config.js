// Two Jest projects:
// - app:    React Native environment (jest-expo) for the Device Lab and future UI.
// - engine: plain Node, no React Native setup at all. Proves the learning engine
//           runs without native modules. Only TypeScript is transformed.
// - runtime: plain Node for persistence and the runtime service, against real SQLite
//            (node:sqlite). expo-sqlite itself is only exercised on device.
// - theme:  plain Node for src/themes/**/*.test.ts (UI component tests, *.test.tsx, run in app).
// - bench:  only when BENCH=1 (`npm run bench`). History-size benchmarks, not tests.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

const nodeTs = { testEnvironment: 'node', transform: { '^.+\\.ts$': ['babel-jest', { presets: [babelPresetExpo] }] } };

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      resolver: '<rootDir>/jest.resolver.js',
      testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '<rootDir>/src/engine/', '<rootDir>/src/persistence/', '<rootDir>/src/runtime/', '<rootDir>/src/themes/.*\\.test\\.ts$'],
    },
    { displayName: 'engine', ...nodeTs, testMatch: ['<rootDir>/src/engine/**/*.test.ts'] },
    { displayName: 'runtime', ...nodeTs, testMatch: ['<rootDir>/src/persistence/**/*.test.ts', '<rootDir>/src/runtime/**/*.test.ts'] },
    // Theme logic (simulation, audio cues, mission director): plain Node, no rendering.
    { displayName: 'theme', ...nodeTs, testMatch: ['<rootDir>/src/themes/**/*.test.ts'] },
    ...(process.env.BENCH === '1' ? [{ displayName: 'bench', ...nodeTs, testMatch: ['<rootDir>/src/**/*.bench.ts'] }] : []),
  ],
};
