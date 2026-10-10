// 検証記録を閉じる前の検査（plan/design-records-automation.md 3.7 節）。npm run records:close の純粋な部分。
import { gradeAboveCandidate, type Claim, type ClaimGrade } from './claims.ts';
import { summarizeWarnings, type PairWarning } from './relevance.ts';
import type { Observation } from './observations.ts';
import type { Verification } from './verifications.ts';

export type CloseInput = {
  verification: Verification;
  claims: readonly Claim[];
  /** その検証記録を source にする観測値 */
  observations: readonly Observation[];
  /** 結論 ID → 機械の等級の候補 */
  gradeCandidates: ReadonlyMap<string, ClaimGrade>;
  /** 結論 ID → 効きうる未確定の要素が残った組（最小構成の検査。plan/design-minimal-relevance.md 5 節） */
  minimal: ReadonlyMap<string, readonly PairWarning[]>;
};

export type CloseResult = { errors: string[]; warnings: string[] };

/** 完了にできるかの検査。errors が空なら閉じてよい。warnings は人が目を通す */
export function closeChecks(input: CloseInput): CloseResult {
  const { verification: v } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  const at = v.id;
  if (v.state === '完了' || v.state === '打ち切り') warnings.push(`${at}: 既に ${v.state}`);
  if (v.claims.length === 0) errors.push(`${at}: 「結論」が 1 つ以上要る（完了の条件）`);
  const ownIds = new Set(input.observations.map((o) => o.id));
  const byId = new Map(input.claims.map((c) => [c.id, c]));
  for (const id of v.claims) {
    const c = byId.get(id);
    if (c === undefined) {
      errors.push(`${at}: 結論 ${id} が無い`);
      continue;
    }
    const tied = c.observations.some((o) => ownIds.has(o)) || c.basis.includes(v.id);
    if (!tied) errors.push(`${at}: 結論 ${id} の根拠に、この検証記録の観測値も ID（${v.id}）も無い`);
    const candidate = input.gradeCandidates.get(id);
    if (c.grade !== undefined && candidate !== undefined && gradeAboveCandidate(c.grade, candidate)) {
      // 人の判断で候補より上の等級にした結論（1 本の録画の中の反復など。plan/design-minimal-relevance.md 11.7 節）は、
      // 理由（gradeReason）を書けば注意にとどめる
      if (c.gradeReason !== undefined)
        warnings.push(
          `${at}: 結論 ${id} の等級（${c.grade}）は機械の候補（${candidate}）より上（理由: ${c.gradeReason}）`,
        );
      else
        errors.push(
          `${at}: 結論 ${id} の等級（${c.grade}）が機械の候補（${candidate}）より上。根拠に別の録画を足すか、等級を候補に合わせるか、人の判断なら理由を gradeReason に書く`,
        );
    }
    if (c.state === '確定') {
      // 最小構成の検査（plan/design-minimal-relevance.md 11 節。2026-10-08 のオーナー決定）: この記録の観測値の組に警告があれば止める。
      // 既存の確定の結論を指す記録もあるので、ほかの記録の観測値の組の警告は注意にとどめる（records:check でも止めない）
      const warned = (input.minimal.get(id) ?? []).filter((w) => w.elements.length > 0);
      const ownWarned = warned.filter((w) => ownIds.has(w.observation));
      const otherWarned = warned.filter((w) => !ownIds.has(w.observation));
      if (ownWarned.length > 0)
        errors.push(
          `${at}: 結論 ${id} を確定にしているが、この記録の観測値の組に最小構成の警告がある（${summarizeWarnings(ownWarned)}）。効かない理由を結論の minimal に印として書くか、仮説にする`,
        );
      if (otherWarned.length > 0)
        warnings.push(
          `${at}: 結論 ${id} のほかの記録の観測値の組に最小構成の警告がある（${summarizeWarnings(otherWarned)}）`,
        );
      if (c.subject === undefined) warnings.push(`${at}: 確定の結論 ${id} に結論の対象（subject）が無い`);
      // 反復実測の再現に、仮説・値・読み方を決めるのに使った録画を数えない（plan/design-investigation-review.md 1.3 節）。
      // その録画を結論に書いていなければ止める（無ければ []）
      if (c.grade === '反復実測' && c.decidedOn === undefined)
        errors.push(
          `${at}: 確定の結論 ${id}（反復実測）に decidedOn が無い。仮説・値・読み方を決めるのに使った録画を書く（無ければ []。records:new の --decided-on）`,
        );
      // 設計書 9 節の 2: 確定にする結論の根拠の観測値のうち、compare を持たないものには scope が要る
      const noScope = input.observations
        .filter((o) => c.observations.includes(o.id) && o.invalid === undefined)
        .filter((o) => o.compare === undefined && o.scope === undefined)
        .map((o) => o.id);
      if (noScope.length > 0)
        errors.push(
          `${at}: 確定の結論 ${id} の根拠の観測値に scope が無い（${noScope.join('・')}。compare を持たないものに要る）`,
        );
    }
  }
  // 撮る前の予測は確定の条件にしない（plan/design-investigation-review.md 1 節。2026-10-10 のオーナーの決定）ので、予測の順は見ない
  if ((v.sections.get('次に撮るもの') ?? '').trim() === '')
    errors.push(`${at}: 「次に撮るもの」が空（「なし」でもよい）`);
  if ((v.sections.get('分かったこと・分からないこと') ?? '').trim() === '') {
    errors.push(`${at}: 「分かったこと・分からないこと」が空`);
  }
  for (const o of input.observations) {
    if (o.invalid !== undefined) warnings.push(`${at}: 観測値 ${o.id} は失効している（${o.invalid.reason}）`);
  }
  return { errors, warnings };
}

/** 冒頭の「- 状態: …」の行を書き換える */
export function markState(markdown: string, state: '完了'): string {
  const re = /^- 状態: .*$/m;
  if (!re.test(markdown)) throw new Error('冒頭に「- 状態:」の行が無い');
  return markdown.replace(re, `- 状態: ${state}`);
}

/** PR の題名の案 */
export function prTitle(v: Pick<Verification, 'id' | 'title' | 'claims'>): string {
  return `${v.title}（${[v.id, ...v.claims].join('、')}）`;
}
