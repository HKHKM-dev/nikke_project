// 起案と結論の下書き（plan/design-records-automation.md 3.1・3.6 節）。npm run records:new の純粋な部分。
// 採番（最大の番号 + 1）、検証記録のひな形、結論の状態（確定にできる条件が全部そろえば確定、1 つでも欠ければ仮説と理由）。
import { CLAIM_TOPICS, type ClaimFile, type ClaimGrade, type ClaimTopic } from './claims.ts';
import type { MinimalWarning } from './minimal.ts';
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
    '- 録画: ',
    '- 状態: 調査中',
    ...(d.derivedFrom ? [`- 派生元: \`${d.derivedFrom}\``] : []),
  ];
  return `${[
    ...head,
    '',
    '## 条件',
    '',
    '',
    '## 予測（撮る前に書く）',
    '',
    `仮説ごとに、この録画で何が見えるはずか。見分けられるか。外れたときの影響。数値は予測ファイル（records/predictions/${d.id}.json。npm run records:predict -- ${d.id}）を指す。`,
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
  /** その検証記録の最小構成の警告 */
  warnings: readonly MinimalWarning[];
  /** 予測との比べ（予測ファイルが無ければ undefined） */
  prediction: PredictionComparison | undefined;
};

export type ClaimDraft = { file: ClaimFile; reasons: string[] };

/**
 * 結論の下書き（3.6 節）。状態は、等級の候補が厳密一致か反復実測で、疑問の印（最小構成の警告・予測の日付・合う仮説が 1 つに
 * 決まらない・失効した観測値・許容外）が無いときだけ確定。1 つでも欠ければ仮説にし、欠けた条件を reasons に返す
 */
export function claimDraft(input: ClaimDraftInput): ClaimDraft {
  const reasons: string[] = [];
  const valid = input.observations.filter((o) => o.invalid === undefined);
  const invalid = input.observations.filter((o) => o.invalid !== undefined);
  const candidate = input.gradeCandidate;
  if (candidate === undefined) reasons.push('モデルと比べた観測値が無い（等級の候補を出せない）');
  else if (candidate !== '厳密一致' && candidate !== '反復実測') reasons.push(`等級の候補が ${candidate}`);
  if (input.warnings.length > 0) {
    reasons.push(`最小構成の警告がある（録画 ${input.warnings.map((w) => w.recording).join('・')}）`);
  }
  if (invalid.length > 0) reasons.push(`失効した観測値がある（${invalid.map((o) => o.id).join('・')}）`);
  const outside = [...input.compared.entries()].filter(([, ok]) => !ok).map(([id]) => id);
  if (outside.length > 0) reasons.push(`許容外の観測値がある（${outside.join('・')}）`);
  if (input.prediction !== undefined) {
    const p = input.prediction;
    if (p.file.predicted === null) reasons.push('予測ファイルがあるが、予測を出していない');
    else {
      const readAts = valid.map((o) => o.readAt).filter((d): d is string => d !== undefined);
      const earliest = readAts.sort()[0];
      if (earliest !== undefined && p.file.predicted.at > earliest) {
        reasons.push(`予測の日付（${p.file.predicted.at}）が、観測値を読んだ日（${earliest}）より後`);
      }
      if (p.file.hypotheses.length >= 2) {
        const fits = [...p.score.entries()].filter(([, s]) => s.total > 0 && s.ok === s.total).map(([h]) => h);
        if (fits.length !== 1) {
          reasons.push(
            fits.length === 0 ? '予測と合う仮説が無い' : `予測と合う仮説が ${fits.length} つ（${fits.join('・')}）`,
          );
        }
      }
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
  };
  return { file, reasons };
}
