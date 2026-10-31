import { buildTeamInput } from '../src/records/observations.ts';
import { runSimulation } from '../src/sim/engine.ts';
import { loadRecordingsFile, loadRecordsData, recordingMap } from './records-data.ts';
const file = loadRecordingsFile();
const data = loadRecordsData(file);
const recording = recordingMap(file).get(process.argv[2]!)!;
const input = buildTeamInput(recording, { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true } as never, data);
const sim = runSimulation(input);
const [from, to] = [Number(process.argv[3]), Number(process.argv[4])];
for (const slot of [0, 1, 2]) {
  for (const s of sim.slots[slot]!.segments) {
    if (s.end < from || s.start > to) continue;
    const t = s.trigger;
    const core = (t.normal / t.hitRate / t.hitsPerShot / t.boost.total) * (2 + t.boost.fullBurst) / (input.slots[slot]!.character.shot.shotCount);
    console.log(slot + 1, s.start, s.end, 'coreHit', core.toFixed(1), 'atk', t.attack, 'AD', (t.attackDamageMultiplier - 1).toFixed(4), 'T', (t.damageTakenMultiplier - 1).toFixed(4), 'FB', t.boost.fullBurst);
  }
}
