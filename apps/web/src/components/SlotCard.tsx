import {
  growthLimits,
  type CharacterData,
  type CharacterIndexEntry,
  type GrowthInput,
  type BuildInput,
  type BuildMasters,
  type SkillLevels,
  type TeamSlotResult,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { formatNumber } from '../format.ts';
import { effectiveTreasurePhase, type SlotState, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';
import { BuildSection } from './BuildSection.tsx';
import { CharacterPicker } from './CharacterPicker.tsx';
import { SkillSection } from './SkillSection.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  index: readonly CharacterIndexEntry[];
  excludeIds: ReadonlySet<number>;
  /** キャラの選択肢の印（useSkillDefinitions の fullySupported） */
  fullySupported: ReadonlySet<number> | null;
  character: CharacterData | undefined;
  loading: boolean;
  error: string | undefined;
  fixedSpec: boolean;
  effectiveGrowth: GrowthInput;
  effectiveSkillLevels: SkillLevels;
  effectiveBuild: BuildInput;
  masters: BuildMasters | null;
  mastersError: string | null;
  skillsStatus: SlotSkillsStatus;
  slotResult: TeamSlotResult | null;
  dispatch: Dispatch<TeamAction>;
};

export function SlotCard({
  slotIndex,
  slot,
  index,
  excludeIds,
  fullySupported,
  character,
  loading,
  error,
  fixedSpec,
  effectiveGrowth,
  effectiveSkillLevels,
  effectiveBuild,
  masters,
  mastersError,
  skillsStatus,
  slotResult,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;

  const treasurePhase = character ? effectiveTreasurePhase(slot, character) : 0;
  // 2026-10-31: オーナーの指示で、キャラの諸元の行（武器・属性・クラス・バーストの段と CT）と射撃条件の欄（条件の決め方・
  // フルチャージ・想定 HP・手入力の値）を消した。射撃条件と想定 HP は既定値で計算する（team.ts の slotForCalc）

  const growthField = (key: keyof GrowthInput, name: string, min: number, max: number) => (
    <label className="field" title={`${min}〜${max}`}>
      <span>{name}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={effectiveGrowth[key]}
        disabled={fixedSpec}
        onChange={(e) =>
          dispatch({ type: 'setGrowth', index: slotIndex, growth: { ...slot.growth, [key]: Number(e.target.value) } })
        }
      />
    </label>
  );

  return (
    <fieldset className="panel slot" aria-label={`枠 ${slotIndex + 1}`}>
      <CharacterPicker
        index={index}
        excludeIds={excludeIds}
        fullySupported={fullySupported}
        value={slot.resourceId}
        onSelect={(resourceId) => dispatch({ type: 'selectCharacter', index: slotIndex, resourceId })}
        onClear={() => dispatch({ type: 'clearSlot', index: slotIndex })}
      />
      {error && <p className="error">読み込みに失敗しました: {error}</p>}
      {loading && <p className="hint">キャラデータを読み込み中…</p>}
      {character && (
        <div className="slot-damage-display">
          <span className="slot-damage-label">ダメージ</span>
          <span className="slot-damage-val">{slotResult ? formatNumber(slotResult.totalDamage) : '—'}</span>
        </div>
      )}
      {character && limits && (
        <details className="slot-settings">
          <summary>設定</summary>
          <div className="slot-settings-body">
            <div className="growth-row">
              {growthField('level', 'Lv', 1, limits.levelMax)}
              {growthField('grade', '限界突破', 0, limits.gradeMax)}
              {growthField('core', 'コア強化', 0, limits.coreMax)}
            </div>
            <SkillSection
              slotIndex={slotIndex}
              character={character}
              levels={effectiveSkillLevels}
              treasurePhase={treasurePhase}
              disabled={fixedSpec}
              status={skillsStatus}
              dispatch={dispatch}
            />
            <BuildSection
              slotIndex={slotIndex}
              character={character}
              build={slot.build}
              effectiveBuild={effectiveBuild}
              growth={effectiveGrowth}
              savedGrowth={slot.growth}
              treasurePhase={treasurePhase}
              masters={masters}
              mastersError={mastersError}
              disabled={fixedSpec}
              dispatch={dispatch}
            />
          </div>
        </details>
      )}
    </fieldset>
  );
}
