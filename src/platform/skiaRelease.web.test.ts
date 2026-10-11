// The browser build's Skia memory release (M9.1) against stand-ins for CanvasKit, the Skia API and
// the view registry: a surface made for a canvas element frees its GPU context and context handle
// when deleted, once (anything else goes the original way); a paint replaced in its wrapper is
// deleted, the last one when the wrapper is collected; a view's previous picture is deleted when a
// new one replaces it, never a picture still waiting for its view. Safety: the three patches install
// together or not at all (an unsupported version, a missing private symbol or a failure halfway
// installs nothing), and a failing delete never breaks the call it rides on. The real installed
// modules are checked in skiaRelease.contract.test.ts; the real CanvasKit's memory is measured with
// scripts/perf-games.js and scripts/perf-rides.js.
import { installSkiaRelease, SUPPORTED_SKIA_VERSIONS, type SkiaReleaseEnv } from './skiaRelease.web';

jest.mock('@shopify/react-native-skia', () => ({ Skia: {} }));

class FakeCanvas {
  width = 300;
  height = 200;
}
const g = globalThis as { HTMLCanvasElement?: unknown };
const hadCanvas = 'HTMLCanvasElement' in g;
const savedCanvas = g.HTMLCanvasElement;
beforeAll(() => {
  g.HTMLCanvasElement = FakeCanvas;
});
afterAll(() => {
  if (hadCanvas) g.HTMLCanvasElement = savedCanvas;
  else delete g.HTMLCanvasElement;
});

function fakeKit({ surfaceFails = false, abandonThrows = false } = {}) {
  const log: string[] = [];
  let next = 1;
  const kit = {
    MakeWebGLCanvasSurface: jest.fn((_canvas: unknown) => {
      log.push('original');
      return { delete: () => log.push('original surface deleted') };
    }),
    GetWebGLContext: jest.fn(() => next++),
    MakeWebGLContext: jest.fn((handle: number) => ({
      releaseResourcesAndAbandonContext: () => {
        log.push(`abandon gpu ${handle}`);
        if (abandonThrows) throw new Error('context lost');
      },
      delete: () => log.push(`delete gpu ${handle}`),
    })),
    MakeOnScreenGLSurface: jest.fn((_gpu: unknown, w: number, h: number) => (surfaceFails ? null : { size: [w, h], delete: () => log.push('surface deleted') })),
    deleteContext: jest.fn((handle: number) => log.push(`delete handle ${handle}`)),
    GrDirectContext: class {
      releaseResourcesAndAbandonContext() {}
      delete() {}
    },
  };
  return { kit, log };
}

/** A fresh paint class per test: the paint patch changes the class's prototype. */
function fakePaints({ deleteThrows = false } = {}) {
  const counts = { live: 0 };
  class FakeHandle {
    deleted = false;
    constructor() {
      counts.live += 1;
    }
    copy() {
      return new FakeHandle();
    }
    delete() {
      if (deleteThrows) throw new Error('wasm delete failed');
      if (this.deleted) throw new Error('deleted twice');
      this.deleted = true;
      counts.live -= 1;
    }
    isDeleted() {
      return this.deleted;
    }
  }
  class FakePaint {
    constructor(public ref: FakeHandle) {}
    assign(p: FakePaint) {
      this.ref = p.ref.copy();
      return 'assigned';
    }
    reset() {
      this.ref = new FakeHandle();
    }
    copy() {
      return new FakePaint(this.ref.copy());
    }
    dispose() {
      this.ref.delete();
    }
  }
  const api = { Paint: () => new FakePaint(new FakeHandle()) };
  return { api, counts, FakePaint };
}

/** A FinalizationRegistry stand-in whose collection the test triggers. */
function fakeRegistry() {
  const entries: { target: object; collect: () => void }[] = [];
  class Registry<T> {
    constructor(private readonly cb: (held: T) => void) {}
    register(target: object, held: T) {
      entries.push({ target, collect: () => this.cb(held) });
    }
  }
  return { Registry: Registry as unknown as typeof FinalizationRegistry, collect: (target: object) => entries.filter((e) => e.target === target).forEach((e) => e.collect()) };
}

type ViewApiStandIn = {
  views: Record<string, boolean>;
  deferedPictures: Record<string, unknown>;
  drawn: Record<string, unknown>;
  setJsiProperty(id: unknown, name: string, value: unknown): unknown;
};
function fakeViewApi(): ViewApiStandIn {
  return {
    views: { '1': true },
    deferedPictures: {},
    drawn: {},
    setJsiProperty(this: ViewApiStandIn, id: unknown, name: string, value: unknown) {
      if (name !== 'picture') return 'not a picture';
      if (!this.views[String(id)]) this.deferedPictures[String(id)] = value;
      else this.drawn[String(id)] = value;
      return 'set';
    },
  };
}

