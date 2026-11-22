// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。
//   npm run records:new -- verification --title "<題名>" --name <短い名前> --topic <話題> [--question "<問い>"] [--from V-NNNN]
//   npm run records:new -- claim --from V-NNNN [--text "<結論の文>"] [--topic <話題>] [--subject "<定義の場所>" … | --mechanism <機構>]
//     [--decided-on <録画>:<仮説|値|読み方> … | --decided-on none] [--run "<録画>|<観測値,…>|<後の回>[|<決めた回>]" …]
//     [--parameter-free "<式と定数の出どころ>"] [--model "<モデル側>"] [--judgment "<条件>[・<条件>…]|<理由>"] [--dry-run]
//   npm run records:new -- claim --update C-NNNN --from V-NNNN [--observations …] [--subject … | --mechanism …] [--decided-on …]
//     [--run …] [--parameter-free …] [--model …] [--judgment …] [--dry-run]
// verification: 次の空き番号で records/verifications/V-NNNN-<短い名前>.md をひな形から作る（状態は調査中）。
// claim: 次の空き番号で records/claims/C-NNNN.json を作る。話題はその検証記録の話題、根拠はその検証記録を source にする有効な観測値
//   （無効の観測値は除いて知らせる）、等級は機械の候補（3.5 節）、状態は確定にできる条件が全部そろえば確定、欠ければ仮説（欠けた
//   条件を出す。3.6 節）。
//   結論の対象（subject）は --subject（定義の場所。複数可）か --mechanism（plan/design-minimal-relevance.md 3.2 節）。
//   最小構成の検査（同 5 節）は、下書きを確定とみて根拠の観測値の組を判定する。text は人が書く（model は --model でも書ける）。
//   --decided-on は、仮説・値・読み方を決めるのに使った録画（decidedOn。plan/design-investigation-review.md 1.3 節）。等級の候補は、
//   反復実測の再現にこれらの録画を数えない。仮説を立てた録画が無ければ none。
//   --run は 1 本の録画の中の反復（runs。plan/design-grade-runs.md 2 節）。載せた観測値が許容内なら、その録画を 2 回と数え、後の回を
//   再現にする。決めた回は、その録画を --decided-on に書いたときだけ書く。
//   --parameter-free は、合わせ込みの定数を持たない仮説の式と定数の出どころ（parameterFree。同 3 節）。仮説の出どころの録画も再現に数える。
//   --observations は根拠にする観測値（観測値 ID・録画 id・V-NNNN。records:residual と同じ選び方。無ければ、その検証記録を source にする
//   観測値の全部。無効のものは除く）。等級の候補・状態・最小構成の検査は
//   それで出す（plan/design-workflow-simplification-14.md 4 節）。
//   --judgment は、人の判断で上書きする確定の条件と理由（judgment。records:close と同じ形で、decided は今日）。条件は
//   指標なし・最小構成の警告・許容外・合う仮説が 2 つ以上 から選び、・ か , で区切る。上書きした条件は仮説の理由にしない。
//   --update は、前からある結論（仮説か確定）を新しい検証で書き直す（plan/design-workflow-simplification-17.md 2 節）。結論の文・話題・
//   model（--model を渡せば置き換え）・置き換え・印などを残し、根拠の文に --from の観測値（--observations で選べる。無ければ --from を
//   source にする観測値。無効のものは除く）のうち、まだ根拠に無いものと --from を書き足す。等級の候補・状態・最小構成の検査は、前の
//   根拠と足した根拠の全部で新しい結論と同じく出し直す。--decided-on・--run は前の並びに足し、--subject・--mechanism・--parameter-free・--judgment は置き換える。
//   結論の中身（式・値）が変わるときは使わない（新しい結論を作り、古い結論を棄却にする）ので、--text・--topic は受けない。番号は取らず、
//   commit もしない。
//   --dry-run は書かずに、状態と確定にできない理由だけを出す（番号を取らず、commit もしない）。
//   npm run records:new -- observation --from V-NNNN --recording <録画 id> (--json '<下書き>' | --file <下書きの JSON>)
//   npm run records:new -- observation --replace <観測値 ID> (--json '<下書き>' | --file <下書きの JSON>) [--allow-cited]
//   npm run records:new -- observation --invalidate <観測値 ID>[,...] --reason "<理由>" [--by <新しい観測値 ID>[,...]]
// observation: 観測値の下書き（1 つか配列。id・recording・source・readAt を除いた欄。欄の一覧は下の「観測値の下書きの欄」）に、次の空き番号・
//   source（--from）・readAt（今日）を付け、records:check と同じ観測値の検査を通ったら records/observations/<録画 id>.json に足す
//   （通らなければ書かない。番号の振り方と同じ値の扱いは records:read --write と同じ。tools/captures/records-io.ts）。
//   下書きに invalid は書けない（無効にするのは --invalidate）。
//   --replace は、その観測値の欄を下書き（1 つ）で差し替える（id・recording・source・readAt は前のまま）。同じ検査を通ったら書く。
//   仮説か確定の結論の根拠になっている観測値（入力なら、それを setup で指す比べが根拠のもの）は、その結論を出して止める（--allow-cited で差し替える。結論は出し直さない）。
//   --invalidate は、観測値に invalid（理由と今日の日付）を付ける。--by を書くと、それを根拠にしている結論の根拠と、それを setup で指して
//   いる比べ（jumpWindows など）の参照を新しい観測値に付け替える（--by が 1 つなら全部をそれに、並びなら同じ順の組で）。入力を読み直した
//   ときは、比べを写さずにこれで付け替える（plan/design-workflow-simplification-18.md 1 節）。付け替えた結論は、等級・状態・許容内かを
//   claim --update と同じく出し直す（確定にできる条件がそろわなければ仮説に戻し、理由を出す。仮説は確定に上げない。予測とは比べない）。
//   setup の参照を付け替えた比べを根拠にしている結論も、根拠の文はそのままで同じく出し直す（入力が変わって残差が変わりうる）。observation はどれも commit しない。
//   npm run records:new -- backlog --section <節> [--name <名前>] (--text "<本文>" | --cell "<列>=<文>" …) [--first]
// backlog: records/backlog/<名前>.json を作る（plan/backlog.md の冒頭の書き方）。2 節など # の列のある節は、名前を次の番号（2-NN。ほかの
//   ブランチが使った番号も避ける）にし、ほかの節は --name の名前で、order を節の末尾（--first なら先頭）にする。箇条の節は --text、表の節は
//   列ごとの --cell。records:check と同じ課題の検査を通ったら書く。
// verification・claim（--update と --dry-run を除く）・backlog は、作ったファイルだけを commit して git push -u origin HEAD する（番号を
//   ほかのブランチから見えるようにする。reserve.ts）。--no-push でしない。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { backlogPlacement, parseBacklogTemplate, validateBacklog, type BacklogFile } from '../src/records/backlog.ts';
import {
  CLAIM_MECHANISMS,
  CLAIM_TOPICS,
  DECIDED_ROLES,
  gradeCandidate,
  toClaims,
  type Claim,
  type ClaimFile,
  type ClaimGrade,
  type ClaimMechanism,
  type ClaimSubject,
  type ClaimTopic,
  type DecidedOn,
  type DecidedRole,
  type Judgment,
  type RunRepeat,
  validateParameterFree,
  validateRuns,
} from '../src/records/claims.ts';
import {
  basisIdsText,
  claimBasisObservations,
  claimDraft,
  claimUpdateBasis,
  keepHypothesis,
  keptClaimGrade,
  mergeClaimUpdate,
  nextId,
  parseJudgment,
  updatedClaim,
  verificationFileName,
  verificationTemplate,
  type ClaimDraft,
  type ClaimUpdate,
} from '../src/records/drafts.ts';
import {
  claimsCiting,
  claimsCitingResetup,
  draftShapeErrors,
  repointedClaimOwn,
  invalidatedObservation,
  replacedObservation,
  repointClaim,
  repointSetup,
  setupRefIds,
} from '../src/records/observationEdits.ts';
import {
  invalidReasonsOf,
  observationDraftFieldsText,
  type Observation,
  type ObservationDraft,
} from '../src/records/observations/types.ts';
import {
  loadObservations as loadRecordingObservations,
  prepareObservations,
  saveObservations,
  writeObservations,
} from '../../../tools/captures/records-io.ts';
import { comparePredictions, todayLocal } from '../src/records/predictions.ts';
import { relevanceOf } from '../src/records/relevance.ts';
import { withFreshSensitivity } from '../src/records/sensitivity.ts';
import {
  CLAIMS_DIR,
  ROOT,
  addedObservationErrors,
  formatFiles,
  backlogContext,
  idsInBranches,
  loadBacklog,
  loadBacklogTemplate,
  loadClaims,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSensitivity,
  loadVerifications,
  pickObservations,
  splitIds,
  recordingMap,
} from './records-data.ts';
import { reserve } from './reserve.ts';
import { runObservationsCached } from './residual-cache.ts';
import { cliArgs, fail } from './cli.ts';

