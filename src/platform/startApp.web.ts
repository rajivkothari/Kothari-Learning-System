// Browser entry (playtest/development target): Skia on the web runs on CanvasKit, a WebAssembly
// module that must finish loading before any Skia component module is evaluated. So the app is
// required only after LoadSkiaWeb resolves. canvaskit.wasm is copied into public/ by
// scripts/prepare-web.js and served from the site root.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

const base = () => globalThis.location?.pathname.replace(/[^/]*$/, '') ?? '/';

export function startApp(): void {
  void LoadSkiaWeb({ locateFile: (file: string) => `${base()}${file}` }).then(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../../App') as typeof import('../../App')).default;
    registerRootComponent(App);
  });
}
