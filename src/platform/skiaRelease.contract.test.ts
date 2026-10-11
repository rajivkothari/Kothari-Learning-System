/**
 * @jest-environment node
 */
/// <reference types="node" />
// Contract between skiaRelease.web.ts and the react-native-skia actually installed in node_modules.
// The patches key on private web internals; this test fails when an upgrade removes or renames one,
// or when the installed version is not in SUPPORTED_SKIA_VERSIONS (so the patch would not install).
//
// Two kinds of check:
// - Real modules. The real CanvasKit WebAssembly (canvaskit-wasm/bin/full, the build LoadSkiaWeb
//   loads) runs in Node, and react-native-skia's compiled web modules (lib/commonjs: JsiSkApi, the
//   JsiSkPaint class, the web SkiaViewApi registry) load without a browser. The preflight must find
//   every symbol on them, the install must succeed, and the paint and picture releases must delete
//   real CanvasKit objects. lib/commonjs is compiled from the same release as src/, which is what
//   Metro bundles for the web (the package's "react-native" field points at src/index.ts).
// - Source text. A WebGL surface cannot be made in Node (no WebGL), and whether react-native-skia
//   still reaches the patched functions (a Canvas makes its surface with MakeWebGLCanvasSurface, a
//   frame hands its picture over with SkiaViewApi.setJsiProperty, the drawing context reassigns and
//   copies paints) is a property of its call sites, not of an object. Those are checked by reading
//   the installed package's src/ files as text. A text check proves the call is still written
//   there, not that it runs; the browser soaks (scripts/perf-rides.js, scripts/perf-games.js) are
//   the runtime proof.
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder as NodeTextDecoder } from 'node:util';

import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit';
import { JsiSkApi } from '@shopify/react-native-skia/lib/commonjs/skia/web/JsiSkia';
import skiaPackage from '@shopify/react-native-skia/package.json';

import { installSkiaRelease, preflightSkiaRelease, SUPPORTED_SKIA_VERSIONS } from './skiaRelease.web';

// skiaRelease.web.ts imports the Skia API at module scope; jest.setup.ts already replaces the
// package entry with a stand-in, and this test passes the real API in explicitly.

const SKIA_DIR = path.dirname(require.resolve('@shopify/react-native-skia/package.json'));
const CK_DIR = path.dirname(require.resolve('canvaskit-wasm/bin/full/canvaskit'));
const source = (rel: string) => fs.readFileSync(path.join(SKIA_DIR, rel), 'utf8');

type Handle = { delete(): void; isDeleted(): boolean };
type RealPaint = { ref: Handle; assign(p: RealPaint): void; reset(): void; copy(): RealPaint };
type RealPicture = { ref: Handle };
type RealSkia = {
  Paint(): RealPaint;
  PictureRecorder(): { beginRecording(rect: unknown): unknown; finishRecordingAsPicture(): RealPicture };
  XYWHRect(x: number, y: number, w: number, h: number): unknown;
};
type RealViewApi = {
  setJsiProperty(id: unknown, name: string, value: unknown): void;
  registerView(id: string, view: unknown): void;
  deferedPictures: Record<string, unknown>;
};

const g = globalThis as { SkiaViewApi?: unknown };
const hadViewApi = 'SkiaViewApi' in g;
const savedViewApi = g.SkiaViewApi;

let canvasKit: Record<string, unknown>;
let skia: RealSkia;
let viewApi: RealViewApi;

beforeAll(async () => {
  // Expo's Jest setup installs a TextDecoder without utf-16le, which CanvasKit's loader asks for;
  // Node's own is used while CanvasKit loads. wasmBinary: no fetch or file lookup in the loader.
  const expoDecoder = globalThis.TextDecoder;
  globalThis.TextDecoder = NodeTextDecoder as unknown as typeof TextDecoder;
  try {
    canvasKit = (await CanvasKitInit({ wasmBinary: fs.readFileSync(path.join(CK_DIR, 'canvaskit.wasm')) } as never)) as unknown as Record<string, unknown>;
  } finally {
    globalThis.TextDecoder = expoDecoder;
  }
  skia = JsiSkApi(canvasKit as never) as unknown as RealSkia;
  // The web view registry installs itself on the global when its module loads.
  jest.requireActual('@shopify/react-native-skia/lib/commonjs/specs/NativeSkiaModule.web');
  viewApi = g.SkiaViewApi as RealViewApi;
}, 30_000);

afterAll(() => {
  if (hadViewApi) g.SkiaViewApi = savedViewApi;
  else delete g.SkiaViewApi;
});

it('the installed react-native-skia version is one the patches support', () => {
  expect(SUPPORTED_SKIA_VERSIONS).toContain(skiaPackage.version);
});

