// 観測値の直しと無効（records:new observation --replace・--invalidate の純粋な部分。plan/design-workflow-simplification-17.md 3 節）。
// 直しは同じ ID のまま欄を下書きで差し替え、無効は invalid（observations/types.ts）を付ける。無効にした観測値を根拠にしている結論は、
// 新しい観測値に付け替えられる（根拠の文・runs・minimal の ID を置き換える）。比べの setup が ID で指している観測値（入力）を無効にしたときは、
// 比べを写さずに setup の参照を新しい観測値に付け替える（plan/design-workflow-simplification-18.md 1 節）。
import { isActiveClaim, observationIdsIn, type Claim, type ClaimFile } from './claims.ts';
import { mapSetupRefs } from './observations/setup.ts';
import type { Observation, ObservationDraft } from './observations/types.ts';

/** 下書きに書かせない欄（このコマンドが付ける・前の値を残す） */
const DRAFT_RESERVED_KEYS = ['id', 'recording', 'source', 'readAt'] as const;

/** 下書きの形の誤り（予約した欄・invalid・kind と description が無い）。records:new observation の足す・直すで同じ検査 */
export function draftShapeErrors(drafts: readonly ObservationDraft[]): string[] {
  const errors: string[] = [];
  if (drafts.length === 0 || drafts.some((d) => d === null || typeof d !== 'object' || Array.isArray(d)))
    return ['下書きは観測値の欄のオブジェクトか、その配列'];
  const given = drafts.flatMap((d) => DRAFT_RESERVED_KEYS.filter((k) => k in d));
  if (given.length > 0) errors.push(`下書きに ${[...new Set(given)].join('・')} を書かない（このコマンドが付ける）`);
  // 無効にするのは --invalidate だけ（理由を要り、根拠にしている結論を付け替えられる）
  if (drafts.some((d) => 'invalid' in d)) errors.push('下書きに invalid を書かない（無効にするのは --invalidate）');
  if (drafts.some((d) => typeof d.description !== 'string' || typeof d.kind !== 'string'))
    errors.push('下書きには kind と description（文字列）が要る');
  return errors;
}

/**
 * 新しく増えた欄を置く順（records/observations/ の多くの観測値の並び）。観測値の欄を全部持つ（source・readAt は前の観測値の位置に残り、
 * invalid は下書きに書かない）
 */
const FIELD_RANK = {
  id: 0,
  recording: 1,
  recordings: 2,
  kind: 3,
  use: 4,
  value: 5,
  unit: 6,
  spread: 7,
  description: 8,
  method: 9,
  evidence: 10,
  compare: 11,
  scope: 12,
} satisfies Record<Exclude<keyof Observation, 'source' | 'readAt' | 'invalid'>, number>;

/** 欄の順を問わずに同じ JSON の値か */
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  const ar = a as Record<string, unknown>;
  const br = b as Record<string, unknown>;
  return ak.length === bk.length && ak.every((k) => Object.hasOwn(br, k) && sameJson(ar[k], br[k]));
}

/**
 * id・recording・source・readAt を前の観測値のまま残し、ほかの欄を下書きで差し替える。欄の並びは前の観測値のまま（下書きに無い欄は
 * 消え、値が同じ欄は前の値を残すので、中の欄の並びも変わらない）。新しく増えた欄は、FIELD_RANK で前か同じ順の欄（知らない欄は
 * source・readAt を除く全部）の、最後のものの後に置く
 */
export function replacedObservation(before: Observation, draft: ObservationDraft): Observation {
  const prior = before as unknown as Record<string, unknown>;
  const given = draft as unknown as Record<string, unknown>;
  const reserved: readonly string[] = DRAFT_RESERVED_KEYS;
  const keys = Object.keys(prior).filter((k) => reserved.includes(k) || Object.hasOwn(given, k));
  const ranks: Record<string, number> = FIELD_RANK;
  const rank = (k: string) => (Object.hasOwn(ranks, k) ? ranks[k]! : Object.keys(ranks).length);
  for (const k of Object.keys(given).filter((k) => !Object.hasOwn(prior, k))) {
    const after = keys.findLastIndex((p) => p !== 'source' && p !== 'readAt' && rank(p) <= rank(k));
    keys.splice(after + 1, 0, k);
  }
  const value = (k: string) => (reserved.includes(k) || sameJson(prior[k], given[k]) ? prior[k] : given[k]);
  return Object.fromEntries(keys.map((k) => [k, value(k)])) as unknown as Observation;
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

/** 比べの setup が ID で指している観測値（無効の比べと setup の無い観測値は空） */
export function setupRefIds(o: Observation): string[] {
  const setup = o.compare?.setup;
  if (setup === undefined || o.invalid !== undefined) return [];
  const ids: string[] = [];
  mapSetupRefs(setup, (id) => {
    ids.push(id);
    return id;
  });
  return ids;
}

/**
 * 比べの setup が ID で指す欄の from を to に置き換える。無効の比べ（記録は書き換えない）と、from を指していない観測値は undefined
 */
export function repointSetup(o: Observation, from: string, to: string): Observation | undefined {
  if (!setupRefIds(o).includes(from)) return undefined;
  const setup = mapSetupRefs(o.compare!.setup, (id) => (id === from ? to : id));
  return { ...o, compare: { ...o.compare!, setup } } as Observation;
}

/** 観測値 ids のどれかを根拠にしている、仮説か確定の結論（isActiveClaim。棄却・範囲外の結論は問わない） */
export function claimsCiting(claims: readonly Claim[], ids: readonly string[]): Claim[] {
  return claims.filter((c) => isActiveClaim(c) && c.observations.some((o) => ids.includes(o)));
}

/**
 * --invalidate --by で、setup の参照を付け替えた比べ resetup を根拠にしている、仮説か確定の結論（根拠を付け替えた結論 repointed は除く）。
 * 根拠の文は変わらないが、比べの入力が変わって残差が変わりうるので、等級・状態・許容内かを出し直す
 */
export function claimsCitingResetup(
  claims: readonly Claim[],
  resetup: readonly string[],
  repointed: ReadonlySet<string>,
): Claim[] {
  return claimsCiting(claims, resetup).filter((c) => !repointed.has(c.id));
}

/**
 * 付け替えた結論の、出し直しに使う根拠の観測値（根拠の文にある観測値）。無効にした観測値 invalidated は外す（範囲の中にあって
 * 根拠の文に残っても、付け替え先に置き換えたものとみる）
 */
export function repointedClaimOwn(
  claim: Pick<ClaimFile, 'basis'>,
  observations: readonly Observation[],
  invalidated: readonly string[],
): Observation[] {
  const ids = new Set(observationIdsIn(claim.basis));
  return observations.filter((o) => ids.has(o.id) && !invalidated.includes(o.id));
}
