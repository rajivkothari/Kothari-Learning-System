// Tower Rescue's lines that name a system (audit 2026-10-23, C4): one system name is plural ("AIR FANS"),
// so a template must not put a singular verb after {system} ("The AIR FANS is running fine").
import { TOWER_RESCUE } from '../../content/minigames';

// Present-tense verbs change with number ("is", "needs"); past-tense ones ("lost") do not.
const SINGULAR_VERB_AFTER_SYSTEM = /\{system\}\s+(is|was|has|needs|does|goes)\b/;

describe('Tower Rescue copy with a system name', () => {
  it('never follows {system} with a verb that must agree in number', () => {
    const lines = Object.entries(TOWER_RESCUE.lines as Record<string, string>).filter(([, text]) => text.includes('{system}'));
    expect(lines.length).toBeGreaterThan(0);
    for (const [key, text] of lines) expect({ key, text, agrees: !SINGULAR_VERB_AFTER_SYSTEM.test(text) }).toMatchObject({ agrees: true });
  });

  it('reads correctly with the plural system name', () => {
    const fans = (TOWER_RESCUE.systems as { id: string; name: string }[]).find((s) => s.id === 'fans');
    expect(fans?.name).toBe('AIR FANS');
    const line = ((TOWER_RESCUE.lines as Record<string, string>).wrongSystem ?? '').replace('{system}', fans?.name ?? '');
    expect(line).toBe('AIR FANS: running fine. Read the report again.');
  });
});
