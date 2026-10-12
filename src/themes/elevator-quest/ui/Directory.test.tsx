/**
 * @jest-environment node
 */
// The building directory (M8.1): the DIRECTORY control has a word and a full-size target, pulses only
// while Lifty introduces it (a still ring under Reduced Motion); the sheet lists every floor top first in
// rows of at least 56 pt, marks only the car's floor (in words and weight), and Back closes it.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { LINES } from '../content/floor15';
import { LANDINGS, directoryRows } from '../content/landings';
import { DirectoryButton, DirectorySheet, MORE_GUTTER, ROW_H, directoryGrid } from './Directory';
import { scrollToRow } from './directoryLayout';
import { moreBelow } from './ScrollMore';
import { textSizes } from './textRoles';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const rows = directoryRows(LANDINGS, 1, 20, { restored: () => true });
const box = { x: 10, y: 10, width: 306, height: 64 };

describe('DIRECTORY control', () => {
  it('names B1 as B1 in the basement, never as Floor 1 (D194)', async () => {
    await render(<DirectoryButton box={{ ...box, width: 420 }} floor="B1" name="BOWLING" hint={false} still={false} open={false} disabled={false} onPress={jest.fn()} />);
    expect(screen.getByText('B1 · BOWLING')).toBeTruthy();
  });

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

describe('express rides from the directory (D191)', () => {
  const games = [
    { label: '20', name: 'Word Golf' },
    { label: 'B1', name: 'Strike Lab' },
  ];
  const lay = async () => fireEvent(screen.getByTestId('directory-scroll'), 'layout', { nativeEvent: { layout: { width: 560, height: 420 } } });

  it('during a job: rows stay information, no EXPRESS RIDE, no LAST GAME', async () => {
    await render(<DirectorySheet box={{ x: 0, y: 0, width: 600, height: 560 }} rows={rows} current={7} games={games} onClose={jest.fn()} />);
    await lay();
    expect(screen.getByTestId('directory-row-20').props.accessibilityRole).toBe('text');
    expect(screen.getByTestId('directory-row-B1').props.accessibilityRole).toBe('text');
    expect(screen.queryByTestId('directory-express')).toBeNull();
    expect(screen.queryByTestId('directory-last-game')).toBeNull();
    expect(screen.getByTestId('directory-note').props.children).toBe(LINES.directory.note);
  });

  it('in free play: a tap picks a place (never rides), EXPRESS RIDE TO it rides; B1 is a place below the lobby', async () => {
    const onExpress = jest.fn();
    await render(<DirectorySheet box={{ x: 0, y: 0, width: 600, height: 560 }} rows={rows} current={7} games={games} onClose={jest.fn()} onExpress={onExpress} />);
    await lay();
    expect(screen.getByTestId('directory-note').props.children).toBe(LINES.directory.pick);
    // B1 comes after the lobby, never as Floor 0.
    const labels = screen.getAllByTestId(/^directory-row-/).map((r) => String(r.props.testID).replace('directory-row-', ''));
    expect(labels.slice(-2)).toEqual(['1', 'B1']);
    expect(labels).not.toContain('0');
    // Nothing picked: the button says EXPRESS RIDE and does nothing.
    const cta = () => screen.getByTestId('directory-express');
    expect(cta().props.accessibilityState).toMatchObject({ disabled: true });
    // The car's floor is not a pick.
    expect(screen.getByTestId('directory-row-7').props.accessibilityRole).toBe('text');
    await fireEvent.press(screen.getByTestId('directory-row-B1'));
    expect(onExpress).not.toHaveBeenCalled();
    expect(screen.getByTestId('directory-row-B1').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText(LINES.directory.rideTo('B1'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('directory-row-20'));
    expect(screen.getByLabelText(LINES.directory.rideTo('20'))).toBeTruthy();
    await fireEvent.press(cta());
    expect(onExpress).toHaveBeenCalledWith(20);
    // Game places carry a marker and say so to screen readers.
    expect(screen.getByTestId('directory-game-20')).toBeTruthy();
    expect(screen.getByTestId('directory-game-B1')).toBeTruthy();
    expect(screen.queryByTestId('directory-game-7')).toBeNull();
    expect(screen.getByTestId('directory-row-B1').props.accessibilityHint).toBe(`${LINES.directory.game}: Strike Lab`);
    // B1 is pinned under the scrolling floors behind the ground line (D194): always in view, never in the scroll.
    const scroller = screen.getByTestId('directory-scroll');
    expect(within(scroller).queryByTestId('directory-row-B1')).toBeNull();
    expect(within(screen.getByTestId('directory-basement')).getByTestId('directory-row-B1')).toBeTruthy();
    expect(within(screen.getByTestId('directory-basement')).getByTestId('directory-ground')).toBeTruthy();
    // Every scrolling row ends before the MORE cue's gutter, so the cue never covers a row or its GAME marker (D192).
    for (const r of within(scroller).getAllByTestId(/^directory-row-/)) {
      const st = flat(r.props.style);
      expect(Number(st.left) + Number(st.width)).toBeLessThanOrEqual(560 - MORE_GUTTER);
    }
    // The CTA is a full-size target.
    expect(Number(flat(cta().props.style).minHeight)).toBeGreaterThanOrEqual(64);
  });

  it('LAST GAME names the game and rides there; the tower map lights visited places and always shows games', async () => {
    const onLast = jest.fn();
    await render(<DirectorySheet box={{ x: 0, y: 0, width: 600, height: 560 }} rows={rows} current={7} games={games} visited={['7', '20']} onClose={jest.fn()} onExpress={jest.fn()} lastGame={{ name: 'Strike Lab', onPress: onLast }} />);
    await lay();
    const last = screen.getByTestId('directory-last-game');
    expect(last.props.accessibilityLabel).toBe(`${LINES.directory.lastGame}: Strike Lab`);
    await fireEvent.press(last);
    expect(onLast).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('directory-view'));
    expect(screen.getByTestId('tower-map')).toBeTruthy();
    expect(screen.getByTestId('directory-note').props.children).toBe(LINES.map.note);
    // Visited: named. Not visited: a question, but a game place still shows its game.
    expect(screen.getByTestId('map-20').props.accessibilityLabel).toContain('rooftop golf');
    expect(screen.getByTestId('map-12').props.accessibilityLabel).toContain(LINES.map.unknown.toLowerCase());
    expect(screen.getByTestId('map-B1').props.accessibilityLabel).toContain('Strike Lab');
    expect(screen.getByTestId('map-game-B1')).toBeTruthy();
    // B1 sits under the ground line below the tower (D194), outside the scrolling floors, so it is in view.
    expect(within(screen.getByTestId('tower-map')).queryByTestId('map-B1')).toBeNull();
    expect(within(screen.getByTestId('map-basement')).getByTestId('map-B1')).toBeTruthy();
    expect(within(screen.getByTestId('map-basement')).getByTestId('directory-ground')).toBeTruthy();
    const levels = within(screen.getByTestId('tower-map')).getAllByTestId(/^map-\d+$/).map((r) => String(r.props.testID));
    expect(levels.at(-1)).toBe('map-1');
    expect(screen.getByTestId('map-7').props.accessibilityLabel).toContain(LINES.directory.here.toLowerCase());
    // Back to the list.
    await fireEvent.press(screen.getByTestId('directory-view'));
    expect(screen.queryByTestId('tower-map')).toBeNull();
    // No secret count unless the screen gives one; on the map only.
    expect(screen.queryByTestId('map-secrets')).toBeNull();
  });

  it('the map counts the Engineer Secrets found (D194), and the list does not', async () => {
    await render(<DirectorySheet box={{ x: 0, y: 0, width: 600, height: 560 }} rows={rows} current={7} games={games} onClose={jest.fn()} secrets={{ found: 1, total: 3 }} />);
    await lay();
    expect(screen.queryByTestId('map-secrets')).toBeNull();
    await fireEvent.press(screen.getByTestId('directory-view'));
    expect(screen.getByTestId('map-secrets').props.children).toBe(LINES.mapSecrets(1, 3));
  });
});
