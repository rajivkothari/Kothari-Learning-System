// Browser build only (M9.1): give back the Skia memory that react-native-skia 2.6.2 keeps on the
// web. Skia runs there on CanvasKit (WebAssembly), whose objects live outside the JS heap: each must
// be deleted, or be one of the kinds CanvasKit frees when its JS handle is garbage collected. Three
// leaks were measured in the browser build (scripts/perf-games.js, scripts/perf-rides.js):
//
// 1. GPU contexts. Each <Canvas> draws through CanvasKit.MakeWebGLCanvasSurface, which registers a
//    WebGL context handle in CanvasKit's (emscripten's) context table and makes a Skia GPU context
//    for it. When the Canvas unmounts, react-native-skia loses the WebGL context and deletes the
//    surface, but never deletes the GPU context or the handle. The table keeps the <canvas> element
//    alive, and with it the whole unmounted view tree it hung in. Every mini-game opened and closed
//    left five (Word Golf) or seven (Cargo Commander) contexts and 400 to 500 DOM nodes behind for
//    good; Chromium drops the oldest WebGL contexts once more than 16 are alive.
// 2. Paints. Every frame a canvas draws, react-native-skia's drawing context replaces its root paint
//    with a new Skia.Paint() and never deletes the old one, each nested group's pooled paint takes
//    a fresh copy (JsiSkPaint.assign) without deleting the paint it held, and every draw command
//    draws with a copy of the current paint (JsiSkPaint.copy) that nobody deletes. A CanvasKit paint
//    is not freed by garbage collection: about 36,000 paints a ride stayed in the WebAssembly heap.
// 3. Pictures. Every frame records a new picture and hands it to the view; the view drops the old
//    one without deleting it. Pictures are freed only when garbage collection gets to them, and
//    until then each holds the images it drew: an image the art cache disposed stayed in memory.
//
// The fixes keep react-native-skia's rendering as it is: the surface is made the same way through
// CanvasKit's public calls and its delete also frees its GPU context and handle; a paint replaced in
// its wrapper is deleted, and the last one when the wrapper is garbage collected (as CanvasKit
// already does for images and pictures); a view's previous picture is deleted once a new one
// replaces it. Native builds draw with Skia's own GPU context and JSI objects, not CanvasKit:
// skiaRelease.ts is a no-op there.
import { Skia } from '@shopify/react-native-skia';

interface Deletable {
  delete(): void;
}
interface GpuContext extends Deletable {
  releaseResourcesAndAbandonContext(): void;
}
interface CanvasKitGpu {
  MakeWebGLCanvasSurface(canvas: unknown, colorSpace?: unknown, attrs?: unknown): Deletable | null;
  GetWebGLContext(canvas: unknown, attrs?: unknown): number;
  MakeWebGLContext(handle: number): GpuContext | null;
  MakeOnScreenGLSurface(gpu: GpuContext, width: number, height: number, colorSpace: unknown): Deletable | null;
  deleteContext(handle: number): void;
  __releasesGpuContexts?: boolean;
}

const isCanvas = (c: unknown): c is { width: number; height: number } =>
  (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas);

/**
 * Wraps CanvasKit.MakeWebGLCanvasSurface so deleting a surface also frees its GPU context and
 * context handle. Returns whether it installed (false: no CanvasKit, already installed, or a
 * CanvasKit without these calls).
 */
export function installGpuContextRelease(ck: unknown): boolean {
  const kit = ck as CanvasKitGpu | undefined;
  if (!kit || kit.__releasesGpuContexts) return false;
  const original = kit.MakeWebGLCanvasSurface;
  if (typeof original !== 'function' || typeof kit.GetWebGLContext !== 'function' || typeof kit.MakeWebGLContext !== 'function' || typeof kit.MakeOnScreenGLSurface !== 'function' || typeof kit.deleteContext !== 'function') return false;
  kit.__releasesGpuContexts = true;
  kit.MakeWebGLCanvasSurface = function (canvas: unknown, colorSpace?: unknown, attrs?: unknown) {
    // Anything but a canvas element (an element id) goes the original way.
    if (!isCanvas(canvas)) return original.call(this, canvas, colorSpace, attrs);
    const handle = kit.GetWebGLContext(canvas, attrs);
    if (!handle || handle < 0) return original.call(this, canvas, colorSpace, attrs);
    const gpu = kit.MakeWebGLContext(handle);
    const surface = gpu ? kit.MakeOnScreenGLSurface(gpu, canvas.width, canvas.height, colorSpace ?? null) : null;
    if (!gpu || !surface) {
      // As before: let CanvasKit decide (it falls back to a software surface).
      gpu?.delete();
      kit.deleteContext(handle);
      return original.call(this, canvas, colorSpace, attrs);
    }
    const deleteSurface = surface.delete;
    let released = false;
    surface.delete = function () {
      deleteSurface.call(this);
      if (released) return;
      released = true;
      // react-native-skia has lost the WebGL context by now: abandon, so no GL call goes to it.
      try {
        gpu.releaseResourcesAndAbandonContext();
        gpu.delete();
      } finally {
        kit.deleteContext(handle);
      }
    };
    return surface;
  };
  return true;
}

