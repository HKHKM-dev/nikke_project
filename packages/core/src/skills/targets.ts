// 効果の対象判定。対象の種類を足すときはここに述語を増やし、計算の本体（runSimulation）側は触らない。
//   - 発火のたびに対象が変わるもの（「直前にバーストスキルを使用した味方」）は、発火の文脈を受けて決める。
//   - 「最終攻撃力が最も高い味方 N 機」（topAttack）・「最終攻撃力が一番低い味方 N 機」（lowestAttack）は、文脈（攻撃力の順位）で決める
//     （skills/ranking.ts）。
//   - 「〈武器種〉の味方」「〈コード〉コードの味方」（targetElement）「〈クラス〉型の味方」（targetClass）は、対象の枠のキャラで絞る。
//   - 編成で決まる対象は、最上位の skills/composition.ts が決めた枠（fixedTargets）で絞る（どれが編成で決まるかは needsFixedTargets）。
//     それ以外の「自分を除く」（excludeSelf）は順位（skills/ranking.ts）で外す。
//   - 「残りの HP の割合が最も低い味方 N 機」（lowestHpRatio）は、fixedTargets（HP の割合の想定の低い順。同値は枠の若い順）の
//     先頭 targetCount 枠に掛ける（plan/design-skill-stage8.md 1.1 節）。
//   - 「残りの HP の値が最も低い味方 N 機」（lowestHp）と「最終防御力が最も高い味方 N 機」（topDefense）は、発火の文脈の並び
//     （targetRank）の先頭 targetCount 枠に掛ける（plan/design-heal-target-rank.md 2.2・2.3 節）。
//   - 「〈絞り込み〉の味方 N 機」（allies と targetCount）は、fixedTargets（絞り込みに合う枠の順）の先頭 targetCount 枠に掛ける
//     （候補が N 機より多い時、実機は発ごとに選び直す（C-1579）。枠の若い順は決め打ち。plan/design-kiri.md 6.1 節）。
//   - 「ランダムな味方 N 機」（allies と targetCount と targetRandom）は、fixedTargets の全員に掛ける（値は解決で N / 候補の数を
//     掛けた期待値。plan/design-lily.md 2 節）。
import type { Element, NikkeClass, WeaponType } from '../types.ts';
import type { NamedStateId } from './states.ts';
import {
  type BasicBurstStep,
  type BuffTarget,
  type ExcludeSelf,
  type RankTie,
  isAttackRanked,
  isHealOnlyTarget,
  type TargetAdjacent,
  type TargetDefense,
  type TargetSquad,
} from './types.ts';

/**
 * 発火の文脈。
 * burstUsers = そのフルバーストを開いたチェーンでバーストを撃った枠（FullBurstWindow.burstUsers）。フルバーストの開始・終了のときだけ。
 * attackRank = 対象になりうる枠（効果の targetWeapon・fixedTargets で絞った後）を発火のフレームの最終攻撃力の順
 * （topAttack は高い順、lowestAttack は低い順）に並べたもの。順位の対象の効果のときだけ（skills/ranking.ts の attackRankFor）。
 * lowerDefense = 発火のフレームの最終防御力が、発動者より低い枠と発動者自身
 * （同値は含まない。plan/design-skill-stage7.md 1.4 節）。targetDefense の効果のときだけ（skills/holders.ts）。
 * どれも無い発火では null
 */
export type FireContext = {
  burstUsers?: readonly number[];
  /** { applied } のきっかけの状態の、そのフレームに付いた件を付けた枠（appliedCaster。plan/design-mint-prika.md 2.4 節） */
  appliedCasters?: readonly number[];
  attackRank?: readonly number[];
  lowerDefense?: readonly number[];
  /**
   * heal にだけ書ける対象（lowestHpRatio・lowestHp・topDefense）の並び。fixedTargets の候補の枠を、発火のフレームの HP の割合の低い順
   * （plan/design-hp-ratio-readers.md 2.2 節）・HP の値の低い順・最終防御力の高い順（plan/design-heal-target-rank.md 2.2・2.3 節）に並べ、
   * 同値は枠の若い順。targetHpAtMost のある効果では、割合がそれ以下の枠だけ。無ければ fixedTargets（枠の想定の順）
   */
  targetRank?: readonly number[];
  /**
   * 時間で変わる targetState（targetStateHeld）の、発火のフレームにその状態の件を持つ枠（plan/design-rei-tentative.md 2.2 節。
   * skills/holders/conditions.ts の stateHoldersAt）
   */
  stateHolders?: readonly number[];
} | null;

