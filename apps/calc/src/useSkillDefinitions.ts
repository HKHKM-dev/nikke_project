import { loadSkillDefinition, loadSkillIndex, type SkillDefinition, type TeamSlotSkills } from '@nikke/core';
import { useEffect, useRef, useState } from 'react';
import type { SkillLevels } from '@nikke/core';

export type SkillDefinitionCache = {
  /** 定義済み resourceId の一覧。読み込み前は null */
  index: ReadonlySet<number> | null;
  indexError: string | null;
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

/** 定義一覧を 1 回読み、枠が参照している定義済みニケの定義をまとめて読み込んでキャッシュする。 */
export function useSkillDefinitions(resourceIds: readonly (number | null)[], baseUrl: string): SkillDefinitionCache {
  const [index, setIndex] = useState<ReadonlySet<number> | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<ReadonlyMap<number, SkillDefinition>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  const inflight = useRef(new Set<number>());

  useEffect(() => {
    loadSkillIndex({ baseUrl })
      .then((i) => setIndex(new Set(i.resourceIds)))
      .catch((e: unknown) => setIndexError(e instanceof Error ? e.message : String(e)));
  }, [baseUrl]);

  const wantedKey = resourceIds.filter((id): id is number => id !== null).join(',');

  useEffect(() => {
    if (index === null || wantedKey === '') return;
    for (const text of wantedKey.split(',')) {
      const id = Number(text);
      if (!index.has(id) || definitions.has(id) || errors.has(id) || inflight.current.has(id)) continue;
      inflight.current.add(id);
      loadSkillDefinition(id, { baseUrl })
        .then(
          (def) => setDefinitions((m) => new Map(m).set(id, def)),
          (e: unknown) => setErrors((m) => new Map(m).set(id, e instanceof Error ? e.message : String(e))),
        )
        .finally(() => inflight.current.delete(id));
    }
  }, [wantedKey, baseUrl, index, definitions, errors]);

  return { index, indexError, definitions, errors };
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

/** computeTeamDamage に渡す skills。読み込み中・エラー・未定義は definition: null（味方の効果は受ける） */
export function toSlotSkills(status: SlotSkillsStatus, levels: SkillLevels): TeamSlotSkills {
  return { definition: status.kind === 'ready' ? status.definition : null, levels };
}
