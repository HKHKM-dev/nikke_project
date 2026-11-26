// スロットの育成を育成状況の値に戻すボタン（plan/design-roster-edit.md 7 節）。スロットの育成は試しで、育成状況が正
import { sameGrowthFields } from '../rosterEdits.ts';
import type { SlotGrowthFields } from '../team.ts';
import { InertButton } from './InertButton.tsx';

/** スロット・共通育成の、育成状況の値に戻すボタンの名前 */
export const ROSTER_REVERT_LABEL = '育成状況の値に戻す';

type Props = {
  /** スロットの育成（保存している値） */
  fields: SlotGrowthFields;
  /** 育成状況のそのニケの育成。育成状況にいないニケ（null）では出さない */
  rosterGrowth: SlotGrowthFields | null;
  fixedSpec: boolean;
  onRevert: (fields: SlotGrowthFields) => void;
};

/** スペック固定の間と、スロットの値が育成状況と同じときは押せない。確かめずに戻す。
 *  表記は「戻す」とだけ出し、読み上げの名前は「育成状況の値に戻す」にする（オーナーのコメント） */
export function RosterRevertButton({ fields, rosterGrowth, fixedSpec, onRevert }: Props) {
  if (rosterGrowth === null) return null;
  return (
    <InertButton
      className="advanced-settings-button roster-revert-button"
      label={ROSTER_REVERT_LABEL}
      enabled={!fixedSpec && !sameGrowthFields(fields, rosterGrowth)}
      onPress={() => onRevert(rosterGrowth)}
    >
      戻す
    </InertButton>
  );
}
