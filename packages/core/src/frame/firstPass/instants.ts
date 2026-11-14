// 1 パス目（../firstPass.ts の runFirstPassOnce）の即時効果（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// 即時効果の出どころ（createInstantSources）と、フレームごとにゲージのチャージ・ほかの即時効果を当てる手順（createInstants）。
import { gameSecondsToFrames } from '../../time.ts';
import { extendCooldown, reduceCooldown, reserveFullBurstExtension } from '../../burst/controller.ts';
import { type BurstScheduleModel } from '../../burst/schedule.ts';
import {
  isResolvedShotCount,
  isResolvedApplied,
  isResolvedFullStack,
  isResolvedTimer,
  isResolvedWeaponChangeEnd,
  resolveCoverHeals,
  resolveInstant,
  type ResolvedCoverHeal,
  type ResolvedInstantEffect,
  type ResolvedTrigger,
} from '../../skills/resolve.ts';
import { isEffectTarget, type FireContext } from '../../skills/targets.ts';
import { triggerFrames, type TimelineSlot } from '../../skills/timeline.ts';
import {
  burstStepHolds,
  createTriggerTracker,
  fireContextOf,
  type FrameEvents,
  type TriggerTracker,
} from '../../skills/triggers.ts';
import { isEndedTrigger } from '../../skills/types.ts';
import { clampAmmoToMax, refillAmmo, drainAmmo, resumeAfterLastShotRefill } from '../shooter.ts';
import type { FirstPassBase } from './base.ts';
import type { HolderLists } from '../../skills/holders.ts';
import type { ShooterStates } from './shooters.ts';
import type { BurstScheduleLayer, BurstStep } from './burst.ts';
import { WEAPON_CHANGE_END_DELAY } from './shotLogs.ts';

type InstantSource = {
  sourceSlotIndex: number;
  effect: ResolvedInstantEffect;
  fires: TriggerTracker;
};

/**
 * 弾丸チャージの端数（C-0558）。トーブの代用弾丸（最大装弾数 × 5.31%）が、最大装弾数 60〜64 で 3 発、66 で 4 発入る（録画 0467・0468）。
 * 録画 0019 のノワール（14 × 39.88% = 5.58）は満タンに近く、切り捨て・四捨五入のどちらでも 14 になった
 */
export const AMMO_REFILL_ROUNDING: 'floor' | 'round' = 'round';

function refillRounds(maxAmmo: number, ratio: number): number {
  const raw = maxAmmo * ratio;
  return AMMO_REFILL_ROUNDING === 'floor' ? Math.floor(raw + 1e-9) : Math.round(raw);
}

