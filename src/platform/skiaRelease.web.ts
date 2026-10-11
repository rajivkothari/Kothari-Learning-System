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
//
// Safety (D174 follow-up): these patches key on react-native-skia's private web internals, so they
// install only on a react-native-skia version in SUPPORTED_SKIA_VERSIONS, and only after a preflight
// found every private symbol all three patches need. Anything else installs nothing at all (never
// one patch without the others) and logs one development warning; it never throws. If applying the
// patches throws halfway, everything already changed is put back. Inside the patched functions the
// original call always runs and its value is returned; the extra deletes are guarded, so a failing
// delete never breaks rendering. skiaRelease.contract.test.ts checks the installed modules.
import { Skia } from '@shopify/react-native-skia';
// No "exports" field in react-native-skia's package.json, so Metro (web) and Jest both resolve it.
import skiaPackage from '@shopify/react-native-skia/package.json';

// Type only: the result type lives with the native no-op, which types every caller.
import type { installSkiaRelease as NativeInstall, SkiaReleaseResult } from './skiaRelease';

/**
 * The react-native-skia versions whose web internals these patches were written and measured
 * against. Add a version only after re-running scripts/perf-rides.js, scripts/perf-games.js,
 * npm run web:e2e and the memory checks on it (see D174).
 */
export const SUPPORTED_SKIA_VERSIONS: readonly string[] = ['2.6.2'];

/** What installSkiaRelease patches. Tests pass stand-ins; the app uses the defaults. */
export interface SkiaReleaseEnv {
  /** The installed react-native-skia version (default: its package.json). */
  version: unknown;
  /** CanvasKit (default: globalThis.CanvasKit, set by LoadSkiaWeb). */
  canvasKit: unknown;
  /** The Skia API (default: react-native-skia's Skia). */
  skia: unknown;
  /** The web view registry (default: globalThis.SkiaViewApi). */
  viewApi: unknown;
  Registry: typeof FinalizationRegistry | undefined;
  /** Default: console.warn in development builds only, each message once per page. */
  warn: (message: string) => void;
}

const TAG = '[skiaRelease]';
const devWarned = new Set<string>();
function devWarn(message: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__ || devWarned.has(message)) return;
  devWarned.add(message);
  console.warn(message);
}

function defaultEnv(): SkiaReleaseEnv {
  const g = globalThis as { CanvasKit?: unknown; SkiaViewApi?: unknown };
  return {
    version: (skiaPackage as { version?: unknown } | undefined)?.version,
    canvasKit: g.CanvasKit,
    skia: Skia,
    viewApi: g.SkiaViewApi,
    Registry: globalThis.FinalizationRegistry,
    warn: devWarn,
  };
}

// ---------- shared helpers ----------

type Fn = (...args: unknown[]) => unknown;
const isFn = (v: unknown): v is Fn => typeof v === 'function';
const isObj = (v: unknown): v is Record<string, unknown> => (typeof v === 'object' || typeof v === 'function') && v !== null;

interface Handle {
  delete(): void;
  isDeleted(): boolean;
}
const isHandle = (h: unknown): h is Handle => isObj(h) && isFn(h.delete) && isFn(h.isDeleted);

/** Runs one of our extra deletes. A failure is reported (once per install) and swallowed. */
type Guard = (what: string, action: () => void) => void;

/** Every property the install changes, so a failure halfway can put all of it back. */
class PatchLog {
  private readonly undo: (() => void)[] = [];
  set(target: Record<string, unknown>, key: string, value: unknown): void {
    const had = Object.prototype.hasOwnProperty.call(target, key);
    const before = target[key];
    this.undo.push(() => {
      if (had) target[key] = before;
      else delete target[key];
    });
    target[key] = value;
    // A read-only property ignores the write outside strict mode: that is a failure too.
    if (target[key] !== value) throw new Error(`could not replace ${key}`);
  }
  rollback(): void {
    for (const step of this.undo.reverse()) {
      try {
        step();
      } catch {
        // Best effort: keep restoring the rest.
      }
    }
  }
}

// ---------- 1. GPU contexts ----------

