// The browser build's Skia memory release (M9.1) against stand-ins for CanvasKit, the Skia API and
// the view registry: a surface made for a canvas element frees its GPU context and context handle
// when deleted, once (anything else goes the original way); a paint replaced in its wrapper is
// deleted, the last one when the wrapper is collected; a view's previous picture is deleted when a
// new one replaces it, never a picture still waiting for its view. The real CanvasKit is measured
// with scripts/perf-games.js and scripts/perf-rides.js.
import { installGpuContextRelease, installPaintRelease, installPictureRelease } from './skiaRelease.web';

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

function fakeKit({ surfaceFails = false } = {}) {
  const log: string[] = [];
  let next = 1;
  const kit = {
    MakeWebGLCanvasSurface: jest.fn((_canvas: unknown) => {
      log.push('original');
      return { delete: () => log.push('original surface deleted') };
    }),
    GetWebGLContext: jest.fn(() => next++),
    MakeWebGLContext: jest.fn((handle: number) => ({
      releaseResourcesAndAbandonContext: () => log.push(`abandon gpu ${handle}`),
      delete: () => log.push(`delete gpu ${handle}`),
    })),
    MakeOnScreenGLSurface: jest.fn((_gpu: unknown, w: number, h: number) => (surfaceFails ? null : { size: [w, h], delete: () => log.push('surface deleted') })),
    deleteContext: jest.fn((handle: number) => log.push(`delete handle ${handle}`)),
  };
  return { kit, log };
}

it('installs once, and not without a CanvasKit that has the calls it needs', () => {
  const { kit } = fakeKit();
  expect(installGpuContextRelease(undefined)).toBe(false);
  expect(installGpuContextRelease({})).toBe(false);
  expect(installGpuContextRelease(kit)).toBe(true);
  expect(installGpuContextRelease(kit)).toBe(false);
});

it('a canvas surface frees its GPU context and context handle when deleted, once', () => {
  const { kit, log } = fakeKit();
  installGpuContextRelease(kit);
  const surface = kit.MakeWebGLCanvasSurface(new FakeCanvas()) as unknown as { size: number[]; delete: () => void };
  expect(surface.size).toEqual([300, 200]);
  expect(log).toEqual([]);
  surface.delete();
  expect(log).toEqual(['surface deleted', 'abandon gpu 1', 'delete gpu 1', 'delete handle 1']);
  surface.delete();
  expect(log.filter((l) => l.startsWith('delete handle'))).toHaveLength(1);
});

it('each canvas has its own context: deleting one surface leaves the other drawing', () => {
  const { kit, log } = fakeKit();
  installGpuContextRelease(kit);
  const a = kit.MakeWebGLCanvasSurface(new FakeCanvas()) as unknown as { delete: () => void };
  kit.MakeWebGLCanvasSurface(new FakeCanvas());
  a.delete();
  expect(log).toEqual(['surface deleted', 'abandon gpu 1', 'delete gpu 1', 'delete handle 1']);
});

it('an element id, or a canvas that gets no GPU surface, goes the original way (nothing left behind)', () => {
  const { kit, log } = fakeKit({ surfaceFails: true });
  installGpuContextRelease(kit);
  kit.MakeWebGLCanvasSurface('some-id');
  expect(log).toEqual(['original']);
  log.length = 0;
  kit.MakeWebGLCanvasSurface(new FakeCanvas());
  expect(log).toEqual(['delete gpu 1', 'delete handle 1', 'original']);
});

// ---------- paints ----------

class FakeHandle {
  static live = 0;
  deleted = false;
  constructor() {
    FakeHandle.live += 1;
  }
  copy() {
    return new FakeHandle();
  }
  delete() {
    if (this.deleted) throw new Error('deleted twice');
    this.deleted = true;
    FakeHandle.live -= 1;
  }
  isDeleted() {
    return this.deleted;
  }
}
class FakePaint {
  constructor(public ref: FakeHandle) {}
  assign(p: FakePaint) {
    this.ref = p.ref.copy();
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

/** A FinalizationRegistry stand-in whose collection the test triggers. */
function fakeRegistry() {
  const entries: { target: WeakRef<object> | object; held: unknown; collect: () => void }[] = [];
  class Registry<T> {
    constructor(private readonly cb: (held: T) => void) {}
    register(target: object, held: T) {
      entries.push({ target, held, collect: () => this.cb(held) });
    }
  }
  return { Registry: Registry as unknown as typeof FinalizationRegistry, collect: (target: object) => entries.filter((e) => e.target === target).forEach((e) => e.collect()) };
}

it('paints: a paint replaced by assign or reset is deleted at once; the last one, and a copy, when its wrapper is collected', () => {
  const api = { Paint: () => new FakePaint(new FakeHandle()) };
  const reg = fakeRegistry();
  FakeHandle.live = 0;
  expect(installPaintRelease(api, reg.Registry)).toBe(true);
  expect(installPaintRelease(api, reg.Registry)).toBe(false);
  expect(FakeHandle.live).toBe(0); // the probe paint made at install is gone
  const root = api.Paint() as FakePaint;
  const pooled = api.Paint() as FakePaint;
  expect(FakeHandle.live).toBe(2);
  for (let frame = 0; frame < 5; frame++) pooled.assign(root);
  expect(FakeHandle.live).toBe(2);
  pooled.reset();
  expect(FakeHandle.live).toBe(2);
  // The wrapper is collected: the paint it holds now (not the one it was made with) is deleted.
  reg.collect(pooled);
  expect(pooled.ref.deleted).toBe(true);
  expect(FakeHandle.live).toBe(1);
  // A copy for one draw command is deleted when its wrapper is collected.
  const drawCopy = root.copy();
  expect(FakeHandle.live).toBe(2);
  reg.collect(drawCopy);
  expect(FakeHandle.live).toBe(1);
  // A paint disposed by its owner is not deleted again when its wrapper goes.
  root.dispose();
  expect(() => reg.collect(root)).not.toThrow();
  expect(FakeHandle.live).toBe(0);
});

// ---------- pictures ----------

it('pictures: the previous picture of a view is deleted when a new one is set, never a deferred one', () => {
  const pic = (n: number) => ({ n, dispose: jest.fn() });
  const drawn: Record<string, unknown> = {};
  const api = {
    views: { '1': true } as Record<string, boolean>,
    deferedPictures: {} as Record<string, unknown>,
    setJsiProperty(this: { views: Record<string, boolean>; deferedPictures: Record<string, unknown> }, id: unknown, name: string, value: unknown) {
      if (name !== 'picture') return;
      if (!this.views[String(id)]) this.deferedPictures[String(id)] = value;
      else drawn[String(id)] = value;
    },
  };
  expect(installPictureRelease(api)).toBe(true);
  expect(installPictureRelease(api)).toBe(false);
  const [a, b, c] = [pic(1), pic(2), pic(3)];
  api.setJsiProperty(1, 'picture', a);
  api.setJsiProperty(1, 'picture', b);
  expect(a.dispose).toHaveBeenCalledTimes(1);
  expect(b.dispose).not.toHaveBeenCalled();
  api.setJsiProperty(1, 'picture', b); // the same picture again: kept
  expect(b.dispose).not.toHaveBeenCalled();
  api.setJsiProperty(1, 'picture', c);
  expect(b.dispose).toHaveBeenCalledTimes(1);
  expect(drawn['1']).toBe(c);
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
