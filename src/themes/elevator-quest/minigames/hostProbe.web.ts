// Browser only, and only with ?e2e=1 in the page URL: a read-only probe for scripts/web-e2e.js
// (window.__eqProbe). It lets the browser playthrough check what a page cannot show: the elevator
// mission's instance and step, the open game's item (its prompt fields, never its answer), and the
// learning records written. It changes nothing: no command, no setting, no save. Native builds get
// hostProbe.ts (a no-op).
import type { Response } from '../../../engine';
import { launchParams } from '../../../platform/launchParams';
import { FLOOR15 } from '../content/floor15';
import { openFloor15Services } from '../session';
import type { Floor15Session } from '../sessionCore';

export function installProbe(session: Floor15Session): () => void {
  if (launchParams().e2e !== '1') return () => {};
  const { director, runtime, learnerId, games } = session;
  const openSession = () => {
    const st = games.get();
    return st.phase === 'open' ? st.session : null;
  };
  const probe = {
    learnerId,
    elevator() {
      const v = director.getView();
      return { instanceId: director.instanceId(), stage: v.stage, floor: v.elevator.floor, phase: v.elevator.phase, destination: v.elevator.destination, panelEnabled: v.elevator.panelEnabled, stepId: v.task?.stepId ?? null, miniGame: v.miniGame };
    },
    async mission() {
      const id = director.instanceId();
      const latest = await runtime.latestMission(learnerId, FLOOR15.missionId);
      const view = await runtime.view(id);
      return { instanceId: id, latest: latest?.id ?? null, status: view.status, stepId: view.step?.id ?? null, stepIndex: view.step?.index ?? null, item: view.activity?.itemSignature ?? null, wrongTries: view.activity?.wrongTries ?? null };
    },
    game() {
      const st = games.get();
      const s = openSession();
      const c = s?.challenge() ?? null;
      return {
        phase: st.phase,
        id: st.phase === 'elevator' ? null : st.game.id,
        instanceId: s?.instanceId ?? null,
        progress: s?.progress() ?? null,
        // The item as the game gets it: prompt fields and how to answer. Never the answer.
        challenge: c ? { key: c.key, activityId: c.activityId, concept: c.concept, prompt: c.prompt, answer: c.answer, wrongTries: c.wrongTries } : null,
      };
    },
    /** runtime.check through the open game's session: right or wrong, nothing recorded. */
    check(response: Response) {
      return openSession()?.check(response) ?? null;
    },
    /** Every learning record of this learner, in order: type, id, the mission instance, outcome. */
    async records() {
      const { db } = await openFloor15Services();
      const rows = await db.all<{ type: string; payload: string }>('SELECT type, payload FROM learning_events WHERE learner_id = ? ORDER BY seq', [learnerId]);
      return rows.map((r) => {
        const p = JSON.parse(r.payload) as { id?: string; missionInstanceId?: string; instanceId?: string; outcome?: string; activityId?: string };
        return { type: r.type, id: p.id ?? null, instance: p.missionInstanceId ?? p.instanceId ?? null, outcome: p.outcome ?? null, activityId: p.activityId ?? null };
      });
    },
  };
  const g = globalThis as { __eqProbe?: unknown };
  g.__eqProbe = probe;
  return () => {
    if (g.__eqProbe === probe) delete g.__eqProbe;
  };
}
