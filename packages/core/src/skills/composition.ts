// 編成の条件（バースト段階の構成 burstStepMix: plan/design-anis-star-s1.md 2.1 節、同じ部隊の味方 squad: plan/design-ram-s1.md
// 2.1 節）。編成で決まる静的な条件なので、宝物版の差し替え（skills/treasure.ts）と同じく最上位で 1 回だけ、満たさない効果を
// 定義から外す。外した後の定義には満たした効果だけが残るので、2 回通しても結果は同じ。
// 防御力無視ダメージ編（plan/design-true-damage-element.md 3.3・3.6 節）: 編成に特定のキャラがいる条件 withCharacter と、
// 敵の属性の条件 enemyElement も、同じく静的な条件としてここで外す。
// 対象の語彙編（plan/design-target-vocab.md 2.2・2.3 節）: 編成で決まる対象（targetSquad・longestChargeTime）の枠も、ここで
// 効果の fixedTargets に書く（skills/targets.ts が絞る）。何度通しても同じ枠になる。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';
import { matchesTargetFilter } from './targets.ts';
import {
  SKILL_SLOTS,
  type BurstStepMixCondition,
  type SkillDefinition,
  type SkillEffect,
  type SquadCondition,
  type WithCharacterCondition,
} from './types.ts';

/**
 * 条件を見るのに要るキャラの欄。対象の語彙編: 編成で決まる対象を決めるときは、武器種・属性（絞り込み）とチャージ時間も要る
 * （その効果が無い編成では無くてよい）
 */
export type CompositionCharacter = Pick<CharacterData, 'burstStep' | 'squad' | 'resourceId'> &
  Partial<Pick<CharacterData, 'weaponType' | 'element' | 'shot'>>;

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

function fullCharacter(c: CompositionCharacter, index: number): Required<CompositionCharacter> {
  if (c.weaponType === undefined || c.element === undefined || c.shot === undefined) {
    throw new Error(`slot ${index}: weaponType, element and shot are needed to fix the target`);
  }
  return c as Required<CompositionCharacter>;
}

/**
 * 対象の語彙編: 編成で決まる対象の枠（順位の順）。targetSquad = 部隊が自分と同じ枠（自分を含む。枠の順）、
 * longestChargeTime = 基本チャージ時間（CharacterData.shot.chargeTime）の長い順（同値は枠の若い順。仮定）。
 * どちらも targetWeapon・targetElement で絞った後。どちらでもない効果は undefined
 */
export function fixedTargetsOf(
  effect: SkillEffect,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
): number[] | undefined {
  if (effect.kind !== 'passive' && effect.kind !== 'timed') return undefined;
  const squad = effect.targetSquad !== undefined;
  const longest = effect.target === 'longestChargeTime';
  if (!squad && !longest) return undefined;
  const self = characters[selfIndex];
  if (!self) throw new Error(`no character in slot ${selfIndex}`);
  const candidates: number[] = [];
  characters.forEach((c, i) => {
    if (c === null) return;
    if (squad && c.squad !== self.squad) return;
    if (!matchesTargetFilter(effect, fullCharacter(c, i))) return;
    candidates.push(i);
  });
  if (!longest) return candidates;
  const seconds = (i: number) => fullCharacter(characters[i]!, i).shot.chargeTime;
  return candidates.sort((a, b) => seconds(b) - seconds(a) || a - b);
}

function sameTargets(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((v, i) => v === b[i]));
}

/**
 * 編成の条件を満たさない効果を外し、編成で決まる対象の枠（fixedTargets）を書いた定義。どの効果も変わらなければ
 * definition をそのまま返す
 */
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
    let slotChanged = false;
    const effects = entry.effects
      .filter((e) => compositionAllows(e, characters, selfIndex, enemyElement))
      .map((e) => {
        const fixed = fixedTargetsOf(e, characters, selfIndex);
        if (
          fixed === undefined ||
          !('target' in e) ||
          sameTargets(fixed, (e as { fixedTargets?: readonly number[] }).fixedTargets)
        ) {
          return e;
        }
        slotChanged = true;
        return { ...e, fixedTargets: fixed };
      });
    if (!slotChanged && effects.length === entry.effects.length) continue;
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
