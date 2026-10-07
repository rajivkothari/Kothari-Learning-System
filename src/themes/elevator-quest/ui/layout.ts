// Floor 15 screen layout. Pure math, no React: testable for every window size.
//
// Landscape (preferred): cabin view on the left, the physical panel on the right. Portrait:
// cabin on top, then the panel. Lifty lives inside the cabin, in a band at eye level between
// the floor indicator and the door frame (cabinGeometry.band), never in a strip below it. The
// cabin absorbs whatever space is left; the panel's buttons never drop below MIN_BUTTON.
import { cabinGeometry } from './cabinGeometry';

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
  /** Lifty's band inside the cabin (screen coordinates). */
  lifty: Box;
  /** Height of that band, for cabinGeometry(cabin, bandHeight). */
  bandHeight: number;
  /** Floor button diameter and spacing inside the panel. */
  button: number;
  gap: number;
  columns: number;
  rows: number;
  /** True when the window is too small for everything at minimum size: the panel scrolls. */
  cramped: boolean;
  /**
   * The directory placard under the panel (landscape with spare height only): the floor the car is
   * at, by number, emblem and name. Information, never a control (D128). Null when there is no room;
   * the directory sheet is always reachable from the cabin's icon row.
   */
  placard: Box | null;
}

let MARGIN = 12;
export const PANEL_HEADER = 30;
export const PLACARD_HEIGHT = 56;
/**
 * Lifty's band height. A narrow band stacks the help button under Lifty (see liftyPlacement),
 * so it is taller; the words keep their width.
 */
export function liftyBandHeight(cabinWidth: number): number {
  return cabinWidth < 560 ? 140 : 112;
}

function withBand(cabin: Box): { lifty: Box; bandHeight: number } {
  const bandHeight = liftyBandHeight(cabin.width);
  const b = cabinGeometry(cabin, bandHeight).band;
  return { lifty: { x: cabin.x + b.x, y: cabin.y + b.y, width: b.w, height: b.h }, bandHeight };
}

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
    // The placard takes spare height only: the buttons never shrink for it.
    const withPlacard = area.height - p.height >= PLACARD_HEIGHT + MARGIN;
    const stack = p.height + (withPlacard ? PLACARD_HEIGHT + MARGIN : 0);
    const panel: Box = { x: area.x + area.width - p.width, y: area.y + Math.max(0, (area.height - stack) / 2), width: p.width, height: Math.min(p.height, area.height) };
    const placard: Box | null = withPlacard ? { x: panel.x, y: panel.y + panel.height + MARGIN, width: panel.width, height: PLACARD_HEIGHT } : null;
    const leftWidth = Math.max(0, area.width - p.width - MARGIN);
    const cabin: Box = { x: area.x, y: area.y, width: leftWidth, height: area.height };
    return { orientation: 'landscape', cabin, panel, ...withBand(cabin), button, gap, columns, rows, cramped: !fits, placard };
  }

  // Stacked (portrait): reserve a real share of the height for the cabin first.
  // Tiny windows (Slide Over) keep 64 pt buttons and let the cabin shrink instead.
  let columns = 5;
  let fit = fitButton(area.width, 0, columns, FLOOR_COUNT / columns);
  const preferredCabin = Math.max(240, area.height * MIN_CABIN_SHARE);
  for (const minCabin of [preferredCabin, 120, 90]) {
    const panelLimit = Math.max(0, area.height - liftyBandHeight(area.width) - MARGIN - minCabin);
    columns = 5;
    fit = fitButton(area.width, panelLimit, columns, FLOOR_COUNT / columns);
    if (!fit.fits) {
      columns = 4;
      fit = fitButton(area.width, panelLimit, columns, FLOOR_COUNT / columns);
    }
    // Short of room for the preferred cabin: keep the buttons at the minimum size so every
    // spare point goes to the cabin, instead of growing the buttons into it.
    if (fit.fits && minCabin !== preferredCabin) fit = { button: MIN_BUTTON, gap: 8, fits: true };
    if (fit.fits) break;
  }
  const rows = FLOOR_COUNT / columns;
  const { button, gap } = fit;
  const p = panelSize(button, gap, columns, rows);
  const panelHeight = Math.min(p.height, area.height);
  const panel: Box = { x: area.x + Math.max(0, (area.width - p.width) / 2), y: area.y + area.height - panelHeight, width: Math.min(p.width, area.width), height: panelHeight };
  const cabin: Box = { x: area.x, y: area.y, width: area.width, height: Math.max(0, panel.y - MARGIN - area.y) };
  return { orientation: 'portrait', cabin, panel, ...withBand(cabin), button, gap, columns, rows, cramped: !fit.fits, placard: null };
}

/** Floors in panel order: top row first, highest floors at the top, like a real panel. */
export function panelRows(columns: number, floorCount = FLOOR_COUNT): number[][] {
  const rows: number[][] = [];
  for (let first = 1; first <= floorCount; first += columns) rows.unshift(Array.from({ length: Math.min(columns, floorCount - first + 1) }, (_, i) => first + i));
  return rows;
}
