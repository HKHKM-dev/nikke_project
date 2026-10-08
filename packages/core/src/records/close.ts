// 検証記録を閉じる前の検査（plan/design-records-automation.md 3.7 節）。npm run records:close の純粋な部分。
import { gradeAboveCandidate, type Claim, type ClaimGrade } from './claims.ts';
import { summarizeWarnings, type PairWarning } from './relevance.ts';
import type { Observation } from './observations.ts';
import { seenObservationIds, type PredictionFile } from './predictions.ts';
import type { RecordingEntry } from './recordings.ts';
import type { Verification } from './verifications.ts';

export type CloseInput = {
  verification: Verification;
  claims: readonly Claim[];
  /** その検証記録を source にする観測値 */
  observations: readonly Observation[];
  recordings: ReadonlyMap<string, RecordingEntry>;
  prediction: PredictionFile | undefined;
  /** 結論 ID → 機械の等級の候補 */
  gradeCandidates: ReadonlyMap<string, ClaimGrade>;
  /** 結論 ID → 効きうる未確定の要素が残った組（最小構成の検査。plan/design-minimal-relevance.md 5 節） */
  minimal: ReadonlyMap<string, readonly PairWarning[]>;
  /**
   * git の履歴で見た、予測と読みの順（plan/design-reread-prediction.md 5 節の B1。ブランチの上で records:close が調べる）。
   * 調べられなかったら undefined
   */
  gitOrder?: GitOrder;
  /**
   * 手計算の予測（予測ファイルが無く、「予測」の節に「手計算」と書いた記録。plan/design-pellet-hit.md 7 節）の、「予測」の節の commit と
   * 読みの順。records:close が git の履歴で調べる。調べられなかったら undefined
   */
  handOrder?: GitOrder;
};

const PREDICTION_SECTION = '予測（撮る前に書く）';

