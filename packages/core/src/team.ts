// Stage 3〜: 編成の入力（枠・条件・スキル）と結果の型、入力の検証。calc（calc/model.ts）と sim（sim/engine.ts）で共通。
// Stage 16（plan/design-stage16.md 2 節）: 1 パス目は frame/plan.ts、calc モデルは calc/model.ts に分けた。
import type { BurstSchedule, BurstScheduleModel, BurstSummary } from './burst/schedule.ts';
import type { CadenceResult } from './cadence.ts';
import {
  baseAttackOf,
  hitRateOf,
  type EnemyEvent,
  type EnemyInput,
  type ModelNote,
  type TriggerCondition,
  type TriggerDamage,
} from './damage.ts';
import type { BuildEffect } from './buildEffects.ts';
import type { InstantApplication } from './frame/firstPass.ts';
import type { BuffTotals } from './skills/buffs.ts';
import type { BurstHitResult, ResolvedDamageEffect, SkillHitResult } from './skills/burstDamage.ts';
import type { CycleWindow } from './skills/cycles.ts';
import { MAX_SKILL_LEVELS, type AppliedEffect, type AppliedTimedEffect, type SkillLevels } from './skills/resolve.ts';
import {
  resolvePassiveStates,
  type BuffTimeline,
  type BuffWindow,
  type ConditionSkip,
  type TimelineSlot,
} from './skills/timeline.ts';
import { treasureSlots, type TreasurePhase } from './skills/treasure.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillSlot, type SkillSupport } from './skills/types.ts';
import type { GrowthInput } from './stats.ts';
import type { CharacterData } from './types.ts';
import type { WeaponModel } from './weapons.ts';

export const TEAM_SIZE = 5;

/** 枠ごとの条件。戦闘時間とフルバースト区間の別は編成側で決めるので含まない */
export type SlotCondition = Omit<TriggerCondition, 'fullBurst'>;

export type TeamSlotSkills = {
  /** null = 定義ファイルなし（未定義）。自分のスキルは発動しないが、味方からの allies 効果は受ける */
  definition: SkillDefinition | null;
  levels: SkillLevels;
  /**
   * Stage 9: 宝物の段階（0..3）。省略 0 = 宝物なし。character.treasure が null なら 0 だけ許す。
   * スペック固定でも上書きしない（所持状況がそのまま反映される）
   */
  treasurePhase?: TreasurePhase;
};

export type TeamSlotInput = {
  character: CharacterData;
  growth: GrowthInput;
  condition: SlotCondition;
  /** 戦闘中の攻撃力（バフ前）を直接指定する（射撃場スペック固定など）。指定時は growth からの算出をしない */
  attackOverride?: number;
  /** 省略は { definition: null, levels: 全部 10 } と同じ（自分のスキルなし、味方の効果は受ける） */
  skills?: TeamSlotSkills;
  /**
   * Stage 13: 育成入力の効果層（OL・キューブ・コレクション。resolveBuildEffects の effects）。自分だけの常時バフ。
   * 省略は無し。マスタは呼び出し側が引く（attackOverride と同じ）
   */
  buildEffects?: readonly BuildEffect[];
};

export type TeamInput = {
  /** 長さ 1..TEAM_SIZE。null は空枠 */
  slots: (TeamSlotInput | null)[];
  enemy: EnemyInput;
  durationSeconds: number;
  model?: WeaponModel;
  /** バーストを回すか。省略 false = Stage 4 と同一（バーストなし・フルバーストなし） */
  burst?: boolean;
  /**
   * burst が true のときの時刻表の作り方。省略 'dynamic'（ゲージ蓄積・CT・チェーン。Stage 7）。
   * 'fixed' は Stage 5 / 6 の固定 20 秒サイクル（比較・退化テスト用。UI には出さない）
   */
  burstModel?: BurstScheduleModel;
  /**
   * 操作キャラの枠（Stage 7）。チャージ武器のフルチャージ倍率がゲージに乗るのは操作キャラだけ（AI の SR は倍率なし）。
   * 省略・null は全員 AI 扱い。ダメージには影響しない（ゲージと時刻表だけ）
   */
  controlledSlot?: number | null;
};

export type { AppliedEffect, AppliedTimedEffect };

