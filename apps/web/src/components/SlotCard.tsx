import {
  ELEMENT_LABEL,
  WEAPON_LABEL,
  applyTreasure,
  burstStepInTeam,
  growthLimits,
  isChargeWeapon,
  type BurstStep,
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
import { CLASS_LABEL } from '../skillLabels.ts';
import { effectiveTreasurePhase, type SlotState, type TeamAction } from '../team.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';
import { BuildSection } from './BuildSection.tsx';
import { CharacterPicker } from './CharacterPicker.tsx';
import { HpRatioInput, SkillSection, hasSelfHpCondition } from './SkillSection.tsx';

const BURST_LABEL: Record<BurstStep, string> = { Step1: 'I', Step2: 'II', Step3: 'III', AllStep: 'I〜III' };

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
  hpRatioTargeted: boolean;
  slotResult: TeamSlotResult | null;
  /** 2 段目の段 12: 編成の枠のキャラ（バースト段階の変更の編成の条件を見る） */
  teamCharacters: readonly (CharacterData | null)[];
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
  hpRatioTargeted,
  slotResult,
  teamCharacters,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;

  const condition = slot.condition;
  const treasurePhase = character ? effectiveTreasurePhase(slot, character) : 0;
  // 2 段目の段 12: バースト段階の変更（戦闘補助）が編成で効けば、差し替えた段を出す（宝物の版を当てた定義で見る）
  const burstStep = character
    ? burstStepInTeam(
        character,
        applyTreasure(character, skillsStatus.kind === 'ready' ? skillsStatus.definition : null, treasurePhase)
          .definition,
        teamCharacters,
        slotIndex,
      )
    : null;
  const showHpRatio =
    hpRatioTargeted || (character !== undefined && hasSelfHpCondition(character, skillsStatus, treasurePhase));

  const manualFields = character && (
    <div className="manual-fields">
      <label className="field">
        <span>コア命中率</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={condition.coreHitRate}
          onChange={(e) =>
            dispatch({
              type: 'setSlotCondition',
              index: slotIndex,
              condition: { ...condition, coreHitRate: Number(e.target.value) },
            })
          }
        />
      </label>
      <label className="field">
        <span>弾丸命中率</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={condition.hitRate ?? 1}
          onChange={(e) =>
            dispatch({
              type: 'setSlotCondition',
              index: slotIndex,
              condition: { ...condition, hitRate: Math.min(1, Math.max(0, Number(e.target.value) || 0)) },
            })
          }
        />
      </label>
      <label className="field checkbox">
        <input
          type="checkbox"
          checked={condition.distanceBonus && character.bonusRange !== null}
          disabled={character.bonusRange === null}
          onChange={(e) =>
            dispatch({
              type: 'setSlotCondition',
              index: slotIndex,
              condition: { ...condition, distanceBonus: e.target.checked },
            })
          }
        />
        <span>距離ボーナス{character.bonusRange === null ? '（なし）' : ''}</span>
      </label>
    </div>
  );

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
    <fieldset className="panel slot">
      <legend>枠 {slotIndex + 1}</legend>
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
          <span className="slot-damage-label">総ダメージ</span>
          <span className="slot-damage-val">{slotResult ? formatNumber(slotResult.totalDamage) : '—'}</span>
        </div>
      )}
      {character && limits && (
        <details className="slot-settings">
          <summary>設定（Lv・スキル・育成・射撃条件）</summary>
          <div className="slot-settings-body">
            <p className="meta" title={WEAPON_LABEL[character.weaponType].ja}>
              {character.weaponType} / {ELEMENT_LABEL[character.element].ja} / {CLASS_LABEL[character.class]} / B
              {burstStep !== null && burstStep !== character.burstStep
                ? `${BURST_LABEL[burstStep]}（基本は ${BURST_LABEL[character.burstStep]}）`
                : BURST_LABEL[character.burstStep]}
              （CT {character.burstSkill.cooldownSeconds}s）
            </p>
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
            <details className="build condition-details">
              <summary>
                射撃条件（{slot.conditionMode === 'auto' ? '自動' : '手入力'}
                {showHpRatio && slot.hpRatio < 1 ? `・HP ${Math.round(slot.hpRatio * 100)}%` : ''}）
              </summary>
              <label className="field">
                <span>条件</span>
                <select
                  value={slot.conditionMode}
                  onChange={(e) =>
                    dispatch({
                      type: 'setConditionMode',
                      index: slotIndex,
                      conditionMode: e.target.value === 'manual' ? 'manual' : 'auto',
                    })
                  }
                >
                  <option value="auto">自動（射撃場の表）</option>
                  <option value="manual">手入力</option>
                </select>
              </label>
              {isChargeWeapon(character.shot) && (
                <label className="field checkbox">
                  <input
                    type="checkbox"
                    checked={condition.fullCharge}
                    onChange={(e) =>
                      dispatch({
                        type: 'setSlotCondition',
                        index: slotIndex,
                        condition: { ...condition, fullCharge: e.target.checked },
                      })
                    }
                  />
                  <span>フルチャージで撃つ</span>
                </label>
              )}
              {showHpRatio && (
                <label className="field">
                  <span>想定 HP (%)</span>
                  <HpRatioInput
                    value={slot.hpRatio}
                    onCommit={(ratio) => dispatch({ type: 'setHpRatio', index: slotIndex, hpRatio: ratio })}
                  />
                </label>
              )}
              {slot.conditionMode === 'auto' ? (
                <details className="manual-condition">
                  <summary>手入力の値（未測定の敵で使用）</summary>
                  {manualFields}
                </details>
              ) : (
                manualFields
              )}
            </details>
          </div>
        </details>
      )}
    </fieldset>
  );
}