/** 使い方に足す、話題と機構の語彙と、観測値の下書きの欄 */
const VOCABULARY = [
  `話題: ${CLAIM_TOPICS.join(' / ')}`,
  `機構: ${CLAIM_MECHANISMS.join(' / ')}`,
  '観測値の下書きの欄（? は省ける。observations/types.ts の ObservationDraft）:',
  observationDraftFieldsText(),
].join('\n');

const { values, positionals } = cliArgs(
  import.meta.url,
  {
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
      'decided-on': { type: 'string', multiple: true },
      run: { type: 'string', multiple: true },
      'parameter-free': { type: 'string' },
      model: { type: 'string' },
      judgment: { type: 'string' },
      update: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      observations: { type: 'string' },
      recording: { type: 'string' },
      json: { type: 'string' },
      file: { type: 'string' },
      replace: { type: 'string' },
      invalidate: { type: 'string' },
      reason: { type: 'string' },
      by: { type: 'string' },
      'allow-cited': { type: 'boolean', default: false },
      section: { type: 'string' },
      cell: { type: 'string', multiple: true },
      first: { type: 'boolean', default: false },
      'no-push': { type: 'boolean', default: false },
    },
  },
  { extra: VOCABULARY },
);

/** 「--decided-on 077:仮説」の短い名前 → 語彙 */
const ROLE_SHORT: Readonly<Record<string, DecidedRole>> = {
  仮説: '仮説の出どころ',
  値: '値を合わせた',
  読み方: '読み方を合わせた',
};

