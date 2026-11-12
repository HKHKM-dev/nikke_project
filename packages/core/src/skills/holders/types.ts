// 件の一覧（../holders.ts の createHolderLists）の型と、件・履歴を読む小さな関数: 件の列（HeldTrack）・履歴（HolderHistory）・
// 問い合わせ（HolderLists）・作るときの入力（HolderListsOptions）と、出どころの型（createHolderLists の中で発火を追う単位）。
import type { BurstScheduleModel, FullBurstWindow } from '../../burst/schedule.ts';
import { lowerBound, type ShotLog } from '../../frame/shots.ts';
import type { ResolvedDamageEffect } from '../burstDamage.ts';
import type { BuffTotals, HitRateN } from '../buffs.ts';
import type { ChanceOpportunity } from '../chance.ts';
import type { ResolvedCycleEvery } from '../cycles.ts';
import type {
  ResolvedCounterChange,
  ResolvedEffect,
  ResolvedInstantEffect,
  ResolvedRemoveDebuff,
  ResolvedRemoveState,
  ResolvedStateExtend,
  ResolvedStackChange,
  ResolvedStateContent,
  ResolvedStateGrant,
  ResolvedTimedEffect,
  ResolvedWhileEffect,
  ResolvedCounterWhileEffect,
  ResolvedHpWhileEffect,
} from '../resolve.ts';
import type { attackRankFor, RankingRecord } from '../ranking.ts';
import { counterMax, type CounterId } from '../counters.ts';
import type { StackDecrease } from '../stacks.ts';
import type { NamedStateId } from '../states.ts';
import type { dependsOnRank, FireContext } from '../targets.ts';
import type { FrameEvents, FullStackEvent, HealRecord, ShotCountEveryAt, TriggerTracker } from '../triggers.ts';
import { isEnemyHeldStat, type TimerTrigger } from '../types.ts';
import type { SkillSlot } from '../../types.ts';
import type { AppliedRecord, ConditionSkip, SlotBuffState, TimelineSlot } from '../timeline.ts';

/**
 * 件の列の持ち主（plan/design-holder-effects.md 2.8 節）。0 以上は味方の枠、ENEMY は敵（1 体の前提）。
 * 敵の件は、敵の受けるダメージ▲（damageTaken の timed）と、持続ダメージが付ける敵の状態
 */
export const ENEMY = -1;

/**
 * 敵が持つ効果か: 敵の受けるダメージ▲（damageTaken）と、敵の防御力▼（enemyDefenseDown）。値は、敵が受ける全ダメージに
 * 効くので、味方の各枠の区間の値に足す（値の小片で味方の各枠に写す。C-0138）
 */
export function isEnemyEffect(effect: { stat: string }): boolean {
  return isEnemyHeldStat(effect.stat);
}

/** 段の印（plan/design-holder-effects.md 2.5 節）: 1・1.5・2・2.5 段目 */
export type HeldStage = 1 | 1.5 | 2 | 2.5;

/** 件の列の出どころ */
export type HeldOrigin =
  | { kind: 'passive'; effect: ResolvedEffect }
  | { kind: 'timed'; effect: ResolvedTimedEffect }
  | { kind: 'state'; state: NamedStateId; grant: ResolvedStateGrant; contents: readonly ResolvedStateContent[] }
  | { kind: 'healWindow'; effect: ResolvedInstantEffect }
  | { kind: 'cycleEvery'; effect: ResolvedCycleEvery }
  /** 持続ダメージが付ける敵の状態（持ち主は ENEMY。同じ状態の持続ダメージの効果をまとめる。frame/dot.ts の groupDotsByState） */
  | { kind: 'enemyState'; state: NamedStateId; effects: readonly ResolvedDamageEffect[] }
  /**
   * 状態の間だけ効く常時の効果（while。plan/design-skill-stage9.md 1.3 節）。件は、出どころの枠のその状態の段 1 の件
   * から作る（whileItems。始まりの列を持たない）。カウンタの while は、出どころの枠のカウンタの記録から作る。
   * HP の割合の while は、出どころの枠の HP の割合の記録から作る（plan/design-hp-ratio-readers.md 2.1 節）
   */
  | { kind: 'while'; effect: ResolvedWhileEffect | ResolvedCounterWhileEffect | ResolvedHpWhileEffect };

