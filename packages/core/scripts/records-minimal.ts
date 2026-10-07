// 最小構成の検査の感度（plan/design-minimal-relevance.md 4.1 節・10.6 節）を計算し、records/minimal/sensitivity.json を書き直す。
// 対象は、確定の結論の根拠で sim と比べる観測値と、その録画の、根拠が確定でない定義の効果の組。数分かかる。
// 結果は records:check が読んで plan/minimal.md と claims.md に重ねる。使い方: npm run records:minimal（ルート。records:check まで回す）
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SENSITIVITY_VERSION, type SensitivityEntry } from '../src/records/relevance.ts';
import { sensitivityOf, sensitivityTargets } from '../src/records/sensitivity.ts';
import type { SimResult } from '../src/sim/engine.ts';
import {
  SENSITIVITY_PATH,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
  type SensitivityFile,
} from './records-data.ts';

const started = Date.now();
const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(
  file,
  loadPredictions().flatMap((p) => p.team.map((m) => m.rid)),
);
const claims = loadClaims();
const observations = loadObservations();
const ctx = { recordings, characters: data.characters, skills: data.skills, enemies: data.enemies, claims, data };
const targets = sensitivityTargets(observations, ctx);
const entries: SensitivityEntry[] = [];
// 同じ録画の観測値は続けて回し、sim の結果を使い回す（録画が変わったら捨てる）
let cache = new Map<string, SimResult>();
let current = '';
for (const o of [...targets].sort((a, b) => a.recording.localeCompare(b.recording) || a.id.localeCompare(b.id))) {
  if (o.recording !== current) {
    cache = new Map();
    current = o.recording;
  }
  entries.push(...sensitivityOf(o, ctx, cache));
}
entries.sort((a, b) => a.observation.localeCompare(b.observation) || a.element.localeCompare(b.element));
const out: SensitivityFile = { version: SENSITIVITY_VERSION, entries };
mkdirSync(dirname(SENSITIVITY_PATH), { recursive: true });
writeFileSync(SENSITIVITY_PATH, `${JSON.stringify(out, null, 2)}\n`);
const effective = entries.filter((e) => e.effective).length;
const errors = entries.filter((e) => e.error !== undefined).length;
console.log(
  `感度: 観測値 ${targets.length}・組（観測値 × 効果）${entries.length}。効きうる ${effective}（うち計算できない ${errors}）。${((Date.now() - started) / 1000).toFixed(0)} 秒`,
);