interface GpuContext {
  delete(): void;
  releaseResourcesAndAbandonContext(): void;
}
interface Surface {
  delete(): void;
}
interface CanvasKitGpu {
  MakeWebGLCanvasSurface(canvas: unknown, colorSpace?: unknown, attrs?: unknown): Surface | null;
  GetWebGLContext(canvas: unknown, attrs?: unknown): number;
  MakeWebGLContext(handle: number): GpuContext | null;
  MakeOnScreenGLSurface(gpu: GpuContext, width: number, height: number, colorSpace: unknown): Surface | null;
  deleteContext(handle: number): void;
  __releasesGpuContexts?: boolean;
}

const GPU_CALLS = ['MakeWebGLCanvasSurface', 'GetWebGLContext', 'MakeWebGLContext', 'MakeOnScreenGLSurface', 'deleteContext'] as const;

function preflightGpu(ck: unknown): string[] {
  if (!isObj(ck)) return ['CanvasKit'];
  const missing: string[] = GPU_CALLS.filter((name) => !isFn(ck[name])).map((name) => `CanvasKit.${name}`);
  // MakeWebGLContext's result is a GrDirectContext; check its class without making a context.
  const grProto = isObj(ck.GrDirectContext) ? (ck.GrDirectContext as { prototype?: unknown }).prototype : undefined;
  for (const name of ['releaseResourcesAndAbandonContext', 'delete']) {
    if (!isObj(grProto) || !isFn(grProto[name])) missing.push(`CanvasKit.GrDirectContext.prototype.${name}`);
  }
  return missing;
}

const isCanvas = (c: unknown): c is { width: number; height: number } =>
  (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas);

/** Wraps MakeWebGLCanvasSurface so deleting a surface also frees its GPU context and context handle. */
function applyGpu(kit: CanvasKitGpu, log: PatchLog, guard: Guard): void {
  const original = kit.MakeWebGLCanvasSurface;
  const target = kit as unknown as Record<string, unknown>;
  log.set(target, '__releasesGpuContexts', true);
  log.set(target, 'MakeWebGLCanvasSurface', function (this: unknown, canvas: unknown, colorSpace?: unknown, attrs?: unknown) {
    // Anything but a canvas element (an element id) goes the original way.
    if (!isCanvas(canvas)) return original.call(this, canvas, colorSpace, attrs);
    // Assigned inside the guard (the casts keep TypeScript from narrowing them to null).
    let handle = 0 as number;
    let gpu = null as GpuContext | null;
    let surface = null as Surface | null;
    guard('making a GPU surface', () => {
      handle = kit.GetWebGLContext(canvas, attrs);
      if (!handle || handle < 0) return;
      gpu = kit.MakeWebGLContext(handle);
      if (gpu) surface = kit.MakeOnScreenGLSurface(gpu, canvas.width, canvas.height, colorSpace ?? null);
    });
    if (!gpu || !surface) {
      // As before: let CanvasKit decide (it falls back to a software surface).
      const made = gpu;
      if (made) guard('GrDirectContext.delete', () => made.delete());
      if (handle > 0) guard('CanvasKit.deleteContext', () => kit.deleteContext(handle));
      return original.call(this, canvas, colorSpace, attrs);
    }
    const context = gpu;
    const madeSurface = surface;
    const deleteSurface = madeSurface.delete;
    let released = false;
    guard('wrapping Surface.delete', () => {
      madeSurface.delete = function (this: unknown) {
        try {
          return deleteSurface.call(this);
        } finally {
          if (!released) {
            released = true;
            // react-native-skia has lost the WebGL context by now: abandon, so no GL call goes to it.
            guard('GrDirectContext.releaseResourcesAndAbandonContext', () => context.releaseResourcesAndAbandonContext());
            guard('GrDirectContext.delete', () => context.delete());
            guard('CanvasKit.deleteContext', () => kit.deleteContext(handle));
          }
        }
      };
    });
    return madeSurface;
  });
}

// ---------- 2. Paints ----------

interface PaintWrapper {
  ref?: unknown;
}
interface SkiaApi {
  Paint: () => PaintWrapper;
  __releasesPaints?: boolean;
}

const PAINT_METHODS = ['assign', 'reset', 'copy'] as const;

