// Two Jest projects:
// - app:    React Native environment (jest-expo) for the Device Lab and future UI.
// - engine: plain Node, no React Native setup at all. Proves the learning engine
//           runs without native modules. Only TypeScript is transformed.
const babelPresetExpo = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: 'jest-expo',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      resolver: '<rootDir>/jest.resolver.js',
      testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '<rootDir>/src/engine/'],
    },
    {
      displayName: 'engine',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/engine/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['babel-jest', { presets: [babelPresetExpo] }] },
    },
  ],
};
