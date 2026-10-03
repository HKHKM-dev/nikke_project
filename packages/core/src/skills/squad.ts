// アニス：スター編: 部隊構成の条件（squad。plan/design-anis-star-s1.md 2.1 節）。編成で決まる静的な条件なので、宝物版の差し替え
// （skills/treasure.ts）と同じく最上位で 1 回だけ、満たさない効果を定義から外す。外した後の定義には squad の効果が残らない
// （残るのは満たした効果だけ）ので、2 回通しても結果は同じ。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillEffect, type SquadCondition } from './types.ts';

/** 自分（selfIndex）を除く空でない枠に、基本バースト段階が squad.otherBurstStep のキャラがいるかを squad.present と比べる */
export function squadAllows(
  squad: SquadCondition | undefined,
  characters: readonly (Pick<CharacterData, 'burstStep'> | null)[],
  selfIndex: number,
): boolean {
  if (squad === undefined) return true;
  const present = characters.some((c, i) => i !== selfIndex && c !== null && c.burstStep === squad.otherBurstStep);
  return present === squad.present;
}

function effectSquad(effect: SkillEffect): SquadCondition | undefined {
  return 'squad' in effect ? effect.squad : undefined;
}

/** 部隊構成の条件を満たさない効果を外した定義。どの効果も外れなければ definition をそのまま返す */
export function applySquad(
  definition: SkillDefinition,
  characters: readonly (Pick<CharacterData, 'burstStep'> | null)[],
  selfIndex: number,
): SkillDefinition {
  let changed = false;
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) {
    const entry = definition.skills[slot];
    const effects = entry.effects.filter((e) => squadAllows(effectSquad(e), characters, selfIndex));
    if (effects.length === entry.effects.length) continue;
    changed = true;
    skills[slot] = { ...entry, effects };
  }
  return changed ? { ...definition, skills } : definition;
}

function applySquadToSlot(
  slot: TeamSlotInput,
  characters: readonly (CharacterData | null)[],
  selfIndex: number,
): TeamSlotInput {
  const definition = slot.skills?.definition;
  if (slot.skills === undefined || !definition) return slot;
  const applied = applySquad(definition, characters, selfIndex);
  return applied === definition ? slot : { ...slot, skills: { ...slot.skills, definition: applied } };
}

/**
 * 各枠に applySquad を当てた新しい入力。どの枠も変わらなければ input をそのまま返す。
 * 宝物版の差し替え（applyTreasureToTeam）の後に通す（宝物版の効果にも squad を書けるように）
 */
export function applySquadToTeam<T extends TeamInput>(input: T): T {
  const characters = input.slots.map((slot) => (slot === null ? null : slot.character));
  const slots = input.slots.map((slot, i) => (slot === null ? null : applySquadToSlot(slot, characters, i)));
  if (slots.every((slot, i) => slot === input.slots[i])) return input;
  return { ...input, slots };
}