/** --decided-on の値（「<録画>:<役割>」の並びか none）を decidedOn にする。指定が無ければ undefined */
function parseDecidedOn(given: readonly string[] | undefined): DecidedOn[] | undefined {
  if (given === undefined) return undefined;
  if (given.length === 1 && given[0] === 'none') return [];
  return given.map((v) => {
    const m = /^([^:：]+)[:：](.+)$/.exec(v.trim());
    const role = m === null ? undefined : (ROLE_SHORT[m[2]!] ?? m[2]);
    if (m === null || role === undefined || !(DECIDED_ROLES as readonly string[]).includes(role))
      fail(`--decided-on は <録画>:<${Object.keys(ROLE_SHORT).join('|')}> か none: ${v}`);
    return { recording: m[1]!.replaceAll('`', '').trim(), role: role as DecidedRole };
  });
}

/** --run の値（「<録画>|<観測値,…>|<後の回>[|<決めた回>]」の並び）を runs にする。指定が無ければ undefined */
function parseRuns(given: readonly string[] | undefined): RunRepeat[] | undefined {
  if (given === undefined) return undefined;
  return given.map((v) => {
    const parts = v.split('|').map((x) => x.replaceAll('`', '').trim());
    if (parts.length < 3 || parts.length > 4 || parts.some((x) => x === ''))
      fail(`--run は "<録画>|<観測値,…>|<後の回>[|<決めた回>]": ${v}`);
    const [recording, observations, reproduced, decided] = parts as [string, string, string, string | undefined];
    return {
      recording,
      ...(decided === undefined ? {} : { decided }),
      reproduced,
      observations: splitIds(observations),
    };
  });
}

/** --subject・--mechanism を結論の対象にする（plan/design-minimal-relevance.md 3.2 節）。どちらも無ければ undefined */
function parseSubject(): ClaimSubject | undefined {
  if (values.subject !== undefined && values.mechanism !== undefined) fail('--subject と --mechanism はどちらか 1 つ');
  if (values.mechanism !== undefined && !(CLAIM_MECHANISMS as readonly string[]).includes(values.mechanism))
    fail(`機構が語彙に無い: ${values.mechanism}`);
  return values.mechanism !== undefined
    ? { mechanism: values.mechanism as ClaimMechanism }
    : values.subject !== undefined
      ? { places: values.subject.map((s) => s.replaceAll('`', '').trim()) }
      : undefined;
}

/** --judgment を judgment にする。指定が無ければ undefined */
function parseJudgmentOption(today: string): Judgment | undefined {
  if (values.judgment === undefined) return undefined;
  const parsed = parseJudgment(values.judgment, today);
  if (Array.isArray(parsed)) fail(parsed.join('\n'));
  return parsed;
}

/** JSON のファイルを書いて整える */
function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  formatFiles([path]);
}

function readDraftJson(): unknown {
  if ((values.json === undefined) === (values.file === undefined)) fail('--json か --file のどちらか 1 つが要る');
  try {
    return JSON.parse(values.json ?? readFileSync(values.file!, 'utf8'));
  } catch (e) {
    return fail(`下書きの JSON が読めない: ${(e as Error).message}`);
  }
}

/**
 * 次の空き番号。どれかのブランチ（手元か origin。まだ取り込んでいない main を含む）が使った番号も除く。並行する作業が同じ番号を取ると、
 * 後からマージする側が振り直すことになる（V-0378）
 */
function freeId(prefix: 'V' | 'C', own: readonly string[]): string {
  const other = idsInBranches();
  if (other.note !== '') console.log(`注意: ${other.note}`);
  const ownOnly = nextId(prefix, own);
  const id = nextId(prefix, [...own, ...other.ids]);
  if (id !== ownOnly) console.log(`${ownOnly} から先はほかのブランチ（か main）が使っているので、${id} にした`);
  return id;
}

/** 結論の下書きの評価に使う、結論の欄（新しい結論は空の文で作り、--update は前の結論に重ねる） */
type ClaimEvaluation = {
  id: string;
  /** 予測を引く検証記録（無ければ予測と比べない） */
  from: string | undefined;
  topic: ClaimTopic;
  text: string | undefined;
  basis: string;
  /** 根拠の観測値（前の根拠と足した根拠） */
  own: Observation[];
  /** 等級の候補と確定の条件を出すときに重ねる欄（前の結論の欄を含む） */
  base: Partial<ClaimFile>;
  subject: ClaimSubject | undefined;
  decidedOn: DecidedOn[] | undefined;
  runs: RunRepeat[] | undefined;
  parameterFree: string | undefined;
  judgment: Judgment | undefined;
  /** 人が決めた等級（前の結論の。claimDraft の grade） */
  grade?: (candidate: ClaimGrade | undefined) => ClaimGrade | undefined;
};

