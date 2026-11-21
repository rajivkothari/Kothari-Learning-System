import { bindKingdomSound, createSoundSwitch, kingdomSound } from './soundSwitch';

function gate(open = true) {
  let listeners: (() => void)[] = [];
  return {
    isOpen: () => open,
    onOpen(l: () => void) {
      if (open) {
        l();
        return () => undefined;
      }
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
    touch() {
      open = true;
      const run = listeners;
      listeners = [];
      for (const l of run) l();
    },
    waiting: () => listeners.length,
  };
}

describe('the sound switch', () => {
  it('sound can play only when it is switched on and the first touch has been given', () => {
    const g = gate(false);
    const s = createSoundSwitch(g);
    expect([s.on(), s.canSound()]).toEqual([false, false]);
    s.set(true);
    expect([s.on(), s.canSound()]).toEqual([true, false]);
    g.touch();
    expect(s.canSound()).toBe(true);
    s.set(false);
    expect(s.canSound()).toBe(false);
  });

  it('whenReady runs once when sound can play again, whichever was missing; never when it can play already; a cancel stops it', () => {
    const g = gate(false);
    const s = createSoundSwitch(g);
    const ran: string[] = [];
    s.whenReady(() => ran.push('a'));
    const cancel = s.whenReady(() => ran.push('b'));
    cancel();
    // The touch alone is not enough while the switch is off, nor the switch alone before the touch.
    g.touch();
    expect(ran).toEqual([]);
    s.set(true);
    expect(ran).toEqual(['a']);
    s.set(false);
    s.set(true);
    expect(ran).toEqual(['a']);
    // Nothing to wait for: it never runs.
    s.whenReady(() => ran.push('c'));
    s.set(false);
    s.set(true);
    expect(ran).toEqual(['a']);
    // Switched off later (Sound off in Comfort, the app behind another): it runs when switched back on.
    s.set(false);
    s.whenReady(() => ran.push('d'));
    expect(ran).toEqual(['a']);
    s.set(true);
    expect(ran).toEqual(['a', 'd']);
    // Switched on first, the touch second.
    const h = gate(false);
    const t = createSoundSwitch(h);
    t.set(true);
    t.whenReady(() => ran.push('e'));
    t.whenReady(() => ran.push('f'));
    expect(h.waiting()).toBe(1);
    h.touch();
    expect(ran).toEqual(['a', 'd', 'e', 'f']);
    t.set(false);
    t.whenReady(() => ran.push('g'));
    t.release();
    t.set(true);
    expect(ran).toEqual(['a', 'd', 'e', 'f']);
  });

  it('screens read the switch of the audio in use and are told when it changes', () => {
    let told = 0;
    const stop = kingdomSound.subscribe(() => told++);
    // No audio yet: nothing is known to be off, and nothing can sound.
    expect([kingdomSound.off(), kingdomSound.canSound()]).toEqual([false, false]);
    const s = createSoundSwitch(gate());
    const unbind = bindKingdomSound(s);
    expect([kingdomSound.off(), kingdomSound.canSound(), told]).toEqual([true, false, 1]);
    s.set(true);
    expect([kingdomSound.off(), kingdomSound.canSound(), told]).toEqual([false, true, 2]);
    s.set(true);
    expect(told).toBe(2);
    s.set(false);
    expect([kingdomSound.off(), told]).toEqual([true, 3]);
    // A newer audio takes over; the older one's unbind does not undo it.
    const newer = createSoundSwitch(gate());
    const unbindNewer = bindKingdomSound(newer);
    newer.set(true);
    unbind();
    expect(kingdomSound.off()).toBe(false);
    unbindNewer();
    expect([kingdomSound.off(), kingdomSound.canSound()]).toEqual([false, false]);
    stop();
  });
});