/**
 * 対象の絞り込みの欄（解決した後の形）。解決済みの効果の型（skills/resolve.ts）は、欄をここから取る。どの欄も、定義に無ければ
 * キーごと無い。欄を足すときは、skills/resolve.ts の TARGET_KEYS の、その欄を書ける効果の一覧にも足す（足さないと、解決済みの
 * 効果に載らない）。編成で決まる欄なら、needsFixedTargets と skills/composition.ts の fixedTargetsOf にも足す
 */
export type TargetFields = {
  /** 「〈武器〉を所持する味方」 */
  targetWeapon?: WeaponType;
  /** 「〈コード〉コードの味方」 */
  targetElement?: Element;
  /** 「〈クラス〉型の味方」（plan/design-skill-stage9.md 1.1 節） */
  targetClass?: NikkeClass;
  /** N 機を選ぶ対象（topAttack・lowestAttack・longestChargeTime・lowestHpRatio と、allies の「〈絞り込み〉の味方 N 機」）の N（解決済み） */
  targetCount?: number;
  /** 「同じ部隊の味方全体に」 */
  targetSquad?: TargetSquad;
  /** 「自分の王」「自分のアイドル」（キャラの resourceId。plan/design-chime.md 2.1 節）。枠は skills/composition.ts が fixedTargets に書く */
  targetCharacter?: number;
  /** 「自分を除く」（topAttack と、allies の always） */
  excludeSelf?: ExcludeSelf;
  /** 順位の同値の向き（topAttack・lowestAttack。skills/ranking.ts の rankByFinalAttack） */
  rankTie?: RankTie;
  /** 「〈名前〉状態の」（目録の id） */
  targetState?: NamedStateId;
  /** targetState が時間で変わる状態なら true（skills/types.ts の FixedTargetFields）。発火の文脈の stateHolders で絞る */
  targetStateHeld?: true;
  /**
   * 「自分と〈状態〉の味方」（plan/design-new-chars-1029.md 5.1 節）・「自分と両隣」。時間で変わる targetState では、発火の文脈の枠に
   * 自分を足す
   */
  includeSelf?: true;
  /** 「両隣の味方」（plan/design-rouge.md 2.1 節）・「右隣の味方 1 機」。枠は最上位の skills/composition.ts が fixedTargets に書く */
  targetAdjacent?: TargetAdjacent;
  /** 「基本バースト段階が N の」 */
  targetBurstStep?: BasicBurstStep;
  /** 「部隊の一番左側にいる〈絞り込み〉の味方 1 機」（plan/design-trina.md 2.2 節）。枠は skills/composition.ts が fixedTargets に書く */
  targetLeftmost?: true;
  /** 「ランダムな味方 N 機」（plan/design-lily.md 2 節）。allies と targetCount の候補の全員に、期待値の値で掛ける */
  targetRandom?: true;
  /** 「自分と自分より最終防御力が低い味方」。発火の文脈の lowerDefense で決める */
  targetDefense?: TargetDefense;
  /**
   * 「…が HP X% 以下なら、対象に」の X（割合。lowestHpRatio の heal だけ）。発火の文脈の targetRank が X 以下の枠に絞り、文脈の無い
   * 呼び出しでは誰にも掛けない（plan/design-heal-target-rank.md 2.4 節）
   */
  targetHpAtMost?: number;
  /** 編成で決まる対象の枠（skills/composition.ts が定義に書いたもの） */
  fixedTargets?: readonly number[];
};

/** isEffectTarget が見る効果の項目 */
export type TargetedEffect = { target: BuffTarget } & TargetFields;

/**
 * 編成で決まる対象か（最上位の skills/composition.ts が fixedTargets を書く）。定義の効果（composition.ts の fixedTargetsOf が
 * 枠を書くかを決める）と、解決済みの効果（fixedTargetOk が fixedTargets の無い呼び出しを落とす）の両方が同じ判定を使う。
 * 欄を書ける効果の種類は読み込み（skills/parse/）が決めるので、ここでは欄だけを見る。枠の決め方（fixedTargetsOf）は効果の種類で
 * 分かれる（excludeSelf は timed・付与・passive（allies の always）、targetState は timed と付与、targetLeftmost は timed）ので、読み込みが欄を書ける種類を広げたら、
 * fixedTargetsOf の枠の決め方も合わせる
 */
