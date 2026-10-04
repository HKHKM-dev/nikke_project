// 検証記録を閉じる前の検査（plan/design-records-automation.md 3.7 節）。npm run records:close の純粋な部分。
import { gradeAboveCandidate, type Claim, type ClaimGrade } from './claims.ts';
import type { MinimalWarning } from './minimal.ts';
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
  warnings: readonly MinimalWarning[];
  /**
   * git の履歴で見た、予測と読みの順（plan/design-reread-prediction.md 5 節の B1。ブランチの上で records:close が調べる）。
   * 調べられなかったら undefined
   */
  gitOrder?: GitOrder;
};

export type GitOrder = {
  /** 予測ファイルの predicted に手元の変更がある（予測を commit していない） */
  uncommitted: boolean;
  /** いまの predicted を入れた commit（無ければ null） */
  predictionCommit: string | null;
  /** この検証記録の観測値のうち、予測の commit より前か同じ commit で足したもの */
  notAfter: string[];
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
      errors.push(
        `${at}: 結論 ${id} の等級（${c.grade}）が機械の候補（${candidate}）より上。根拠に別の録画を足すか、等級を候補に合わせる`,
      );
    }
    if (c.state === '確定' && input.warnings.length > 0) {
      warnings.push(
        `${at}: 最小構成の警告があるのに結論 ${id} を確定にしている（録画 ${input.warnings.map((w) => w.recording).join('・')}）`,
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
    const section = v.sections.get('予測（撮る前に書く）') ?? '';
    if (!/探索|予測なし/.test(section)) {
      errors.push(
        `${at}: 予測ファイル（records/predictions/${v.id}.json）が無い。探索なら「予測」の節に「探索」か「予測なし」と書く`,
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
      const g = input.gitOrder;
      if (g !== undefined) {
        if (g.uncommitted || g.predictionCommit === null) {
          errors.push(`${at}: 予測ファイルの predicted が commit されていない。予測を commit してから読む`);
        } else if (g.notAfter.length > 0) {
          errors.push(
            `${at}: 観測値 ${g.notAfter.join('・')} を、予測の commit（${g.predictionCommit.slice(0, 7)}）より前か同じ commit で足した`,
          );
        }
      }
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
