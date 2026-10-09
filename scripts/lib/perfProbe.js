// Shared by the perf scripts (scripts/perf-*.js): serve an exported browser build, open it in
// Chromium with a CDP session, and sample what the page holds. Development measurement only: the
// browser build runs Skia on CanvasKit (WebAssembly), so these numbers say nothing about a Fire tablet
// or an iPad; they show leaks and trends, not device performance.
//
// What a sample reads (after a forced garbage collection, so collectable garbage does not count):
//   wasmBytes     the CanvasKit WebAssembly memory (CanvasKit.HEAPU8.buffer). It only grows: it is the
//                 high-water mark of Skia's heap. A plateau means freed memory is being reused.
//   jsHeapUsed    the page's JS heap in use (CDP Runtime.getHeapUsage).
//   domNodes      DOM nodes alive in the renderer (CDP Memory.getDOMCounters), attached or not.
//   attached      nodes reachable from the document; detached = domNodes - attached (an estimate).
//   listeners     JS event listeners (Memory.getDOMCounters).
//   glLive        WebGL contexts still alive (weakly tracked from getContext, after the GC); glMade, made in all.
//   glHandles     CanvasKit GL context handles made and not deleted (emscripten's context table keeps
//                 the canvas and its context alive until CanvasKit.deleteContext).
//   grLive        Skia GPU contexts (GrDirectContext) made and not deleted; surfLive, on-screen surfaces.
//   canvases      <canvas> elements in the document.
//   imgLive       CanvasKit images made by MakeImageFromEncoded and not yet deleted; imgMade, imgDeleted.
const path = require('node:path');
const { serve } = require('../serve-web');
const { launchBrowser } = require('./browser');

/** Installed before any page script: counts WebGL contexts and CanvasKit images, and marks times. */
const INIT = () => {
  const perf = (globalThis.__perf = { glMade: 0, gl: [], imgMade: 0, imgDeleted: 0, marks: {}, taps: [], armed: 'startup' });
  const getContext = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl/.test(String(type)) && !seen.has(ctx)) {
      seen.add(ctx);
      perf.glMade += 1;
      perf.gl.push(new WeakRef(ctx));
    }
    return ctx;
  };
  perf.grMade = 0;
  perf.grDeleted = 0;
  perf.ctxMade = 0;
  perf.ctxDeleted = 0;
  perf.surfMade = 0;
  perf.surfDeleted = 0;
  const counted = (obj, made, deleted) => {
    perf[made] += 1;
    const del = obj.delete;
    let gone = false;
    obj.delete = function (...a) {
      if (!gone) perf[deleted] += 1;
      gone = true;
      return del.apply(this, a);
    };
    return obj;
  };
  const wrap = (ck) => {
    if (!ck || ck.__perfWrapped) return;
    ck.__perfWrapped = true;
    // GL context handles (emscripten's context table), Skia GPU contexts and on-screen surfaces.
    const getGL = ck.GetWebGLContext;
    ck.GetWebGLContext = function (...a) {
      const h = getGL.apply(this, a);
      if (h > 0) perf.ctxMade += 1;
      return h;
    };
    const delGL = ck.deleteContext;
    ck.deleteContext = function (...a) {
      perf.ctxDeleted += 1;
      return delGL.apply(this, a);
    };
    const makeGr = ck.MakeWebGLContext;
    ck.MakeWebGLContext = ck.MakeGrContext = function (...a) {
      const gr = makeGr.apply(this, a);
      return gr ? counted(gr, 'grMade', 'grDeleted') : gr;
    };
    // A surface made while a measured transition is armed: when it first draws (its first flush).
    // `<armed>:drawn` is the latest first-draw among them, so it reads "every new canvas has drawn".
    const makeSurf = ck.MakeOnScreenGLSurface;
    ck.MakeOnScreenGLSurface = function (...a) {
      const s = makeSurf.apply(this, a);
      if (s && perf.armed) {
        const name = perf.armed;
        const flush = s.flush;
        let first = true;
        s.flush = function (...f) {
          const r = flush.apply(this, f);
          if (first) {
            first = false;
            perf.marks[`${name}:drawn`] = Math.max(perf.marks[`${name}:drawn`] ?? 0, performance.now());
          }
          return r;
        };
      }
      return s ? counted(s, 'surfMade', 'surfDeleted') : s;
    };
    // Skia objects made per frame by react-native-skia's web renderer: paints (one new paint per
    // drawn frame of each canvas) and pictures (one per frame). Counted made and deleted.
    perf.objects = {};
    const track = (name, obj) => {
      const o = (perf.objects[name] ??= { made: 0, deleted: 0 });
      o.made += 1;
      const del = obj.delete;
      let gone = false;
      obj.delete = function (...a) {
        if (!gone) o.deleted += 1;
        gone = true;
        return del.apply(this, a);
      };
      return obj;
    };
    for (const cls of ['Paint', 'Path', 'PictureRecorder']) {
      const C = ck[cls];
      if (typeof C !== 'function') continue;
      ck[cls] = new Proxy(C, { construct: (t, a) => track(cls, Reflect.construct(t, a)) });
    }
    const copy = ck.Paint?.prototype?.copy;
    if (copy) {
      ck.Paint.prototype.copy = function (...a) {
        const p = copy.apply(this, a);
        return p ? track('PaintCopy', p) : p;
      };
    }
    const finish = ck.PictureRecorder?.prototype?.finishRecordingAsPicture;
    if (finish) {
      ck.PictureRecorder.prototype.finishRecordingAsPicture = function (...a) {
        const p = finish.apply(this, a);
        return p ? track('Picture', p) : p;
      };
    }
    const make = ck.MakeImageFromEncoded;
    ck.MakeImageFromEncoded = function (...args) {
      const img = make.apply(this, args);
      if (img) {
        perf.imgMade += 1;
        const del = img.delete;
        let gone = false;
        img.delete = function () {
          if (!gone) perf.imgDeleted += 1;
          gone = true;
          return del.call(this);
        };
      }
      return img;
    };
  };
  let ck;
  Object.defineProperty(globalThis, 'CanvasKit', {
    configurable: true,
    get: () => ck,
    set: (v) => {
      wrap(v);
      ck = v;
    },
  });
  // The press that starts a measured transition (perf scripts tag it by setting __perf.armed).
  document.addEventListener(
    'pointerdown',
    () => {
      if (perf.armed) perf.taps.push({ name: perf.armed, t: performance.now() });
    },
    true,
  );
  // When each watched thing first shows (performance.now(), ms from navigation start), and the first
  // animation frame after it (`<name>:frame`). A script deletes a mark to time the next showing.
  const WATCH = {
    panel: '[aria-label="Floor 20"]',
    'word-golf': '[data-testid="word-golf"]',
    'cargo-commander': '[data-testid="cargo-commander"]',
    directory: '[data-testid="directory-sheet"]',
  };
  const check = () => {
    for (const [name, sel] of Object.entries(WATCH)) {
      if (perf.marks[name] !== undefined || !document.querySelector(sel)) continue;
      perf.marks[name] = performance.now();
      requestAnimationFrame(() => {
        perf.marks[`${name}:frame`] = performance.now();
      });
    }
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true });
  // Long tasks and frame gaps, for the scripts that read them.
  perf.longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* no long-task API */
  }
};