export function needsFixedTargets(
  effect: { target: string } & Pick<
    TargetFields,
    | 'targetSquad'
    | 'targetCharacter'
    | 'targetState'
    | 'targetAdjacent'
    | 'targetBurstStep'
    | 'targetLeftmost'
    | 'excludeSelf'
    | 'targetCount'
  > & { targetCountRef?: number },
): boolean {
  return (
    effect.targetSquad !== undefined ||
    effect.targetCharacter !== undefined ||
    effect.target === 'longestChargeTime' ||
    isHealOnlyTarget(effect.target) ||
    effect.targetState !== undefined ||
    effect.targetAdjacent !== undefined ||
    effect.targetBurstStep !== undefined ||
    effect.targetLeftmost !== undefined ||
    (effect.target === 'allies' && effect.excludeSelf !== undefined) ||
    (effect.target === 'allies' && (effect.targetCount !== undefined || effect.targetCountRef !== undefined))
  );
}

/**
 * 編成で決まる対象の絞り込み。fixedTargets が有ればその枠だけ（longestChargeTime は順位の順の先頭 targetCount 枠、allies の
 * targetCount は枠の順の先頭 targetCount 枠。targetRandom なら候補の全員）。
 * targetSquad・longestChargeTime なのに
 * fixedTargets が無いのは、最上位の applyCompositionToTeam を通していない呼び出しなので落とす（黙って全員へ掛けない）
 */
function fixedTargetOk(effect: TargetedEffect, targetSlotIndex: number): boolean {
  if (effect.fixedTargets === undefined) {
    if (needsFixedTargets(effect)) {
      throw new Error(`target ${effect.target} needs fixedTargets (apply skills/composition.ts first)`);
    }
    return true;
  }
  // 順位の順の対象（基本チャージ時間・HP の割合と値・最終防御力）と「〈絞り込み〉の味方 N 機」は先頭の targetCount 枠
  const ranked =
    effect.target === 'longestChargeTime' ||
    isHealOnlyTarget(effect.target) ||
    (effect.target === 'allies' && effect.targetCount !== undefined && effect.targetRandom !== true);
  const candidates = ranked ? effect.fixedTargets.slice(0, effect.targetCount ?? 1) : effect.fixedTargets;
  return candidates.includes(targetSlotIndex);
}

/**
 * 対象の枠のキャラのうち、絞り込みに使う項目（CharacterData をそのまま渡せる）。class が無ければ、「〈クラス〉型の味方」の
 * 効果は掛からない（黙って全員へ掛けない）
 */
export type TargetSlot = { weaponType: WeaponType; element: Element; class?: NikkeClass };

/** targetWeapon・targetElement・targetClass の絞り込み（いくつかあれば全部を満たす枠だけ） */
export function matchesTargetFilter(
  effect: Pick<TargetedEffect, 'targetWeapon' | 'targetElement' | 'targetClass'>,
  slot: TargetSlot,
): boolean {
  return (
    (effect.targetWeapon === undefined || effect.targetWeapon === slot.weaponType) &&
    (effect.targetElement === undefined || effect.targetElement === slot.element) &&
    (effect.targetClass === undefined || effect.targetClass === slot.class)
  );
}

/**
 * sourceSlotIndex の枠が発動した効果が、targetSlotIndex の枠（キャラ targetSlot）に掛かるか。
 * targetWeapon（「〈武器〉を所持する味方」）があれば武器種の一致する枠だけ。アスカ: targetElement も同じ。
 * targetSlot を省略可能にしないのは、渡し忘れたときに黙って全員へ掛かるのを防ぐため。
 * burstUsers は context の枠だけ（context に無ければ誰にも掛からない。検証でフルバーストのトリガーに限っている）。
 * topAttack・lowestAttack は context.attackRank の先頭 targetCount 枠だけ（attackRank が無ければ誰にも掛からない）
 */
