// 編成の条件（バースト段階の構成 burstStepMix: plan/design-anis-star-s1.md 2.1 節、同じ部隊の味方 squad: plan/design-ram-s1.md
// 2.1 節）。編成で決まる静的な条件なので、宝物版の差し替え（skills/treasure.ts）と同じく最上位で 1 回だけ、満たさない効果を
// 定義から外す。外した後の定義には満たした効果だけが残るので、2 回通しても結果は同じ。
// 防御力無視ダメージ編（plan/design-true-damage-element.md 3.3・3.6 節）: 編成に特定のキャラがいる条件 withCharacter と、
// 敵の属性の条件 enemyElement も、同じく静的な条件としてここで外す。
// 対象の語彙編（plan/design-target-vocab.md 2.2・2.3 節）: 編成で決まる対象（targetSquad・longestChargeTime）の枠も、ここで
// 効果の fixedTargets に書く（skills/targets.ts が絞る）。何度通しても同じ枠になる。
// ペルソナ編（plan/design-persona.md 3.2 節）: 「ペルソナ状態の」（targetState）・「基本バースト段階が N の」
// （targetBurstStep）・allies の「自分を除く」（excludeSelf: always）も、編成で決まる対象としてここで枠を決める。
// 名前の付いた状態の語彙編（plan/design-named-state.md 3.4 節・実装の別紙 1.3 節）: 枠の状態は、その枠の定義の静的な状態
// （staticStatesOf。2 段目の段 1 で状態ごとの決め方にした）から取る。静的な付与にも編成の条件を書けるので、効果を外した後の定義から集める
// （applyCompositionToTeam: 編成の条件で外す → 静的な状態を集める → 対象の枠を決める）。付与（state）の対象も timed と同じに決める。
// 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 自分の状態の条件（selfState）のうち、編成で決まるもの（自分の定義の静的な状態と、
// どの枠の定義も付けない状態）も、ここで決める（満たせば条件から落とし、満たさなければ効果を外す）。
// 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 自分の HP の割合の条件（selfHp）も、枠の HP の割合の想定（TeamSlotInput.hpRatio。
// 戦闘中一定）で、ここで決める（applyCompositionToTeam の枠ごとの段。最小構成の検査など、枠の入力の無い所は想定の既定（満タン）とみなす）。
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { BurstStep, CharacterData, Element } from '../types.ts';
import { skillValue, type SkillLevels } from './resolve.ts';
import { statesMatching, type NamedStateId } from './states.ts';
import { matchesTargetFilter } from './targets.ts';
import {
  SKILL_SLOTS,
  burstStepChangeOf,
  isStacksCondition,
  selfHpThreshold,
  staticStatesOf,
  type BurstStepMixCondition,
  type SelfHpCondition,
  type SkillDefinition,
  type SkillEffect,
  type SquadCondition,
  type WithCharacterCondition,
} from './types.ts';

/**
 * 条件を見るのに要るキャラの欄。対象の語彙編: 編成で決まる対象を決めるときは、武器種・属性（絞り込み）とチャージ時間も要る
 * （その効果が無い編成では無くてよい）
 */
export type CompositionCharacter = BurstStepCharacter &
  Pick<CharacterData, 'squad' | 'resourceId'> &
  Partial<Pick<CharacterData, 'weaponType' | 'element' | 'shot' | 'class'>> & {
    /**
     * 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: 枠の HP の割合の想定（TeamSlotInput.hpRatio）。CharacterData には無く、
     * applyCompositionToTeam が枠の入力から足す。省略は満タン（最小構成の検査など、枠の入力の無い所）
     */
    hpRatio?: number;
  };

/** 「基本バースト段階が N の味方」を数えるのに要る欄（基本バースト段階と、バーストの後の段階） */
export type BurstStepCharacter = Pick<CharacterData, 'burstStep'> & {
  burstSkill: Pick<CharacterData['burstSkill'], 'nextStep'>;
};

/**
 * 基本バースト段階が step の味方に数えるか。バーストの後に同じ段階へ再突入するキャラ（burstSkill.nextStep が burstStep と同じ。
 * アビスタなど）は数えない（C-0555。ゲーム内の用語のツールチップと録画 0460）。全段階（AllStep）のキャラは burstStep が
 * Step1〜Step3 のどれとも一致しないので数えない（C-0203）
 */
export function countsAsBurstStep(c: BurstStepCharacter, step: string): boolean {
  return c.burstStep === step && c.burstSkill.nextStep !== c.burstStep;
}

/**
 * 自分（selfIndex）を除く空でない枠に、基本バースト段階が mix.otherBurstStep のキャラ（countsAsBurstStep。再突入するキャラは
 * 数えない）がいるかを mix.present と比べる
 */
