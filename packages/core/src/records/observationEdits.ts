// 観測値の直しと無効（records:new observation --replace・--invalidate の純粋な部分。plan/design-workflow-simplification-17.md 3 節）。
// 直しは同じ ID のまま欄を下書きで差し替え、無効は invalid（observations/types.ts）を付ける。無効にした観測値を根拠にしている結論は、
// 新しい観測値に付け替えられる（根拠の文・runs・minimal の ID を置き換える）。
import { observationIdsIn, type ClaimFile } from './claims.ts';
import type { Observation, ObservationDraft } from './observations/types.ts';

/** 下書きに書かせない欄（このコマンドが付ける・前の値を残す） */
const DRAFT_RESERVED_KEYS = ['id', 'recording', 'source', 'readAt'] as const;

/** 下書きの形の誤り（予約した欄・kind と description が無い）。records:new observation の足す・直すで同じ検査 */
export function draftShapeErrors(drafts: readonly ObservationDraft[]): string[] {
  const errors: string[] = [];
  if (drafts.length === 0 || drafts.some((d) => d === null || typeof d !== 'object' || Array.isArray(d)))
    return ['下書きは観測値の欄のオブジェクトか、その配列'];
  const given = drafts.flatMap((d) => DRAFT_RESERVED_KEYS.filter((k) => k in d));
  if (given.length > 0) errors.push(`下書きに ${[...new Set(given)].join('・')} を書かない（このコマンドが付ける）`);
  if (drafts.some((d) => typeof d.description !== 'string' || typeof d.kind !== 'string'))
    errors.push('下書きには kind と description（文字列）が要る');
  return errors;
}

/** id・recording・source・readAt を前の観測値のまま残し、ほかの欄を下書きで差し替える */
export function replacedObservation(before: Observation, draft: ObservationDraft): Observation {
  return {
    id: before.id,
    recording: before.recording,
    ...draft,
    source: before.source,
    ...(before.readAt === undefined ? {} : { readAt: before.readAt }),
  } as Observation;
}

/** invalid を付けた観測値（理由と日付） */
export function invalidatedObservation(before: Observation, reason: string, date: string): Observation {
  return { ...before, invalid: { reason, date } };
}

/**
 * 結論の根拠の観測値 from を to に付け替える（根拠の文の `from` を `to` に置き換え、runs・minimal の観測値の並びも置き換える）。
 * to が既に根拠にあれば、並びの中の `from`（前後が ・ で、注記の括弧が続かないもの）を外し、残りは置き換える（注記は消さない）。
 * from が範囲（`a-01`〜`a-04`。端を含む）の中にだけあるときは、範囲を残して to を書き足す（範囲の中の from は無効のまま残る）。from を根拠に
 * していなければ undefined
 */
export function repointClaim(claim: ClaimFile, from: string, to: string, today: string): ClaimFile | undefined {
  const ids = observationIdsIn(claim.basis);
  if (!ids.includes(from)) return undefined;
  // 範囲（`a-01`〜`a-04`）の端の from は範囲の一部なので、置き換えない
  const literal = `\`${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``;
  const alone = new RegExp(`(?<!〜\\s*)${literal}(?!\\s*〜)`, 'g');
  // 並びの中の from（前後が ・ で、注記の括弧も範囲も続かないもの）
  const listed = [new RegExp(`・${literal}(?![\\s〜（])`), new RegExp(`(?<!〜\\s*)${literal}・`)].find((re) =>
    re.test(claim.basis),
  );
  const toLiteral = `\`${to}\``;
  const basis =
    claim.basis.search(alone) < 0
      ? ids.includes(to)
        ? claim.basis
        : `${claim.basis}・${toLiteral}`
      : (ids.includes(to) && listed !== undefined ? claim.basis.replace(listed, '') : claim.basis).replace(
          alone,
          toLiteral,
        );
  const swap = (list: string[]) => [...new Set(list.map((o) => (o === from ? to : o)))];
  return {
    ...claim,
    basis,
    ...(claim.runs === undefined
      ? {}
      : { runs: claim.runs.map((r) => ({ ...r, observations: swap(r.observations) })) }),
    ...(claim.minimal === undefined
      ? {}
      : {
          minimal: claim.minimal.map((m) =>
            m.observations === '*' ? m : { ...m, observations: swap(m.observations) },
          ),
        }),
    updated: today,
  };
}