/** 1 つのバフ状態でいた区間の結果。calc はグループ単位、sim は区間単位で埋める */
export type SlotSegmentResult = {
  /** 含まれる区間 [start, end) の列（フレーム）。グループは離れた複数区間を含みうる */
  ranges: { start: number; end: number }[];
  seconds: number;
  fullBurst: boolean;
  buffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  timedEffects: AppliedTimedEffect[];
  trigger: TriggerDamage;
  /** calc: triggersPerSecond × seconds（小数）か射撃の列の発数（triggerSource）/ sim: 実際に撃った数（整数） */
  triggers: number;
  /**
   * Stage 10: トリガー数の出どころ。'average' = 平均レート × 秒数（常時分の射撃バフは平均レートに畳み込む）、
   * 'shots' = 持続の射撃バフ（最大装弾数・リロード速度・チャージ速度の timed）が掛かっているので、射撃の列の発数を数えた
   */
  triggerSource: 'average' | 'shots';
  damage: number;
};

export type SlotBurstResult = {
  /** 発動ごとの内訳（時刻は秒）。定義がない・unsupported・倍率ダメージなしなら空 */
  activations: { seconds: number; hit: BurstHitResult }[];
  /** 1 回目の内訳（UI の代表値）。定義がない・unsupported・倍率ダメージなしなら null */
  hit: BurstHitResult | null;
  totalDamage: number;
};

export type SlotSkillHitsResult = {
  /** 発生順。時刻は秒 */
  activations: { seconds: number; effect: ResolvedDamageEffect; hit: SkillHitResult }[];
  totalDamage: number;
};

export type TeamSlotResult = {
  /** slots 内の位置 */
  index: number;
  character: CharacterData;
  /** バフ前の攻撃力（素、またはスペック固定値）。区間に依らない */
  baseAttack: number;
  /** 発射サイクル（平均レート）。Stage 10: 常時分の射撃バフを畳み込んだもの（持続分は含まない。表示用） */
  cadence: CadenceResult;
  notes: ModelNote[];
  /** 常時パッシブだけのバフ合計（Stage 4 互換の表示用） */
  passiveBuffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  /** Stage 13: 育成入力の効果層（OL・キューブ・コレクション）。passiveBuffs に含まれている */
  buildEffects: readonly BuildEffect[];
  /** この枠に掛かった持続バフの窓（発生順） */
  windows: BuffWindow[];
  /** Stage 11 モダニア: この枠に掛かった状態だけの stat（命中率）の窓（区間には入らない。表示用） */
  stateWindows: BuffWindow[];
  /** Stage 11 モダニア: この枠の条件付きの効果が、条件を満たさずに発火しなかった記録 */
  conditionSkips: ConditionSkip[];
  /** Stage 11 紅蓮BS: この枠の循環の間隔の変更（cycleEvery）の窓（区間には入らない。表示用） */
  cycleWindows: CycleWindow[];
  /** バフ状態ごとにまとめた通常攻撃の結果（groupTimeline の順） */
  segments: SlotSegmentResult[];
  /** Σ segments.damage */
  normalDamage: number;
  burst: SlotBurstResult;
  /** Stage 8: トリガー付きの倍率ダメージ（damage）。発動ごとの内訳と合計。sim と同じ発動列 */
  skillHits: SlotSkillHitsResult;
  /** Stage 10: この枠が受けた即時効果（CT 短縮・弾丸チャージ）。発生順 */
  instants: InstantApplication[];
  /** normalDamage + burst.totalDamage + skillHits.totalDamage */
  totalDamage: number;
  /** totalDamage / durationSeconds（0 秒なら 0） */
  dps: number;
  /** 編成の総ダメージに対する寄与率 0..1（合計 0 のときは 0） */
  share: number;
  /** null = 定義ファイルなし（未定義） */
  skillSupport: Record<SkillSlot, SkillSupport> | null;
  /** Stage 9: 入力の宝物の段階（省略は 0） */
  treasurePhase: TreasurePhase;
  /** Stage 9: 宝物版で計算したスロット（unlockOrder の先頭 treasurePhase 個）。character はこれらを差し替え済み */
  treasureSlots: SkillSlot[];
};

