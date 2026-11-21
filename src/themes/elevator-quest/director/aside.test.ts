// An aside (B1 pressed while a job waits: "Let's finish this job first") stands in front of the job's
// words for a few seconds and then gives them back, however many asides stack. A scripted child
// playtest pressed B1 twice and the question was gone for good: the second aside remembered the first
// aside as the line to return to, and the first one's return was dropped.
import { LINES } from '../content/floor15';
import { openSession, settled, tempDir, virtualTime } from '../testing/headless';

describe('an aside always gives the job its words back', () => {
  let tmp: ReturnType<typeof tempDir>;
  beforeEach(() => (tmp = tempDir()));
  afterEach(() => tmp.cleanup());

  it.each([
    ['150 ms apart', [150]],
    ['1.5 s apart', [1500]],
    ['five presses in a row', [100, 400, 900, 2000]],
  ] as const)('B1 pressed again %s during a job: the job\'s words are back 3.6 s after the last press', async (_name, gaps) => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    const job = s.view().lifty.line;
    expect(job).not.toBe('');
    s.director.pressBasement();
    expect(s.view().lifty.line).toBe(LINES.basementLater);
    for (const gap of gaps) {
      await time.advance(gap);
      s.director.pressBasement();
      expect(s.view().lifty.line).toBe(LINES.basementLater);
    }
    // Not early (the last aside has its full time), and then the question, not the aside.
    await time.advance(3500);
    expect(s.view().lifty.line).toBe(LINES.basementLater);
    await time.advance(100);
    expect(s.view().lifty.line).toBe(job);
    await time.advance(75_000);
    expect(s.view().lifty.line).toBe(job);
    expect(s.view().stage).toBe('task');
    s.director.dispose();
    await s.db.close();
  });

  it('something else said after the aside is not replaced by the old line', async () => {
    const time = virtualTime();
    const s = await openSession(tmp.file, time);
    s.director.pressDoorOpen();
    expect(await time.runUntil(() => settled(s)() && s.view().stage === 'task')).toBe(true);
    s.director.pressBasement();
    await time.advance(500);
    s.director.requestHelp();
    await time.runUntil(() => !s.view().saving);
    const help = s.view().lifty.line;
    expect(help).not.toBe(LINES.basementLater);
    await time.advance(10_000);
    expect(s.view().lifty.line).toBe(help);
    // A fresh aside now stands in front of the help line, and gives that back.
    s.director.pressBasement();
    await time.advance(3600);
    expect(s.view().lifty.line).toBe(help);
    s.director.dispose();
    await s.db.close();
  });
});