export function burstStepMixAllows(
  mix: BurstStepMixCondition | undefined,
  characters: readonly (BurstStepCharacter | null)[],
  selfIndex: number,
): boolean {
  if (mix === undefined) return true;
  const present = characters.some((c, i) => i !== selfIndex && c !== null && countsAsBurstStep(c, mix.otherBurstStep));
  return present === mix.present;
}

/**
 * 2 段目の段 12（plan/design-skill-stage12.md 2.5 節）: 編成でのバーストの段（画面の表示用）。計算と同じく、編成の条件で外した後の定義の
 * バースト段階の変更（burstStepChange）の段、無ければ基本バースト段階
 */
export function burstStepInTeam(
  character: CharacterData,
  definition: SkillDefinition | null,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
): BurstStep {
  const composed = definition && filterComposition(definition, characters, selfIndex, null);
  return burstStepChangeOf(composed) ?? character.burstStep;
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
 * ペルソナ編: 効果の対象が編成で決まる絞り込み（〈名前〉状態・基本バースト段階・allies の自分を除く）を持つか。
 * 名前の付いた状態の語彙編: 付与（state）も timed と同じ
 */
export function hasPersonaTargetFilter(effect: SkillEffect): boolean {
  return (
    (effect.kind === 'timed' || effect.kind === 'state') &&
    (effect.targetState !== undefined ||
      effect.targetBurstStep !== undefined ||
      (effect.target === 'allies' && effect.excludeSelf !== undefined))
  );
}

/**
 * 対象の語彙編: 編成で決まる対象の枠（順位の順）。targetSquad = 部隊が自分と同じ枠（自分を含む。枠の順）、
 * longestChargeTime = 基本チャージ時間（CharacterData.shot.chargeTime）の長い順（同値は枠の若い順。仮定）。
 * ペルソナ編: targetState = 枠の静的な状態（states[i]。名前の付いた状態の語彙編: 枠の定義の静的な付与が付ける状態）にその id がある枠、
 * targetBurstStep = 基本バースト段階が N の枠（countsAsBurstStep。再突入するキャラは除く）、allies の excludeSelf = 自分の枠を外す。
 * どれも targetWeapon・targetElement で絞った後。どれでもない効果は undefined。付与（state）も timed と同じ
 */
export function fixedTargetsOf(
  effect: SkillEffect,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
  states: readonly (readonly NamedStateId[] | undefined)[] = [],
): number[] | undefined {
  // 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: 「残りの HP の割合が最も低い味方 N 機」（heal の lowestHpRatio）は、枠の HP の
  // 割合の想定（省略は満タン）の低い順・同値は枠の若い順（C-0567）。自分も候補。先頭の N 枠は skills/targets.ts が取る
  if (effect.kind === 'heal') {
    if (effect.target !== 'lowestHpRatio') return undefined;
    const ratio = (i: number) => characters[i]?.hpRatio ?? 1;
    return characters.flatMap((c, i) => (c === null ? [] : [i])).sort((a, b) => ratio(a) - ratio(b) || a - b);
  }
  if (effect.kind !== 'passive' && effect.kind !== 'timed' && effect.kind !== 'state') return undefined;
  const squad = effect.targetSquad !== undefined;
  const longest = effect.target === 'longestChargeTime';
  const persona = hasPersonaTargetFilter(effect);
  if (!squad && !longest && !persona) return undefined;
  const self = characters[selfIndex];
  if (!self) throw new Error(`no character in slot ${selfIndex}`);
  const windowed = effect.kind === 'timed' || effect.kind === 'state';
  const state = windowed ? effect.targetState : undefined;
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.1 節）: 家族の根なら家族のどの状態でも当たる。「自分と」は自分の枠を足す
  const matching = state === undefined ? [] : statesMatching(state);
  const withSelf = windowed && effect.includeSelf === true;
  const step = windowed ? effect.targetBurstStep : undefined;
  const excludeSelf = windowed && effect.target === 'allies' && effect.excludeSelf !== undefined;
  const candidates: number[] = [];
  characters.forEach((c, i) => {
    if (c === null) return;
    if (squad && c.squad !== self.squad) return;
    const own = withSelf && i === selfIndex;
    if (state !== undefined && !own && !matching.some((s) => (states[i] ?? []).includes(s))) return;
    if (step !== undefined && !countsAsBurstStep(c, step)) return;
    if (excludeSelf && i === selfIndex) return;
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

/** 定義の付与（静的なものも時間で変わるものも）が付ける状態 */
export function grantedStatesOf(definition: SkillDefinition | null | undefined): Set<NamedStateId> {
  const out = new Set<NamedStateId>();
  if (!definition) return out;
  for (const slot of SKILL_SLOTS)
    for (const e of definition.skills[slot].effects) if (e.kind === 'state') out.add(e.state);
  return out;
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 自分の状態が編成で決まるか。true = いつも付いている（自分の定義の静的な状態）、
 * false = いつも付いていない（自分の定義もほかの枠の定義も付けない）、undefined = 時間で変わる（段 1.5 と damage で件を見る）
 */
export type SelfStateLookup = (state: NamedStateId) => boolean | undefined;

/**
 * 枠の定義（編成の条件を当てた後）と、ほかの枠の定義が付けうる状態から、SelfStateLookup を作る。
 * ほかの枠の付与は、対象がこの枠になりうるかを見ずに数える（多めに「時間で変わる」とみなす）
 */
export function selfStateLookupOf(
  own: SkillDefinition | null | undefined,
  others: ReadonlySet<NamedStateId> = new Set(),
): SelfStateLookup {
  const statics = new Set(staticStatesOf(own));
  const granted = grantedStatesOf(own);
  // 2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 家族の根なら、家族のどの状態でも当たる
  return (state) => {
    const ids = statesMatching(state);
    if (ids.some((s) => statics.has(s))) return true;
    return ids.some((s) => granted.has(s) || others.has(s)) ? undefined : false;
  };
}

/**
 * 効果の selfState を、編成で決まるなら決める。満たすなら条件から selfState を落とした効果（ほかの鍵が無ければ条件ごと落とす。
 * 段の印が条件の無い効果と同じになる）、満たさないなら null、決まらなければそのまま
 */
export function resolveSelfState<E extends SkillEffect>(effect: E, lookup: SelfStateLookup): E | null {
  const condition = 'condition' in effect ? effect.condition : undefined;
  const self = condition?.selfState;
  if (condition === undefined || self === undefined) return effect;
  const has = lookup(self.state);
  if (has === undefined) return effect;
  // 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: スタック数の条件は、付けうる枠が無ければ満たさない。静的な状態（1 段）は
  // 件を見る段（skills/holders.ts・frame/plan.ts の stacksHold）で決める
  if (isStacksCondition(self)) return has ? effect : null;
  if (has !== self.present) return null;
  const { selfState: _selfState, ...rest } = condition;
  const { condition: _condition, ...without } = effect as E & { condition?: unknown };
  return (Object.keys(rest).length > 0 ? { ...without, condition: rest } : without) as E;
}

/**
 * 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 効果の selfHp（自分の HP の割合の条件）を、枠の HP の割合の想定 hpRatio で決める。
 * 満たすなら条件から selfHp を落とした効果（ほかの鍵が無ければ条件ごと落とす）、満たさないなら null。threshold は atLeastRef を
 * 割合（説明文の % ÷ 100）にする関数
 */
export function resolveSelfHp<E extends SkillEffect>(
  effect: E,
  hpRatio: number,
  threshold: (hp: SelfHpCondition) => number,
): E | null {
  const condition = 'condition' in effect ? effect.condition : undefined;
  const hp = condition?.selfHp;
  if (condition === undefined || hp === undefined) return effect;
  if (hpRatio < threshold(hp)) return null;
  const { selfHp: _selfHp, ...rest } = condition;
  const { condition: _condition, ...without } = effect as E & { condition?: unknown };
  return (Object.keys(rest).length > 0 ? { ...without, condition: rest } : without) as E;
}

/**
 * 2 段目の段 6: 定義の selfHp を、枠の HP の割合の想定で決めた定義（どの効果も変わらなければ definition をそのまま返す）。
 * 閾値は枠のキャラの説明文の値（スキル Lv の値）。いまは passive だけが書けるので、静的な状態の集め方には効かない
 */
export function applySelfHp(
  definition: SkillDefinition,
  character: Pick<CharacterData, 'skills'>,
  levels: SkillLevels,
  hpRatio: number,
): SkillDefinition {
  let changed = false;
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) {
    const entry = definition.skills[slot];
    const threshold = (hp: SelfHpCondition) =>
      selfHpThreshold(hp, (ref) => skillValue(character.skills[slot], ref, levels[slot]));
    let slotChanged = false;
    const effects = entry.effects
      .map((e) => {
        const resolved = resolveSelfHp(e, hpRatio, threshold);
        if (resolved !== e) slotChanged = true;
        return resolved;
      })
      .filter((e): e is SkillEffect => e !== null);
    if (!slotChanged) continue;
    changed = true;
    skills[slot] = { ...entry, effects };
  }
  return changed ? { ...definition, skills } : definition;
}

/**
 * 編成の枠ごとの SelfStateLookup（applyCompositionToTeam と同じ決め方。最小構成の検査など、効果を 1 つずつ見る所が使う）。
 * definitions は宝物版を当てた各枠の定義（定義の無い枠は null）
 */
export function selfStateLookupsForTeam(
  definitions: readonly (SkillDefinition | null | undefined)[],
  characters: readonly (CompositionCharacter | null)[],
  enemyElement: Element | null = null,
): SelfStateLookup[] {
  const filtered = definitions.map((d, i) => (d ? filterComposition(d, characters, i, enemyElement) : d));
  const others = otherGrantedStates(filtered);
  return filtered.map((own, i) => selfStateLookupOf(own, others[i]));
}

/**
 * 編成の条件を満たさない効果を外し、編成で決まる対象の枠（fixedTargets）を書いた定義。どの効果も変わらなければ
 * definition をそのまま返す。2 段目の段 1: 編成で決まる selfState も決める（others はほかの枠の定義が付けうる状態。
 * 省略はほかの枠が付けない）
 */
export function applyComposition(
  definition: SkillDefinition,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
  enemyElement: Element | null = null,
  /** ペルソナ編: 枠ごとの静的な状態（名前の付いた状態の語彙編: 編成の条件を当てた後の定義の静的な付与。定義の無い枠は undefined） */
  states: readonly (readonly NamedStateId[] | undefined)[] = [],
  others: ReadonlySet<NamedStateId> = new Set(),
): SkillDefinition {
  const allowed = filterComposition(definition, characters, selfIndex, enemyElement);
  const lookup = selfStateLookupOf(allowed, others);
  let changed = allowed !== definition;
  const skills = { ...allowed.skills };
  for (const slot of SKILL_SLOTS) {
    const entry = allowed.skills[slot];
    let slotChanged = false;
    const effects = entry.effects
      .map((e) => {
        const resolved = resolveSelfState(e, lookup);
        if (resolved !== e) slotChanged = true;
        return resolved;
      })
      .filter((e): e is SkillEffect => e !== null)
      .map((e) => {
        const fixed = fixedTargetsOf(e, characters, selfIndex, states);
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
  return changed ? { ...allowed, skills } : definition;
}

/** 編成の条件（burstStepMix・squad・withCharacter・enemyElement）を満たさない効果を外した定義。どれも満たせばそのまま */
function filterComposition(
  definition: SkillDefinition,
  characters: readonly (CompositionCharacter | null)[],
  selfIndex: number,
  enemyElement: Element | null,
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
  states: readonly (readonly NamedStateId[] | undefined)[],
  others: ReadonlySet<NamedStateId>,
): TeamSlotInput {
  const definition = slot.skills?.definition;
  if (slot.skills === undefined || !definition) return slot;
  const composed = applyComposition(definition, characters, selfIndex, enemyElement, states, others);
  // 2 段目の段 6: 自分の HP の割合の条件は、枠の HP の割合の想定（省略は満タン）で決める
  const applied = applySelfHp(composed, slot.character, slot.skills.levels, slot.hpRatio ?? 1);
  return applied === definition ? slot : { ...slot, skills: { ...slot.skills, definition: applied } };
}

/** 枠ごとの、ほかの枠の定義が付けうる状態（自分の枠を除く全枠の付与の状態） */
function otherGrantedStates(definitions: readonly (SkillDefinition | null | undefined)[]): Set<NamedStateId>[] {
  const granted = definitions.map(grantedStatesOf);
  return definitions.map((_, i) => {
    const out = new Set<NamedStateId>();
    granted.forEach((g, j) => {
      if (j !== i) for (const s of g) out.add(s);
    });
    return out;
  });
}

/**
 * 各枠に applyComposition を当てた新しい入力。どの枠も変わらなければ input をそのまま返す。
 * 宝物版の差し替え（applyTreasureToTeam）の後に通す（宝物版の効果にも条件を書けるように）。
 * 名前の付いた状態の語彙編: 枠の静的な状態は、編成の条件で効果を外した後の定義から集める（applyComposition は 2 回通しても同じ）。
 * 2 段目の段 1: 編成で決まる selfState は、ほかの枠の定義が付けうる状態を見て決める
 */
export function applyCompositionToTeam<T extends TeamInput>(input: T): T {
  // 2 段目の段 8: 枠の HP の割合の想定を、編成で決まる対象（lowestHpRatio）の並べ方に渡す
  const characters = input.slots.map((slot) =>
    slot === null ? null : slot.hpRatio === undefined ? slot.character : { ...slot.character, hpRatio: slot.hpRatio },
  );
  const enemyElement = input.enemy.element;
  const filtered = input.slots.map((slot, i) => {
    const definition = slot?.skills?.definition;
    return definition ? filterComposition(definition, characters, i, enemyElement) : undefined;
  });
  const states = filtered.map((definition) => (definition === undefined ? undefined : staticStatesOf(definition)));
  const others = otherGrantedStates(filtered);
  const slots = input.slots.map((slot, i) =>
    slot === null ? null : applyCompositionToSlot(slot, characters, i, enemyElement, states, others[i]!),
  );
  if (slots.every((slot, i) => slot === input.slots[i])) return input;
  return { ...input, slots };
}
