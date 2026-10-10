// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。npm run records:new の純粋な部分。
// 採番（最大の番号 + 1）、検証記録のひな形、結論の状態（確定にできる条件が全部そろえば確定、1 つでも欠ければ仮説と理由）。
import {
  CLAIM_TOPICS,
  type ClaimFile,
  type ClaimGrade,
  type ClaimSubject,
  type ClaimTopic,
  type DecidedOn,
} from './claims.ts';
import { summarizeWarnings, type PairWarning } from './relevance.ts';
import type { Observation } from './observations.ts';
import type { PredictionComparison } from './predictions.ts';

/** 既存の ID（V-0012・C-0159 など）から、同じ接頭辞の次の空き番号 */
export function nextId(prefix: 'V' | 'C', existing: readonly string[]): string {
  const re = new RegExp(`^${prefix}-(\\d{4,})$`);
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

/**
 * git の出力のファイル名の並び（records/verifications/V-NNNN-….md・records/claims/C-NNNN.json）から、検証記録と結論の ID を取り出す
 * （重複なし・出てきた順）。ほかのブランチが使っている番号を records:new の空き番号から除くのに使う（V-0378 の振り直し）
 */
export function idsInPaths(text: string): string[] {
  const ids = new Set<string>();
  for (const line of text.split('\n')) {
    const m = /(?:^|\/)records\/(?:verifications\/(V-\d{4,})-[^/]*\.md|claims\/(C-\d{4,})\.json)$/.exec(line.trim());
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
};

export type ClaimDraft = { file: ClaimFile; reasons: string[] };

/**
 * 結論の下書き（3.6 節）。状態は、等級の候補が厳密一致か反復実測で、疑問の印（結論の対象が無い・反復実測なのに decidedOn が無い・
 * 最小構成の警告・scope の無い観測値・予測と合う仮説が 2 つ以上・失効した観測値・許容外）が無いときだけ確定。1 つでも欠ければ仮説にし、
 * 欠けた条件を reasons に返す。撮る前の予測と読みの順は見ない（plan/design-investigation-review.md 1 節）。
 * 最小構成の警告は plan/design-minimal-relevance.md の組の判定（records/relevance.ts）
 */
export function claimDraft(input: ClaimDraftInput): ClaimDraft {
  const reasons: string[] = [];
  const valid = input.observations.filter((o) => o.invalid === undefined);
  const invalid = input.observations.filter((o) => o.invalid !== undefined);
  const candidate = input.gradeCandidate;
  if (candidate === undefined) reasons.push('モデルと比べた観測値が無い（等級の候補を出せない）');
  else if (candidate !== '厳密一致' && candidate !== '反復実測') reasons.push(`等級の候補が ${candidate}`);
  if (input.subject === undefined) reasons.push('結論の対象（subject）が無い（--subject か --mechanism で書く）');
  if (candidate === '反復実測' && input.decidedOn === undefined)
    reasons.push('decidedOn が無い（仮説・値・読み方を決めるのに使った録画。無ければ []。--decided-on で書く）');
  const warned = input.minimal.filter((w) => w.elements.length > 0);
  if (warned.length > 0) {
    reasons.push(`最小構成の警告がある（${summarizeWarnings(warned)}）`);
  }
  // 設計書 9 節の 2: compare を持たない根拠の観測値には scope が要る
  const noScope = valid.filter((o) => o.compare === undefined && o.scope === undefined).map((o) => o.id);
  if (noScope.length > 0) reasons.push(`scope の無い観測値がある（${noScope.join('・')}）`);
  if (invalid.length > 0) reasons.push(`失効した観測値がある（${invalid.map((o) => o.id).join('・')}）`);
  const outside = [...input.compared.entries()].filter(([, ok]) => !ok).map(([id]) => id);
  if (outside.length > 0) reasons.push(`許容外の観測値がある（${outside.join('・')}）`);
  // 予測は任意の道具（plan/design-investigation-review.md 1.3 節）。仮説が 2 つ以上あって 2 つ以上と合うときだけ、見分けられていないと出す
  if (input.prediction !== undefined && input.prediction.file.predicted !== null) {
    const p = input.prediction;
    if (p.file.hypotheses.length >= 2) {
      const fits = [...p.score.entries()].filter(([, s]) => s.total > 0 && s.ok === s.total).map(([h]) => h);
      if (fits.length >= 2) reasons.push(`予測と合う仮説が ${fits.length} つ（${fits.join('・')}）`);
    }
  }
  const basisIds = valid.map((o) => `\`${o.id}\``);
  const basis = `${basisIds.length > 0 ? `${basisIds.join('・')}。` : ''}${input.verification}`;
  const file: ClaimFile = {
    id: input.id,
    text: input.text ?? '（結論の文を書く）',
    state: reasons.length === 0 ? '確定' : '仮説',
    topic: input.topic,
    grade: candidate ?? (valid.length > 0 ? '単独実測' : '推論'),
    basis,
    model: '（モデル側を書く。未反映ならそう書く）',
    replaces: [],
    updated: input.today,
    ...(input.subject === undefined ? {} : { subject: input.subject }),
    ...(input.decidedOn === undefined ? {} : { decidedOn: input.decidedOn }),
  };
  return { file, reasons };
}
