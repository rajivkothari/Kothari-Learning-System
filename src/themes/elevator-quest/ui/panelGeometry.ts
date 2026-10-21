// Where the panel's buttons sit on the plate. Pure math mirroring ButtonPanel's flex layout
// (header plate, rows of floor buttons, the door-button row), so the plate's single Skia
// canvas can draw a brass bezel under every button without a canvas per button.
import { PANEL_HEADER, panelPad } from './layout';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelGeometry {
  header: Cell;
  /** One cell per floor button, in panel order (top row first). */
  floors: Cell[];
  doors: [Cell, Cell];
}

export function panelGeometry(box: { width: number; height: number }, button: number, gap: number, columns: number, rows: number): PanelGeometry {
  const pad = panelPad(button);
  const inner = box.width - pad * 2;
  const header: Cell = { x: pad, y: pad, w: inner, h: PANEL_HEADER };
  const rowW = columns * button + (columns - 1) * gap;
  const x0 = pad + Math.max(0, (inner - rowW) / 2);
  const y0 = pad + PANEL_HEADER + 8;
  const floors: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) floors.push({ x: x0 + c * (button + gap), y: y0 + r * (button + gap), w: button, h: button });
  const doorY = y0 + rows * (button + gap) + gap;
  const doorW = Math.max(button * 1.35, (inner - gap) / 2);
  const doors: [Cell, Cell] = [
    { x: pad, y: doorY, w: doorW, h: button },
    { x: pad + inner - doorW, y: doorY, w: doorW, h: button },
  ];
  return { header, floors, doors };
}