/** 即時効果の出どころ（回復・遮蔽物 HP 回復・ゲージのチャージ・発動の延長・ほか）と発火の追跡を作る。件の一覧はこの後に作るので、発火の時に late から読む */
export function createInstantSources({
  frames,
  scheduleModel,
  slots,
  listsOf,
}: {
  slots: readonly TimelineSlot[];
  frames: number;
  scheduleModel: BurstScheduleModel | null;
  /** 件の一覧（出どころの後に作るので、発火の時に読む） */
  listsOf: () => Pick<HolderLists, 'appliedAt' | 'endedAt' | 'sinceFires'>;
}) {
  const instant: InstantSource[] = [];
  /** 発火の文脈 context のとき、効果 e が掛かる枠（burstUsers は発火ごとに変わる） */
  const targetsAt = (e: Parameters<typeof isEffectTarget>[0], sourceSlotIndex: number, context: FireContext) =>
    slots.flatMap((t, i) => (t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character, context) ? [i] : []));
  // F5（plan/design-heal-vocabulary.md 3.3 節）: 時間の周期のトリガー（heal だけ書ける）は出来事の列に無いので、
  // 周期のフレーム（atStart ならフレーム 0 も。skills/timeline.ts の triggerFires）で発火する
  // 状態の付いた時から数える周期（since。currentHpDown。plan/design-hp-down-interval.md 2.1 節）は、件の一覧の sinceFires
  // （counterChange と同じ数え方）で決める
  const instantTracker = (effect: { trigger: ResolvedTrigger }, sourceSlotIndex: number): TriggerTracker => {
    // 「〈状態〉が適用された時」は、件の一覧がそのフレームに付けた記録で見る（件を
    // 登録した後に読む。即時効果のループは lists.registerFrame の後。plan/design-mint-prika.md 2.6 節）
    if (isResolvedApplied(effect.trigger)) {
      const state = effect.trigger.applied;
      return (ev) => listsOf().appliedAt(sourceSlotIndex, state, ev.frame);
    }
    // 「〈状態〉が終了した時」（ammoDecrease）は件の一覧の endedAt で決める（plan/design-grave.md 2.1 節）
    const trigger = effect.trigger;
    if (isEndedTrigger(trigger)) return (ev) => listsOf().endedAt(sourceSlotIndex, trigger.ended, ev.frame);
    if (!isResolvedTimer(effect.trigger)) return createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel);
    // 件の一覧（lists）は即時効果の後に作るので、最初の呼び出しで作る
    if (effect.trigger.since !== undefined) {
      const trigger = effect.trigger;
      let fires: TriggerTracker | undefined;
      return (ev) => (fires ??= listsOf().sinceFires(trigger, sourceSlotIndex))(ev);
    }
    const at = new Set(triggerFrames(effect.trigger, null, sourceSlotIndex, frames));
    return (ev) => at.has(ev.frame);
  };
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      instant.push({
        sourceSlotIndex,
        effect,
        fires: instantTracker(effect, sourceSlotIndex),
      });
    }
  });
  // 遮蔽物 HP 回復（plan/design-skill-stage17.md 2.1 節）。受けた枠に coverHealed の出来事を、回復と同じフレームの
  // 規則（healFrameOf）で立てる。回復量は計算に効かないので、件も記録も作らない
  // 対象の枠は編成だけで決まるので、始めに 1 回求めておく
  const coverHeals: {
    sourceSlotIndex: number;
    effect: ResolvedCoverHeal;
    fires: TriggerTracker;
    targets: readonly number[];
  }[] = [];
  // 遮蔽物 HP が最も低い味方 N 機は、編成が N 体以下なら全員、N 体より多ければ
  // 選び方を確かめていないので誰も選ばない（未実装。plan/design-skill-stage17.md 2.1 節の論点 3）
  const present = slots.flatMap((s, i) => (s === null ? [] : [i]));
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCoverHeals(slot.definition, slot.character, slot.levels)) {
      const targets =
        effect.target === 'lowestCoverHp'
          ? present.length <= effect.targetCount!
            ? present
            : []
          : targetsAt({ ...effect, target: effect.target }, sourceSlotIndex, null);
      coverHeals.push({ sourceSlotIndex, effect, fires: instantTracker(effect, sourceSlotIndex), targets });
    }
  });
  // 回復は healed の出来事を作るので先に当てる（heal のトリガーに healed は書けないので順番で閉じる。plan/design-stage11.md 3.3 節）
  // V-0024: 維持時間のある heal は、件の付いている対象への付き直しでは healed を起こさない（件の一覧の吸収回復の件。applyHeal）
  const heals = instant.filter((src) => src.effect.kind === 'heal');
  // V-0034: 射撃の回数トリガーのバーストゲージのチャージは、発と同じフレームのゲージに足す（手順 2 の前。下のループ）
  const isShotGaugeCharge = (src: InstantSource): boolean =>
    src.effect.kind === 'burstGauge' && isResolvedShotCount(src.effect.trigger);
  const shotGaugeCharges = instant.filter(isShotGaugeCharge);
  // バースト使用時のフルバーストタイムの延長（D）は、状態機械が発動の時に聞く
  // （extensionAtActivation。件の一覧が窓の終わりを読む前に足す。plan/design-skill-stage21.md 2.1 節）ので、下の即時効果のループでは扱わない
  const isActivationExtension = (src: InstantSource): boolean =>
    src.effect.kind === 'fullBurstExtend' && src.effect.trigger === 'burstUse';
  const activationExtensions = instant.filter(isActivationExtension);
  const otherInstants = instant.filter(
    (src) => src.effect.kind !== 'heal' && !isShotGaugeCharge(src) && !isActivationExtension(src),
  );
  return { activationExtensions, coverHeals, heals, instant, otherInstants, shotGaugeCharges, targetsAt };
}

export type InstantSources = ReturnType<typeof createInstantSources>;

