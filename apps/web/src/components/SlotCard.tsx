import type { BuildMasters, CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { Dispatch } from 'react';
import type { SlotResultView } from '../calcView.ts';
import { formatDamage } from '../format.ts';
import { growthFieldsActions, type SlotGrowthFields, type SlotState, type TeamAction } from '../team.ts';
import { CharacterPicker } from './CharacterPicker.tsx';
import { GrowthEditor, type ShownGrowth } from './GrowthEditor.tsx';
import { Popover } from './Popover.tsx';
import { RosterRevertButton } from './RosterRevertButton.tsx';
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
  /** 計算に使う育成（スペック固定なら固定の値。宝物のないキャラの段階は 0。calcView.ts） */
  shown: ShownGrowth;
  masters: BuildMasters | null;
  mastersError: string | null;
  /** このスロットの計算の結果（calcView.ts の slotResultFor）。stale なら計算中の印を付けて出す */
  slotResult: SlotResultView | null;
  /** 想定 HP の欄を出すか（calcView.ts） */
  usesHpRatio: boolean;
  /** 育成状況のこのニケの育成（育成状況にいなければ null）。あれば「育成状況の値に戻す」を出す */
  rosterGrowth: SlotGrowthFields | null;
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
  shown,
  masters,
  mastersError,
  slotResult,
  usesHpRatio,
  rosterGrowth,
  dispatch,
}: Props) {
  const damageText = formatDamage(character && slotResult ? slotResult.result.totalDamage : null);
  const setGrowth = (fields: Partial<SlotGrowthFields>) => growthFieldsActions(slotIndex, fields).forEach(dispatch);

  // 枠の育成（好感度・限界突破・コア強化／スキル LV／装備・キューブ・コレクション）は「育成」の折りたたみ 1 つにまとめる。
  // 射撃条件は画面で選ばず、既定値で計算する（calcView.ts）

  return (
    <fieldset className="panel slot">
      {/* 見出しは「スロット N」 */}
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
          出さない（設定はポップアップのボタンの色で分かる） */}
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
      {!character && (
        <details className="slot-settings" data-placeholder="true" aria-disabled="true">
          <summary tabIndex={-1} onClick={(e) => e.preventDefault()}>
            育成
          </summary>
        </details>
      )}
      {character && (
        <details className="slot-settings">
          {/* 見出しの横に対応状況の印（対応・一部対応・未対応・未定義）は出さない。未対応はキャラ名の
              「（未）」と「未対応・近似・仮定の一覧」に出る */}
          <summary>育成</summary>
          <div className="slot-settings-body">
            <GrowthEditor
              character={character}
              fields={slot}
              shown={shown}
              masters={masters}
              mastersError={mastersError}
              disabled={fixedSpec}
              onChange={setGrowth}
            />
            <RosterRevertButton fields={slot} rosterGrowth={rosterGrowth} fixedSpec={fixedSpec} onRevert={setGrowth} />
          </div>
        </details>
      )}
    </fieldset>
  );
}