export type TeamResult = {
  slots: (TeamSlotResult | null)[];
  filledCount: number;
  totalDps: number;
  totalDamage: number;
  /** burst なしなら null */
  schedule: BurstSchedule | null;
  /** 時刻表の集計（フルバースト回数・稼働率・平均サイクル）。burst なしなら null */
  burstSummary: BurstSummary | null;
  timeline: BuffTimeline;
  /** Stage 16-B: 敵の出来事（入力のまま）と、その注記（未実装の種類・近似）。出来事が無ければどちらも空 */
  enemyEvents: EnemyEvent[];
  enemyNotes: ModelNote[];
  /** Stage 16-B: 1 秒ごとのダメージ（編成の合計と枠ごと。sim だけ。calc は null） */
  damagePerSecond: DamagePerSecond | null;
};

/** Stage 16-B: 1 秒ごとのダメージ。添字 k は [k, k + 1) 秒（最後の 1 つは戦闘時間で切れた端数を含む） */
export type DamagePerSecond = { total: number[]; slots: (number[] | null)[] };

/** 操作キャラの枠が編成の範囲内の埋まった枠か検証する。sim と calc で共通 */
export function validateControlledSlot(
  slots: readonly (TeamSlotInput | null)[],
  controlledSlot: number | null | undefined,
): void {
  if (controlledSlot === null || controlledSlot === undefined) return;
  if (!Number.isInteger(controlledSlot) || controlledSlot < 0 || controlledSlot >= slots.length) {
    throw new RangeError(`controlledSlot must be a slot index, got ${controlledSlot}`);
  }
}

/** 枠数と重複を検証する。sim と calc で共通 */
export function validateTeamSlots(slots: readonly (TeamSlotInput | null)[]): void {
  if (slots.length < 1 || slots.length > TEAM_SIZE) {
    throw new RangeError(`slots must have 1..${TEAM_SIZE} entries, got ${slots.length}`);
  }
  const seen = new Set<number>();
  for (const slot of slots) {
    if (slot === null) continue;
    const id = slot.character.resourceId;
    if (seen.has(id)) throw new RangeError(`character ${id} appears in more than one slot`);
    seen.add(id);
  }
}

/** TeamSlotInput を timeline.ts の入力に落とす（sim と calc で共通） */
export function toTimelineSlots(slots: readonly (TeamSlotInput | null)[]): TimelineSlot[] {
  return slots.map((slot) =>
    slot === null
      ? null
      : {
          character: slot.character,
          definition: slot.skills?.definition ?? null,
          levels: slot.skills?.levels ?? MAX_SKILL_LEVELS,
          // 循環参照を避けるため、発動者自身のバフは乗せない値（バフ前攻撃力）を使う
          casterBaseAttack: baseAttackOf(slot),
          buildEffects: slot.buildEffects,
          hitRate: hitRateOf(slot.condition),
        },
  );
}

export type SlotBuffs = { buffs: BuffTotals; appliedEffects: AppliedEffect[] };

/**
 * 常時発動パッシブを枠間で配り、枠ごとの BuffTotals を作る（Stage 4 の API。持続バフは含まない）。
 * 中身は skills/timeline.ts の resolvePassiveStates に移した。
 */
export function resolveTeamBuffs(slots: readonly (TeamSlotInput | null)[]): (SlotBuffs | null)[] {
  return resolvePassiveStates(toTimelineSlots(slots)).map((state) =>
    state === null ? null : { buffs: state.buffs, appliedEffects: state.passiveEffects },
  );
}

/** Stage 9: 結果に添える宝物の段階。適用前の入力（元のキャラデータ）から取る */
export function treasureOf(slot: TeamSlotInput | null): { treasurePhase: TreasurePhase; treasureSlots: SkillSlot[] } {
  const treasurePhase = slot?.skills?.treasurePhase ?? 0;
  return { treasurePhase, treasureSlots: slot === null ? [] : treasureSlots(slot.character, treasurePhase) };
}

/** 結果に添えるスキルの対応状況。定義が無ければ null */
export function skillSupportOf(slot: TeamSlotInput): Record<SkillSlot, SkillSupport> | null {
  const definition = slot.skills?.definition;
  if (!definition) return null;
  const support = {} as Record<SkillSlot, SkillSupport>;
  for (const s of SKILL_SLOTS) support[s] = definition.skills[s].support;
  return support;
}
