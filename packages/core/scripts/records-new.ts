// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。
//   npm run records:new -- verification --title "<題名>" --name <短い名前> --topic <話題> [--question "<問い>"] [--from V-NNNN]
//   npm run records:new -- claim --from V-NNNN [--text "<結論の文>"] [--topic <話題>]
// verification: 次の空き番号で records/verifications/V-NNNN-<短い名前>.md をひな形から作る（状態は調査中）。
// claim: 次の空き番号で records/claims/C-NNNN.json を作る。話題はその検証記録の話題、根拠はその検証記録を source にする観測値、
//   等級は機械の候補（3.5 節）、状態は確定にできる条件が全部そろえば確定、欠ければ仮説（欠けた条件を出す。3.6 節）。
//   text と model は人が書く。
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CLAIM_TOPICS, gradeCandidate, toClaims, type ClaimTopic } from '../src/records/claims.ts';
import { claimDraft, nextId, verificationFileName, verificationTemplate } from '../src/records/drafts.ts';
import { minimalWarnings } from '../src/records/minimal.ts';
import { invalidReasonsOf, runObservations } from '../src/records/observations.ts';
import { comparePredictions, todayLocal } from '../src/records/predictions.ts';
import {
  ROOT,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSkillDefinitions,
  loadVerifications,
  recordingMap,
} from './records-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' },
    name: { type: 'string' },
    topic: { type: 'string' },
    question: { type: 'string' },
    from: { type: 'string' },
    text: { type: 'string' },
  },
});

const USAGE =
  'usage: npm run records:new -- verification --title "<題名>" --name <短い名前> --topic <話題> [--question "<問い>"] [--from V-NNNN]\n' +
  '       npm run records:new -- claim --from V-NNNN [--text "<結論の文>"] [--topic <話題>]\n' +
  `話題: ${CLAIM_TOPICS.join(' / ')}`;

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function format(path: string): void {
  spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prettier', '--write', path], { stdio: 'ignore' });
}

const kind = positionals[0];
const verifications = loadVerifications();
const today = todayLocal();

if (kind === 'verification') {
  if (!values.title || !values.name || !values.topic) fail('--title・--name・--topic が要る');
  if (values.from !== undefined && !verifications.some((v) => v.id === values.from))
    fail(`派生元 ${values.from} が無い`);
  const id = nextId(
    'V',
    verifications.map((v) => v.id),
  );
  const draft = {
    id,
    title: values.title,
    name: values.name,
    topic: values.topic as ClaimTopic,
    question: values.question ?? '（何を知りたいか。1 文）',
    date: today,
    ...(values.from ? { derivedFrom: values.from } : {}),
  };
  const path = `${ROOT}records/verifications/${verificationFileName(draft)}`;
  if (existsSync(path)) fail(`${path} が既にある`);
  writeFileSync(path, verificationTemplate(draft));
  format(path);
  console.log(
    `${path} を作った（状態: 調査中）。問い・条件・予測を書き、予測ファイル records/predictions/${id}.json を作って npm run records:predict -- ${id} を回す`,
  );
} else if (kind === 'claim') {
  const from = values.from;
  if (!from) fail('--from V-NNNN が要る');
  const verification = verifications.find((v) => v.id === from);
  if (verification === undefined) fail(`検証記録 ${from} が無い`);
  const topic = (values.topic ?? verification.topic) as ClaimTopic;
  if (!(CLAIM_TOPICS as readonly string[]).includes(topic)) fail(`話題が語彙に無い: ${topic}`);
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const predictions = loadPredictions();
  const data = loadRecordsData(
    file,
    predictions.flatMap((p) => p.team.map((m) => m.rid)),
  );
  const observations = loadObservations();
  const claims = loadClaims();
  const id = nextId(
    'C',
    claims.map((c) => c.id),
  );
  const own = observations.filter((o) => o.source === from);
  const residuals = runObservations(own, recordings, data);
  const residualOf = new Map(
    residuals.map((r) => [r.observation.id, { status: r.status, diff: r.diff, value: r.observation.value }]),
  );
  const compared = new Map(
    residuals.filter((r) => r.status !== 'invalid').map((r) => [r.observation.id, r.status === 'ok']),
  );
  const basisForCandidate = toClaims([
    {
      id,
      text: '',
      state: '仮説',
      topic,
      grade: '推論',
      basis: own.map((o) => `\`${o.id}\``).join('・'),
      model: '',
      replaces: [],
      updated: today,
    },
  ])[0]!;
  const candidate = gradeCandidate(basisForCandidate, residualOf, new Set(invalidReasonsOf(observations).keys()));
  const warnings = minimalWarnings([verification], {
    recordings,
    characters: data.characters,
    skills: data.skills,
    enemies: data.enemies,
    claims,
  });
  const prediction = predictions.find((p) => p.verification === from);
  const draft = claimDraft({
    id,
    verification: from,
    topic,
    text: values.text,
    today,
    observations: own,
    gradeCandidate: candidate,
    compared,
    warnings,
    prediction: prediction === undefined ? undefined : comparePredictions(prediction, observations),
  });
  const path = `${ROOT}records/claims/${id}.json`;
  if (existsSync(path)) fail(`${path} が既にある`);
  writeFileSync(path, `${JSON.stringify(draft.file, null, 2)}\n`);
  format(path);
  console.log(`${path} を作った: 状態 ${draft.file.state}・等級 ${draft.file.grade}・根拠の観測値 ${own.length} 件`);
  if (draft.reasons.length > 0) {
    console.log('確定にしなかった理由（人が確かめて書き換えてよい）:');
    for (const r of draft.reasons) console.log(`  - ${r}`);
  }
  console.log(
    'text（結論の文）と model（モデル側）を書き、検証記録の「結論」に ID を足してから npm run records:check を回す',
  );
  void loadSkillDefinitions;
} else {
  fail('verification か claim を指定する');
}