/** Makes (and frees again) one probe paint: the wrapper's prototype is only reachable from a paint. */
function preflightPaint(api: unknown, Registry: unknown): { missing: string[]; proto?: Record<string, unknown> } {
  const missing: string[] = [];
  if (!isFn(Registry)) missing.push('FinalizationRegistry');
  if (!isObj(api) || !isFn(api.Paint)) return { missing: [...missing, 'Skia.Paint'] };
  let probe: unknown;
  try {
    probe = api.Paint.call(api);
  } catch {
    return { missing: [...missing, 'Skia.Paint() (threw)'] };
  }
  const proto = isObj(probe) ? (Object.getPrototypeOf(probe) as unknown) : null;
  const ref = isObj(probe) ? probe.ref : undefined;
  try {
    if (isHandle(ref) && !ref.isDeleted()) ref.delete();
  } catch {
    // The probe is one paint; failing to free it changes nothing else.
  }
  if (!isObj(proto)) return { missing: [...missing, 'JsiSkPaint.prototype'] };
  for (const name of PAINT_METHODS) if (!isFn(proto[name])) missing.push(`JsiSkPaint.prototype.${name}`);
  if (!isHandle(ref)) missing.push('JsiSkPaint.ref (a CanvasKit Paint with delete and isDeleted)');
  return { missing, proto };
}

/**
 * Paints: the wrapper's assign() and reset() delete the CanvasKit paint they replace, and a paint
 * made by Skia.Paint() or a wrapper's copy() is deleted once its wrapper is garbage collected
 * (unless deleted already).
 */
function applyPaint(skia: SkiaApi, proto: Record<string, unknown>, Registry: typeof FinalizationRegistry, log: PatchLog, guard: Guard): void {
  const free = (h: unknown) => {
    if (isHandle(h)) guard('Paint.delete', () => (h.isDeleted() ? undefined : h.delete()));
  };
  // What a wrapper holds now (assign and reset swap it), for the registry's callback: the box never
  // points back at the wrapper, so the wrapper can still be collected.
  const boxes = new WeakMap<object, { ref: unknown }>();
  const registry = new Registry<{ ref: unknown }>((box) => free(box.ref));
  const track = (paint: PaintWrapper) => {
    guard('tracking a paint', () => {
      const box = { ref: paint.ref };
      registry.register(paint, box);
      boxes.set(paint, box);
    });
    return paint;
  };
  const target = skia as unknown as Record<string, unknown>;
  log.set(target, '__releasesPaints', true);
  for (const name of ['assign', 'reset'] as const) {
    const original = proto[name] as Fn;
    log.set(proto, name, function (this: PaintWrapper, ...args: unknown[]) {
      const old = this.ref;
      const result = original.apply(this, args);
      if (old !== this.ref) {
        const box = boxes.get(this);
        if (box) box.ref = this.ref;
        free(old);
      }
      return result;
    });
  }
  // The player copies the current paint for every draw command of every frame (to apply opacity).
  const copy = proto.copy as (this: PaintWrapper) => PaintWrapper;
  log.set(proto, 'copy', function (this: PaintWrapper) {
    return track(copy.call(this));
  });
  const make = skia.Paint;
  log.set(target, 'Paint', function (this: unknown) {
    return track(make.call(this));
  });
}

// ---------- 3. Pictures ----------

interface ViewApi {
  setJsiProperty(nativeId: unknown, name: string, value: unknown): unknown;
  deferedPictures: Record<string, unknown>;
  __releasesPictures?: boolean;
}

function preflightPicture(api: unknown): string[] {
  if (!isObj(api)) return ['SkiaViewApi'];
  const missing: string[] = [];
  if (!isFn(api.setJsiProperty)) missing.push('SkiaViewApi.setJsiProperty');
  // Spelled as upstream spells it.
  if (!isObj(api.deferedPictures)) missing.push('SkiaViewApi.deferedPictures');
  return missing;
}