/** 件（窓 [start, end)）。stack はスタックの段（1 始まり）、scale は確率のきっかけの付いている確率 */
export type HeldItem = { start: number; end: number; stack?: number; scale?: number };

/** 件の列: 1 つの出どころの、1 人の持ち主への件 */
export type HeldTrack = {
  /** 持ち主の枠（敵は ENEMY） */
  holder: number;
  /** 付けた枠 */
  sourceSlotIndex: number;
  /** 付けた枠のバフ前攻撃力（発動者基準の固定加算） */
  casterBaseAttack: number;
  /** 付けた枠の最終最大HP（casterFinalMaxHp の固定加算。skills/timeline.ts の TimelineSlot.casterMaxHp） */
  casterMaxHp?: number;
  origin: HeldOrigin;
  stage: HeldStage;
  /** 窓の始まり（昇順）。確率のきっかけは機会（opportunities）で持つ */
  starts: number[];
  /**
   * 状態の件の列を閉じる解除の発火のフレーム（昇順・重なりなし。plan/design-skill-stage1.md 1.2 節）。発火の f に
   * 効いている件を f + 1 で切る（同じフレーム f に始まりのある列は閉じない）。状態と、デバフ解除で外れる味方の timed の▼と、
   * 敵の状態の消去のほかは空
   */
  closes: number[];
  /**
   * フルスタックの消費のフレーム（昇順。plan/design-skill-stage3.md 1.3 節）。その時に付いている件を、同じフレームに
   * 始まった件も含めて次のフレームで切る（解除と違い、付与が勝つ規則を当てない）。状態のほかは空
   */
  consumes: number[];
  /**
   * スタック量の減少（フレームの昇順。plan/design-skill-stage3.md 1.5 節）。そのフレームに効いている段の上から
   * N 段を次のフレームで切る（skills/stacks.ts）。スタックする状態のほかは空
   */
  decreases: StackDecrease[];
  /**
   * 状態の維持の延長（発火のフレームの昇順。plan/design-mint-prika.md 2.5 節）。そのフレームに付いていて後まで続く件の
   * 終わりを frames だけ延ばす（extendItems）。状態のほかは無い
   */
  extensions?: { frame: number; frames: number }[];
  /** 確率のきっかけの機会（出どころで共有。ほかは null） */
  opportunities: ChanceOpportunity[] | null;
  /**
   * durationUntil "selfHpAbove" の窓の終わり（発動者の HP の割合が閾値を上回ったフレーム。昇順。
   * 同じ発動者・閾値の件の列で共有する。plan/design-mast.md 8 節）。ほかは無い
   */
  untilEnds?: number[];
  /**
   * perCount の timed の、発火の窓の始まり → 発火のフレームのスタック数（件の scale にする。plan/design-maids.md 2.1 節）。
   * ほかは無い
   */
  startScales?: Map<number, number>;
  /**
   * 徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: leadFrames のある付与の、件の始まり → きっかけの発のフレーム
   * （昇順。戦闘の始まりで止まった始まりには、発が複数ありうる）。付けた枠の小片の始まり（piecesOfTrack）に使う。ほかは無い
   */
  leadFires?: Map<number, number[]>;
  /**
   * stacksFrom で確率の状態のスタック数を写した付与の、件の始まり → 段ごとの
   * 「元のスタック数がその段以上の確率」（添字は段 − 1。件の段の scale にする。plan/design-tove-base.md 2.1 節）。ほかは無い
   */
  levelScales?: Map<number, number[]>;
  /** 作った件（入力が変わったら作り直す。readItems で読む） */
  items: HeldItem[];
};