/** Serve `dist`, launch Chromium, and open a page with the probe and a CDP session. */
async function openPerf(dist, { width = 1280, height = 900 } = {}) {
  const dir = path.resolve(dist);
  const server = await serve(dir, 0);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  return {
    base,
    page,
    cdp,
    async close() {
      await browser.close().catch(() => {});
      server.close();
    },
  };
}

/** One sample of what the page holds (after a forced GC). */
async function sample(page, cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(100);
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  const inPage = await page.evaluate(() => {
    const p = globalThis.__perf;
    let attached = 0;
    const walk = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    while (walk.nextNode()) attached += 1;
    return {
      wasmBytes: globalThis.CanvasKit?.HEAPU8?.buffer?.byteLength ?? null,
      attached: attached + 1,
      canvases: document.getElementsByTagName('canvas').length,
      glMade: p.glMade,
      glLive: p.gl.filter((r) => r.deref() !== undefined).length,
      imgMade: p.imgMade,
      imgDeleted: p.imgDeleted,
      imgLive: p.imgMade - p.imgDeleted,
      glHandles: p.ctxMade - p.ctxDeleted,
      grLive: p.grMade - p.grDeleted,
      surfLive: p.surfMade - p.surfDeleted,
      objects: Object.fromEntries(Object.entries(p.objects ?? {}).map(([k, v]) => [k, v.made - v.deleted])),
    };
  });
  return { jsHeapUsed: heap.usedSize, domNodes: dom.nodes, listeners: dom.jsEventListeners, detached: dom.nodes - inPage.attached, ...inPage };
}

const MB = (b) => (b == null ? 'n/a' : (b / 1048576).toFixed(1));
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Print a sample as one table line. */
const line = (label, s) =>
  `${String(label).padEnd(8)} wasm ${MB(s.wasmBytes).padStart(6)} MB  js ${MB(s.jsHeapUsed).padStart(6)} MB  nodes ${String(s.domNodes).padStart(6)} (detached ${String(s.detached).padStart(5)})  listeners ${String(s.listeners).padStart(5)}  gl ${s.glLive}/${s.glMade} (handles ${s.glHandles}, gr ${s.grLive}, surfaces ${s.surfLive})  canvases ${s.canvases}  images ${s.imgLive} live (${s.imgMade} made)  undeleted ${Object.entries(s.objects ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}`;

/** Command-line options: --dist <dir> (required), --out <file.json>, and numbers by name. */
function args(defaults) {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const out = { ...defaults };
  for (const k of Object.keys(defaults)) {
    const v = get(k);
    if (v !== undefined) out[k] = typeof defaults[k] === 'number' ? Number(v) : v;
  }
  if (!out.dist) throw new Error('usage: --dist <exported web build> (see the script header)');
  return out;
}

/** Wait until `fn()` (in Node) returns something truthy. */
async function until(page, what, fn, ms = 60_000, every = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(every);
  }
}

module.exports = { openPerf, sample, line, args, median, MB, until };
