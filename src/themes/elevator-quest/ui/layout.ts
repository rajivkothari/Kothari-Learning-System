// Floor 15 screen layout. Pure math, no React: testable for every window size.
//
// Landscape (preferred): cabin view on the left, the physical panel on the right, Lifty's
// line under the cabin. Portrait: cabin on top, Lifty, then the panel. The cabin absorbs
// whatever space is left; the panel's buttons never drop below MIN_BUTTON.

export interface Size {
  width: number;
  height: number;
}
export interface Box extends Size {
  x: number;
  y: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** docs/ACCESSIBILITY.md: gameplay targets at least 64 x 64 pt. */
export const MIN_BUTTON = 64;
export const MAX_BUTTON = 92;
export const FLOOR_COUNT = 20;

export interface GameLayout {
  orientation: 'landscape' | 'portrait';
  cabin: Box;
  panel: Box;
  lifty: Box;
  /** Floor button diameter and spacing inside the panel. */
  button: number;
  gap: number;
  columns: number;
  rows: number;
  /** True when the window is too small for everything at minimum size: the panel scrolls. */
  cramped: boolean;
}

let MARGIN = 12;
export const PANEL_HEADER = 30;
const LIFTY_HEIGHT = 112;
/** Narrow dialogue strips get more height so Lifty's whole line always fits. */
const liftyHeight = (width: number, height: number) => (width < 400 && height >= 900 ? 184 : width < 480 ? 150 : LIFTY_HEIGHT);

export function panelPad(button: number): number {
  return button <= MIN_BUTTON ? 10 : 14;
}

function panelSize(button: number, gap: number, columns: number, rows: number): Size {
  // rows of floor buttons + one row of door buttons + a header plate
  const pad = panelPad(button);
  return {
    width: columns * button + (columns - 1) * gap + pad * 2,
    height: PANEL_HEADER + (rows + 1) * button + rows * gap + gap + pad * 2,
  };
}

function fitButton(limitW: number, limitH: number, columns: number, rows: number): { button: number; gap: number; fits: boolean } {
  for (let b = MAX_BUTTON; b >= MIN_BUTTON; b -= 2) {
    for (const gap of [Math.max(8, Math.round(b * 0.16)), 8]) {
      const p = panelSize(b, gap, columns, rows);
      if (p.width <= limitW && p.height <= limitH) return { button: b, gap, fits: true };
    }
  }
  return { button: MIN_BUTTON, gap: 8, fits: false };
}

/** The cabin must stay the dominant thing on screen. */
const MIN_CABIN_WIDTH = 300;
const MIN_CABIN_SHARE = 0.4;

export function computeLayout(window: Size, insets: Insets): GameLayout {
  MARGIN = window.width < 400 ? 8 : 12;
  const area: Box = {
    x: insets.left + MARGIN,
    y: insets.top + MARGIN,
    width: Math.max(0, window.width - insets.left - insets.right - MARGIN * 2),
    height: Math.max(0, window.height - insets.top - insets.bottom - MARGIN * 2),
  };

  // Side by side whenever the cabin can still be at least MIN_CABIN_WIDTH wide next to a
  // minimum-size panel: landscape, and near-square windows such as iPad split view.
  const minPanel = panelSize(MIN_BUTTON, 8, 4, FLOOR_COUNT / 4);
  const sideBySide = area.width >= area.height * 0.85 && area.width - minPanel.width - MARGIN >= MIN_CABIN_WIDTH;

  if (sideBySide) {
    const columns = 4;
    const rows = FLOOR_COUNT / columns;
    const { button, gap, fits } = fitButton(Math.max(minPanel.width, area.width * 0.4), area.height, columns, rows);
    const p = panelSize(button, gap, columns, rows);
    const panel: Box = { x: area.x + area.width - p.width, y: area.y + Math.max(0, (area.height - p.height) / 2), width: p.width, height: Math.min(p.height, area.height) };
    const leftWidth = Math.max(0, area.width - p.width - MARGIN);
    const lh = liftyHeight(leftWidth, area.height);
    const lifty: Box = { x: area.x, y: area.y + area.height - lh, width: leftWidth, height: lh };
    const cabin: Box = { x: area.x, y: area.y, width: leftWidth, height: Math.max(0, area.height - lh - MARGIN) };
    return { orientation: 'landscape', cabin, panel, lifty, button, gap, columns, rows, cramped: !fits };
  }

  // Stacked (portrait): reserve a real share of the height for the cabin first.
  // Tiny windows (Slide Over) keep 64 pt buttons and let the cabin shrink instead.
  let columns = 5;
  let fit = fitButton(area.width, 0, columns, FLOOR_COUNT / columns);
  for (const minCabin of [Math.max(240, area.height * MIN_CABIN_SHARE), 120, 90]) {
    const panelLimit = Math.max(0, area.height - liftyHeight(area.width, area.height) - MARGIN * 2 - minCabin);
    columns = 5;
    fit = fitButton(area.width, panelLimit, columns, FLOOR_COUNT / columns);
    if (!fit.fits) {
      columns = 4;
      fit = fitButton(area.width, panelLimit, columns, FLOOR_COUNT / columns);
    }
    if (fit.fits) break;
  }
  const rows = FLOOR_COUNT / columns;
  const { button, gap } = fit;
  const p = panelSize(button, gap, columns, rows);
  const panelHeight = Math.min(p.height, area.height);
  const panel: Box = { x: area.x + Math.max(0, (area.width - p.width) / 2), y: area.y + area.height - panelHeight, width: Math.min(p.width, area.width), height: panelHeight };
  const lh = liftyHeight(area.width, area.height);
  const lifty: Box = { x: area.x, y: panel.y - MARGIN - lh, width: area.width, height: lh };
  const cabin: Box = { x: area.x, y: area.y, width: area.width, height: Math.max(0, lifty.y - MARGIN - area.y) };
  return { orientation: 'portrait', cabin, panel, lifty, button, gap, columns, rows, cramped: !fit.fits };
}

/** Floors in panel order: top row first, highest floors at the top, like a real panel. */
export function panelRows(columns: number, floorCount = FLOOR_COUNT): number[][] {
  const rows: number[][] = [];
  for (let first = 1; first <= floorCount; first += columns) rows.unshift(Array.from({ length: Math.min(columns, floorCount - first + 1) }, (_, i) => first + i));
  return rows;
}