/** A complete stand-in environment, with one part swapped as a test needs. */
function setup(over: { kit?: ReturnType<typeof fakeKit>; paints?: ReturnType<typeof fakePaints>; env?: Partial<SkiaReleaseEnv> } = {}) {
  const gpu = over.kit ?? fakeKit();
  const paints = over.paints ?? fakePaints();
  const views = fakeViewApi();
  const reg = fakeRegistry();
  const warn = jest.fn();
  const env: Partial<SkiaReleaseEnv> = { version: '2.6.2', canvasKit: gpu.kit, skia: paints.api, viewApi: views, Registry: reg.Registry, warn, ...over.env };
  const originals = { surface: gpu.kit.MakeWebGLCanvasSurface, paint: paints.api.Paint, assign: paints.FakePaint.prototype.assign, reset: paints.FakePaint.prototype.reset, copy: paints.FakePaint.prototype.copy, set: views.setJsiProperty };
  /** True when nothing at all was changed. */
  const untouched = () =>
    gpu.kit.MakeWebGLCanvasSurface === originals.surface &&
    paints.api.Paint === originals.paint &&
    paints.FakePaint.prototype.assign === originals.assign &&
    paints.FakePaint.prototype.reset === originals.reset &&
    paints.FakePaint.prototype.copy === originals.copy &&
    views.setJsiProperty === originals.set &&
    !('__releasesGpuContexts' in gpu.kit) &&
    !('__releasesPaints' in paints.api) &&
    !('__releasesPictures' in views);
  return { gpu, paints, views, reg, warn, env, untouched, install: () => installSkiaRelease(env) };
}

// ---------- install: all or nothing ----------

it('supports exactly react-native-skia 2.6.2', () => {
  expect(SUPPORTED_SKIA_VERSIONS).toEqual(['2.6.2']);
});

it('installs all three once, and the second call changes nothing', () => {
  const s = setup();
  expect(s.install()).toEqual({ installed: true, status: 'installed', version: '2.6.2' });
  expect(s.untouched()).toBe(false);
  const surface = s.gpu.kit.MakeWebGLCanvasSurface;
  expect(s.install()).toMatchObject({ installed: false, status: 'already-installed' });
  expect(s.gpu.kit.MakeWebGLCanvasSurface).toBe(surface);
  expect(s.warn).not.toHaveBeenCalled();
});

it('an unsupported or unreadable react-native-skia version installs nothing and warns once', () => {
  for (const version of ['2.6.3', '3.0.0', undefined, 262]) {
    const s = setup({ env: { version } });
    const result = s.install();
    expect(result).toMatchObject({ installed: false, status: 'unsupported-version', version: typeof version === 'string' ? version : null });
    expect(s.untouched()).toBe(true);
    expect(s.warn).toHaveBeenCalledTimes(1);
    expect(s.warn.mock.calls[0]?.[0]).toMatch(/NOT installed/);
  }
});

it('a missing private symbol installs none of the three patches and warns once', () => {
  const cases: [string, (s: ReturnType<typeof setup>) => void][] = [
    ['CanvasKit', (s) => (s.env.canvasKit = undefined)],
    ['CanvasKit.deleteContext', (s) => delete (s.gpu.kit as Partial<typeof s.gpu.kit>).deleteContext],
    ['CanvasKit.MakeOnScreenGLSurface', (s) => delete (s.gpu.kit as Partial<typeof s.gpu.kit>).MakeOnScreenGLSurface],
    ['CanvasKit.GrDirectContext.prototype.releaseResourcesAndAbandonContext', (s) => (s.gpu.kit.GrDirectContext = class {} as typeof s.gpu.kit.GrDirectContext)],
    ['JsiSkPaint.prototype.copy', (s) => delete (s.paints.FakePaint.prototype as Partial<InstanceType<typeof s.paints.FakePaint>>).copy],
    ['JsiSkPaint.prototype.assign', (s) => delete (s.paints.FakePaint.prototype as Partial<InstanceType<typeof s.paints.FakePaint>>).assign],
    ['Skia.Paint', (s) => (s.env.skia = {})],
    ['FinalizationRegistry', (s) => (s.env.Registry = undefined)],
    ['SkiaViewApi.setJsiProperty', (s) => delete (s.views as Partial<ViewApiStandIn>).setJsiProperty],
    ['SkiaViewApi.deferedPictures', (s) => delete (s.views as Partial<ViewApiStandIn>).deferedPictures],
  ];
  for (const [symbol, remove] of cases) {
    const s = setup();
    remove(s);
    // The untouched() check compares against what is there after the removal.
    const before = { surface: s.gpu.kit.MakeWebGLCanvasSurface, paint: s.paints.api.Paint, assign: s.paints.FakePaint.prototype.assign, set: s.views.setJsiProperty };
    const result = s.install();
    expect(result.status).toBe('missing-symbols');
    expect(result.installed).toBe(false);
    expect(result.missing).toContain(symbol);
    expect(s.warn).toHaveBeenCalledTimes(1);
    expect({ surface: s.gpu.kit.MakeWebGLCanvasSurface, paint: s.paints.api.Paint, assign: s.paints.FakePaint.prototype.assign, set: s.views.setJsiProperty }).toEqual(before);
    expect('__releasesGpuContexts' in s.gpu.kit || '__releasesPaints' in s.paints.api || '__releasesPictures' in s.views).toBe(false);
  }
});

