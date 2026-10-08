/**
 * @jest-environment node
 */
// The building directory (M8.1): the DIRECTORY control has a word and a full-size target, pulses only
// while Lifty introduces it (a still ring under Reduced Motion); the sheet lists every floor top first in
// rows of at least 56 pt, marks only the car's floor (in words and weight), and Back closes it.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LINES } from '../content/floor15';
import { LANDINGS, directoryRows } from '../content/landings';
import { DirectoryButton, DirectorySheet, ROW_H, directoryGrid } from './Directory';
import { scrollToRow } from './directoryLayout';
import { moreBelow } from './ScrollMore';
import { textSizes } from './textRoles';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const rows = directoryRows(LANDINGS, 1, 20, { restored: () => true });
const box = { x: 10, y: 10, width: 306, height: 64 };

describe('DIRECTORY control', () => {
  it('is a labelled button with the word on it; a ring shows only during the introduction, still under Reduced Motion', async () => {
    const onPress = jest.fn();
    await render(<DirectoryButton box={box} floor={3} name="UTILITY" hint={false} still={false} open={false} disabled={false} onPress={onPress} />);
    const button = screen.getByLabelText(LINES.directory.open);
    expect(button.props.accessibilityRole).toBe('button');
    expect(screen.getByText(LINES.directory.button)).toBeTruthy();
    expect(screen.queryByTestId('directory-hint')).toBeNull();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    await render(<DirectoryButton box={box} floor={3} name="UTILITY" hint still open={false} disabled={false} onPress={onPress} />);
    expect(screen.getByTestId('directory-hint')).toBeTruthy();
    // Reduced Motion: the ring holds still at full strength.
    expect(flat(screen.getByTestId('directory-hint').props.style).opacity).toBe(1);
    await render(<DirectoryButton box={box} floor={3} name="UTILITY" hint still={false} open={false} disabled onPress={onPress} />);
    expect(screen.queryByTestId('directory-hint')).toBeNull();
    expect(screen.getByLabelText(LINES.directory.open).props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('directory sheet', () => {
  it('lists twenty floors top first in rows of at least 56 pt, marks only the car floor, and Back closes it', async () => {
    const onClose = jest.fn();
    const text = textSizes('standard');
    await render(<DirectorySheet box={{ x: 0, y: 0, width: 600, height: 560 }} rows={rows} current={7} text={text} onClose={onClose} />);
    expect(ROW_H).toBeGreaterThanOrEqual(56);
    // Laid out once the plate reports its width.
    await fireEvent(screen.getByTestId('directory-scroll'), 'layout', { nativeEvent: { layout: { width: 560, height: 420 } } });
    const shown = screen.getAllByTestId(/^directory-row-\d+$/).map((r) => Number(String(r.props.testID).split('-').pop()));
    expect(shown).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i));
    for (const r of screen.getAllByTestId(/^directory-row-\d+$/)) expect(Number(flat(r.props.style).height)).toBeGreaterThanOrEqual(56);
    expect(screen.getAllByText(LINES.directory.here)).toHaveLength(1);
    expect(screen.getByTestId('directory-row-7').props.accessibilityValue).toEqual({ text: LINES.directory.here.toLowerCase() });
    expect(screen.getByTestId('directory-row-8').props.accessibilityValue).toBeUndefined();
    const name = screen.getByText('Platform Heights');
    expect(Number(flat(name.props.style).fontSize)).toBe(text.directory);
    expect(flat(name.props.style).fontWeight).toBe('900');
    expect(Number(flat(screen.getByText('Lobby').props.style).fontSize)).toBeGreaterThanOrEqual(18);
    const back = screen.getByLabelText(LINES.directory.back);
    expect(Number(flat(back.props.style).minHeight)).toBeGreaterThanOrEqual(64);
    await fireEvent.press(back);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('scrolling lists', () => {
  it('opens the directory on the car floor, and says when more is below (never when all is shown)', () => {
    const grid = directoryGrid(20, 300, 1);
    expect(scrollToRow(grid, 0, 400)).toBe(0);
    const last = scrollToRow(grid, 19, 400);
    expect(last).toBe(grid.height - 400);
    expect(grid.cells[19]!.y - last).toBeLessThanOrEqual(400 - ROW_H);
    expect(moreBelow({ view: 400, content: 1000, y: 0 })).toBe(true);
    expect(moreBelow({ view: 400, content: 1000, y: 600 })).toBe(false);
    expect(moreBelow({ view: 400, content: 380, y: 0 })).toBe(false);
    expect(moreBelow({ view: 0, content: 380, y: 0 })).toBe(false);
  });
});