/** Deletes a view's previous picture once a new one replaces it (it is never drawn again). */
function applyPicture(views: ViewApi, log: PatchLog, guard: Guard): void {
  const target = views as unknown as Record<string, unknown>;
  const shown = new Map<string, unknown>();
  const set = views.setJsiProperty;
  log.set(target, '__releasesPictures', true);
  log.set(target, 'setJsiProperty', function (this: unknown, nativeId: unknown, name: string, value: unknown) {
    const result = set.call(this, nativeId, name, value);
    if (name === 'picture') {
      guard('Picture.dispose', () => {
        const id = String(nativeId);
        const previous = shown.get(id);
        shown.set(id, value);
        if (previous && previous !== value && previous !== views.deferedPictures?.[id]) (previous as { dispose?: () => void }).dispose?.();
      });
    }
    return result;
  });
}

// ---------- install ----------

/**
 * Lists the private symbols the three patches need that are missing (empty: all present). Makes
 * and frees one probe paint; changes nothing else.
 */
export function preflightSkiaRelease(env: Pick<SkiaReleaseEnv, 'canvasKit' | 'skia' | 'viewApi' | 'Registry'>): string[] {
  return [...preflightGpu(env.canvasKit), ...preflightPaint(env.skia, env.Registry).missing, ...preflightPicture(env.viewApi)];
}

/**
 * Installs all three releases, or none. Call once CanvasKit has loaded, before any Skia Canvas
 * mounts. Never throws.
 */
export function installSkiaRelease(overrides: Partial<SkiaReleaseEnv> = {}): SkiaReleaseResult {
  const env: SkiaReleaseEnv = { ...defaultEnv(), ...overrides };
  const version = typeof env.version === 'string' ? env.version : null;
  try {
    if (version === null || !SUPPORTED_SKIA_VERSIONS.includes(version)) {
      env.warn(
        `${TAG} react-native-skia ${version ?? '(version unreadable)'} is not in SUPPORTED_SKIA_VERSIONS (${SUPPORTED_SKIA_VERSIONS.join(', ')}). ` +
          'The browser memory release is NOT installed, so WebGL contexts, paints and pictures leak as before D174. ' +
          'Re-run scripts/perf-rides.js, scripts/perf-games.js and npm run web:e2e on this version, then add it in src/platform/skiaRelease.web.ts.',
      );
      return { installed: false, status: 'unsupported-version', version };
    }
    const kit = env.canvasKit as CanvasKitGpu | undefined;
    const skia = env.skia as SkiaApi | undefined;
    const views = env.viewApi as ViewApi | undefined;
    if (kit?.__releasesGpuContexts || skia?.__releasesPaints || views?.__releasesPictures) return { installed: false, status: 'already-installed', version };

    const gpuMissing = preflightGpu(kit);
    const paint = preflightPaint(skia, env.Registry);
    const missing = [...gpuMissing, ...paint.missing, ...preflightPicture(views)];
    if (missing.length > 0 || !paint.proto || !kit || !skia || !views || !env.Registry) {
      env.warn(`${TAG} react-native-skia ${version}: private symbols missing (${missing.join(', ')}). The browser memory release is NOT installed (none of its three patches).`);
      return { installed: false, status: 'missing-symbols', version, missing };
    }

    let reported = false;
    const guard: Guard = (what, action) => {
      try {
        action();
      } catch (error) {
        if (reported) return;
        reported = true;
        try {
          env.warn(`${TAG} ${what} failed (later failures are not reported): ${String(error)}`);
        } catch {
          // A warning must never break rendering either.
        }
      }
    };
    const log = new PatchLog();
    try {
      applyGpu(kit, log, guard);
      applyPaint(skia, paint.proto, env.Registry, log, guard);
      applyPicture(views, log, guard);
    } catch (error) {
      log.rollback();
      env.warn(`${TAG} installing failed and was undone, nothing is installed: ${String(error)}`);
      return { installed: false, status: 'failed', version };
    }
    return { installed: true, status: 'installed', version };
  } catch {
    // Only a throwing warn() gets here (before anything is patched, or after a rollback);
    // installing must never throw.
    return { installed: false, status: 'failed', version };
  }
}

// Callers are typed by skiaRelease.ts (TypeScript does not know platform files): tsc fails here if
// this export stops fitting the native signature.
void (installSkiaRelease satisfies typeof NativeInstall);