export function isEffectTarget(
  effect: TargetedEffect,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlot: TargetSlot,
  context: FireContext = null,
): boolean {
  const weaponOk = matchesTargetFilter(effect, targetSlot) && fixedTargetOk(effect, targetSlotIndex);
  switch (effect.target) {
    case 'self':
      return sourceSlotIndex === targetSlotIndex;
    case 'allies':
      // 防御力の比べの絞り込みは、発火の文脈の枠だけ（文脈に無ければ誰にも掛からない）
      if (effect.targetDefense !== undefined)
        return weaponOk && context?.lowerDefense?.includes(targetSlotIndex) === true;
      // 時間で変わる〈状態〉の味方は、発火のフレームにその状態を持つ枠だけ（文脈に無ければ誰にも掛からない）
      if (effect.targetStateHeld === true)
        return (
          weaponOk &&
          ((effect.includeSelf === true && sourceSlotIndex === targetSlotIndex) ||
            context?.stateHolders?.includes(targetSlotIndex) === true)
        );
      return weaponOk;
    case 'longestChargeTime':
      return weaponOk;
    case 'lowestHpRatio':
    case 'lowestHp':
    case 'topDefense': {
      const rank = context?.targetRank;
      // 文脈の無い呼び出しは、枠の想定の順（fixedTargets）で決まる lowestHpRatio だけ掛ける。HP の値と最終防御力の順位は発火の時の
      // 値でしか決まらず、閾値のある回復は閾値で絞った並びが要るので、どちらも掛けない
      if (rank === undefined)
        return effect.target === 'lowestHpRatio' && effect.targetHpAtMost === undefined && weaponOk;
      return (
        matchesTargetFilter(effect, targetSlot) && rank.slice(0, effect.targetCount ?? 1).includes(targetSlotIndex)
      );
    }
    case 'burstUsers':
      return weaponOk && context?.burstUsers?.includes(targetSlotIndex) === true;
    case 'appliedCaster':
      return weaponOk && context?.appliedCasters?.includes(targetSlotIndex) === true;
    case 'topAttack':
    case 'lowestAttack': {
      const rank = context?.attackRank;
      if (!weaponOk || rank === undefined) return false;
      return rank.slice(0, effect.targetCount ?? 1).includes(targetSlotIndex);
    }
  }
}

/**
 * 枠 selfIndex の「両隣」の枠（左右の枠のうち空でないもの。枠の若い順）。withSelf なら自分の枠も入れる。ゲーム内の用語のツールチップの
 * 「両隣」（編成の枠の左右）の読み（plan/design-rouge.md 2.1 節・plan/design-adjacent-allies.md 2.1 節）。side が 'right' なら
 * 右隣（自分の次の枠）だけ（枠の番号の若い方が左。plan/design-belorta-pw.md 2.1 節）
 */
export function adjacentSlotsOf(
  characters: readonly (unknown | null)[],
  selfIndex: number,
  withSelf: boolean,
  side: TargetAdjacent = true,
): number[] {
  const sides = side === 'right' ? [selfIndex + 1] : [selfIndex - 1, ...(withSelf ? [selfIndex] : []), selfIndex + 1];
  return sides.filter((i) => i >= 0 && i < characters.length && characters[i] !== null && characters[i] !== undefined);
}

/** 文脈しだいで掛かりうるか（burstUsers・順位の対象は武器種・属性の条件と編成で決まる枠だけで見る）。1 パス目で「窓を持ちうる枠」を決めるのに使う */
export function canEverTarget(
  effect: TargetedEffect,
  sourceSlotIndex: number,
  targetSlotIndex: number,
  targetSlot: TargetSlot,
): boolean {
  if (effect.target === 'self') return sourceSlotIndex === targetSlotIndex;
  if (effect.excludeSelf === 'always' && sourceSlotIndex === targetSlotIndex) return false;
  // 「足りなければ自分も」は、武器種・属性の条件に依らず自分に付きうる
  if (effect.excludeSelf === 'unlessShort' && sourceSlotIndex === targetSlotIndex) return true;
  // 「残りの HP の割合（値）が最も低い味方」「最終防御力が最も高い味方」は、発火の時の値で並べるので、
  // 候補の枠（fixedTargets の全部）のどれにも付きうる（plan/design-hp-ratio-readers.md 2.2 節）
  if (isHealOnlyTarget(effect.target) && effect.fixedTargets !== undefined)
    return matchesTargetFilter(effect, targetSlot) && effect.fixedTargets.includes(targetSlotIndex);
  return matchesTargetFilter(effect, targetSlot) && fixedTargetOk(effect, targetSlotIndex);
}

/** 対象が発火の文脈で変わるか（変わらなければ効果ごとに 1 回だけ対象を決めてよい） */
export function dependsOnContext(effect: {
  target: BuffTarget;
  targetDefense?: TargetDefense;
  targetStateHeld?: true;
}): boolean {
  return (
    effect.target === 'burstUsers' ||
    effect.targetStateHeld === true ||
    isAttackRanked(effect.target) ||
    effect.target === 'appliedCaster' ||
    dependsOnDefense(effect)
  );
}

/** 対象を決めるのに最終防御力の比べが要るか（plan/design-skill-stage7.md 1.4 節） */
export function dependsOnDefense(effect: { targetDefense?: TargetDefense }): boolean {
  return effect.targetDefense !== undefined;
}

/** 対象を決めるのに攻撃力の順位が要るか */
export function dependsOnRank(effect: { target: BuffTarget }): boolean {
  return isAttackRanked(effect.target);
}
