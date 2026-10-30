// 使い捨て（commit しない）
import { buildTeamInput } from '../../src/records/observations.ts';
import { runSimulation } from '../../src/sim/engine.ts';
import { videoFrameOf } from '../../src/burst/schedule.ts';
import { oneHitValue } from '../../src/skills/burstDamage.ts';
import { loadRecordingsFile, loadRecordsData } from '../records-data.ts';
const file = loadRecordingsFile();
const data = loadRecordsData(file);
const rec = file.recordings.find((r) => r.id === process.argv[2])!;
const slot = Number(process.argv[3] ?? 3) - 1;
const mb = process.argv[4];
const input = buildTeamInput(rec, { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true, ...(mb ? { manualBursts: mb } : {}) }, data);
const r = runSimulation(input);
for (const h of r.skillHits.filter((x) => x.slotIndex === slot)) {
  console.log([videoFrameOf(r.schedule, h.frame), h.effect.source.skill, h.effect.dot ? (h.onApply ? 'apply' : 'tick') : 'hit', h.stacks ?? '', Math.round(oneHitValue(h.hit, false))].join('\t'));
}
console.log('FB', r.schedule!.fullBurstWindows.map((w) => `${videoFrameOf(r.schedule, w.start)}-${videoFrameOf(r.schedule, w.end)}`).join(' '));
for (const a of r.schedule!.activations.slice(0, 4)) console.log('act', a.step, a.slotIndex, a.frame, videoFrameOf(r.schedule, a.frame), (a as any).hexagonFrame);
