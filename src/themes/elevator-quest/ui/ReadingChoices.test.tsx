/**
 * @jest-environment node
 */
// The cards of a reading job (M8.1): the question over them at the question size, the cards' words at
// the choice size, and in a short box (the narrow split view) the sheet keeps to its box and scrolls,
// so every card is reachable and none is cut off.
import { render, screen, within } from '@testing-library/react-native';

import { computeLayout } from './layout';
import { readingCardBox } from './readingCardLayout';
import { ReadingChoices } from './ReadingNote';

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, number | string>;
const options = ['full of jam', 'stuck, so it cannot move', 'turned off'].map((label, i) => ({ optionId: `o${i}`, value: `v${i}`, label, tried: false, shown: false }));

describe('ReadingChoices', () => {
  it.each([
    ['narrow split view', 375, 820],
    ['Fire HD 8 landscape', 960, 600],
  ] as const)('%s: every card is inside the scrolling sheet, the sheet keeps to its box, the words are big', async (_n, w, h) => {
    const layout = computeLayout({ width: w, height: h }, { top: 0, right: 0, bottom: 0, left: 0 });
    const box = readingCardBox(layout);
    await render(<ReadingChoices box={box} ask="What does jammed mean here?" groupLabel="Choices" options={options} accepting onChoose={() => {}} noteLabel="Read the note" onOpenNote={() => {}} text={layout.text} />);
    const scroll = screen.getByTestId('reading-choices-scroll');
    for (const o of options) expect(within(scroll).getByTestId(`reading-choice-${o.value}`)).toBeTruthy();
    // The sheet never grows past its box (so it scrolls instead of running off the cabin).
    const sheet = flat(scroll.parent?.props.style);
    expect(Number(sheet.maxHeight ?? box.height)).toBeLessThanOrEqual(box.height);
    expect(Number(flat(screen.getByText('What does jammed mean here?').props.style).fontSize)).toBe(layout.text.question);
    expect(Number(flat(screen.getByText('turned off').props.style).fontSize)).toBe(layout.text.choice);
    expect(layout.text.choice).toBeGreaterThanOrEqual(20);
  });
});