/** 強化（amplifies）の出どころ。受け付けと値は、ループの後に履歴を閉じる時に決める（amplify） */
export type AmplifierSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  /** 発火の窓の始まり（受け付ける前） */
  starts: number[];
};

/**
 * 強化の値の小片（plan/design-holder-effects.md 2.9 節）。受け付けた発火の窓の中で、参照する件が効いている所は
 * 割合 × その件の値、切れた所は (1 + 割合) × 発動の瞬間の値（V-0230）
 */
export type AmplifiedPiece = {
  holder: number;
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  end: number;
  value: number;
};

/** 履歴（plan/design-holder-effects.md 2.9 節）。件の列と、判定の記録 */
export type HolderHistory = {
  frames: number;
  slots: readonly TimelineSlot[];
  /** 常時パッシブだけの状態（skills/timeline.ts の resolvePassiveStates） */
  passive: readonly (SlotBuffState | null)[];
  /** 件の列（作った順: 常時 → timed → 状態 → 循環の間隔の変更 → 吸収回復） */
  tracks: readonly HeldTrack[];
  /** 強化の値の小片（受け付けた発火の分） */
  amplified: readonly AmplifiedPiece[];
  /** 状態が付いた記録（静的な状態はフレーム 0） */
  applications: readonly AppliedRecord[];
  /** 条件を満たさずに発火しなかった記録（フレームの順。強化の受け付けなかった発火も入る） */
  conditionSkips: readonly ConditionSkip[];
  rankings: readonly RankingRecord[];
  /** デバフ解除の対象を、選び方を確かめていない決め打ちで選んだ記録（フレームの順） */
  removeDebuffGuesses: readonly RemoveDebuffGuessRecord[];
  /** 回復の記録（回復を起こした適用。吸収回復の付き直しは入らない） */
  heals: readonly HealRecord[];
  /** ループで分かったフルバーストの窓（終わりで閉じる件を作り直すのに使う） */
  fullBurstWindows: readonly FullBurstWindow[];
  logs: readonly (ShotLog | null)[];
  /** カウンタの値が変わった記録（フレームの順。value は変わった後の値。plan/design-skill-stage10.md 2.3 節） */
  counters: readonly CounterRecord[];
  /**
   * 枠ごとの HP の割合（selfHpRatioAt）の変わり目（plan/design-soline.md 2.1 節）。読むのは selfHpRatioOf（2 パス目の damage の
   * 条件 selfHp（以上）が発火のフレームで読む）
   */
  hpRatios: readonly HpRatioSteps[];
};

/** 枠の HP の割合の段。frames（昇順・先頭は 0）のフレームから次の変わり目の前まで、割合は ratios の同じ番号 */
export type HpRatioSteps = { frames: readonly number[]; ratios: readonly number[] };

/** 履歴から、枠のフレーム frame の HP の割合（1 パス目の selfHpRatioAt と同じ値。plan/design-soline.md 2.1 節） */
export function selfHpRatioOf(history: Pick<HolderHistory, 'hpRatios'>, slotIndex: number, frame: number): number {
  const steps = history.hpRatios[slotIndex];
  if (steps === undefined) throw new RangeError(`selfHpRatioOf: no slot ${slotIndex}`);
  return steps.ratios[hpRatioStepIndexOf(steps, frame)]!;
}

/** フレーム frame が入る HP の割合の段の番号 */
export function hpRatioStepIndexOf(steps: HpRatioSteps, frame: number): number {
  return lowerBound(steps.frames, frame + 1) - 1;
}

/**
 * デバフ解除の選び方を確かめていない所（plan/design-debuff-removal.md 2.2 節）。targets は debuffedRandom でデバフのかかった味方が
 * N 機より多い（実機ではランダム）、states は味方にデバフ（印の付いた状態と、timed の▼）が count 個より多く付いている
 */
export type RemoveDebuffGuess = 'targets' | 'states';

