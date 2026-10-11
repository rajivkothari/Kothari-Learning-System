import type { ReactNode } from 'react';

// Many tiny static icons should not each hold a browser GPU context. Render the same paths as SVG.
type Paint = { color: string; style?: 'stroke'; strokeWidth?: number; strokeCap?: 'round' };
const paint = ({ color, style, strokeWidth, strokeCap }: Paint) => ({ fill: style === 'stroke' ? 'none' : color, stroke: style === 'stroke' ? color : undefined, strokeWidth, strokeLinecap: strokeCap });
export function Canvas({ style, children }: { style: { width: number; height: number }; pointerEvents?: string; children: ReactNode }) {
  return <svg width={style.width} height={style.height} style={{ display: 'block', pointerEvents: 'none', flexShrink: 0 }} aria-hidden="true" focusable="false">{children}</svg>;
}
export function Group({ transform, children }: { transform: { scale: number }[]; children: ReactNode }) {
  return <g transform={transform.map((t) => `scale(${t.scale})`).join(' ')}>{children}</g>;
}
export function Circle({ cx, cy, r, ...p }: Paint & { cx: number; cy: number; r: number }) { return <circle cx={cx} cy={cy} r={r} {...paint(p)} />; }
export function Oval({ x, y, width, height, ...p }: Paint & { x: number; y: number; width: number; height: number }) { return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...paint(p)} />; }
export function Path({ path, ...p }: Paint & { path: string }) { return <path d={path} {...paint(p)} />; }
export function RoundedRect({ x, y, width, height, r, ...p }: Paint & { x: number; y: number; width: number; height: number; r: number }) { return <rect x={x} y={y} width={width} height={height} rx={r} {...paint(p)} />; }