let evaluationCache: ReturnType<typeof loadEvaluationInputs> | undefined;

function loadEvaluationInputs() {
  const file = loadRecordingsFile();
  const predictions = loadPredictions();
  const data = loadRecordsData(
    file,
    predictions.flatMap((p) => p.team.map((m) => m.rid)),
  );
  return { recordings: recordingMap(file), predictions, data };
}

/** evaluateClaim が読む録画・予測・データ（--invalidate --by で結論を何件出し直しても 1 回だけ読む） */
function evaluationInputs(): ReturnType<typeof loadEvaluationInputs> {
  evaluationCache ??= loadEvaluationInputs();
  return evaluationCache;
}

/**
 * 結論を確定とみなして、等級の候補・最小構成の検査・予測との比べを出し、claimDraft で状態と確定にできない理由を出す（新しい結論と
 * --update で同じ）
 */
function evaluateClaim(e: ClaimEvaluation, claims: readonly Claim[], observations: readonly Observation[]): ClaimDraft {
  const { recordings, predictions, data } = evaluationInputs();
  const residuals = runObservationsCached(e.own, recordings, data);
  const residualOf = new Map(
    residuals.map((r) => [
      r.observation.id,
      { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
    ]),
  );
  const compared = new Map(
    residuals.filter((r) => r.status !== 'invalid').map((r) => [r.observation.id, r.status === 'ok']),
  );
  const forCandidate = toClaims([
    {
      text: '',
      grade: '推論',
      model: '',
      replaces: [],
      ...e.base,
      id: e.id,
      state: '仮説',
      topic: e.topic,
      basis: e.basis,
      updated: today,
      ...(e.decidedOn === undefined ? {} : { decidedOn: e.decidedOn }),
      ...(e.runs === undefined ? {} : { runs: e.runs }),
      ...(e.parameterFree === undefined ? {} : { parameterFree: e.parameterFree }),
    },
  ])[0]!;
  const shapeErrors = [
    ...validateRuns(forCandidate),
    ...validateParameterFree(forCandidate, new Map(claims.map((c) => [c.id, c]))),
  ];
  if (shapeErrors.length > 0) fail(shapeErrors.join('\n'));
  const candidate = gradeCandidate(forCandidate, residualOf, new Set(invalidReasonsOf(observations).keys()));
  // 最小構成の検査（plan/design-minimal-relevance.md 5 節）: 結論を確定とみて、根拠の観測値の組を判定する。感度はその場で計算して重ねる
  const asConfirmed: Claim = {
    ...forCandidate,
    state: '確定',
    observations: e.own.filter((o) => o.invalid === undefined).map((o) => o.id),
    ...(e.subject === undefined ? {} : { subject: e.subject }),
  };
  const relevanceCtx = { recordings, ...data, claims: [...claims.filter((c) => c.id !== e.id), asConfirmed] };
  const sensitivity = withFreshSensitivity(e.own, relevanceCtx, loadSensitivity());
  const minimal = relevanceOf([asConfirmed], observations, relevanceCtx, sensitivity)[0]?.warnings ?? [];
  const prediction = e.from === undefined ? undefined : predictions.find((p) => p.verification === e.from);
  const grade = e.grade?.(candidate);
  return claimDraft({
    id: e.id,
    verification: e.from ?? '',
    topic: e.topic,
    text: e.text,
    today,
    observations: e.own,
    gradeCandidate: candidate,
    compared,
    ...(e.subject === undefined ? {} : { subject: e.subject }),
    minimal,
    prediction: prediction === undefined ? undefined : comparePredictions(prediction, observations),
    ...(e.decidedOn === undefined ? {} : { decidedOn: e.decidedOn }),
    ...(e.runs === undefined ? {} : { runs: e.runs }),
    ...(e.parameterFree === undefined ? {} : { parameterFree: e.parameterFree }),
    ...(e.judgment === undefined ? {} : { judgment: e.judgment }),
    ...(grade === undefined ? {} : { grade }),
  });
}

/**
 * 前からある結論を、根拠の文 basis と根拠の観測値 own で出し直す（--update と、観測値の --invalidate --by の付け替えで同じ）。
 * 等級の候補・最小構成の検査・状態は新しい結論と同じく出し、人が決めた等級（keptClaimGrade）と前の欄を残す
 */
function rewriteClaim(
  existing: ClaimFile,
  next: { from: string | undefined; basis: string; own: Observation[]; merged: ClaimUpdate; model?: string },
  claims: readonly Claim[],
  observations: readonly Observation[],
): ClaimDraft {
  const draft = evaluateClaim(
    {
      id: existing.id,
      from: next.from,
      topic: existing.topic,
      text: existing.text,
      basis: next.basis,
      own: next.own,
      base: existing,
      subject: next.merged.subject,
      decidedOn: next.merged.decidedOn,
      runs: next.merged.runs,
      parameterFree: next.merged.parameterFree,
      judgment: next.merged.judgment,
      grade: (candidate) => keptClaimGrade(existing, candidate),
    },
    claims,
    observations,
  );
  return updatedClaim(existing, draft, next.merged, next.basis, next.model);
}

/** 出し直した結論の状態と等級の変わり方を head の後ろに付けて出し、確定にしなかった理由と、確定から仮説に戻ったことを知らせる */
function reportRewrite(head: string, before: ClaimFile, result: ClaimDraft, tail = ''): void {
  console.log(
    `${head}: 状態 ${before.state} → ${result.file.state}・等級 ${before.grade ?? 'なし'} → ${result.file.grade ?? 'なし'}${tail}`,
  );
  printReasons(result.reasons);
  if (before.state === '確定' && result.file.state === '仮説')
    console.log('注意: 確定の結論が仮説に戻った。理由を確かめ、確定のままにするなら根拠か judgment を直す');
}

function printReasons(reasons: readonly string[]): void {
  if (reasons.length === 0) return;
  console.log('確定にしなかった理由（人が確かめて書き換えてよい）:');
  for (const r of reasons) console.log(`  - ${r}`);
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
  formatFiles([path]);
  console.log(
    `${path} を作った（状態: 調査中）。問い・条件・次に撮るもの（撮影計画。オーナーに頼む撮影は plan/captures/protocol.md「撮影の依頼」の型）を書く。予測は任意（撮影計画で仮説を見分けられるか確かめるなら、予測ファイル records/predictions/${id}.json を作って npm run records:predict -- ${id}）`,
  );
  reserve([path], id, !values['no-push']);
} else if (kind === 'claim') {
  const from = values.from;
  if (!from) fail('--from V-NNNN が要る');
  const verification = verifications.find((v) => v.id === from);
  if (verification === undefined) fail(`検証記録 ${from} が無い`);
  const observations = loadObservations();
  const claims = loadClaims();
  const picked =
    values.observations === undefined ? undefined : pickObservations(observations, splitIds(values.observations));
  if (picked !== undefined && picked.missing.length > 0)
    fail(`--observations に当たる観測値が無い: ${picked.missing.join('・')}`);
  const { given, excluded } = claimBasisObservations(observations, from, picked?.picked);
  const givenFrom = picked === undefined ? from : '--observations で選んだ観測値';
  const noteExcluded = (ids: readonly string[]) => {
    if (ids.length > 0) console.log(`注意: 無効の観測値は根拠に足さない: ${ids.join('・')}`);
  };
  const subject = parseSubject();
  const decidedOn = parseDecidedOn(values['decided-on']);
  const runs = parseRuns(values.run);
  const judgment = parseJudgmentOption(today);
  const dryRun = values['dry-run'];

  if (values.update !== undefined) {
    // 前からある結論を、新しい検証で書き直す（plan/design-workflow-simplification-17.md 2 節）
    const id = values.update;
    if (values.text !== undefined || values.topic !== undefined)
      fail(
        '--update では --text・--topic を使わない（結論の中身が変わるなら、新しい結論を作り、古い結論を棄却にする）',
      );
    const path = `${CLAIMS_DIR}${id}.json`;
    const found = claims.find((c) => c.id === id);
    if (found === undefined) fail(`結論 ${id} が無い`);
    const { observations: beforeIds, ...existing } = found;
    if (existing.state !== '仮説' && existing.state !== '確定')
      fail(`${id} は ${existing.state}。--update は仮説か確定の結論にだけ使う`);
    // 前の根拠にある無効の観測値は根拠に残る（確定にできない理由に「失効した観測値がある」で出る）
    noteExcluded(excluded.filter((o) => !beforeIds.includes(o.id)).map((o) => o.id));
    const { added, basis, own } = claimUpdateBasis(
      { basis: existing.basis, observations: beforeIds },
      given,
      from,
      observations,
    );
    if (added.length === 0)
      console.log(
        given.length === 0
          ? `注意: ${givenFrom} に有効な観測値が無い（根拠は前のまま出し直す）`
          : `注意: ${from} の観測値はどれも ${id} の根拠に既にある（根拠は前のまま出し直す）`,
      );
    const merged = mergeClaimUpdate(existing, {
      ...(subject === undefined ? {} : { subject }),
      ...(decidedOn === undefined ? {} : { decidedOn }),
      ...(runs === undefined ? {} : { runs }),
      ...(values['parameter-free'] === undefined ? {} : { parameterFree: values['parameter-free'] }),
      ...(judgment === undefined ? {} : { judgment }),
    });
    const result = rewriteClaim(existing, { from, basis, own, merged, model: values.model }, claims, observations);
    const tail = `・足した根拠 ${added.length} 件（${added.join('・') || 'なし'}）`;
    if (dryRun) reportRewrite(`${id}（--dry-run。書かない）`, existing, result, tail);
    else {
      writeJson(path, result.file);
      reportRewrite(`${path} を書き直した`, existing, result, tail);
      console.log(
        `検証記録 ${from} の「結論」に ${id} を足し、npm run records:check を回す（commit はしない。ほかの変更と一緒に commit する）`,
      );
    }
  } else {
    noteExcluded(excluded.map((o) => o.id));
    if (given.length === 0 && excluded.length > 0)
      fail(`${givenFrom} に有効な観測値が無い（無効のものだけ）。根拠にする有効な観測値を足してから回す`);
    const topic = (values.topic ?? verification.topic) as ClaimTopic;
    if (!(CLAIM_TOPICS as readonly string[]).includes(topic)) fail(`話題が語彙に無い: ${topic}`);
    // --dry-run は番号を取らない（手元の結論の次の番号で評価する）
    const id = (dryRun ? nextId : freeId)(
      'C',
      claims.map((c) => c.id),
    );
    const parameterFree = values['parameter-free'];
    const draft = evaluateClaim(
      {
        id,
        from,
        topic,
        text: values.text,
        basis: basisIdsText(given.map((o) => o.id)),
        own: given,
        base: {},
        subject,
        decidedOn,
        runs,
        parameterFree,
        judgment,
      },
      claims,
      observations,
    );
    const file: ClaimFile = values.model === undefined ? draft.file : { ...draft.file, model: values.model };
    if (dryRun) {
      console.log(
        `結論の下書き（--dry-run。書かず、番号も取らない）: 状態 ${file.state}・等級 ${file.grade}・根拠の観測値 ${given.length} 件`,
      );
      printReasons(draft.reasons);
    } else {
      const path = `${CLAIMS_DIR}${id}.json`;
      if (existsSync(path)) fail(`${path} が既にある`);
      writeJson(path, file);
      console.log(`${path} を作った: 状態 ${file.state}・等級 ${file.grade}・根拠の観測値 ${given.length} 件`);
      printReasons(draft.reasons);
      console.log(
        `text（結論の文）${values.model === undefined ? 'と model（モデル側）' : ''}を書き、検証記録の「結論」に ID を足してから npm run records:check を回す`,
      );
      if (subject !== undefined && 'places' in subject)
        console.log(
          `subject の定義の場所（${subject.places.join('、')}）の claims にも ${id} を足す（records:check が確かめる）`,
        );
      reserve([path], id, !values['no-push']);
    }
  }
} else if (kind === 'observation') {
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const all = loadObservations();
  const checked = (changed: Observation[]): void => {
    const errors = addedObservationErrors(changed, recordings, all);
    if (errors.length > 0) fail(`観測値の検査に通らないので書かない:\n${errors.map((e) => `  ${e}`).join('\n')}`);
  };
  if (values.replace !== undefined) {
    // 同じ ID のまま欄を差し替える（plan/design-workflow-simplification-17.md 3 節）
    const parsed = readDraftJson();
    if (Array.isArray(parsed)) fail('--replace の下書きは 1 つ（観測値の欄のオブジェクト）');
    const draft = parsed as ObservationDraft;
    const shape = draftShapeErrors([draft]);
    if (shape.length > 0) fail(shape.join('\n'));
    const before = all.find((o) => o.id === values.replace);
    if (before === undefined) fail(`観測値 ${values.replace} が無い`);
    if (before.invalid !== undefined)
      fail(`${before.id} は無効（${before.invalid.reason}）。直さずに新しい観測値を足す`);
    const after = replacedObservation(before, draft);
    checked([after]);
    // 仮説か確定の結論の根拠になっている観測値は、--allow-cited が無ければ差し替えない（値や許容幅が変わると、結論の等級と状態が変わりうる）
    // 入力（setup が ID で指す観測値）は、それを指す比べを根拠にしている結論も問う
    const referring = all.filter((o) => setupRefIds(o).includes(before.id)).map((o) => o.id);
    const cited = claimsCiting(loadClaims(), [before.id, ...referring]).map((c) => `${c.id}（${c.state}）`);
    if (cited.length > 0 && !values['allow-cited'])
      fail(
        `${before.id} は結論の根拠${referring.length > 0 ? `（setup で指す比べ ${referring.join('・')} を含む）` : ''}になっているので差し替えない: ${cited.join('・')}\n` +
          '  読み違いなら --invalidate --reason "<理由>" --by <新しい観測値> で付け替える。承知の上で差し替えるなら --allow-cited を付ける',
      );
    const list = loadRecordingObservations(before.recording).map((o) => (o.id === before.id ? after : o));
    const path = saveObservations(before.recording, list, { format: false });
    formatFiles([path]);
    console.log(`${path} の ${before.id} を差し替えた（commit はしない）`);
    if (cited.length > 0)
      console.log(
        `差し替えた観測値を根拠にしている結論（等級・状態は出し直していない。records:new claim --update で出し直すか確かめる）: ${cited.join('・')}`,
      );
  } else if (values.invalidate !== undefined) {
    // 無効にし、--by があれば、それを根拠にしている結論を新しい観測値に付け替える
    if (values.reason === undefined || values.reason.trim() === '') fail('--reason "<理由>" が要る');
    const ids = splitIds(values.invalidate);
    const by = values.by === undefined ? undefined : splitIds(values.by);
    if (by !== undefined && by.length !== 1 && by.length !== ids.length)
      fail(`--by は 1 つか、--invalidate と同じ数（${ids.length}）の並び`);
    const byId = new Map(all.map((o) => [o.id, o]));
    const missing = [...ids, ...(by ?? [])].filter((id) => !byId.has(id));
    if (missing.length > 0) fail(`観測値が無い: ${missing.join('・')}`);
    const already = ids.filter((id) => byId.get(id)!.invalid !== undefined);
    if (already.length > 0) fail(`既に無効: ${already.join('・')}`);
    const invalidNew = (by ?? []).filter((id) => byId.get(id)!.invalid !== undefined || ids.includes(id));
    if (invalidNew.length > 0) fail(`--by の観測値が無効か、無効にする観測値: ${invalidNew.join('・')}`);
    const invalidated = ids.map((id) => invalidatedObservation(byId.get(id)!, values.reason!.trim(), today));
    // 付け替えの組（無効にする観測値 → 新しい観測値。--by が 1 つなら全部をそれに）
    const pairs = by === undefined ? [] : ids.map((old, i) => [old, by.length === 1 ? by[0]! : by[i]!] as const);
    // 無効にする観測値を setup で指している比べは、比べを写さずに参照を付け替える
    const resetup = new Map<string, Observation>();
    for (const [old, to] of pairs)
      for (const o of all) {
        if (ids.includes(o.id)) continue;
        const next = repointSetup(resetup.get(o.id) ?? o, old, to);
        if (next !== undefined) resetup.set(o.id, next);
      }
    // setup の参照は同じ録画の観測値に限る（--by が 1 つで録画をまたぐと、ほかの録画の比べが別の録画を指す）
    const crossed = [...resetup.values()].filter((o) =>
      setupRefIds(o).some((id) => byId.get(id)?.recording !== o.recording),
    );
    if (crossed.length > 0)
      fail(
        `付け替え先が別の録画の観測値になる比べがある（--by を --invalidate と同じ順の並びにする）: ${crossed.map((o) => o.id).join('・')}`,
      );
    const changed = [...invalidated, ...resetup.values()];
    checked(changed);
    // 結論の付け替え（無効にする前に、書き換える結論を出しておく）
    const claims = loadClaims();
    const repointed = new Map<string, ClaimFile>();
    for (const [old, to] of pairs)
      for (const { observations: _o, ...c } of claimsCiting(claims, [old])) {
        const next = repointClaim(repointed.get(c.id) ?? c, old, to, today);
        if (next !== undefined) repointed.set(c.id, next);
      }
    // 付け替えた runs が録画と食い違えば、何も書かずに止める
    const runErrors = toClaims([...repointed.values()]).flatMap((c) => validateRuns(c));
    if (runErrors.length > 0)
      fail(
        `付け替えた結論の runs が検査に通らないので書かない（結論を手で直す）:\n${runErrors.map((e) => `  ${e}`).join('\n')}`,
      );
    // 付け替えた結論の等級・状態・許容内かを、無効にした後の観測値で出し直す（新しい結論と同じ確定にできる条件）。予測は結論を作った
    // ときに見たので比べない。仮説は確定に上げない（keepHypothesis）
    const changedById = new Map(changed.map((o) => [o.id, o]));
    const withChanged = (o: Observation) => changedById.get(o.id) ?? o;
    const afterAll = all.map(withChanged);
    // setup の参照を付け替えた比べを根拠にしている結論も、入力が変わったので出し直す（根拠の文はそのまま）
    const reinput = new Map<string, ClaimFile>();
    for (const { observations: _o, ...c } of claimsCitingResetup(
      claims,
      [...resetup.keys()],
      new Set(repointed.keys()),
    ))
      reinput.set(c.id, c);
    const rewritten = new Map<string, ClaimDraft>();
    for (const [cid, c] of [...repointed, ...reinput]) {
      const own = repointedClaimOwn(c, afterAll, ids);
      const result = rewriteClaim(
        c,
        { from: undefined, basis: c.basis, own, merged: mergeClaimUpdate(c, {}) },
        claims,
        afterAll,
      );
      const kept = keepHypothesis(c.state, result);
      // 入力を付け替えた比べを根拠にしている結論は、更新日のほかに変わらなければ書かない（根拠の文は変えていない）
      if (reinput.has(cid) && isDeepStrictEqual({ ...kept.file, updated: c.updated }, c)) {
        console.log(`入力を付け替えた比べを根拠にしている結論 ${cid}: 出し直しても変わらない`);
        continue;
      }
      rewritten.set(cid, kept);
    }
    const written = [...new Set(changed.map((o) => o.recording))].map((recording) =>
      saveObservations(recording, loadRecordingObservations(recording).map(withChanged), { format: false }),
    );
    for (const [cid, { file }] of rewritten) {
      const path = `${CLAIMS_DIR}${cid}.json`;
      writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
      written.push(path);
    }
    formatFiles(written);
    console.log(`無効にした（理由: ${values.reason.trim()}）: ${ids.join('・')}`);
    if (resetup.size > 0) console.log(`setup の参照を付け替えた比べ: ${[...resetup.keys()].join('・')}`);
    // 付け替えなかった比べ（--by が無い）は、無効の観測値を指したまま（records:check が止める）
    const referring =
      by === undefined
        ? all.filter((o) => !ids.includes(o.id) && setupRefIds(o).some((id) => ids.includes(id))).map((o) => o.id)
        : [];
    if (referring.length > 0)
      console.log(
        `無効にした観測値を setup で指している比べ（付け替えていない。--by で付け替えるか、比べも無効にする）: ${referring.join('・')}`,
      );
    for (const [cid, result] of rewritten)
      reportRewrite(
        reinput.has(cid) ? `入力を付け替えた比べを根拠にしている結論 ${cid}` : `根拠を付け替えた結論 ${cid}`,
        claims.find((c) => c.id === cid)!,
        result,
      );
    // 付け替えなかった結論（--by が無い）は、無効の根拠を残したまま（records:check が、確定の結論の根拠がすべて無効なら止める）
    const citing = claimsCiting(claims, ids)
      .filter((c) => !repointed.has(c.id))
      .map((c) => `${c.id}（${c.state}）`);
    if (citing.length > 0)
      console.log(`無効にした観測値を根拠にしている結論（付け替えていない）: ${citing.join('・')}`);
    console.log('npm run records:check を回す（commit はしない）');
  } else {
    const from = values.from;
    const recordingId = values.recording;
    if (!from || !recordingId) fail('--from V-NNNN と --recording <録画 id> が要る');
    if (!verifications.some((v) => v.id === from)) fail(`検証記録 ${from} が無い`);
    const parsed = readDraftJson();
    const drafts = (Array.isArray(parsed) ? parsed : [parsed]) as ObservationDraft[];
    // 番号・録画・出どころ・読んだ日はこのコマンドが付ける（下書きの値で上書きさせない）
    const shape = draftShapeErrors(drafts);
    if (shape.length > 0) fail(shape.join('\n'));
    if (!recordings.has(recordingId)) fail(`録画 ${recordingId} が台帳に無い`);
    const { existing, finished } = prepareObservations(recordingId, drafts, { source: from, readAt: today });
    checked(finished);
    writeObservations(recordingId, existing, finished);
  }
} else if (kind === 'backlog') {
  // 課題のファイルの起票（plan/design-workflow-simplification-17.md 9 節。書き方は plan/backlog.md の冒頭）
  const section = values.section;
  if (section === undefined) fail('--section <節> が要る');
  const slots = parseBacklogTemplate(loadBacklogTemplate());
  const slot = slots.find((s) => s.section === section);
  if (slot === undefined)
    fail(`節 ${section} が雛形（records/backlog/template.md）に無い（${slots.map((s) => s.section).join('・')}）`);
  const items = loadBacklog();
  // ほかのブランチが使った番号を見るのは、番号の列のある節だけ（git を回すので）
  const columns = slot.columns?.filter((c) => c !== '#');
  let taken: readonly string[] = [];
  if (slot.columns?.includes('#') === true) {
    const branches = idsInBranches();
    if (branches.note !== '') console.log(`注意: ${branches.note}`);
    taken = branches.ids;
  }
  const placed = backlogPlacement(slot, items, {
    ...(values.name === undefined ? {} : { name: values.name }),
    first: values.first,
    taken,
  });
  if (typeof placed === 'string') fail(placed);
  let body: Pick<BacklogFile, 'text' | 'cells'>;
  if (columns === undefined) {
    if (values.text === undefined || values.cell !== undefined)
      fail(`節 ${section} は箇条なので --text（本文）だけを渡す`);
    body = { text: values.text };
  } else {
    if (values.cell === undefined || values.text !== undefined)
      fail(`節 ${section} は表なので、列ごとに --cell "<列>=<文>" を渡す（列: ${columns.join('・')}）`);
    const given = new Map(
      values.cell.map((c) => {
        const at = c.indexOf('=');
        if (at < 0) fail(`--cell は "<列>=<文>": ${c}`);
        return [c.slice(0, at).trim(), c.slice(at + 1).trim()] as const;
      }),
    );
    const unknown = [...given.keys()].filter((c) => !columns.includes(c));
    if (unknown.length > 0) fail(`節 ${section} の表に無い列: ${unknown.join('・')}（列: ${columns.join('・')}）`);
    body = { cells: Object.fromEntries(columns.map((c) => [c, given.get(c) ?? ''])) };
  }
  const item: BacklogFile = {
    section,
    ...(placed.order === undefined ? {} : { order: placed.order }),
    ...body,
  };
  const errors = validateBacklog(
    slots,
    [{ ...item, name: placed.name }],
    backlogContext(
      loadClaims().map((c) => c.id),
      verifications.map((v) => v.id),
      recordingMap(loadRecordingsFile()).keys(),
      loadObservations().map((o) => o.id),
    ),
  );
  if (errors.length > 0) fail(`課題の検査に通らないので書かない:\n${errors.map((e) => `  ${e}`).join('\n')}`);
  const path = `${ROOT}records/backlog/${placed.name}.json`;
  if (existsSync(path)) fail(`${path} が既にある`);
  writeJson(path, item);
  console.log(
    `${path} を作った（節 ${section}${placed.order === undefined ? '' : `・order ${placed.order}`}）。plan/backlog.md は npm run records:check が作り直す（生成物なので commit しない）`,
  );
  reserve([path], placed.name, !values['no-push']);
} else {
  fail('verification・claim・observation・backlog のどれかを指定する');
}
