/**
 * @jest-environment node
 */
// The reading card: the words at a readable size on a solid sheet, one sentence marked as a clue
// (by more than colour, and in its spoken label), a full-size way out, and nothing it owns beyond
// the box it is given.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReadingCard, readingWidth } from './ReadingCard';
import { ENGINEER_WORLD } from '../../../presentation/design/tokens';
import { TEXT_FLOOR, textSizes } from './textRoles';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const box = { x: 20, y: 200, width: 600, height: 360 };
const lines = ['This tower has twenty floors.', 'Our lift rides one tall shaft.', 'Steel cables hold the car.'];

describe('ReadingCard', () => {
  it('shows the title and every line in the reading face, at the passage size for the window (never under 20 pt)', async () => {
    await render(<ReadingCard box={box} title="The Tower Book" lines={lines} closeLabel="Close the book" onClose={() => {}} />);
    expect(screen.getByText('The Tower Book')).toBeTruthy();
    for (const line of lines) {
      const text = screen.getByText(line);
      expect(Number(flat(text.props.style).fontSize)).toBeGreaterThanOrEqual(TEXT_FLOOR.passage);
      expect(screen.getByLabelText(line)).toBeTruthy();
    }
    // The title is a label: 16 pt or more.
    expect(Number(flat(screen.getByText('The Tower Book').props.style).fontSize)).toBeGreaterThanOrEqual(TEXT_FLOOR.label);
    // It draws inside the box it is given (its owner keeps that box off the controls).
    const area = flat(screen.getByTestId('reading-card').props.style);
    expect([area.left, area.top, area.width, area.height]).toEqual([box.x, box.y, box.width, box.height]);
    await render(<ReadingCard box={box} title="Roomy" lines={lines} text={textSizes('roomy')} />);
    expect(Number(flat(screen.getByText(lines[0]!).props.style).fontSize)).toBe(textSizes('roomy').passage);
  });

  it('keeps to a comfortable reading width inside its box, and never shrinks its words in a narrow box (it scrolls)', async () => {
    await render(<ReadingCard box={{ ...box, width: 1000 }} title="Page" lines={lines} text={textSizes('standard')} />);
    const card = screen.getByLabelText('Page');
    expect(Number(flat(card.props.style).width)).toBeLessThanOrEqual(readingWidth(textSizes('standard').passage));
    await render(<ReadingCard box={{ ...box, width: 260 }} title="Narrow" lines={lines} />);
    expect(Number(flat(screen.getByText(lines[1]!).props.style).fontSize)).toBe(TEXT_FLOOR.passage);
  });

  it('sets the instruction apart as the biggest words, and marks words by weight and an underline as well as colour', async () => {
    const ask = 'Ride to the ladder.';
    await render(<ReadingCard box={box} title="Job note" lines={lines} ask={ask} lineMarks={[[[5, 10]], [], []]} askMarks={[[12, 18]]} text={textSizes('standard')} />);
    const askText = screen.getByTestId('reading-card-ask');
    expect(askText.props.accessibilityLabel).toBe(ask);
    const askSize = Number(flat(screen.getByText(/Ride to the/).props.style).fontSize);
    expect(askSize).toBe(textSizes('standard').question);
    expect(askSize).toBeGreaterThan(Number(flat(screen.getByText(/twenty floors/).props.style).fontSize));
    for (const word of ['tower', 'ladder']) {
      const mark = flat(screen.getByText(word).props.style);
      expect(mark.fontWeight).toBe('900');
      expect(mark.textDecorationLine).toBe('underline');
    }
    // The whole sentence is still one line for a screen reader.
    expect(screen.getByLabelText(lines[0]!)).toBeTruthy();
  });

  it('marks one sentence as the clue: a bar, more weight, and "Clue:" for a screen reader', async () => {
    await render(<ReadingCard box={box} title="Note" lines={lines} highlight={1} />);
    expect(screen.getByLabelText(`Clue: ${lines[1]}`)).toBeTruthy();
    expect(screen.queryByLabelText(`Clue: ${lines[0]}`)).toBeNull();
    expect(flat(screen.getByText(lines[1]!).props.style).fontWeight).toBe('800');
    expect(flat(screen.getByLabelText(`Clue: ${lines[1]}`).props.style).borderLeftColor).toBe(ENGINEER_WORLD.state.clue.ring);
  });

  it('closes with a full-size button that names what it does; without one, it cannot be put away', async () => {
    const onClose = jest.fn();
    await render(<ReadingCard box={box} title="Book" lines={lines} closeLabel="Close the book" onClose={onClose} />);
    const close = screen.getByLabelText('Close the book');
    expect(Number(flat(close.props.style).minHeight)).toBeGreaterThanOrEqual(ENGINEER_WORLD.minTouchTarget);
    expect(Number(flat(close.props.style).minWidth)).toBeGreaterThanOrEqual(ENGINEER_WORLD.minTouchTarget);
    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    await render(<ReadingCard box={box} title="Job note" lines={lines} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

});
