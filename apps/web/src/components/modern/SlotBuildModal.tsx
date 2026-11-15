import type { BuildMasters, CharacterData } from '@nikke/core';
import type { Dispatch } from 'react';
import { growthFieldsActions, type SlotGrowthFields, type SlotState, type TeamAction } from '../../team.ts';
import { GrowthEditor, type ShownGrowth } from '../GrowthEditor.tsx';
import { Modal } from '../Modal.tsx';
import { RosterRevertButton } from '../RosterRevertButton.tsx';
import { SlotOptions } from '../SlotOptions.tsx';
import type { FavoriteMark } from '../../favorites.ts';
import { FavoriteButtons } from './FavoriteBadge.tsx';

type Props = {
  slotIndex: number;
  slot: SlotState;
  character: CharacterData | undefined;
  fixedSpec: boolean;
  /** 計算に使う育成（スペック固定なら固定の値。calcView.ts） */
  shown: ShownGrowth;
  masters: BuildMasters | null;
  mastersError: string | null;
  usesHpRatio: boolean;
  /** このニケの押したお気に入りのバッジ */
  favoriteMarks: readonly FavoriteMark[];
  onToggleFavorite: (mark: FavoriteMark) => void;
  /** 育成状況のこのニケの育成（育成状況にいなければ null）。あれば「育成状況の値に戻す」を出す */
  rosterGrowth: SlotGrowthFields | null;
  dispatch: Dispatch<TeamAction>;
  onClose: () => void;
};

export function SlotBuildModal({
  slotIndex,
  slot,
  character,
  fixedSpec,
  shown,
  masters,
  mastersError,
  usesHpRatio,
  favoriteMarks,
  onToggleFavorite,
  rosterGrowth,
  dispatch,
  onClose,
}: Props) {
  if (!character) return null;

  const setGrowth = (fields: Partial<SlotGrowthFields>) => growthFieldsActions(slotIndex, fields).forEach(dispatch);

  return (
    <Modal
      title={
        <span className="slot-build-title">
          {character.name.ja}
          {/* お気に入り。押したバッジは色が付き、立ち絵の上端にも出る（FavoriteRibbons） */}
          <span className="slot-build-favorites" role="group" aria-label="お気に入り">
            <FavoriteButtons
              marks={favoriteMarks}
              onToggle={onToggleFavorite}
              buttonClassName="slot-build-favorite-button"
            />
          </span>
        </span>
      }
      label={`スロット ${slotIndex + 1}（${character.name.ja}）の育成・設定`}
      onClose={onClose}
    >
      <div className="modal-body">
        <fieldset className="popover-group">
          <legend>スロット詳細設定</legend>
          <SlotOptions slotIndex={slotIndex} slot={slot} usesHpRatio={usesHpRatio} dispatch={dispatch} />
        </fieldset>

        <GrowthEditor
          character={character}
          fields={slot}
          shown={shown}
          masters={masters}
          mastersError={mastersError}
          disabled={fixedSpec}
          onChange={setGrowth}
        />
      </div>

      <div className="modal-footer">
        <RosterRevertButton fields={slot} rosterGrowth={rosterGrowth} fixedSpec={fixedSpec} onRevert={setGrowth} />
        <button type="button" onClick={onClose}>
          完了
        </button>
      </div>
    </Modal>
  );
}
