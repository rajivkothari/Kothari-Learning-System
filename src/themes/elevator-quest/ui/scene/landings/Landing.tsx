// Picks the landing to draw beyond the doors from the floor's look. Presentation only: the
// floor shown is the simulation's `elevator.floor`, never a guess.
import { memo } from 'react';

import type { ConceptGeometry } from '../../conceptGeometry';
import type { FloorLook } from '../../floorLooks';
import { PaintedLanding } from './PaintedLanding';
import { RepairDeck } from './RepairDeck';

export const Landing = memo(function Landing({ g, look, repairDeckLit }: { g: ConceptGeometry; look: FloorLook; repairDeckLit: boolean }) {
  if (look.landing === 'repairDeck') return <RepairDeck g={g} lit={repairDeckLit} />;
  return <PaintedLanding g={g} look={look} floor={look.floor} />;
});
