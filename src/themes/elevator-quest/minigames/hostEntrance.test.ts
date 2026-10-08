// When the landing offers its mini-game (M9): pure rules, every stage and every blocker.
import { NORMAL_TIMING, createElevator } from '../sim/elevator';
import type { Stage } from '../director/director';
import { gameEntrance, type EntranceState } from './hostEntrance';

const config = { minFloor: 1, maxFloor: 20, timing: NORMAL_TIMING };

function state(patch: Partial<EntranceState> & { floor?: number } = {}): EntranceState {
  const { floor = 20, ...rest } = patch;
  return {
    stage: 'freeRide',
    success: null,
    elevator: createElevator(config, floor, 0, 'open'),
    power: 'on',
    saving: false,
    logOpen: false,
    card: null,
    rescueReady: false,
    answerTargets: null,
    miniGame: null,
    reading: null,
    ...rest,
  };
}

describe('mini-game entrance', () => {
  it('Floor 20 offers Word Golf and Floor 4 Cargo Commander; other floors nothing', () => {
    expect(gameEntrance(state({ floor: 20 }))?.id).toBe('word-golf');
    expect(gameEntrance(state({ floor: 4 }))?.id).toBe('cargo-commander');
    for (const floor of [1, 3, 5, 15, 19]) expect(gameEntrance(state({ floor }))).toBeNull();
  });

  it('shows when the learner is free to go: free ride, a hall call, a settled success, a job whose answer is elsewhere', () => {
    const offered: Stage[] = ['freeRide', 'call', 'task'];
    const never: Stage[] = ['loading', 'intro', 'reposition', 'riding', 'pause', 'cargo', 'rescue', 'finale', 'complete', 'error'];
    for (const stage of offered) expect({ stage, game: gameEntrance(state({ stage }))?.id }).toEqual({ stage, game: 'word-golf' });
    for (const stage of never) expect({ stage, game: gameEntrance(state({ stage })) }).toEqual({ stage, game: null });
    expect(gameEntrance(state({ stage: 'success', success: 'review' }))?.id).toBe('word-golf');
    expect(gameEntrance(state({ stage: 'success', success: 'arrival' }))).toBeNull();
    expect(gameEntrance(state({ stage: 'success', success: 'animating' }))).toBeNull();
  });

  it('never with the doors moving or shut, a floor lit, the power off, a save in flight, or a game already open', () => {
    const closed = { ...createElevator(config, 20, 0, 'closed') };
    expect(gameEntrance(state({ elevator: closed }))).toBeNull();
    expect(gameEntrance(state({ elevator: { ...createElevator(config, 20, 0, 'open'), phase: 'doorsClosing' } }))).toBeNull();
    expect(gameEntrance(state({ elevator: { ...createElevator(config, 20, 0, 'open'), destination: 9 } }))).toBeNull();
    expect(gameEntrance(state({ power: 'off' }))).toBeNull();
    expect(gameEntrance(state({ saving: true }))).toBeNull();
    expect(gameEntrance(state({ miniGame: { id: 'word-golf', floor: 20 } }))).toBeNull();
  });

  it('never over the Engineer Log, a landing card, a correction waiting, a reading note or its cards, or a touch job answered on this landing', () => {
    expect(gameEntrance(state({ logOpen: true }))).toBeNull();
    expect(gameEntrance(state({ card: { floor: 20, spotId: 'x', title: 't', lines: [], close: 'c' } }))).toBeNull();
    expect(gameEntrance(state({ stage: 'task', rescueReady: true }))).toBeNull();
    expect(gameEntrance(state({ stage: 'task', reading: { open: true, mode: 'ride' } }))).toBeNull();
    expect(gameEntrance(state({ stage: 'task', reading: { open: false, mode: 'choose' } }))).toBeNull();
    expect(gameEntrance(state({ stage: 'task', answerTargets: { floor: 20, objects: ['ball'] }, reading: { open: false, mode: 'touch' } }))).toBeNull();
    // The answer is elsewhere: a ride job's note folded, or a touch job on another landing.
    expect(gameEntrance(state({ stage: 'task', reading: { open: false, mode: 'ride' } }))?.id).toBe('word-golf');
    expect(gameEntrance(state({ stage: 'task', answerTargets: { floor: 13, objects: ['cart'] }, reading: { open: false, mode: 'touch' } }))?.id).toBe('word-golf');
  });
});
