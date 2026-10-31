import { buildTeamInput } from '../src/records/observations.ts';
import { runSimulation } from '../src/sim/engine.ts';
import { oneHitValue } from '../src/skills/burstDamage.ts';
import { loadRecordingsFile, loadRecordsData, recordingMap } from './records-data.ts';
const file = loadRecordingsFile();
const data = loadRecordsData(file);
const recording = recordingMap(file).get(process.argv[2]!)!;
const input = buildTeamInput(recording, { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true } as never, data);
const sim = runSimulation(input);
for (const h of sim.skillHits) {
  if (h.slotIndex !== 2 || h.effect.projectileStick !== true) continue;
  const r = h.hit;
  console.log(h.frame, oneHitValue(r, false, true).toFixed(1), r.baseHit.toFixed(0), r.boost.fullBurst, (r.attackDamageMultiplier - 1).toFixed(4), (r.damageTakenMultiplier - 1).toFixed(4));
}