it('a failure halfway through installing puts back everything already patched', () => {
  const s = setup();
  // The picture patch comes last: make its target refuse the new function.
  const set = s.views.setJsiProperty;
  Object.defineProperty(s.views, 'setJsiProperty', { value: set, writable: false });
  expect(s.install()).toMatchObject({ installed: false, status: 'failed' });
  expect(s.untouched()).toBe(true);
  expect(s.warn).toHaveBeenCalledTimes(1);
});

it('the default warning is development only, once per message, and installing never throws', () => {
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    // Real defaults: the installed package.json's version, no CanvasKit or view registry in Jest.
    const first = installSkiaRelease();
    expect(first).toMatchObject({ installed: false, status: 'missing-symbols', version: SUPPORTED_SKIA_VERSIONS[0] });
    installSkiaRelease();
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
  const s = setup({ env: { version: '0.0.0', warn: () => { throw new Error('no console'); } } });
  expect(() => s.install()).not.toThrow();
  expect(s.untouched()).toBe(true);
});

// ---------- GPU contexts ----------

it('a canvas surface frees its GPU context and context handle when deleted, once', () => {
  const s = setup();
  s.install();
  const { kit, log } = s.gpu;
  const surface = kit.MakeWebGLCanvasSurface(new FakeCanvas()) as unknown as { size: number[]; delete: () => void };
  expect(surface.size).toEqual([300, 200]);
  expect(log).toEqual([]);
  surface.delete();
  expect(log).toEqual(['surface deleted', 'abandon gpu 1', 'delete gpu 1', 'delete handle 1']);
  surface.delete();
  expect(log.filter((l) => l.startsWith('delete handle'))).toHaveLength(1);
});

it('each canvas has its own context: deleting one surface leaves the other drawing', () => {
  const s = setup();
  s.install();
  const { kit, log } = s.gpu;
  const a = kit.MakeWebGLCanvasSurface(new FakeCanvas()) as unknown as { delete: () => void };
  kit.MakeWebGLCanvasSurface(new FakeCanvas());
  a.delete();
  expect(log).toEqual(['surface deleted', 'abandon gpu 1', 'delete gpu 1', 'delete handle 1']);
});

it('an element id, or a canvas that gets no GPU surface, goes the original way (nothing left behind)', () => {
  const s = setup({ kit: fakeKit({ surfaceFails: true }) });
  s.install();
  const { kit, log } = s.gpu;
  kit.MakeWebGLCanvasSurface('some-id');
  expect(log).toEqual(['original']);
  log.length = 0;
  kit.MakeWebGLCanvasSurface(new FakeCanvas());
  expect(log).toEqual(['delete gpu 1', 'delete handle 1', 'original']);
});

it('a throwing GPU release still deletes the surface, frees the rest, and never throws', () => {
  const s = setup({ kit: fakeKit({ abandonThrows: true }) });
  s.install();
  const { kit, log } = s.gpu;
  const surface = kit.MakeWebGLCanvasSurface(new FakeCanvas()) as unknown as { delete: () => void };
  expect(() => surface.delete()).not.toThrow();
  expect(log).toEqual(['surface deleted', 'abandon gpu 1', 'delete gpu 1', 'delete handle 1']);
  expect(s.warn).toHaveBeenCalledTimes(1);
});

