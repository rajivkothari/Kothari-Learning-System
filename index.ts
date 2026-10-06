import { startApp } from './src/platform/startApp';

// Native registers the app at once. The browser build first loads Skia's WebAssembly
// (src/platform/startApp.web.ts).
startApp();
