/**
 * @jest-environment node
 */
// The reading card: the words at a readable size on a solid sheet, one sentence marked as a clue
// (by more than colour, and in its spoken label), a full-size way out, and nothing it owns beyond
// the box it is given.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReadingCard } from './ReadingCard';
import { ENGINEER_WORLD } from '../../../presentation/design/tokens';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const box = { x: 20, y: 200, width: 600, height: 360 };
const lines = ['This tower has twenty floors.', 'Our lift rides one tall shaft.', 'Steel cables hold the car.'];

describe('ReadingCard', () => {
  it('shows the title and every line in the reading face, at a child-readable size', async () => {
    await render(<ReadingCard box={box} title="The Tower Book" lines={lines} closeLabel="Close the book" onClose={() => {}} />);
    expect(screen.getByText('The Tower Book')).toBeTruthy();
    for (const line of lines) {
      const text = screen.getByText(line);
      expect(Number(flat(text.props.style).fontSize)).toBeGreaterThanOrEqual(17);
      expect(screen.getByLabelText(line)).toBeTruthy();
    }
    expect(Number(flat(screen.getByText(lines[0]!).props.style).fontSize)).toBe(ENGINEER_WORLD.type.reading.size);
    // It draws inside the box it is given (its owner keeps that box off the controls).
    const area = flat(screen.getByTestId('reading-card').props.style);
    expect([area.left, area.top, area.width, area.height]).toEqual([box.x, box.y, box.width, box.height]);
  });

  it('keeps to a comfortable reading width inside its box, and steps the size down once in a narrow box', async () => {
    await render(<ReadingCard box={{ ...box, width: 1000 }} title="Page" lines={lines} />);
    const card = screen.getByLabelText('Page');
    expect(Number(flat(card.props.style).width)).toBeLessThanOrEqual(460);
    await render(<ReadingCard box={{ ...box, width: 260 }} title="Narrow" lines={lines} />);
    const narrow = Number(flat(screen.getByText(lines[1]!).props.style).fontSize);
    expect(narrow).toBeLessThan(ENGINEER_WORLD.type.reading.size);
    expect(narrow).toBeGreaterThanOrEqual(17);
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
