import {
  AFFECTION_RANK_MIN,
  affectionRankMax,
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
import { BuildSection } from './BuildSection.tsx';
import { CharacterPicker } from './CharacterPicker.tsx';
import { Popover } from './Popover.tsx';
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
  slotResult: TeamSlotResult | null;
  /** 2026-10-31: このスロットがフォーカス（操作キャラ）か */
  focused: boolean;
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
  slotResult,
  focused,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;

  const treasurePhase = character ? effectiveTreasurePhase(slot, character) : 0;
  // 2026-10-31: オーナーの指示で、枠の育成（好感度・限界突破・コア強化／スキル LV／装備・キューブ・コレクション）を「育成」の
  // 折りたたみ 1 つにまとめた
  // 2026-10-31: オーナーの指示で、キャラの諸元の行（武器・属性・クラス・バーストの段と CT）と射撃条件の欄（条件の決め方・
  // フルチャージ・想定 HP・手入力の値）を消した。射撃条件と想定 HP は既定値で計算する（team.ts の teamStateForCalc）

  const growthField = (key: keyof GrowthInput, name: string, min: number, max: number) => (
    <label className="field">
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
      {/* 2026-10-31: オーナーの指示で、消した「枠 N」の見出しの代わりに「スロット N」を出す */}
      {/* 2026-10-31: 右に、スロットの詳細設定（フォーカス・撃たない）のポップアップ。設定は今後増やす。設定中の印（撃たない）はその右（狭いと次の行）。フォーカスの印と、ポップアップの説明文はオーナーの指示で出さない（撃たないの近似は未対応の一覧に出す） */}
      <legend className="slot-legend">
        <span>スロット {slotIndex + 1}</span>
        <Popover
          button="詳細設定"
          buttonClassName="slot-settings-button"
          label={`スロット ${slotIndex + 1} の詳細設定`}
          align="left"
        >
          <div className="slot-advanced">
            <div className="slot-toggles">
              <button
                type="button"
                className="toggle-button"
                aria-pressed={focused}
                onClick={() => dispatch({ type: 'setControlledSlot', controlledSlot: slotIndex })}
              >
                フォーカス
              </button>
              <button
                type="button"
                className="toggle-button"
                aria-pressed={slot.noFire}
                onClick={() => dispatch({ type: 'setNoFire', index: slotIndex, noFire: !slot.noFire })}
              >
                撃たない
              </button>
            </div>
          </div>
        </Popover>
        {slot.noFire && <span className="slot-flag">撃たない</span>}
      </legend>
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
          {/* 2026-10-31: オーナーの指示で、見出しの横の対応状況の印（対応・一部対応・未対応・未定義）は出さない。未対応はキャラ名の
              「（未）」と「未対応・近似・仮定の一覧」に出る */}
          <summary>育成</summary>
          <div className="slot-settings-body">
            <div className="growth-row">
              <label className="field">
                <span>好感度</span>
                <input
                  type="number"
                  min={AFFECTION_RANK_MIN}
                  max={affectionRankMax(character)}
                  step={1}
                  value={effectiveBuild.affectionRank}
                  disabled={fixedSpec}
                  onChange={(e) =>
                    dispatch({
                      type: 'setBuild',
                      index: slotIndex,
                      build: {
                        ...slot.build,
                        affectionRank: Math.min(
                          affectionRankMax(character),
                          Math.max(AFFECTION_RANK_MIN, Math.round(Number(e.target.value) || AFFECTION_RANK_MIN)),
                        ),
                      },
                    })
                  }
                />
              </label>
              {growthField('grade', '限界突破', 0, limits.gradeMax)}
              {growthField('core', 'コア強化', 0, limits.coreMax)}
            </div>
            <SkillSection
              slotIndex={slotIndex}
              levels={effectiveSkillLevels}
              disabled={fixedSpec}
              dispatch={dispatch}
            />
            <BuildSection
              slotIndex={slotIndex}
              character={character}
              build={slot.build}
              effectiveBuild={effectiveBuild}
              growth={effectiveGrowth}
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
