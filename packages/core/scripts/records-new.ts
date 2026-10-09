// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。
//   npm run records:new -- verification --title "<題名>" --name <短い名前> --topic <話題> [--question "<問い>"] [--from V-NNNN]
//   npm run records:new -- claim --from V-NNNN [--text "<結論の文>"] [--topic <話題>] [--subject "<定義の場所>" … | --mechanism <機構>]
// verification: 次の空き番号で records/verifications/V-NNNN-<短い名前>.md をひな形から作る（状態は調査中）。
// claim: 次の空き番号で records/claims/C-NNNN.json を作る。話題はその検証記録の話題、根拠はその検証記録を source にする観測値、
//   等級は機械の候補（3.5 節）、状態は確定にできる条件が全部そろえば確定、欠ければ仮説（欠けた条件を出す。3.6 節）。
//   結論の対象（subject）は --subject（定義の場所。複数可）か --mechanism（plan/design-minimal-relevance.md 3.2 節）。
//   最小構成の検査（同 5 節）は、下書きを確定とみて根拠の観測値の組を判定する。text と model は人が書く。
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  CLAIM_MECHANISMS,
  CLAIM_TOPICS,
  gradeCandidate,
  toClaims,
  type Claim,
  type ClaimMechanism,
  type ClaimSubject,
  type ClaimTopic,
} from '../src/records/claims.ts';
import { claimDraft, nextId, verificationFileName, verificationTemplate } from '../src/records/drafts.ts';
import { invalidReasonsOf, runObservations } from '../src/records/observations.ts';
import { comparePredictions, todayLocal } from '../src/records/predictions.ts';
import { relevanceOf } from '../src/records/relevance.ts';
import { withFreshSensitivity } from '../src/records/sensitivity.ts';
import {
  ROOT,
  idsInOtherBranches,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSensitivity,
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
    subject: { type: 'string', multiple: true },
    mechanism: { type: 'string' },
  },
});

const USAGE =
  'usage: npm run records:new -- verification --title "<題名>" --name <短い名前> --topic <話題> [--question "<問い>"] [--from V-NNNN]\n' +
  '       npm run records:new -- claim --from V-NNNN [--text "<結論の文>"] [--topic <話題>] [--subject "<定義の場所>" … | --mechanism <機構>]\n' +
  `話題: ${CLAIM_TOPICS.join(' / ')}\n` +
  `機構: ${CLAIM_MECHANISMS.join(' / ')}`;

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function format(path: string): void {
  spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prettier', '--write', path], { stdio: 'ignore' });
}

/**
 * 次の空き番号。ほかのブランチ（手元か origin の、main に無い commit）が使っている番号も除く。並行する作業が同じ番号を取ると、
 * 後からマージする側が振り直すことになる（V-0378）
 */
function freeId(prefix: 'V' | 'C', own: readonly string[]): string {
  const other = idsInOtherBranches();
  if (other.note !== '') console.log(`注意: ${other.note}`);
  const ownOnly = nextId(prefix, own);
  const id = nextId(prefix, [...own, ...other.ids]);
  if (id !== ownOnly) console.log(`${ownOnly} から先はほかのブランチが使っているので、${id} にした`);
  return id;
}

const kind = positionals[0];
const verifications = loadVerifications();
const today = todayLocal();

if (kind === 'verification') {
  if (!values.title || !values.name || !values.topic) fail('--title・--name・--topic が要る');
  if (values.from !== undefined && !verifications.some((v) => v.id === values.from))
    fail(`派生元 ${values.from} が無い`);
  const id = freeId(
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
  const id = freeId(
    'C',
    claims.map((c) => c.id),
  );
  const own = observations.filter((o) => o.source === from);
  const residuals = runObservations(own, recordings, data);
  const residualOf = new Map(
    residuals.map((r) => [
      r.observation.id,
      { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
    ]),
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
  // 結論の対象（plan/design-minimal-relevance.md 3.2 節）
  if (values.subject !== undefined && values.mechanism !== undefined) fail('--subject と --mechanism はどちらか 1 つ');
  if (values.mechanism !== undefined && !(CLAIM_MECHANISMS as readonly string[]).includes(values.mechanism))
    fail(`機構が語彙に無い: ${values.mechanism}`);
  const subject: ClaimSubject | undefined =
    values.mechanism !== undefined
      ? { mechanism: values.mechanism as ClaimMechanism }
      : values.subject !== undefined
        ? { places: values.subject.map((s) => s.replaceAll('`', '').trim()) }
        : undefined;
  // 最小構成の検査（同 5 節）: 下書きを確定とみて、根拠の観測値の組を判定する。感度はその場で計算して重ねる
  const asConfirmed: Claim = {
    ...basisForCandidate,
    state: '確定',
    observations: own.filter((o) => o.invalid === undefined).map((o) => o.id),
    ...(subject === undefined ? {} : { subject }),
  };
  const relevanceCtx = {
    recordings,
    characters: data.characters,
    skills: data.skills,
    enemies: data.enemies,
    claims: [...claims, asConfirmed],
    data,
  };
  const sensitivity = withFreshSensitivity(own, relevanceCtx, loadSensitivity());
  const minimal = relevanceOf([asConfirmed], observations, relevanceCtx, sensitivity)[0]?.warnings ?? [];
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
    ...(subject === undefined ? {} : { subject }),
    minimal,
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
  if (subject !== undefined && 'places' in subject)
    console.log(
      `subject の定義の場所（${subject.places.join('、')}）の claims にも ${id} を足す（records:check が確かめる）`,
    );
  void loadSkillDefinitions;
} else {
  fail('verification か claim を指定する');
}
