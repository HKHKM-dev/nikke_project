// 全編成の合計ダメージ（partyTotals.ts）。ほかの編成は、共通の設定かほかの編成の中身が変わったときだけ計算し直す
// （共通の設定は文字列にして比べ、選んでいる編成のスロットを変えても作り直さない）
import type { BuildMasters, EnemyPresetMaster } from '@nikke/core';
import { useMemo } from 'react';
import type { CalcView } from './calcView.ts';
import type { ComputeCache, Shown } from './compute.ts';
import { sharedSettingsOf, type PartiesState, type SharedSettings } from './parties.ts';
import { partyInputs, partyTotals } from './partyTotals.ts';
import type { TeamState } from './team.ts';
import { useBatchComputation } from './useBatchComputation.ts';
import type { CharacterCache } from './useCharacterCache.ts';
import type { SkillDefinitionCache } from './useSkillDefinitions.ts';

type Params = {
  team: TeamState;
  parties: PartiesState;
  cache: CharacterCache;
  skills: SkillDefinitionCache;
  masters: BuildMasters | null;
  enemyMaster: EnemyPresetMaster | null;
  computeCache: ComputeCache;
  /** 選んでいる編成の計算の結果（useTeamComputation） */
  shown: Shown<CalcView> | null;
  computing: boolean;
};

export function usePartyTotals({
  team,
  parties,
  cache,
  skills,
  masters,
  enemyMaster,
  computeCache,
  shown,
  computing,
}: Params) {
  const sharedJson = JSON.stringify(sharedSettingsOf(team));
  const allPartyInputs = useMemo(
    () =>
      partyInputs(parties, JSON.parse(sharedJson) as SharedSettings, {
        characters: cache.characters,
        characterErrors: cache.errors,
        skills,
        masters,
        enemyMaster,
      }),
    [parties, sharedJson, cache.characters, cache.errors, skills, masters, enemyMaster],
  );
  const batchInputs = useMemo(() => allPartyInputs.map((p) => (p.kind === 'ready' ? p.input : null)), [allPartyInputs]);
  const batch = useBatchComputation(batchInputs, computeCache);
  const totals = partyTotals(allPartyInputs, { computed: shown?.computed ?? null, computing }, batch);
  const totalsPending =
    computing || batch.computing || shown === null || allPartyInputs.some((p) => p.kind === 'loading');
  return { totals, totalsPending };
}