/** 検証記録の Markdown から「予測」の節の本文（見出しの次の行から次の見出しの前まで。前後の空白を除く）を取り出す。無ければ undefined */
export function predictionSectionOf(markdown: string): string | undefined {
  const head = `## ${PREDICTION_SECTION}
`;
  const start = markdown.indexOf(head);
  if (start < 0) return undefined;
  const body = markdown.slice(start + head.length);
  const next = body.search(/^## /m);
  return (next < 0 ? body : body.slice(0, next)).trim();
}

/**
 * 予測ファイルの代わりに、「予測」の節に手計算の予測を書いた記録か（plan/design-pellet-hit.md 7 節）。語彙が無く仮説ごとに定義を
 * 切り替えるので予測ファイルにできないとき。順は「予測」の節の commit と観測値の commit で確かめる
 */
export function isHandPrediction(v: Pick<Verification, 'sections'>): boolean {
  const section = v.sections.get(PREDICTION_SECTION) ?? '';
  return !/探索|予測なし/.test(section) && /手計算/.test(section);
}

/**
 * 予測の commit と読みの順の検査（予測ファイルと手計算の予測で同じ）。label.unsaved は commit していないものの呼び名、
 * label.commit は予測の commit の呼び名
 */
function orderChecks(
  g: GitOrder,
  label: { unsaved: string; commit: string },
  at: string,
  errors: string[],
  warnings: string[],
): void {
  const what = label.commit;
  if (g.uncommitted || g.predictionCommit === null) {
    errors.push(`${at}: ${label.unsaved}が commit されていない。予測を commit してから読む`);
  } else if (g.notAfter.length > 0) {
    errors.push(
      `${at}: 観測値 ${g.notAfter.join('・')} を、${what}の commit（${g.predictionCommit.slice(0, 7)}）より前か同じ commit で足した`,
    );
  }
  if (g.predictionCommit !== null && g.merged !== undefined && g.merged.length > 0)
    warnings.push(
      `${at}: 観測値 ${g.merged.join('・')} は${what}と同じマージ済みの commit（${g.predictionCommit.slice(0, 7)}）で足されていて、git では順を見られない（控えの検査だけ）`,
    );
}

export type GitOrder = {
  /** 予測ファイルの predicted に手元の変更がある（予測を commit していない） */
  uncommitted: boolean;
  /** いまの predicted を入れた commit（無ければ null） */
  predictionCommit: string | null;
  /** この検証記録の観測値のうち、予測の commit より前か同じ commit で足したもの */
  notAfter: string[];
  /**
   * この検証記録の観測値のうち、予測と同じ commit で足され、その commit が main にマージ済みのもの（notAfter には入れない）。
   * スカッシュマージでブランチの順が消えたので、git では順を見られない（控えの検査だけ。plan/design-reread-prediction.md 5 節の B1）
   */
  merged?: string[];
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
  // 予測は撮る前に書く。起票より前に撮った録画（読み直し）は撮る前に予測を書けないので、録画の日は見ず、読んだ日とだけ比べる。
  // 読み直しは「比べる値を読む前」でよい（plan/design-reread-prediction.md）。控え（seen）があれば、それと git の順で確かめる
  const dates = [
    ...v.recordings.flatMap((r) => {
      const e = input.recordings.get(r);
      return e !== undefined && 'date' in e && e.date >= v.date ? [e.date] : [];
    }),
    ...input.observations.flatMap((o) => (o.readAt === undefined ? [] : [o.readAt])),
  ].sort();
  const earliest = dates[0];
  if (input.prediction === undefined) {
    const section = v.sections.get(PREDICTION_SECTION) ?? '';
    if (isHandPrediction(v)) {
      if (input.handOrder === undefined) {
        errors.push(`${at}: 手計算の予測（「予測」の節）と観測値の順を git の履歴で確かめられない`);
      } else
        orderChecks(
          input.handOrder,
          { unsaved: '手計算の予測（「予測」の節）', commit: '手計算の予測' },
          at,
          errors,
          warnings,
        );
    } else if (!/探索|予測なし/.test(section)) {
      errors.push(
        `${at}: 予測ファイル（records/predictions/${v.id}.json）が無い。探索なら「予測」の節に「探索」か「予測なし」と書く。予測ファイルにできない予測（仮説ごとに定義を切り替えるなど）は、「予測」の節に「手計算」の予測を書いて撮る前に commit する`,
      );
    }
  } else if (input.prediction.predicted === null) {
    errors.push(`${at}: 予測ファイルはあるが、予測を出していない（npm run records:predict -- ${v.id}）`);
  } else {
    const predicted = input.prediction.predicted;
    if (earliest !== undefined && predicted.at > earliest) {
      errors.push(`${at}: 予測の日付（${predicted.at}）が、録画の日か観測値を読んだ日（${earliest}）より後`);
    }
    if (predicted.seen !== undefined) {
      const seen = seenObservationIds(input.prediction);
      const early = input.observations.filter((o) => seen.has(o.id)).map((o) => o.id);
      if (early.length > 0) {
        errors.push(`${at}: 観測値 ${early.join('・')} は予測の時点で既にあった（予測の控え seen に入っている）`);
      }
      for (const r of v.recordings) {
        const e = input.recordings.get(r);
        if (e !== undefined && 'date' in e && e.date < predicted.at && !(r in predicted.seen)) {
          errors.push(
            `${at}: 録画 ${r}（${e.date}）は予測より前に撮ったのに、予測の控え（seen）に無い。読み直しなら「録画」に挙げてから records:predict を出し直す`,
          );
        }
      }
      // git の順は控えのある予測ファイルだけ見る（控えの無い古い記録は、録画を足しながら予測を出し直したものがある）
      if (input.gitOrder !== undefined)
        orderChecks(input.gitOrder, { unsaved: '予測ファイルの predicted ', commit: '予測' }, at, errors, warnings);
    }
  }
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