/** デバフ解除の決め打ちの記録 1 つ。limit は、超えた数（targets なら N、states なら count） */
export type RemoveDebuffGuessRecord = {
  /** 効いたフレーム */
  frame: number;
  sourceSlotIndex: number;
  effect: RankingRecord['effect'];
  guess: RemoveDebuffGuess;
  limit: number;
};

/**
 * デバフ解除で外すデバフを選ぶ（plan/design-debuff-removal.md 2.2 節）。held は枠ごとの、効いているデバフ（印の付いた状態と、
 * timed の▼。とその最も早い始まり）。pick（debuffedRandom の N）があればデバフのある枠から N 機、無ければ全員。枠ごとに count 個。選び方を確かめていない所は
 * 決め打ち（N 機より多ければ枠の若い順、count 個より多ければ付いたのが早い順）で、guesses に超えた数と出す
 */
export function pickRemoveDebuff<T>(
  held: readonly (readonly { tracks: T; firstStart: number }[])[],
  count: number,
  pick: number | undefined,
): { chosen: T[]; guesses: Pick<RemoveDebuffGuessRecord, 'guess' | 'limit'>[] } {
  const guesses: Pick<RemoveDebuffGuessRecord, 'guess' | 'limit'>[] = [];
  let targets = held.filter((states) => states.length > 0);
  if (pick !== undefined && targets.length > pick) {
    guesses.push({ guess: 'targets', limit: pick });
    targets = targets.slice(0, pick);
  }
  if (targets.some((states) => states.length > count)) guesses.push({ guess: 'states', limit: count });
  const chosen = targets.flatMap((states) =>
    [...states]
      .sort((a, b) => a.firstStart - b.firstStart)
      .slice(0, count)
      .map((s) => s.tracks),
  );
  return { chosen, guesses };
}

/** カウンタの値が変わった記録 1 つ */
/**
 * カウンタの増減の記録。値はそのフレームのすべての判定の後に足したものなので、読む側には次のフレームから効く。battleStart は戦闘開始時の
 * 増減（フレーム 0 の記録で、フレーム 0 から効く）。効き始めは counterEffectiveFrom
 */
export type CounterRecord = { frame: number; slotIndex: number; counter: CounterId; value: number; battleStart?: true };

/** カウンタの記録が効き始めるフレーム（戦闘開始時の記録は 0、ほかは記録の次のフレーム） */
export function counterEffectiveFrom(record: CounterRecord): number {
  return record.battleStart === true ? 0 : record.frame + 1;
}

/**
 * 枠のカウンタの { counterFull } が発火するフレーム（上限に届いた記録の次の
 * フレーム。戦闘開始時の記録は 1。createHolderLists の counterFullAt と同じ。plan/design-skill-stage13.md 2.2 節）。damage・dot の { counterFull } が読む
 */
export function counterFullFrames(records: readonly CounterRecord[], slotIndex: number, counter: CounterId): number[] {
  return records
    .filter((r) => r.slotIndex === slotIndex && r.counter === counter && r.value === counterMax(counter))
    .map((r) => r.frame + 1);
}

