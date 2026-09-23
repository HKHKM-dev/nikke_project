// Stage 9: 宝物（お気に入りアイテム）版スキルへの差し替え（plan/design-stage9.md 4 節）。
// 宝物の段階 N（1..3）では CharacterData.treasure.unlockOrder の先頭 N 個のスロットが宝物版になる。
// 差し替えは computeTeamDamage / runSimulation の最上位で 1 回だけ行い、その先の解決（resolvePassives / resolveTimed /
// 倍率ダメージ / 時刻表）は差し替え後の character と definition を読むだけにする。引数は書き換えない。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, SkillSlot } from '../types.ts';
import type { SkillDefinition, SkillEntry } from './types.ts';

/** 宝物の段階。0 = 宝物なし（既定）、1..3 = 解放した段階 */
export type TreasurePhase = 0 | 1 | 2 | 3;
export const TREASURE_PHASE_MAX = 3;

/** 宝物版の定義が無いスロットの扱い。基礎版の定義には戻さない（宝物版とは数値の番号がずれるため） */
const UNDEFINED_TREASURE_ENTRY: SkillEntry = {
  support: 'unsupported',
  effects: [],
  notes: [
    {
      ja: '宝物版のスキル定義がない（基礎版の定義は数値の番号が違うので使わない）',
      en: 'No definition for the treasure version (the base definition refers to different values)',
    },
  ],
};

/** phase が 0..3 の整数で、宝物のないキャラなら 0 であることを確かめる。不正なら RangeError */
export function validateTreasurePhase(character: CharacterData, phase: number): asserts phase is TreasurePhase {
  if (!Number.isInteger(phase) || phase < 0 || phase > TREASURE_PHASE_MAX) {
    throw new RangeError(`treasurePhase must be an integer in [0, ${TREASURE_PHASE_MAX}], got ${phase}`);
  }
  if (phase > 0 && character.treasure === null) {
    throw new RangeError(`character ${character.resourceId} has no treasure, but treasurePhase is ${phase}`);
  }
}

/** 段階 phase で宝物版になるスロット（unlockOrder の先頭 phase 個）。宝物がないか段階 0 なら空 */
export function treasureSlots(character: CharacterData, phase: TreasurePhase): SkillSlot[] {
  if (phase === 0 || character.treasure === null) return [];
  return character.treasure.unlockOrder.slice(0, phase);
}

/**
 * 宝物版を当てた CharacterData と SkillDefinition を返す。phase 0 は引数をそのまま（同じオブジェクト）返す。
 * phase 1 以上では引数を書き換えず、差し替えたスロットだけを入れ替えた浅いコピーを返す。
 * definition.skills[slot] は treasureSkills[slot]（無ければ unsupported）になる。definition が null ならそのまま null
 */
export function applyTreasure(
  character: CharacterData,
  definition: SkillDefinition | null,
  phase: TreasurePhase,
): { character: CharacterData; definition: SkillDefinition | null } {
  validateTreasurePhase(character, phase);
  const slots = treasureSlots(character, phase);
  const treasure = character.treasure;
  if (slots.length === 0 || treasure === null) return { character, definition };
  const skills = { ...character.skills };
  for (const slot of slots) skills[slot] = treasure.skills[slot];
  if (definition === null) return { character: { ...character, skills }, definition };
  const entries = { ...definition.skills };
  for (const slot of slots) entries[slot] = definition.treasureSkills?.[slot] ?? UNDEFINED_TREASURE_ENTRY;
  return { character: { ...character, skills }, definition: { ...definition, skills: entries } };
}

/** 枠に宝物版を当てた新しい枠。段階 0（省略）ならそのまま返す。返す枠の treasurePhase は 0（適用済み） */
function applyTreasureToSlot(slot: TeamSlotInput): TeamSlotInput {
  const phase = slot.skills?.treasurePhase ?? 0;
  validateTreasurePhase(slot.character, phase);
  if (phase === 0 || slot.skills === undefined) return slot;
  const applied = applyTreasure(slot.character, slot.skills.definition, phase);
  return {
    ...slot,
    character: applied.character,
    skills: { ...slot.skills, definition: applied.definition, treasurePhase: 0 },
  };
}

/**
 * 各枠に applyTreasure を当てた新しい入力。どの枠も段階 0 なら input をそのまま返す。
 * 返す入力の treasurePhase は 0（適用済み）にするので、2 回通しても結果は同じ
 */
export function applyTreasureToTeam<T extends TeamInput>(input: T): T {
  const slots = input.slots.map((slot) => (slot === null ? null : applyTreasureToSlot(slot)));
  if (slots.every((slot, i) => slot === input.slots[i])) return input;
  return { ...input, slots };
}
