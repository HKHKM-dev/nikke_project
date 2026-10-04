// 編成の条件（バースト段階の構成 burstStepMix: plan/design-anis-star-s1.md 2.1 節、同じ部隊の味方 squad: plan/design-ram-s1.md
// 2.1 節）。編成で決まる静的な条件なので、宝物版の差し替え（skills/treasure.ts）と同じく最上位で 1 回だけ、満たさない効果を
// 定義から外す。外した後の定義には満たした効果だけが残るので、2 回通しても結果は同じ。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import {
  SKILL_SLOTS,
  type BurstStepMixCondition,
  type SkillDefinition,
  type SkillEffect,
  type SquadCondition,
} from './types.ts';

/** 条件を見るのに要るキャラの欄 */
export type CompositionCharacter = Pick<CharacterData, 'burstStep' | 'squad'>;

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

/** 効果の編成の条件をすべて満たすか（条件の無い効果は true） */
export function compositionAllows(
  effect: SkillEffect,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
): boolean {
  const mix = 'burstStepMix' in effect ? effect.burstStepMix : undefined;
  const squad = 'squad' in effect ? effect.squad : undefined;
  return burstStepMixAllows(mix, characters, selfIndex) && squadAllows(squad, characters, selfIndex);
}

/** 編成の条件を満たさない効果を外した定義。どの効果も外れなければ definition をそのまま返す */
export function applyComposition(
  definition: SkillDefinition,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
): SkillDefinition {
  let changed = false;
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) {
    const entry = definition.skills[slot];
    const effects = entry.effects.filter((e) => compositionAllows(e, characters, selfIndex));
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
): TeamSlotInput {
  const definition = slot.skills?.definition;
  if (slot.skills === undefined || !definition) return slot;
  const applied = applyComposition(definition, characters, selfIndex);
  return applied === definition ? slot : { ...slot, skills: { ...slot.skills, definition: applied } };
}

/**
 * 各枠に applyComposition を当てた新しい入力。どの枠も変わらなければ input をそのまま返す。
 * 宝物版の差し替え（applyTreasureToTeam）の後に通す（宝物版の効果にも条件を書けるように）
 */
export function applyCompositionToTeam<T extends TeamInput>(input: T): T {
  const characters = input.slots.map((slot) => (slot === null ? null : slot.character));
  const slots = input.slots.map((slot, i) => (slot === null ? null : applyCompositionToSlot(slot, characters, i)));
  if (slots.every((slot, i) => slot === input.slots[i])) return input;
  return { ...input, slots };
}