/** フレームごとにゲージのチャージとほかの即時効果を当てる手順を作る */
export function createInstants({
  controller,
  frames,
  instants,
  lists,
  logs,
  model,
  otherInstants,
  paramsAt,
  reserveExtension,
  shooters,
  shotEvents,
  shotGaugeCharges,
  slots,
  targetsAt,
  weaponChangeEndOffset,
}: FirstPassBase & InstantSources & ShooterStates & BurstScheduleLayer & BurstStep) {
  // 戦闘中の発火の回数に上限（maxFires）のある即時効果の、効いた発火の回数（plan/design-red-hood.md 2.3 節）
  const instantFireCounts = new Map<object, number>();
  /** 次のフレーム以降にゲージへ足すチャージ（射撃の回数トリガーでない burstGauge）。フレーム → 効果 */
  const pendingGaugeCharges = new Map<number, { sourceSlotIndex: number; effect: ResolvedInstantEffect }[]>();
  /** バーストゲージのチャージを足す */
  const addGaugeCharges = (gauge: number, f: number): number => {
    // バーストゲージのチャージ（最大値 × X%）。射撃の回数トリガーはこのフレームの射撃で発火し、このフレームのゲージに足す
    // （V-0034: バーは発のフレームで 1 回に跳ぶ）。ほかのトリガーは前のフレームまでに発火したものを足す
    const charges = pendingGaugeCharges.get(f) ?? [];
    pendingGaugeCharges.delete(f);
    if (shotGaugeCharges.length > 0) {
      // 射撃の回数トリガーの判定（skills/triggers.ts）は射撃だけを見る。手順 3 の出来事はまだ無いので空で渡す
      const ev: FrameEvents = {
        frame: f,
        shots: shotEvents,
        activations: [],
        burstEffects: [],
        fullBurstStart: false,
        fullBurstEnd: false,
        gaugeFull: false,
        fullBurstStartUsers: [],
        fullBurstEndUsers: [],
        healed: [],
      };
      for (const src of shotGaugeCharges) {
        if (src.fires(ev) && controller !== null) charges.push(src);
      }
    }
    if (charges.length > 0 && controller !== null) {
      for (const c of charges) {
        gauge += c.effect.value * controller.timing.gaugeMax;
        instants.push({
          frame: f,
          sourceSlotIndex: c.sourceSlotIndex,
          slotIndex: c.sourceSlotIndex,
          effect: c.effect,
          amount: c.effect.value,
        });
      }
    }
    return gauge;
  };
  /** 件の登録の後に、ほかの即時効果を当てる */
  const applyInstants = (ev: FrameEvents, f: number): void => {
    for (const src of otherInstants) {
      if (!src.fires(ev)) continue;
      // 発火の条件（いまは cooldownReduction の selfState だけ。plan/design-skill-stage12.md 2.6 節）
      if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, f)) continue;
      // 使った段階（発火の文脈）と、戦闘中の発火の回数の上限（plan/design-red-hood.md 2.1・2.3 節）。どちらで出なかった
      // 発火も、件の条件と同じく不発に数える（timed の burstStep は件の一覧の fireContextHolds が数える。上限の後の発火は「条件を
      // 満たさない発火と同じ」。2.3 節）
      if (!burstStepHolds(src.effect.condition, ev, src.sourceSlotIndex)) {
        lists.skipInstant(src.effect, src.sourceSlotIndex, f);
        continue;
      }
      if (src.effect.maxFires !== undefined) {
        const fired = instantFireCounts.get(src) ?? 0;
        if (fired >= src.effect.maxFires) {
          lists.skipInstant(src.effect, src.sourceSlotIndex, f);
          continue;
        }
        instantFireCounts.set(src, fired + 1);
      }
      // 射撃の回数トリガーでないバーストゲージのチャージは、対象によらず 1 回だけ、次のフレームのゲージに足す
      if (src.effect.kind === 'burstGauge') {
        if (controller === null || f + 1 >= frames) continue; // 固定サイクル・バーストなしではゲージを見ない
        const list = pendingGaugeCharges.get(f + 1) ?? [];
        list.push({ sourceSlotIndex: src.sourceSlotIndex, effect: src.effect });
        pendingGaugeCharges.set(f + 1, list);
        continue;
      }
      // 窓の外で発火したフルバーストタイムの延長（バースト 3 段階突入時）は、対象によらず 1 回だけ、次に作る窓に予約する
      if (src.effect.kind === 'fullBurstExtend') {
        if (controller === null) continue; // 固定サイクル・バーストなしでは窓を延ばさない
        reserveFullBurstExtension(controller, src.effect.value);
        reserveExtension({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: src.sourceSlotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
        continue;
      }
      // 現在の HP▼ は自分の HP の割合を下げるだけ（次のフレームから読む。plan/design-scarlet.md 2.1 節）
      if (src.effect.kind === 'currentHpDown') {
        lists.lowerCurrentHp(src.sourceSlotIndex, f, src.effect.value);
        instants.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: src.sourceSlotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
        continue;
      }
      const context = lists.rankContext(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
        if (src.effect.kind === 'cooldownReduction') {
          if (controller === null) continue; // 固定サイクル・バーストなしでは CT を見ない
          const before = controller.cooldownReductions.length;
          // CT▲は走っている CT の残りに足す（記録の applied は負。plan/design-mint-prika.md 2.6 節）
          const change = src.effect.increase === true ? extendCooldown : reduceCooldown;
          change(controller, target, gameSecondsToFrames(src.effect.value), f, src.sourceSlotIndex);
          const applied = controller.cooldownReductions[before]?.applied ?? 0;
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: applied,
          });
          continue;
        }
        const state = shooters[target];
        const slot = slots[target];
        if (!state || !slot) continue;
        // 残弾数減少は基礎の武器の残弾から残弾 × X% を減らす（端数は切り上げ。plan/design-skill-stage11.md 2.2 節）
        if (src.effect.kind === 'ammoDecrease') {
          const params = paramsAt(target, f);
          const before = state.ammo;
          const wasReloading = state.phase === 'reloading';
          // 使用武器の変更の撃ち切りで起きる残弾数減少は、最後の発の次のフレーム（ShotLog.weaponChangeEnds）に来るが、ゲームの
          // リロードは変更後の武器の最後の発の本当の発の時刻（発射レートの蓄積の上の時刻。見える最終弾は 0〜1f 遅れることがある）から
          // 始まる（V-0695 のラプラス）。始まりを最後の発のフレームに戻し、その発の蓄積の余りのぶん前にする
          drainAmmo(
            state,
            Math.ceil(state.ammo * src.effect.value - 1e-9),
            params.weapon?.shot ?? slot.character.shot,
            model,
            params,
            isResolvedWeaponChangeEnd(src.effect.trigger)
              ? weaponChangeEndOffset[target]! - WEAPON_CHANGE_END_DELAY
              : 0,
          );
          // 減少でリロードを始めたら、その前の最後の発を記録に書く（照合のリロードの回。V-0735）
          const lastFired = logs[target]?.frames.at(-1);
          if (!wasReloading && state.phase === 'reloading' && lastFired !== undefined)
            (logs[target]!.drainReloadShotFrames ??= []).push(lastFired);
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: state.ammo - before,
          });
          continue;
        }
        // 射撃の回数のきっかけの弾丸チャージは、同じ発のきっかけで付く件（f + 1 から。`{ applied }` の
        // 付与で付く応急改造を含む。C-0561。仮説）を入れた最大装弾数で数える。フルスタックの消費のきっかけの弾丸チャージは、
        // 外したスタック（f + 1 で閉じる）を除いた最大装弾数で数え、残弾もそこで止める（「スタック解除後」。plan/design-diesel.md
        // 2.1 節）。残弾に足すのは発のフレーム f のまま
        const fullStack = isResolvedFullStack(src.effect.trigger);
        const params = paramsAt(target, fullStack || isResolvedShotCount(src.effect.trigger) ? f + 1 : f);
        // 外した後の最大装弾数を超える残弾は、次のフレームの射手と同じくここで削る（記録の量を弾丸チャージの分だけにする）
        if (fullStack) clampAmmoToMax(state, params);
        const before = state.ammo;
        // 発数の弾丸チャージ（scaling 'flat'）は値をそのまま足す
        const rounds =
          src.effect.scaling === 'flat' ? src.effect.value : refillRounds(params.maxAmmo, src.effect.value);
        refillAmmo(state, rounds, slot.character.shot, model, params);
        // V-0163: このフレームの最後の弾丸と同じ発の弾丸チャージは、リロードを取り消して撃ち続ける（その発は最後の弾丸に数えない）
        const fired = shotEvents[target];
        if (fired?.lastShot === true && resumeAfterLastShotRefill(state, slot.character.shot, model, params)) {
          fired.lastShot = false;
          const log = logs[target]!;
          if (log.lastShotFrames![log.lastShotFrames!.length - 1] === f) log.lastShotFrames!.pop();
        }
        instants.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: target,
          effect: src.effect,
          amount: state.ammo - before,
        });
      }
    }
  };
  return { addGaugeCharges, applyInstants };
}

export type Instants = ReturnType<typeof createInstants>;