it('the real CanvasKit, JsiSkPaint and SkiaViewApi have every private symbol the patches need', () => {
  expect(viewApi).toBeDefined();
  // Named one by one so a failure says which symbol went missing.
  expect(preflightSkiaRelease({ canvasKit, skia, viewApi, Registry: FinalizationRegistry })).toEqual([]);
  for (const name of ['MakeWebGLCanvasSurface', 'GetWebGLContext', 'MakeWebGLContext', 'MakeOnScreenGLSurface', 'deleteContext']) expect(typeof canvasKit[name]).toBe('function');
  const gr = (canvasKit.GrDirectContext as { prototype: Record<string, unknown> }).prototype;
  expect(typeof gr.releaseResourcesAndAbandonContext).toBe('function');
  expect(typeof gr.delete).toBe('function');
  const paint = skia.Paint();
  const proto = Object.getPrototypeOf(paint) as Record<string, unknown>;
  expect(proto.constructor).toHaveProperty('name', 'JsiSkPaint');
  for (const name of ['assign', 'reset', 'copy', 'dispose']) expect(typeof proto[name]).toBe('function');
  expect(typeof paint.ref.delete).toBe('function');
  expect(typeof paint.ref.isDeleted).toBe('function');
  paint.ref.delete();
  expect(typeof viewApi.setJsiProperty).toBe('function');
  expect(typeof viewApi.deferedPictures).toBe('object');
});

it('installs on the real modules and deletes real CanvasKit paints and pictures', () => {
  const warn = jest.fn();
  const originalSurface = canvasKit.MakeWebGLCanvasSurface;
  const result = installSkiaRelease({ version: skiaPackage.version, canvasKit, skia, viewApi, Registry: FinalizationRegistry, warn });
  expect(result).toEqual({ installed: true, status: 'installed', version: skiaPackage.version });
  expect(warn).not.toHaveBeenCalled();
  expect(canvasKit.MakeWebGLCanvasSurface).not.toBe(originalSurface);

  // Paints: the CanvasKit paint a wrapper held is deleted when assign or reset replaces it.
  const root = skia.Paint();
  const pooled = skia.Paint();
  const held = pooled.ref;
  pooled.assign(root);
  expect(held.isDeleted()).toBe(true);
  expect(pooled.ref.isDeleted()).toBe(false);
  const assigned = pooled.ref;
  pooled.reset();
  expect(assigned.isDeleted()).toBe(true);
  const drawCopy = root.copy();
  expect(drawCopy.ref.isDeleted()).toBe(false);
  expect(root.ref.isDeleted()).toBe(false);

  // Pictures: a registered view's previous picture is deleted when the next one arrives.
  const picture = () => {
    const recorder = skia.PictureRecorder();
    recorder.beginRecording(skia.XYWHRect(0, 0, 10, 10));
    return recorder.finishRecordingAsPicture();
  };
  const view = { setPicture: jest.fn() };
  viewApi.registerView('701', view);
  const [first, second] = [picture(), picture()];
  viewApi.setJsiProperty(701, 'picture', first);
  viewApi.setJsiProperty(701, 'picture', second);
  expect(view.setPicture).toHaveBeenLastCalledWith(second);
  expect(first.ref.isDeleted()).toBe(true);
  expect(second.ref.isDeleted()).toBe(false);
  expect(warn).not.toHaveBeenCalled();
});

it('react-native-skia still reaches the patched calls (source text of the installed package)', () => {
  // Metro bundles src/ for the web: the package's "react-native" entry.
  expect((skiaPackage as { 'react-native'?: string })['react-native']).toBe('src/index.ts');
  // LoadSkiaWeb loads the CanvasKit build this test loads.
  expect(source('src/web/LoadSkiaWeb.tsx')).toContain('canvaskit-wasm/bin/full/canvaskit');
  // GPU contexts: a web Canvas makes its surface through MakeWebGLCanvasSurface with its canvas.
  expect(source('src/views/SkiaPictureView.web.tsx')).toMatch(/CanvasKit\.MakeWebGLCanvasSurface\(\s*canvas\s*\)/);
  // Pictures: each frame hands its picture to the registry; an unregistered view's picture waits
  // in deferedPictures (the patch must never delete that one).
  expect(source('src/sksg/Container.web.ts')).toMatch(/SkiaViewApi\.setJsiProperty\([^)]*"picture"/);
  expect(source('src/specs/NativeSkiaModule.web.ts')).toMatch(/this\.deferedPictures\[`\$\{nativeId\}`\] = value/);
  // Paints: the drawing context makes paints with Skia.Paint() and reassigns pooled ones; the
  // player copies the current paint per draw command; assign and reset replace the wrapper's ref.
  const drawing = source('src/sksg/Recorder/DrawingContext.ts');
  expect(drawing).toContain('Skia.Paint()');
  expect(drawing).toMatch(/\.assign\(/);
  expect(source('src/sksg/Recorder/Player.ts')).toContain('ctx.paint.copy()');
  const paint = source('src/skia/web/JsiSkPaint.ts');
  expect(paint).toMatch(/assign\(paint: JsiSkPaint\) \{\s*this\.ref = paint\.ref\.copy\(\);/);
  expect(paint).toMatch(/reset\(\) \{\s*this\.ref = new this\.CanvasKit\.Paint\(\);/);
});
