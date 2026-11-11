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
  type TreasurePhase,
} from '@nikke/core';
import type { Dispatch } from 'react';
import type { SlotResultView } from '../calcView.ts';
import { formatDamage } from '../format.ts';
import type { SlotGrowth, SlotState, TeamAction } from '../team.ts';
import { BuildSection } from './BuildSection.tsx';
import { CharacterPicker } from './CharacterPicker.tsx';
import { IntInput } from './IntInput.tsx';
import { Popover } from './Popover.tsx';
import { SkillSection } from './SkillSection.tsx';
import { SlotOptions } from './SlotOptions.tsx';
import type { OtherParties } from '../parties.ts';

type Props = {
  slotIndex: number;
  slot: SlotState;
  /** 操作キャラのスロット（見出しの「操作」のラジオボタンを選んだ形にする） */
  controlled: boolean;
  index: readonly CharacterIndexEntry[];
  excludeIds: ReadonlySet<number>;
  /** ほかの編成で選んでいるニケ（選択肢に印を付ける） */
  otherPartyIds: OtherParties;
  /** キャラの選択肢の印（useSkillDefinitions の fullySupported） */
  fullySupported: ReadonlySet<number> | null;
  character: CharacterData | undefined;
  error: string | undefined;
  fixedSpec: boolean;
  effectiveGrowth: GrowthInput;
  effectiveSkillLevels: SkillLevels;
  effectiveBuild: BuildInput;
  /** 宝物の段階（宝物のないキャラは 0。calcView.ts） */
  treasurePhase: TreasurePhase;
  masters: BuildMasters | null;
  mastersError: string | null;
  /** このスロットの計算の結果（calcView.ts の slotResultFor）。stale なら計算中の印を付けて出す */
  slotResult: SlotResultView | null;
  /** 想定 HP の欄を出すか（calcView.ts） */
  usesHpRatio: boolean;
  dispatch: Dispatch<TeamAction>;
};

export function SlotCard({
  slotIndex,
  slot,
  controlled,
  index,
  excludeIds,
  otherPartyIds,
  fullySupported,
  character,
  error,
  fixedSpec,
  effectiveGrowth,
  effectiveSkillLevels,
  effectiveBuild,
  treasurePhase,
  masters,
  mastersError,
  slotResult,
  usesHpRatio,
  dispatch,
}: Props) {
  const limits = character ? growthLimits(character) : null;
  const damageText = formatDamage(character && slotResult ? slotResult.result.totalDamage : null);

  // 2026-10-31: オーナーの指示で、枠の育成（好感度・限界突破・コア強化／スキル LV／装備・キューブ・コレクション）を「育成」の
  // 折りたたみ 1 つにまとめた
  // 2026-10-31: オーナーの指示で、キャラの諸元の行（武器・属性・クラス・バーストの段と CT）と射撃条件の欄（条件の決め方・
  // フルチャージ・手入力の値）を消した。射撃条件は既定値で計算する（calcView.ts）

  const growthField = (key: keyof SlotGrowth, name: string, min: number, max: number) => (
    <label className="field">
      <span>{name}</span>
      <IntInput
        value={effectiveGrowth[key]}
        min={min}
        max={max}
        disabled={fixedSpec}
        onCommit={(n) => dispatch({ type: 'setGrowth', index: slotIndex, growth: { ...slot.growth, [key]: n } })}
      />
    </label>
  );

  return (
    <fieldset className="panel slot">
      {/* 2026-10-31: オーナーの指示で、消した「枠 N」の見出しの代わりに「スロット N」を出す */}
      {/* 見出しの右に、操作キャラにするラジオボタン（5 つのスロットで 1 組。いつもどれか 1 つ。モダン UI の操作の印のドラッグと同じ値） */}
      <legend className="slot-legend">
        スロット {slotIndex + 1}
        <label className="slot-controlled-option">
          <input
            type="radio"
            name="controlledSlot"
            aria-label={`スロット ${slotIndex + 1} を操作キャラにする`}
            checked={controlled}
            onChange={() => dispatch({ type: 'setControlledSlot', index: slotIndex })}
          />
          操作
        </label>
      </legend>
      {/* キャラの選択の右に、スロットの詳細設定（バーストしない・想定 HP）のポップアップ。設定中の印と、ポップアップの説明文は
          オーナーの指示で出さない（設定はポップアップのボタンの色で分かる） */}
      <div className="picker-row">
        <CharacterPicker
          index={index}
          excludeIds={excludeIds}
          fullySupported={fullySupported}
          otherPartyIds={otherPartyIds}
          value={slot.resourceId}
          onSelect={(resourceId) => dispatch({ type: 'selectCharacter', index: slotIndex, resourceId })}
          onClear={() => dispatch({ type: 'clearSlot', index: slotIndex })}
        />
        <Popover
          button="詳細設定"
          buttonClassName="slot-settings-button"
          label={`スロット ${slotIndex + 1} の詳細設定`}
          align="right"
        >
          <SlotOptions slotIndex={slotIndex} slot={slot} usesHpRatio={usesHpRatio} dispatch={dispatch} />
        </Popover>
      </div>
      {error && <p className="error">読み込みに失敗しました: {error}</p>}
      {/* キャラのいないスロットも、ダメージと育成の欄を薄くして出す（枠の大きさをそろえる） */}
      <div
        className="slot-damage-display"
        data-computing={slotResult?.stale ?? false}
        data-placeholder={character === undefined}
      >
        <span className="slot-damage-val" aria-label={`ダメージ ${damageText}`}>
          {damageText}
        </span>
      </div>
      {!(character && limits) && (
        <details className="slot-settings" data-placeholder="true" aria-disabled="true">
          <summary tabIndex={-1} onClick={(e) => e.preventDefault()}>
            育成
          </summary>
        </details>
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
                <IntInput
                  value={effectiveBuild.affectionRank}
                  min={AFFECTION_RANK_MIN}
                  max={affectionRankMax(character)}
                  disabled={fixedSpec}
                  onCommit={(rank) =>
                    dispatch({ type: 'setBuild', index: slotIndex, build: { ...slot.build, affectionRank: rank } })
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
