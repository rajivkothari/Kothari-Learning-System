// The scale's dial: a half circle from 0 kg (left) to the scale's top (right). Pure math, tested.
// Ticks every 10 kg (the tens scale); numbers only every 10, 20 or 50 so they never crowd at the
// label size. The exact reading is not on the dial: it appears in the window under the hub on WEIGH.

export interface GaugeGeometry {
  cx: number;
  cy: number;
  r: number;
  /** The band the needle sweeps (and the capacity zone) runs between these radii. */
  band: { inner: number; outer: number };
  labelStep: number;
  labels: { value: number; x: number; y: number }[];
  ticks: { value: number; major: boolean; x1: number; y1: number; x2: number; y2: number }[];
  /** The reading window under the hub. */
  readout: { x: number; y: number; width: number; height: number };
  /** The reading's digits (big numbers). */
  numberSize: number;
  /** The legend line (MAX, TARGET) under the window. */
  legend: { x: number; y: number; width: number; height: number };
}

/** The angle (radians, 0 = right, PI = left) of a value on a dial that tops out at `max`. */
export const angleOf = (value: number, max: number) => Math.PI * (1 - Math.max(0, Math.min(1, value / max)));

export function pointOn(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) };
}

export function gaugeGeometry(size: { width: number; height: number }, max: number, labelSize: number): GaugeGeometry {
  const { width: w, height: h } = size;
  const numberSize = Math.max(28, Math.min(44, Math.round(Math.min(w, h) * 0.16)));
  const readoutH = Math.round(numberSize * 1.2 + 14);
  const readoutMinW = Math.round(numberSize * 3.4);
  const legendH = Math.round(labelSize * 1.35 + 8);
  // Two ways to fit: the window and the legend under the dial (stacked), or beside it (a wide, low box).
  const stackedR = Math.floor(Math.min(w / 2 - 10, h - 6 - 10 - readoutH - 6 - legendH));
  const sideR = Math.floor(Math.min((w - readoutMinW - 24) / 2, h - 16));
  const side = sideR > stackedR + 8 && h >= readoutH + legendH + 16;
  const r = Math.max(40, side ? sideR : stackedR);
  const cx = side ? 8 + r : w / 2;
  const cy = side ? Math.round(h / 2 + r / 2) : 6 + r;
  const band = { inner: r * 0.74, outer: r * 0.94 };
  // Numbers sit inside the band; the step keeps them about two and a half label widths apart.
  const labelR = band.inner - labelSize * 0.95;
  let labelStep = 10;
  for (const step of [10, 20, 50, 100]) {
    labelStep = step;
    const arc = (Math.PI * labelR * step) / max;
    if (arc >= labelSize * 2.6) break;
  }
  const labels: GaugeGeometry['labels'] = [];
  for (let v = 0; v <= max; v += labelStep) labels.push({ value: v, ...pointOn(cx, cy, labelR, angleOf(v, max)) });
  const ticks: GaugeGeometry['ticks'] = [];
  for (let v = 0; v <= max; v += 10) {
    const major = v % labelStep === 0;
    const a = angleOf(v, max);
    const p1 = pointOn(cx, cy, band.outer, a);
    const p2 = pointOn(cx, cy, major ? band.inner - 4 : band.inner + (band.outer - band.inner) * 0.35, a);
    ticks.push({ value: v, major, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }
  if (side) {
    const x = cx + r + 16;
    const width = Math.max(readoutMinW, w - x - 4);
    const top = Math.max(4, cy - r / 2 - (readoutH + 6 + legendH) / 2);
    const readout = { x, y: top, width, height: readoutH };
    return { cx, cy, r, band, labelStep, labels, ticks, readout, numberSize, legend: { x, y: top + readoutH + 6, width, height: legendH } };
  }
  const readoutW = Math.min(w - 16, Math.max(readoutMinW, r * 1.25));
  const readout = { x: cx - readoutW / 2, y: cy + 10, width: readoutW, height: readoutH };
  const legend = { x: 4, y: readout.y + readoutH + 6, width: w - 8, height: legendH };
  return { cx, cy, r, band, labelStep, labels, ticks, readout, numberSize, legend };
}