interface Handle {
  delete(): void;
  isDeleted(): boolean;
}
interface PaintWrapper {
  ref?: unknown;
  dispose?: () => void;
}
interface SkiaApi {
  Paint: () => PaintWrapper;
  __releasesPaints?: boolean;
}

const isHandle = (h: unknown): h is Handle => typeof (h as Handle | null)?.delete === 'function' && typeof (h as Handle).isDeleted === 'function';
const free = (h: unknown) => {
  if (isHandle(h) && !h.isDeleted()) h.delete();
};

/**
 * Paints: the wrapper's assign() and reset() delete the CanvasKit paint they replace, and a paint
 * made by Skia.Paint() or a wrapper's copy() is deleted once its wrapper is garbage collected
 * (unless deleted already).
 */
export function installPaintRelease(api: unknown, Registry: typeof FinalizationRegistry | undefined = globalThis.FinalizationRegistry): boolean {
  const skia = api as SkiaApi | undefined;
  if (!skia || skia.__releasesPaints || typeof skia.Paint !== 'function' || typeof Registry !== 'function') return false;
  const make = skia.Paint;
  const probe = make.call(skia);
  const proto = Object.getPrototypeOf(probe) as Record<string, unknown> | null;
  free(probe.ref);
  if (!proto || !isHandle(probe.ref)) return false;
  skia.__releasesPaints = true;
  // What a wrapper holds now (assign and reset swap it), for the registry's callback: the box never
  // points back at the wrapper, so the wrapper can still be collected.
  const boxes = new WeakMap<object, { ref: unknown }>();
  const registry = new Registry<{ ref: unknown }>((box) => free(box.ref));
  for (const name of ['assign', 'reset']) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function (this: PaintWrapper, ...args: unknown[]) {
      const old = this.ref;
      const result = (original as (...a: unknown[]) => unknown).apply(this, args);
      if (old !== this.ref) {
        const box = boxes.get(this);
        if (box) box.ref = this.ref;
        free(old);
      }
      return result;
    };
  }
  const track = (paint: PaintWrapper) => {
    const box = { ref: paint.ref };
    boxes.set(paint, box);
    registry.register(paint, box);
    return paint;
  };
  skia.Paint = function () {
    return track(make.call(this));
  };
  // The player copies the current paint for every draw command of every frame (to apply opacity).
  const copy = proto.copy;
  if (typeof copy === 'function') {
    proto.copy = function (this: PaintWrapper) {
      return track((copy as () => PaintWrapper).call(this));
    };
  }
  return true;
}

interface ViewApi {
  setJsiProperty(nativeId: unknown, name: string, value: unknown): void;
  deferedPictures?: Record<string, unknown>;
  __releasesPictures?: boolean;
}

/** Deletes a view's previous picture once a new one replaces it (it is never drawn again). */
export function installPictureRelease(api: unknown): boolean {
  const views = api as ViewApi | undefined;
  if (!views || views.__releasesPictures || typeof views.setJsiProperty !== 'function') return false;
  views.__releasesPictures = true;
  const shown = new Map<string, { dispose?: () => void }>();
  const set = views.setJsiProperty;
  views.setJsiProperty = function (nativeId: unknown, name: string, value: unknown) {
    set.call(this, nativeId, name, value);
    if (name !== 'picture') return;
    const id = String(nativeId);
    const previous = shown.get(id);
    shown.set(id, value as { dispose?: () => void });
    if (previous && previous !== value && previous !== views.deferedPictures?.[id]) previous.dispose?.();
  };
  return true;
}

/** Installs all three. Call once CanvasKit has loaded, before any Skia Canvas mounts. */
export function installSkiaRelease(): boolean {
  const g = globalThis as { CanvasKit?: unknown; SkiaViewApi?: unknown };
  const gpu = installGpuContextRelease(g.CanvasKit);
  const paints = installPaintRelease(Skia);
  const pictures = installPictureRelease(g.SkiaViewApi);
  return gpu || paints || pictures;
}
