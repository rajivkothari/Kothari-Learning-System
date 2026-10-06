// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const FRAMEWORK_IMPORTS = [
  { group: ['react', 'react/*', 'react-native', 'react-native/*', 'react-native-*', '@react-native/*'], message: 'src/engine must stay framework-free (docs/ARCHITECTURE.md).' },
  { group: ['expo', 'expo-*', '@expo/*'], message: 'src/engine must not depend on Expo.' },
  { group: ['@shopify/react-native-skia'], message: 'src/engine must not depend on a renderer.' },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    // Core learning logic: pure TypeScript only.
    files: ['src/engine/**/*.{ts,tsx}'],
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
