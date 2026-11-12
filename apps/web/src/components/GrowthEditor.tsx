// 1 体分の育成の欄: 好感度・限界突破・コア強化／スキル LV／装備・キューブ・コレクション。スロットの育成（クラシックの「育成」・
// モダン UI の育成のモーダル）と、育成状況の編集（RosterEditModal.tsx）で同じものを使う（plan/design-roster-edit.md 8.2 節）。
// 値と、変えたときに呼ぶ関数だけを受け、どこに保存するか（スロット・育成状況）は呼ぶ側が決める
import {
  AFFECTION_RANK_MIN,
  affectionRankMax,
  growthLimits,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type GrowthInput,
  type SkillLevels,
  type TreasurePhase,
} from '@nikke/core';
import type { SlotGrowth, SlotGrowthFields } from '../team.ts';
import { BuildSection } from './BuildSection.tsx';
import { IntInput } from './IntInput.tsx';
import { SkillSection } from './SkillSection.tsx';

/** 欄に出す値（スロットは計算に使う値で、スペック固定なら固定の値。育成状況は保存している値そのもの） */
export type ShownGrowth = {
  growth: GrowthInput;
  build: BuildInput;
  skillLevels: SkillLevels;
  treasurePhase: TreasurePhase;
};

type Props = {
  character: CharacterData;
  /** 保存している育成（変更はこれに重ねる。スペック固定でも残す） */
  fields: SlotGrowthFields;
  shown: ShownGrowth;
  masters: BuildMasters | null;
  mastersError: string | null;
  /** 欄を使えなくする（スペック固定。宝物の段階だけは選べる） */
  disabled: boolean;
  /** 宝物の段階が未確定（育成状況の編集だけ） */
  unknownTreasure?: boolean;
  /** 変えた育成（変えた項目だけ） */
  onChange: (patch: Partial<SlotGrowthFields>) => void;
};

export function GrowthEditor({
  character,
  fields,
  shown,
  masters,
  mastersError,
  disabled,
  unknownTreasure,
  onChange,
}: Props) {
  const limits = growthLimits(character);
  const growthField = (key: keyof SlotGrowth, name: string, max: number) => (
    <label className="field">
      <span>{name}</span>
      <IntInput
        value={shown.growth[key]}
        min={0}
        max={max}
        disabled={disabled}
        onCommit={(n) => onChange({ growth: { ...fields.growth, [key]: n } })}
      />
    </label>
  );
  return (
    <>
      <div className="growth-row">
        <label className="field">
          <span>好感度</span>
          <IntInput
            value={shown.build.affectionRank}
            min={AFFECTION_RANK_MIN}
            max={affectionRankMax(character)}
            disabled={disabled}
            onCommit={(affectionRank) => onChange({ build: { ...fields.build, affectionRank } })}
          />
        </label>
        {growthField('grade', '限界突破', limits.gradeMax)}
        {growthField('core', 'コア強化', limits.coreMax)}
      </div>
      <SkillSection
        levels={shown.skillLevels}
        disabled={disabled}
        onChange={(skillLevels) => onChange({ skillLevels })}
      />
      <BuildSection
        character={character}
        build={fields.build}
        effectiveBuild={shown.build}
        growth={shown.growth}
        treasurePhase={shown.treasurePhase}
        masters={masters}
        mastersError={mastersError}
        disabled={disabled}
        unknownTreasure={unknownTreasure}
        onChange={onChange}
      />
    </>
  );
}
