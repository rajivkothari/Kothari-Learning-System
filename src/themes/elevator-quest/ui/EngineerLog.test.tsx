/**
 * @jest-environment node
 */
// The Engineer Log (D179): every emblem in ONE canvas, however many rows; each emblem waits for its row's
// measured top; the rows keep their words and screen-reader labels. (jest.setup.ts draws a Canvas as a View.)
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LINES } from '../content/floor15';
import { LANDINGS, engineerLog } from '../content/landings';
import { EngineerLog, logRowText } from './EngineerLog';

const rows = engineerLog(LANDINGS, [], { restored: () => true });
const box = { x: 0, y: 0, width: 600, height: 700 };
const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 500, height } } });

describe('Engineer Log', () => {
  it('draws every emblem in one canvas, whatever the number of rows (never a canvas per row)', async () => {
    expect(rows.length).toBe(20);
    await render(<EngineerLog box={box} rows={rows} onClose={() => {}} onReplay={() => {}} />);
    // Before layout, no canvas at all; once the rows have a height, exactly one.
    expect(screen.queryAllByTestId('engineer-log-emblems')).toHaveLength(0);
    await fireEvent(screen.getByTestId('engineer-log-rows'), 'layout', layout(0, 20 * 60));
    expect(screen.queryAllByTestId('engineer-log-emblems')).toHaveLength(1);
    for (const r of rows) {
      const row = screen.getByLabelText(logRowText(r).label);
      await fireEvent(row, 'layout', layout((r.floor - 1) * 60, 50));
    }
    expect(screen.queryAllByTestId('engineer-log-emblems')).toHaveLength(1);
    // The canvas spans the rows, behind them, and takes no touches.
    const canvas = screen.getByTestId('engineer-log-emblems');
    expect(canvas.props.pointerEvents).toBe('none');
    expect(canvas.props.style).toMatchObject({ position: 'absolute', height: 20 * 60 });
  });

  it('keeps each row readable by a screen reader, with an undiscovered fact never shown', async () => {
    await render(<EngineerLog box={box} rows={rows} onClose={() => {}} onReplay={() => {}} />);
    for (const r of rows) expect(screen.getByLabelText(logRowText(r).label)).toBeTruthy();
    expect(screen.getAllByText(LINES.log.unknown)).toHaveLength(rows.length);
  });
});