it('a GPU context call that throws while making a surface falls back to the original call', () => {
  const s = setup();
  s.install();
  const { kit, log } = s.gpu;
  kit.MakeWebGLContext.mockImplementationOnce(() => {
    throw new Error('no WebGL');
  });
  const made = kit.MakeWebGLCanvasSurface(new FakeCanvas());
  expect(log).toEqual(['delete handle 1', 'original']);
  expect(made).toBeTruthy();
});

// ---------- paints ----------

it('paints: a paint replaced by assign or reset is deleted at once; the last one, and a copy, when its wrapper is collected', () => {
  const s = setup();
  expect(s.install().installed).toBe(true);
  const { api, counts } = s.paints;
  expect(counts.live).toBe(0); // the probe paint made at install is gone
  const root = api.Paint();
  const pooled = api.Paint();
  expect(counts.live).toBe(2);
  for (let frame = 0; frame < 5; frame++) expect(pooled.assign(root)).toBe('assigned');
  expect(counts.live).toBe(2);
  pooled.reset();
  expect(counts.live).toBe(2);
  // The wrapper is collected: the paint it holds now (not the one it was made with) is deleted.
  s.reg.collect(pooled);
  expect(pooled.ref.deleted).toBe(true);
  expect(counts.live).toBe(1);
  // A copy for one draw command is deleted when its wrapper is collected.
  const drawCopy = root.copy();
  expect(counts.live).toBe(2);
  s.reg.collect(drawCopy);
  expect(counts.live).toBe(1);
  // A paint disposed by its owner is not deleted again when its wrapper goes.
  root.dispose();
  expect(() => s.reg.collect(root)).not.toThrow();
  expect(counts.live).toBe(0);
});

it('paints: a throwing delete never breaks assign, reset, copy or collection', () => {
  const s = setup({ paints: fakePaints({ deleteThrows: true }) });
  expect(s.install().installed).toBe(true);
  const { api, FakePaint } = s.paints;
  const root = api.Paint();
  const pooled = api.Paint();
  const held = pooled.ref;
  expect(pooled.assign(root)).toBe('assigned');
  expect(pooled.ref).not.toBe(held);
  expect(() => pooled.reset()).not.toThrow();
  expect(root.copy()).toBeInstanceOf(FakePaint);
  expect(() => s.reg.collect(pooled)).not.toThrow();
  expect(s.warn).toHaveBeenCalledTimes(1);
});

// ---------- pictures ----------

it('pictures: the previous picture of a view is deleted when a new one is set, never a deferred one', () => {
  const s = setup();
  s.install();
  const api = s.views;
  const pic = (n: number) => ({ n, dispose: jest.fn() });
  const [a, b, c] = [pic(1), pic(2), pic(3)];
  expect(api.setJsiProperty(1, 'picture', a)).toBe('set');
  api.setJsiProperty(1, 'picture', b);
  expect(a.dispose).toHaveBeenCalledTimes(1);
  expect(b.dispose).not.toHaveBeenCalled();
  api.setJsiProperty(1, 'picture', b); // the same picture again: kept
  expect(b.dispose).not.toHaveBeenCalled();
  api.setJsiProperty(1, 'picture', c);
  expect(b.dispose).toHaveBeenCalledTimes(1);
  expect(api.drawn['1']).toBe(c);
  expect(api.setJsiProperty(1, 'onSize', null)).toBe('not a picture');
  // A view not registered yet keeps its deferred picture (it draws it when it registers).
  const [d, e] = [pic(4), pic(5)];
  api.setJsiProperty(2, 'picture', d);
  api.setJsiProperty(2, 'picture', e);
  expect(d.dispose).toHaveBeenCalledTimes(1);
  expect(e.dispose).not.toHaveBeenCalled();
  api.views['2'] = true;
  api.setJsiProperty(2, 'picture', pic(6));
  // The deferred picture stays (the registry may hand it to the view again on a re-register).
  expect(e.dispose).not.toHaveBeenCalled();
});

it('pictures: a throwing dispose still sets the new picture and returns the original result', () => {
  const s = setup();
  s.install();
  const api = s.views;
  const bad = { dispose: () => { throw new Error('already gone'); } };
  const next = { dispose: jest.fn() };
  api.setJsiProperty(1, 'picture', bad);
  expect(api.setJsiProperty(1, 'picture', next)).toBe('set');
  expect(api.drawn['1']).toBe(next);
  api.setJsiProperty(1, 'picture', bad);
  api.setJsiProperty(1, 'picture', { dispose: jest.fn() }); // bad throws again: reported only once
  expect(s.warn).toHaveBeenCalledTimes(1);
});
