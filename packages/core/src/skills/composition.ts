// 編成の条件（バースト段階の構成 burstStepMix: plan/design-anis-star-s1.md 2.1 節、同じ部隊の味方 squad: plan/design-ram-s1.md
// 2.1 節）。編成で決まる静的な条件なので、宝物版の差し替え（skills/treasure.ts）と同じく最上位で 1 回だけ、満たさない効果を
// 定義から外す。外した後の定義には満たした効果だけが残るので、2 回通しても結果は同じ。
// 防御力無視ダメージ編（plan/design-true-damage-element.md 3.3・3.6 節）: 編成に特定のキャラがいる条件 withCharacter と、
// 敵の属性の条件 enemyElement も、同じく静的な条件としてここで外す。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';
import {
  SKILL_SLOTS,
  type BurstStepMixCondition,
  type SkillDefinition,
  type SkillEffect,
  type SquadCondition,
  type WithCharacterCondition,
} from './types.ts';

/** 条件を見るのに要るキャラの欄 */
export type CompositionCharacter = Pick<CharacterData, 'burstStep' | 'squad' | 'resourceId'>;

/** 自分（selfIndex）を除く空でない枠に、基本バースト段階が mix.otherBurstStep のキャラがいるかを mix.present と比べる */
export function burstStepMixAllows(
  mix: BurstStepMixCondition | undefined,
  characters: readonly (Pick<CharacterData, 'burstStep'> | null)[],
  selfIndex: number,
): boolean {
  if (mix === undefined) return true;
  const present = characters.some((c, i) => i !== selfIndex && c !== null && c.burstStep === mix.otherBurstStep);
  return present === mix.present;
}

/** 自分（selfIndex）を除く空でない枠に、部隊が自分と同じキャラがいるかを squad.present と比べる */
export function squadAllows(
  squad: SquadCondition | undefined,
  characters: readonly (Pick<CharacterData, 'squad'> | null)[],
  selfIndex: number,
): boolean {
  if (squad === undefined) return true;
  const self = characters[selfIndex];
  if (!self) throw new Error(`no character in slot ${selfIndex}`);
  const present = characters.some((c, i) => i !== selfIndex && c !== null && c.squad === self.squad);
  return present === squad.present;
}

/** 防御力無視ダメージ編: 自分（selfIndex）を除く空でない枠に、resourceId が rid のキャラがいるかを present と比べる */
export function withCharacterAllows(
  condition: WithCharacterCondition | undefined,
  characters: readonly (Pick<CharacterData, 'resourceId'> | null)[],
  selfIndex: number,
): boolean {
  if (condition === undefined) return true;
  const present = characters.some((c, i) => i !== selfIndex && c !== null && c.resourceId === condition.rid);
  return present === condition.present;
}

/** 防御力無視ダメージ編: 敵の属性が条件の属性か（条件が無ければ true。敵が属性なし（null）なら満たさない） */
export function enemyElementAllows(condition: Element | undefined, enemyElement: Element | null): boolean {
  return condition === undefined || condition === enemyElement;
}

/** 効果の編成の条件をすべて満たすか（条件の無い効果は true）。enemyElement は敵の属性（属性なしは null） */
export function compositionAllows(
  effect: SkillEffect,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
  enemyElement: Element | null = null,
): boolean {
  const mix = 'burstStepMix' in effect ? effect.burstStepMix : undefined;
  const squad = 'squad' in effect ? effect.squad : undefined;
  const withCharacter = 'withCharacter' in effect ? effect.withCharacter : undefined;
  const element = 'enemyElement' in effect ? effect.enemyElement : undefined;
  return (
    burstStepMixAllows(mix, characters, selfIndex) &&
    squadAllows(squad, characters, selfIndex) &&
    withCharacterAllows(withCharacter, characters, selfIndex) &&
    enemyElementAllows(element, enemyElement)
  );
}

/** 編成の条件を満たさない効果を外した定義。どの効果も外れなければ definition をそのまま返す */
export function applyComposition(
  definition: SkillDefinition,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
  enemyElement: Element | null = null,
): SkillDefinition {
  let changed = false;
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) {
    const entry = definition.skills[slot];
    const effects = entry.effects.filter((e) => compositionAllows(e, characters, selfIndex, enemyElement));
    if (effects.length === entry.effects.length) continue;
    changed = true;
    skills[slot] = { ...entry, effects };
  }
  return changed ? { ...definition, skills } : definition;
}

function applyCompositionToSlot(
  slot: TeamSlotInput,
  characters: readonly (CharacterData | null)[],
  selfIndex: number,
  enemyElement: Element | null,
): TeamSlotInput {
  const definition = slot.skills?.definition;
  if (slot.skills === undefined || !definition) return slot;
  const applied = applyComposition(definition, characters, selfIndex, enemyElement);
  return applied === definition ? slot : { ...slot, skills: { ...slot.skills, definition: applied } };
}

/**
 * 各枠に applyComposition を当てた新しい入力。どの枠も変わらなければ input をそのまま返す。
 * 宝物版の差し替え（applyTreasureToTeam）の後に通す（宝物版の効果にも条件を書けるように）
 */
export function applyCompositionToTeam<T extends TeamInput>(input: T): T {
  const characters = input.slots.map((slot) => (slot === null ? null : slot.character));
  const slots = input.slots.map((slot, i) =>
    slot === null ? null : applyCompositionToSlot(slot, characters, i, input.enemy.element),
  );
  if (slots.every((slot, i) => slot === input.slots[i])) return input;
  return { ...input, slots };
}
