import {
  loadSkillDefinition,
  loadSkillIndex,
  loadSkillSupportIndex,
  type SkillDefinition,
  type SkillLevels,
  type TeamSlotSkills,
  type TreasurePhase,
} from '@nikke/core';
import { useEffect, useMemo, useRef, useState } from 'react';

export type SkillDefinitionCache = {
  /** 定義済み resourceId の一覧。読み込み前は null */
  index: ReadonlySet<number> | null;
  indexError: string | null;
  /**
   * すべてのスロットに未実装が無いキャラ（data/skills/support.json）。キャラの選択肢の印に使う。読み込み前と、読めなかったときは null
   * （印を付けない。計算には使わない）
   */
  fullySupported: ReadonlySet<number> | null;
  definitions: ReadonlyMap<number, SkillDefinition>;
  /** 定義ファイルの読み込み・検証に失敗した resourceId とメッセージ */
  errors: ReadonlyMap<number, string>;
};

/** 枠の skills 入力の状態 */
export type SlotSkillsStatus =
  | { kind: 'loading' }
  | { kind: 'undefined' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; definition: SkillDefinition };

/** 枠の並びに依存しないキー（重複を除いて昇順）。枠の入れ替えでは変わらない */
function wantedKeyOf(resourceIds: readonly (number | null)[]): string {
  return [...new Set(resourceIds.filter((id): id is number => id !== null))].sort((a, b) => a - b).join(',');
}

/** 定義一覧を 1 回読み、枠が参照している定義済みニケの定義をまとめて読み込んでキャッシュする。 */
export function useSkillDefinitions(resourceIds: readonly (number | null)[], baseUrl: string): SkillDefinitionCache {
  const [index, setIndex] = useState<ReadonlySet<number> | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [fullySupported, setFullySupported] = useState<ReadonlySet<number> | null>(null);
  const [definitions, setDefinitions] = useState<ReadonlyMap<number, SkillDefinition>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  // 取得を開始した id（完了・失敗も含む）。state ではなく ref に持ち、取得完了で Effect を再実行させない
  const requested = useRef(new Set<number>());

  useEffect(() => {
    loadSkillIndex({ baseUrl })
      .then((i) => setIndex(new Set(i.resourceIds)))
      .catch((e: unknown) => setIndexError(e instanceof Error ? e.message : String(e)));
    loadSkillSupportIndex({ baseUrl })
      .then((s) => setFullySupported(new Set(s.fullySupported)))
      .catch(() => {}); // 読めなければ null のまま（印を付けない）
  }, [baseUrl]);

  const wantedKey = useMemo(() => wantedKeyOf(resourceIds), [resourceIds]);

  useEffect(() => {
    if (index === null || wantedKey === '') return;
    for (const text of wantedKey.split(',')) {
      const id = Number(text);
      if (!index.has(id) || requested.current.has(id)) continue;
      requested.current.add(id);
      loadSkillDefinition(id, { baseUrl }).then(
        (def) => setDefinitions((m) => new Map(m).set(id, def)),
        (e: unknown) => setErrors((m) => new Map(m).set(id, e instanceof Error ? e.message : String(e))),
      );
    }
  }, [wantedKey, baseUrl, index]);

  // 返す物は中身が変わるまで同じにする。App.tsx の計算の入力（teamInput）がこれに依存し、毎回作り直すと、計算の結果が
  // 届いて描き直すたびに入力が変わって計算を出し直し続ける（(B) の段 B-2。plan/design-unify-sim-calc.md 経過）
  return useMemo(
    () => ({ index, indexError, fullySupported, definitions, errors }),
    [index, indexError, fullySupported, definitions, errors],
  );
}

export function slotSkillsStatus(cache: SkillDefinitionCache, resourceId: number): SlotSkillsStatus {
  if (cache.indexError !== null) return { kind: 'error', message: cache.indexError };
  if (cache.index === null) return { kind: 'loading' };
  if (!cache.index.has(resourceId)) return { kind: 'undefined' };
  const error = cache.errors.get(resourceId);
  if (error !== undefined) return { kind: 'error', message: error };
  const definition = cache.definitions.get(resourceId);
  return definition ? { kind: 'ready', definition } : { kind: 'loading' };
}

/**
 * runSimulation に渡す skills。読み込み中・エラー・未定義は definition: null（味方の効果は受ける）。
 * Stage 9: treasurePhase は effectiveTreasurePhase を通した値（宝物のないキャラは 0）
 */
export function toSlotSkills(
  status: SlotSkillsStatus,
  levels: SkillLevels,
  treasurePhase: TreasurePhase = 0,
): TeamSlotSkills {
  return { definition: status.kind === 'ready' ? status.definition : null, levels, treasurePhase };
}