export type HolderListsOptions = {
  frames: number;
  /** トリガーの判定に使う（バースト 1 段階突入時の意味） */
  scheduleModel: BurstScheduleModel | null;
  /** ループが書く射撃の列（N 発間維持・撃ち切りの件の終わりに読む） */
  logs: readonly (ShotLog | null)[];
  /** いま分かっているフルバーストの窓（始まりの順） */
  fullBurstWindows: () => readonly FullBurstWindow[];
  /**
   * テスト用（plan/design-first-pass-perf.md 4 節）: 件の列を読むたびに、いまの入力から作り直した件と比べ、違えば投げる。
   * 作り直す判定（readItems）が、件を作る関数の読む入力を落としていないことを確かめる。フレームごとに全部の件の列を読む
   */
  verifyItems?: boolean;
  /**
   * 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節の案 1）: leadFrames のある付与の、前の回で発火した発の
   * フレーム（leadShotKey ごと）。渡された発は、発 − leadFrames のフレームで件を登録し、発のフレームでは足さない（frame/firstPass.ts の
   * runFirstPass が回し直すときに渡す）
   */
  leadShots?: LeadShots;
  /**
   * 条件 inEffectiveRange の判定（plan/design-agent-bunny.md 2.2 節）。枠 slotIndex のフレーム frame の着地点が、
   * 適正最小射程距離▲ の和 minRange で縮めた適正射程距離の中か（frame/landing.ts の inEffectiveRangeAt）。省略は成り立つ（距離ボーナスあり
   * の手入力の条件の既定と同じ）
   */
  effectiveRangeAt?: (slotIndex: number, frame: number, minRange: number) => boolean;
};

/** leadFrames のある付与ごとの、発火した発のフレーム（昇順。leadShotKey ごと。発火の無い付与は入らない） */
export type LeadShots = Readonly<Record<string, readonly number[]>>;

/** leadFrames のある付与の鍵（出どころの枠・スロット・効果の番号） */
export function leadShotKey(g: GrantSource): string {
  return `${g.group.sourceSlotIndex}.${g.grant.source.skill}.${g.grant.effectIndex}`;
}

/** 1 つの出どころ（timed の効果） */
export type TimedSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  stage: HeldStage;
  fires: TriggerTracker;
  chance: boolean;
  /** 持ち主ごとの件の列（対象になりうる枠だけ）。敵の件の効果では、すべて null */
  tracks: (HeldTrack | null)[];
  /** 敵の件の効果（isEnemyEffect）の、敵の件の列。ほかは null */
  enemy: HeldTrack | null;
};

/** 持続ダメージが付ける敵の状態（出どころ × 状態）。発火は効果ごと */
export type EnemyStateSource = { effects: { effect: ResolvedDamageEffect; fires: TriggerTracker }[]; track: HeldTrack };

/** 状態の付与 1 つ */
export type GrantSource = { grant: ResolvedStateGrant; stage: HeldStage; fires: TriggerTracker; group: StateGroup };

/** 出どころ × 状態ごとの、時間で変わる状態（静的な付与の中身は常時パッシブ） */
export type StateGroup = {
  sourceSlotIndex: number;
  state: NamedStateId;
  grants: GrantSource[];
  contents: ResolvedStateContent[];
  /** 状態の件が確定する段（付与のいちばん後の段） */
  stage: HeldStage;
  tracks: (HeldTrack | null)[];
  /**
   * 敵に付く状態（付与の enemy）の、敵の 1 つの件の列（plan/design-elegg.md 8.2 節）。味方の tracks は全部 null。
   * 中身は敵の件の timed と同じく、対象の味方の各枠の区間の値に写す（piecesOfTrack）。ほかは null
   */
  enemy: HeldTrack | null;
};

export type CycleSource = { slotIndex: number; effect: ResolvedCycleEvery; fires: TriggerTracker; track: HeldTrack };

/** 解除 1 つ（対象は自分。plan/design-skill-stage1.md 1.2 節） */
export type RemoveSource = {
  sourceSlotIndex: number;
  effect: ResolvedRemoveState;
  stage: HeldStage;
  fires: TriggerTracker;
};

/** 状態の維持の延長 1 つ（plan/design-mint-prika.md 2.5 節） */
export type ExtendSource = {
  sourceSlotIndex: number;
  effect: ResolvedStateExtend;
  fires: TriggerTracker;
  /** 延ばす件の列（初めての発火で作る。件の列は組み立ての後に増えない） */
  targets?: HeldTrack[];
};

/** デバフ解除 1 つ（plan/design-debuff-removal.md 2.2 節） */
export type RemoveDebuffSource = { sourceSlotIndex: number; effect: ResolvedRemoveDebuff; fires: TriggerTracker };

