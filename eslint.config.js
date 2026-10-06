// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const FRAMEWORK_IMPORTS = [
  { group: ['react', 'react/*', 'react-native', 'react-native/*', 'react-native-*', '@react-native/*'], message: 'src/engine must stay framework-free (docs/ARCHITECTURE.md).' },
  { group: ['expo', 'expo-*', '@expo/*'], message: 'src/engine must not depend on Expo.' },
  { group: ['@shopify/react-native-skia'], message: 'src/engine must not depend on a renderer.' },
];

// Everything the pure engine must never touch: UI, native, platform, storage, network, state libraries.
const ENGINE_FORBIDDEN_IMPORTS = [
  ...FRAMEWORK_IMPORTS,
  { group: ['*reanimated*', '*worklets*', '*gesture-handler*', '*skia*', '*sqlite*', '*mmkv*', 'zustand', 'drizzle-orm', '*async-storage*'], message: 'src/engine must not depend on native, rendering, storage, or state libraries.' },
  { group: ['node:*', 'fs', 'path', 'os', 'http', 'https', 'net', 'child_process', 'axios'], message: 'src/engine must not use the filesystem or network.' },
  { group: ['**/dev', '**/dev/**', '**/presentation', '**/presentation/**', '**/config', '**/config/**', '**/App'], message: 'src/engine must not import app layers.' },
];

const ENGINE_FORBIDDEN_CALLS = {
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: 'Pass time in. The engine never reads a clock.' },
    { object: 'Math', property: 'random', message: 'Use a seeded Rng from random/rng.ts.' },
    { object: 'performance', property: 'now', message: 'Pass time in. The engine never reads a clock.' },
  ],
  'no-restricted-syntax': ['error', { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Pass time in. The engine never reads a clock.' }],
  'no-restricted-globals': [
    'error',
    { name: 'fetch', message: 'No network in the engine.' },
    { name: 'XMLHttpRequest', message: 'No network in the engine.' },
    { name: 'WebSocket', message: 'No network in the engine.' },
    { name: 'localStorage', message: 'No storage in the engine.' },
  ],
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    // Core learning logic: pure TypeScript only. Production files may import only zod and each other.
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/**/*.test.ts', 'src/engine/testing/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...ENGINE_FORBIDDEN_IMPORTS, { group: ['fast-check'], message: 'fast-check is for tests only.' }] }],
      ...ENGINE_FORBIDDEN_CALLS,
    },
  },
  {
    // Engine tests: same framework ban; may use fast-check, node:fs for boundary scans, and content fixtures.
    files: ['src/engine/**/*.test.ts', 'src/engine/testing/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: FRAMEWORK_IMPORTS }] },
  },
  {
    // Framework-independent layout math shared by any future renderer.
    files: ['src/presentation/layout/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: FRAMEWORK_IMPORTS }] },
  },
  {
    // The Device Lab is a removable harness. It must not reach into the learning engine.
    files: ['src/dev/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/engine', '**/engine/**'], message: 'The Device Lab must not depend on the learning engine.' }] },
      ],
    },
  },
]);
