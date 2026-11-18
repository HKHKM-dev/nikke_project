// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。npm run records:new の純粋な部分。
// 採番（最大の番号 + 1）、検証記録のひな形、結論の状態（確定にできる条件が全部そろえば確定、1 つでも欠ければ仮説と理由）。
import {
  CLAIM_TOPICS,
  CONFIRMABLE_GRADES,
  JUDGMENT_OVERRIDES,
  validateJudgment,
  type ClaimFile,
  type ClaimGrade,
  type ClaimSubject,
  type ClaimTopic,
  type DecidedOn,
  type Judgment,
  type JudgmentOverride,
  type RunRepeat,
} from './claims.ts';
import { ID_DIGITS } from './ids.ts';
import { summarizeWarnings, type PairWarning } from './relevance.ts';
import type { Observation } from './observations/types.ts';
import type { PredictionComparison } from './predictions.ts';

/** 既存の ID（V-0012・C-0159 など）から、同じ接頭辞の次の空き番号 */
export function nextId(prefix: 'V' | 'C', existing: readonly string[]): string {
  const re = new RegExp(`^${prefix}-(${ID_DIGITS})$`);
  let max = 0;
  let width = 4;
  for (const id of existing) {
    const m = re.exec(id);
    if (m === null) continue;
    max = Math.max(max, Number(m[1]));
    width = Math.max(width, m[1]!.length);
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

const ID_PATH = new RegExp(
  String.raw`(?:^|\/)records\/(?:verifications\/(V-${ID_DIGITS})-[^/]*\.md|claims\/(C-${ID_DIGITS})\.json)$`,
);

/**
 * git の出力のファイル名の並び（records/verifications/V-NNNN-….md・records/claims/C-NNNN.json）から、検証記録と結論の ID を取り出す
 * （重複なし・出てきた順）。ほかのブランチが使っている番号を records:new の空き番号から除くのに使う（V-0378 の振り直し）
 */
export function idsInPaths(text: string): string[] {
  const ids = new Set<string>();
  for (const line of text.split('\n')) {
    const m = ID_PATH.exec(line.trim());
    if (m !== null) ids.add((m[1] ?? m[2])!);
  }
  return [...ids];
}

export type VerificationDraft = {
  id: string;
  title: string;
  /** ファイル名の短い名前（英小文字・数字・-） */
  name: string;
  topic: ClaimTopic;
  question: string;
  date: string;
  derivedFrom?: string;
};

export const SHORT_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** 結果の節の生成ブロックの印（records:check が予測との比べの表を書き込む） */
export const RESULTS_MARKERS = ['<!-- records:predictions:start -->', '<!-- records:predictions:end -->'] as const;

/** records/verifications/README.md のひな形に沿った本文（状態は調査中） */
export function verificationTemplate(d: VerificationDraft): string {
  if (!SHORT_NAME.test(d.name)) throw new Error(`短い名前は英小文字・数字・- で始まり: ${d.name}`);
  if (!(CLAIM_TOPICS as readonly string[]).includes(d.topic)) throw new Error(`話題が語彙に無い: ${d.topic}`);
  const head = [
    `# ${d.id}: ${d.title}`,
    '',
    `- 問い: ${d.question}`,
    `- 話題: ${d.topic}`,
    `- 日付: ${d.date}`,
    // 録画は起案の時点では無い（撮る前に起こす）。空の行は Prettier が末尾の空白を消すと書式に合わなくなるので出さない
    '- 状態: 調査中',
    ...(d.derivedFrom ? [`- 派生元: \`${d.derivedFrom}\``] : []),
  ];
  return `${[
    ...head,
    '',
    '## 条件',
    '',
    '',
    '## 予測',
    '',
    `任意（使わなければ「なし」）。撮影計画で、仮説ごとにこの録画で何が見えるはずか・見分けられるかを確かめるときに書く。数値は予測ファイル（records/predictions/${d.id}.json。npm run records:predict -- ${d.id}）を指す。仮説を立てるのに使った録画は、結論の decidedOn に書く。`,
    '',
    '## 読み方',
    '',
    '',
    '## 結果',
    '',
    RESULTS_MARKERS[0],
    '',
    '（予測との比べの表は npm run records:check が書き込む）',
    '',
    RESULTS_MARKERS[1],
    '',
    '## 分かったこと・分からないこと',
    '',
    '',
    '## 次に撮るもの',
    '',
    '',
  ].join('\n')}`;
}

export function verificationFileName(d: Pick<VerificationDraft, 'id' | 'name'>): string {
  return `${d.id}-${d.name}.md`;
}

export type ClaimDraftInput = {
  id: string;
  verification: string;
  topic: ClaimTopic;
  text: string | undefined;
  today: string;
  /** その検証記録を source にする観測値 */
  observations: readonly Observation[];
  /** 機械が出した等級の候補（比べた観測値が無ければ undefined） */
  gradeCandidate: ClaimGrade | undefined;
  /** 比べた観測値の ID → 許容内か */
  compared: ReadonlyMap<string, boolean>;
  /** 結論の対象（plan/design-minimal-relevance.md 3.2 節。records:new の --subject・--mechanism） */
  subject?: ClaimSubject;
  /** 下書きの結論 × 根拠の観測値の組のうち、効きうる未確定の要素が残った組（最小構成の検査。同 5 節） */
  minimal: readonly PairWarning[];
  /** 予測との比べ（予測ファイルが無ければ undefined） */
  prediction: PredictionComparison | undefined;
  /** 仮説・値・読み方を決めるのに使った録画（records:new の --decided-on。plan/design-investigation-review.md 1.3 節）。無ければ undefined */
  decidedOn?: DecidedOn[];
  /** 1 本の録画の中の反復（records:new の --run。plan/design-grade-runs.md 2 節）。無ければ undefined */
  runs?: RunRepeat[];
  /** 合わせ込みの定数を持たない仮説の、式と定数の出どころ（records:new の --parameter-free。同 3 節）。無ければ undefined */
  parameterFree?: string;
  /**
   * 人の判断で上書きする確定の条件と理由（records:new の --judgment。records:close と同じ judgment）。上書きした条件は仮説の理由にしない
   */
  judgment?: Judgment;
  /**
   * 人が決めた等級（records:new claim --update が渡す、前からある結論の等級: gradeReason を書いて候補より上にしたものか、比べる指標の
   * 無いデータ明記）。書けば等級の欄はこれで、候補が確定にできる等級でないことを仮説の理由にしない
   */
  grade?: ClaimGrade;
};

export type ClaimDraft = { file: ClaimFile; reasons: string[] };

/** 最小構成の警告で仮説にした理由の書き出し（records:close が、理由がこれだけの結論をまとめて確定にする候補にする） */
export const MINIMAL_REASON = '最小構成の警告がある';

/**
 * 結論の下書き（3.6 節）。状態は、等級の候補が厳密一致か反復実測で、疑問の印（結論の対象が無い・反復実測なのに decidedOn が無い・
 * 最小構成の警告・scope の無い観測値・予測と合う仮説が 2 つ以上・失効した観測値・許容外）が無いときだけ確定。1 つでも欠ければ仮説にし、
 * 欠けた条件を reasons に返す。撮る前の予測と読みの順は見ない（plan/design-investigation-review.md 1 節）。
 * 最小構成の警告は plan/design-minimal-relevance.md の組の判定（records/relevance.ts）。judgment で上書きした条件（指標なし・最小構成の警告・
 * 許容外・合う仮説が 2 つ以上）は理由にしない。等級（grade か候補）が確定にできるもの（厳密一致・反復実測・データ明記）でなければ仮説
 */
export function claimDraft(input: ClaimDraftInput): ClaimDraft {
  const reasons: string[] = [];
  const valid = input.observations.filter((o) => o.invalid === undefined);
  const invalid = input.observations.filter((o) => o.invalid !== undefined);
  const candidate = input.gradeCandidate;
  const grade = input.grade ?? candidate ?? (valid.length > 0 ? '単独実測' : '推論');
  // 人の判断で上書きした条件（plan/design-investigation-review.md 3 節。records:close と同じ）
  const judged = (o: JudgmentOverride) => input.judgment?.overrides.includes(o) === true;
  let gradeBlocked = false;
  if (candidate === undefined) {
    if (grade !== 'データ明記' && !judged('指標なし')) {
      reasons.push('モデルと比べた観測値が無い（等級の候補を出せない）');
      gradeBlocked = true;
    }
  } else if (input.grade === undefined && candidate !== '厳密一致' && candidate !== '反復実測') {
    reasons.push(`等級の候補が ${candidate}`);
    gradeBlocked = true;
  }
  if (!gradeBlocked && !CONFIRMABLE_GRADES.includes(grade))
    reasons.push(`等級が ${grade}（確定にできるのは ${CONFIRMABLE_GRADES.join('・')}）`);
  if (input.subject === undefined) reasons.push('結論の対象（subject）が無い（--subject か --mechanism で書く）');
  if (grade === '反復実測' && input.decidedOn === undefined)
    reasons.push('decidedOn が無い（仮説・値・読み方を決めるのに使った録画。無ければ []。--decided-on で書く）');
  const warned = input.minimal.filter((w) => w.elements.length > 0);
  if (warned.length > 0 && !judged('最小構成の警告')) {
    reasons.push(`${MINIMAL_REASON}（${summarizeWarnings(warned)}）`);
  }
  // 設計書 9 節の 2: compare を持たない根拠の観測値には scope が要る
  const noScope = valid.filter((o) => o.compare === undefined && o.scope === undefined).map((o) => o.id);
  if (noScope.length > 0) reasons.push(`scope の無い観測値がある（${noScope.join('・')}）`);
  if (invalid.length > 0) reasons.push(`失効した観測値がある（${invalid.map((o) => o.id).join('・')}）`);
  const outside = [...input.compared.entries()].filter(([, ok]) => !ok).map(([id]) => id);
  if (outside.length > 0 && !judged('許容外')) reasons.push(`許容外の観測値がある（${outside.join('・')}）`);
  // 予測は任意の道具（plan/design-investigation-review.md 1.3 節）。仮説が 2 つ以上あって 2 つ以上と合うときだけ、見分けられていないと出す
  if (input.prediction !== undefined && input.prediction.file.predicted !== null) {
    const p = input.prediction;
    if (p.file.hypotheses.length >= 2) {
      const fits = [...p.score.entries()].filter(([, s]) => s.total > 0 && s.ok === s.total).map(([h]) => h);
      if (fits.length >= 2 && !judged('合う仮説が 2 つ以上'))
        reasons.push(`予測と合う仮説が ${fits.length} つ（${fits.join('・')}）`);
    }
  }
  const basis = `${valid.length > 0 ? `${basisIdsText(valid.map((o) => o.id))}。` : ''}${input.verification}`;
  const file: ClaimFile = {
    id: input.id,
    text: input.text ?? '（結論の文を書く）',
    state: reasons.length === 0 ? '確定' : '仮説',
    topic: input.topic,
    grade,
    basis,
    model: '（モデル側を書く。未反映ならそう書く）',
    replaces: [],
    updated: input.today,
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.decidedOn === undefined ? {} : { decidedOn: input.decidedOn }),
    ...(input.runs === undefined ? {} : { runs: input.runs }),
    ...(input.parameterFree === undefined ? {} : { parameterFree: input.parameterFree }),
    ...(input.judgment === undefined ? {} : { judgment: input.judgment }),
  };
  return { file, reasons };
}

/**
 * --judgment の値（「<上書きした条件>[・<条件>…]|<理由>」。条件は ・ か , で区切る）を judgment にする。decided は today。
 * 形の誤りは文の並びで返す（validateJudgment と同じ検査）
 */
export function parseJudgment(text: string, today: string): Judgment | string[] {
  const at = text.indexOf('|');
  if (at < 0) return [`--judgment は "<条件>[・<条件>…]|<理由>"（条件は ${JUDGMENT_OVERRIDES.join('・')}）: ${text}`];
  const overrides = text
    .slice(0, at)
    .split(/[・,、]/)
    .map((o) => o.trim())
    .filter((o) => o !== '') as JudgmentOverride[];
  const judgment: Judgment = { decided: today, overrides, reason: text.slice(at + 1).trim() };
  const errors = validateJudgment({ id: '--judgment', judgment });
  return errors.length > 0 ? errors : judgment;
}

/**
 * 前からある結論の根拠の文に、足した観測値と検証記録の ID を書き足す（claimDraft の根拠と同じ「ID・ID。V-NNNN」の形で、前の文の後ろに
 * 句点でつなぐ。前の文に既にある検証記録の ID は書き足さない）。足す観測値が無ければ前の文のまま
 */
export function appendBasis(basis: string, added: readonly string[], verification: string): string {
  if (added.length === 0) return basis;
  return `${basis.replace(/[。\s]+$/, '')}。${basisIdsText(added)}${basis.includes(verification) ? '' : `。${verification}`}`;
}

/** 根拠の文の観測値の並び（`ID`・`ID`） */
export function basisIdsText(ids: readonly string[]): string {
  return ids.map((id) => `\`${id}\``).join('・');
}

/** 前の並びに、まだ無い要素（中身で比べる）を足す。どちらも無ければ undefined */
function mergeUnique<T>(before: readonly T[] | undefined, added: readonly T[] | undefined): T[] | undefined {
  if (before === undefined && added === undefined) return undefined;
  const out = [...(before ?? [])];
  for (const x of added ?? []) if (!out.some((y) => JSON.stringify(y) === JSON.stringify(x))) out.push(x);
  return out;
}

/** records:new claim --update で、前からある結論に重ねる欄（どれも省略できる） */
export type ClaimUpdate = {
  subject?: ClaimSubject;
  decidedOn?: DecidedOn[];
  runs?: RunRepeat[];
  parameterFree?: string;
  judgment?: Judgment;
};

/** 前の欄に --update の欄を重ねる。decidedOn・runs は前の並びに足し、subject・parameterFree・judgment は渡せば置き換える */
export function mergeClaimUpdate(existing: ClaimFile, update: ClaimUpdate): ClaimUpdate {
  const merged: ClaimUpdate = {
    subject: update.subject ?? existing.subject,
    decidedOn: mergeUnique(existing.decidedOn, update.decidedOn),
    runs: mergeUnique(existing.runs, update.runs),
    parameterFree: update.parameterFree ?? existing.parameterFree,
    judgment: update.judgment ?? existing.judgment,
  };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)) as ClaimUpdate;
}

/**
 * --update で書き戻す結論。結論の文・話題・置き換え・印などの前の欄を残し、重ねた欄（mergeClaimUpdate）・根拠の文・model（渡したとき
 * だけ）と、claimDraft の状態・等級・更新日を入れる。when・edge は仮説にだけ書ける欄なので、書いてある結論は仮説のままにし、理由を足す
 */
export function updatedClaim(
  existing: ClaimFile,
  draft: ClaimDraft,
  merged: ClaimUpdate,
  basis: string,
  model: string | undefined,
): ClaimDraft {
  const reasons = [...draft.reasons];
  if (existing.when !== undefined || existing.edge !== undefined)
    reasons.push('when・edge は仮説にだけ書ける欄（確定にするなら、消してからもう一度回す）');
  const file: ClaimFile = {
    ...existing,
    ...merged,
    state: reasons.length === 0 ? '確定' : '仮説',
    ...(draft.file.grade === undefined ? {} : { grade: draft.file.grade }),
    basis,
    ...(model === undefined ? {} : { model }),
    updated: draft.file.updated,
  };
  return { file, reasons };
}