/** スタック量の増減 1 つ（対象は自分。足す・減らす先は同じ定義の付与の状態の件の列。plan/design-skill-stage3.md 1.1・1.5 節） */
export type StackSource = {
  sourceSlotIndex: number;
  effect: ResolvedStackChange;
  stage: HeldStage;
  fires: TriggerTracker;
  track: HeldTrack;
};

/** カウンタの増減 1 つ（対象は自分。plan/design-skill-stage10.md 2.3 節）。{ ended } のトリガーは fires を持たない */
export type CounterSource = { sourceSlotIndex: number; effect: ResolvedCounterChange; fires: TriggerTracker | null };

/** 1 パス目のループが使う、持ち主ごとの件の一覧 */
export type HolderLists = {
  /** timed・状態・循環の間隔の変更のどれかがあるか（無ければ手順 3 の出来事は要らない） */
  readonly hasSources: boolean;
  /** ループの前（フレーム 0）に付く件（戦闘開始時・周期の atStart）を登録する */
  registerBattleStart(): void;
  /** 手順 3: フレーム ev.frame の出来事で件を登録する（回復と即時効果は呼ぶ側） */
  registerFrame(ev: FrameEvents): void;
  /** 枠 holder がフレーム frame に使う、射撃に効く stat の合計（常時の値に足す）。効いている件が無ければ null */
  firingBuffsAt(holder: number, frame: number, base: BuffTotals): BuffTotals | null;
  /** 射撃に効く件を持ちうるか */
  hasFiringTracks(holder: number): boolean;
  /** 枠 holder にフレーム frame に効いている持続の命中率▲▼の和（▲の側の和も。BuffTotals の hitRate・hitRateUp と同じ） */
  hitRateAt(holder: number, frame: number): HitRateN;
  /** 当たりの stat の件の列があるか */
  readonly hasHitTracks: boolean;
  /**
   * 枠 holder にフレーム frame に効いている、時間で変わる適正最小射程距離▲の和
   * （timed・状態の中身。常時の値は含まない。plan/design-agent-bunny.md 2.1 節）。条件 inEffectiveRange と、蓄積爆破の 1 パス目の発の値が読む
   */
  minEffectiveRangeAt(holder: number, frame: number): number;
  /**
   * 枠 holder にフレーム frame に効いている、時間で変わる会心率▲と
   * 通常攻撃のクリティカル確率▲の和（timed・状態の中身。常時の値は含まない。plan/design-new-chars-1029.md 5.7 節）。critHit の回数の量に使う
   */
  critUpAt(holder: number, frame: number): number;
  /**
   * 枠 holder にフレーム frame に効いている、ペレット数▲の和とペレットの数の固定の窓の数（timed。常時の値は無い）。
   * ペレットの命中の量とゲージが読む（skills/buffs.ts の pelletsPerShot。plan/design-dorothy-serendipity.md 2.1・2.2 節）
   */
  pelletsAt(holder: number, frame: number): Pick<BuffTotals, 'pelletCount' | 'singlePellet'>;
  /** ペレットの数の stat の件の列を持ちうるか */
  hasPelletTracks(holder: number): boolean;
  /**
   * 効果 e の発火の文脈に、フレーム frame の攻撃力の順位を足す（topAttack の効果だけ）。lowestHpRatio の効果には
   * HP の割合の並び（hpRank）を足す
   */
  rankContext(
    e: Parameters<typeof dependsOnRank>[0] & Parameters<typeof attackRankFor>[0] & { fixedTargets?: readonly number[] },
    sourceSlotIndex: number,
    context: FireContext,
    frame: number,
  ): FireContext;
  /** 回復の効果 effect がフレーム frame に枠 holder に付く。回復を起こすなら true（吸収回復の付き直しなら false） */
  applyHeal(effect: ResolvedInstantEffect, sourceSlotIndex: number, holder: number, frame: number): boolean;
  /** 枠 holder の、撃ち切りで終わる使用武器の変更（weaponId）の開いている件があるか（閉じる前に見る） */
  openWeaponChange(holder: number, weaponId: string, end: number): boolean;
  /** 枠 slotIndex の、段の循環 targetSkill に効く間隔の変更の件のうち、フレーム frame に効いているものの間隔 */
  cycleEveryAt(slotIndex: number, targetSkill: string, frame: number): number[];
  /**
   * 枠 slotIndex のスロット skill の射撃の回数のきっかけの、フレームごとの間隔（cycleEvery の shotCounts の窓の
   * 中ならその間隔、外なら undefined。窓の無い組は undefined）。窓の件はそのフレームに付いたものも見るので、手順 3 の後に呼ぶ
   */
  shotCountEveryOf(slotIndex: number, skill: SkillSlot): ShotCountEveryAt | undefined;
  /**
   * 枠 holder にフレーム frame に効いている、時間で変わるバーストゲージの
   * チャージ速度の和（timed・状態の中身。常時の値は含まない。plan/design-skill-stage1.md 1.6 節）。ゲージを足す手順 2 で呼べば f − 1 までに付いた件になる
   */
  gaugeSpeedAt(holder: number, frame: number): number;
  /** 時間で変わるバーストゲージのチャージ速度の件の列を持ちうるか */
  hasGaugeSpeedTracks(holder: number): boolean;
  /**
   * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.4 節）: 枠 holder にフレーム frame に効いている件（timed・while・状態の
   * 中身。状態だけの stat は除き、敵の件は効果の対象の味方に写す。区間の値の小片と同じ見え方）を、常時の値 base に足した合計。
   * frame より後のフレームに呼べば、frame までに付いた件になる
   */
  damageBuffsAt(holder: number, frame: number, base: BuffTotals): BuffTotals;
  /**
   * 枠 holder にフレーム frame に効いている、バーストスキルの
   * クールタイム▼ の秒の和（burstCooldown。timed・状態の中身。plan/design-skill-stage11.md 3.3 節）。発動したフレームに呼ぶ（frame/firstPass.ts）
   */
  burstCooldownAt(holder: number, frame: number): number;
  /**
   * 枠 holder の、バーストスキルのクールタイム▼ の件のうち、フレーム
   * frame に始まったものの秒の和（発動の後に付いた▼。frame/firstPass.ts が、走っている CT をその場で縮めるのに使う。plan/design-skill-stage15.md 2.2 節）
   */
  burstCooldownStartedAt(holder: number, frame: number): number;
  /** 同: バーストスキルのクールタイム▼ の件の列を持ちうるか */
  hasBurstCooldownTracks(holder: number): boolean;
  /**
   * 即時効果 effect の発火の条件（cooldownReduction の selfState）が、出どころの枠 sourceSlotIndex でフレーム frame
   * に満たされるか（plan/design-skill-stage12.md 2.6 節）。timed の段 1.5 の条件と同じ件を見る。
   * 満たさなければ条件で出なかった
   * 記録を残す。手順 3 の後に呼ぶ
   */
  instantConditionHolds(effect: ResolvedInstantEffect, sourceSlotIndex: number, frame: number): boolean;
  /**
   * 枠 slotIndex にその状態がフレーム frame に付いたか（{ applied } の付与で付いた記録は
   * 数えない。即時効果の { applied } の発火。registerFrame の後に呼ぶ。plan/design-mint-prika.md 2.6 節）
   */
  appliedAt(slotIndex: number, state: NamedStateId, frame: number): boolean;
  /**
   * 即時効果 effect がフレーム frame に発火したが効かなかった記録（不発）を残す。1 パス目が見る、件によらない理由（使った段階の条件
   * burstStep・戦闘中の発火の回数の上限 maxFires）で出なかった発火に使う（件の条件は instantConditionHolds が残す）
   */
  skipInstant(effect: ResolvedInstantEffect, sourceSlotIndex: number, frame: number): void;
  /**
   * 枠 slotIndex の現在の HP を、フレーム frame に割合 ratio だけ下げる（HP の割合に 1 − ratio を
   * 掛ける。plan/design-scarlet.md 2.1 節）。selfHpRatioAt は frame より後のフレームから読む。フレームの昇順に呼ぶ
   */
  lowerCurrentHp(slotIndex: number, frame: number, ratio: number): void;
  /**
   * V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 枠 holder が自分の状態 state（家族の根なら家族のどれか）をフレーム frame に
   * 持つか。frame/plan.ts の damage の selfState と同じく、静的な状態か、frame より前に付いて frame に続いている件を見る。1 パス目が
   * 周期の短縮（periodShorten）を追うのに、frame までに登録した件で呼ぶ
   */
  selfStateAt(holder: number, state: NamedStateId, frame: number): boolean;
  /**
   * 枠 holder の状態 state（出どころは問わない）の件が、フレーム frame に始まったか（stateStartedAt）・効いているか
   * （stateHeldAt。そのフレームに付いた件も入れる。plan/design-arcana-magician.md 2.1 節）。1 パス目が、
   * クールタイムを縮める状態の
   * 付いたフレームと窓を見るのに、frame までに登録した件で呼ぶ（stateStartedAt は毎フレーム呼ぶので配列を作らない）
   */
  stateStartedAt(holder: number, state: NamedStateId, frame: number): boolean;
  stateHeldAt(holder: number, state: NamedStateId, frame: number): boolean;
  /**
   * 状態の付いた時から数える周期（since）の発火（counterChange と同じ数え方。atStart なら付いたフレームにも。V-0729）。
   * 1 パス目が since の currentHpDown の発火に使う。返す関数は件の登録（registerFrame）の後に呼ぶ
   */
  sinceFires(trigger: TimerTrigger, slotIndex: number): TriggerTracker;
  /**
   * 枠 holder の自分の状態 state の件（段によらない）が、フレーム frame に外れたか（{ ended } の発火。
   * counterChange と同じ。plan/design-grave.md 2.1 節）。1 パス目が { ended } の ammoDecrease の発火に、件の登録（registerFrame）の後に呼ぶ
   */
  endedAt(holder: number, state: NamedStateId, frame: number): boolean;
  /**
   * 枠 holder の自分の状態 state のスタック数（selfStateAt と同じ件の段の最大。
   * 静的な状態は 1、無ければ 0。plan/design-skill-stage14.md 2.5 節）。frame/plan.ts の damage の perCount { state }
   * と同じ見え方で、1 パス目がオートファイアの順番の攻撃の
   * ヒットごとのゲージ（gaugePerHit）を予約するのに、frame までに登録した件で呼ぶ
   */
  selfStackCountAt(holder: number, state: NamedStateId, frame: number): number;
  /**
   * エレグの S1（C-0773）: 敵が状態 state をフレーム frame に持つか（条件 enemyState と同じ見え方。そのフレームに付いた件も入れる）。
   * 1 パス目が、条件 enemyState の付いた射撃の回数の倍率ダメージのヒットごとのゲージ（gaugePerHit）を予約するのに、frame までに登録した件で呼ぶ
   */
  enemyStateAt(state: NamedStateId, frame: number): boolean;
  /**
   * フレーム frame にフルスタックになった状態（定義にその状態のフルスタックの消費の
   * きっかけを持つ枠の、自分の状態だけ）を返し、その状態の件を消費する（次のフレームで切る。
   * plan/design-skill-stage3.md 1.3 節）。回復を当てる前（手順 3 の最初）に呼ぶ
   */
  consumeFullStacks(frame: number): FullStackEvent[];
  /** ループの後の、leadFrames のある付与が発火した発のフレーム（HolderListsOptions.leadShots に渡す形） */
  leadShots(): LeadShots;
  /** ループの後の履歴 */
  history(): HolderHistory;
};
