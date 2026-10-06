import {
  LAB_STAGE,
  availableArea,
  chooseArrangement,
  describeOrientation,
  fitStage,
  fromStage,
  isCompact,
  toStage,
} from './stageLayout';

// Window sizes in points. Device names are labels only; the math must not depend on them.
const WINDOWS = {
  fireHd8Landscape: { width: 1280 / 1.33, height: 800 / 1.33 },
  ipadLandscape: { width: 1180, height: 820 },
  ipadPortrait: { width: 820, height: 1180 },
  ipadSplitThird: { width: 320, height: 820 },
  ipadStageManager: { width: 700, height: 540 },
  square: { width: 600, height: 600 },
};

describe('chooseArrangement', () => {
  it('puts controls beside the stage in landscape and below it in portrait', () => {
    expect(chooseArrangement(WINDOWS.ipadLandscape)).toBe('row');
    expect(chooseArrangement(WINDOWS.fireHd8Landscape)).toBe('row');
    expect(chooseArrangement(WINDOWS.ipadPortrait)).toBe('column');
    expect(chooseArrangement(WINDOWS.ipadSplitThird)).toBe('column');
  });
});

describe('fitStage', () => {
  it.each(Object.entries(WINDOWS))('keeps the whole stage visible and centred: %s', (_name, size) => {
    const fit = fitStage(size);
    expect(fit.stage.width).toBeLessThanOrEqual(size.width + 1e-6);
    expect(fit.stage.height).toBeLessThanOrEqual(size.height + 1e-6);
    expect(fit.stage.width / fit.stage.height).toBeCloseTo(LAB_STAGE.width / LAB_STAGE.height, 6);
    // One axis is fully used.
    const fillsWidth = Math.abs(fit.stage.width - size.width) < 1e-6;
    const fillsHeight = Math.abs(fit.stage.height - size.height) < 1e-6;
    expect(fillsWidth || fillsHeight).toBe(true);
    // Centred.
    expect(fit.stage.x).toBeCloseTo((size.width - fit.stage.width) / 2, 6);
    expect(fit.stage.y).toBeCloseTo((size.height - fit.stage.height) / 2, 6);
  });

  it('returns a zero fit for an unmeasured container instead of NaN', () => {
    const fit = fitStage({ width: 0, height: 500 });
    expect(fit.scale).toBe(0);
    expect(Number.isNaN(fit.stage.x)).toBe(false);
  });

  it('round-trips points between container and stage space', () => {
    const fit = fitStage(WINDOWS.ipadStageManager);
    const logical = { x: 800, y: 250 };
    const back = toStage(fit, fromStage(fit, logical));
    expect(back.x).toBeCloseTo(logical.x, 6);
    expect(back.y).toBeCloseTo(logical.y, 6);
  });
});

describe('availableArea and isCompact', () => {
  it('subtracts safe-area insets and never goes negative', () => {
    expect(availableArea({ width: 100, height: 100 }, { top: 60, right: 0, bottom: 60, left: 0 })).toEqual({
      width: 100,
      height: 0,
    });
  });

  it('flags a narrow Slide Over style window as compact', () => {
    expect(isCompact(WINDOWS.ipadSplitThird)).toBe(true);
    expect(isCompact(WINDOWS.ipadLandscape)).toBe(false);
  });
});

describe('describeOrientation', () => {
  it('reports orientation and aspect', () => {
    expect(describeOrientation(WINDOWS.ipadPortrait).orientation).toBe('portrait');
    expect(describeOrientation(WINDOWS.square).orientation).toBe('square');
    expect(describeOrientation({ width: 1600, height: 1000 }).aspect).toBeCloseTo(1.6, 6);
  });
});
