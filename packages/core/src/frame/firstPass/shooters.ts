// 1 パス目（../firstPass.ts の runFirstPassOnce）の射手（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// 射手の実効値と状態（createShooterStates）と、フレームごとに枠の射手を進めて発を記録する手順（createShooters）。
import { stunSlot } from '../../burst/controller.ts';
import { partialGaugeRatio } from '../../burst/dynamic.ts';
import { effectFrameOf, hexagonFrameOf } from '../../burst/schedule.ts';
import { capCritRate, ZERO_BUFFS } from '../../skills/buffs.ts';
import { isChargeWeapon } from '../../weapons.ts';
import { firingParams, isZeroFiring, type FiringParams } from '../firing.ts';
import {
  beginHide,
  hideShooter,
  initialShooter,
  resumeShooter,
  chargeProgressFrames,
  stepShooter,
  stepHide,
  reaimShooter,
  unhideShooter,
  weaponChangeShooter,
  weaponFreeFrameAtSwap,
  type ShooterState,
} from '../shooter.ts';
import { flightFramesAt } from '../landing.ts';
import type { SkillSlot } from '../../types.ts';
import { reloadStartOffset } from '../../cadence.ts';
import type { FrameRange } from '../../skills/timeline.ts';
import type { HoldFire } from '../../team.ts';
import { unionRanges } from '../events.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import type { GaugeEffects } from './gaugeEffects.ts';
import type { ShotLogs } from './shotLogs.ts';
import type { BurstScheduleLayer } from './burst.ts';
import type { ShotPauses } from './shotPauses.ts';

/**
 * V-0605: 枠の撃たない区間。untargetable は区間の始まりが狙えない窓の始まりか（そのときだけ窓の始まりの D を待ち、部分チャージの発を撃つ。
 * holdFire の区間は待たずにハイドする。plan/design-hide-reload-detect.md 案 A）
 */
type SlotBlock = FrameRange & { untargetable: boolean };

/**
 * V-0605: 枠ごとの撃たない区間。狙えない窓に枠の holdFire を合わせて 1 つにする（同じフレームに始まれば狙えない窓の側）。
 * holdFire の無い枠は、狙えない窓の列を共有する
 */
function slotBlockRanges(
  slotCount: number,
  untargetable: readonly FrameRange[],
  holdFire: readonly HoldFire[] | undefined,
): (readonly SlotBlock[])[] {
  const shared: SlotBlock[] = untargetable.map((r) => ({ start: r.start, end: r.end, untargetable: true }));
  return Array.from({ length: slotCount }, (_, i) => {
    const holds = (holdFire ?? []).filter((h) => h.slotIndex === i).flatMap((h) => h.ranges);
    if (holds.length === 0) return shared;
    const all = [...shared, ...holds.map((r) => ({ start: r.start, end: r.end, untargetable: false }))];
    return unionRanges(all.sort((a, b) => a.start - b.start || Number(b.untargetable) - Number(a.untargetable)));
  });
}

/** 撃ち切りで終わる使用武器の変更を、最後の発から何フレーム後に終えるか（ShotLog.weaponChangeEnds） */
export const WEAPON_CHANGE_END_DELAY = 1;

/** 射手の実効値と、射手の状態（基礎の武器・使用武器の変更）を作る */
export function createShooterStates({ lists, model, passive, slots }: FirstPassBase) {
  // ---- 射手 ----
  const passiveFiring = passive.map((s) => s?.buffs ?? ZERO_BUFFS);
  const baseParams = slots.map((slot, i) =>
    slot === null ? null : firingParams(slot.character.shot, passiveFiring[i]!),
  );
  /**
   * 枠 i がフレーム f に使う実効値（件の一覧のうち、射撃に効く stat の件で start ≤ f < end のもの）。
   * 手順 1 で呼ぶときは f の件はまだ登録されていないので「f − 1 までに登録済み」になり、
   * 手順 3 の弾丸チャージで呼ぶときは f に付いた最大装弾数▲も含む（射撃の回数のきっかけの弾丸チャージは f + 1 で呼ぶ。C-0561）
   */
  const paramsAt = (i: number, f: number): FiringParams => {
    const base = baseParams[i]!;
    const buffs = lists.firingBuffsAt(i, f, passiveFiring[i]!);
    if (buffs === null || isZeroFiring(buffs)) return base;
    return firingParams(slots[i]!.character.shot, buffs);
  };
  const shooters: (ShooterState | null)[] = slots.map((slot, i) =>
    slot === null ? null : initialShooter(slot.character.shot, model, paramsAt(i, 0)),
  );
  /**
   * 撃ち切りで終わった使用武器の変更の、最後の発の本当の発の時刻の、そのフレームからのずれ（変更後の武器の発射レートの蓄積の余りから。
   * 撃ち切りの残弾数減少のリロードの始まりに使う。plan/design-reload-rounding.md 案 F）
   */
  const weaponChangeEndOffset: number[] = slots.map(() => 0);
  return { paramsAt, passiveFiring, shooters, weaponChangeEndOffset };
}

export type ShooterStates = ReturnType<typeof createShooterStates>;

/** 枠ごとの射手を進める手順と、使用武器の変更の補助・発の番号・枠の撃たない区間を作る */
export function createShooters({
  activationsOf,
  appliedPauses,
  burstPauseAim,
  chargeGaugeOf,
  chargeWatches,
  controlledSlot,
  controller,
  energyAt,
  gaugeHitsOf,
  hitsAt,
  landingGauge,
  lists,
  logs,
  model,
  obstacleEnergyAt,
  obstacles,
  options,
  paramsAt,
  passiveFiring,
  pauseLeft,
  pelletsAt,
  shooters,
  shotEvents,
  shotFlightAt,
  slots,
  untargetable,
  watchCharge,
  weaponChangeEndOffset,
  writesReloadEnds,
}: FirstPassBase & Gauge & GaugeEffects & ShotLogs & ShooterStates & BurstScheduleLayer & ShotPauses) {
  /** 使用武器の変更中の射手の状態と、その武器の識別子（変更していなければ null） */
  const changedShooters: (ShooterState | null)[] = slots.map(() => null);
  const activeWeapon: (string | null)[] = slots.map(() => null);
  const shotCounts = slots.map(() => 0);
  /**
   * フレーム f に始まった枠 i の使用武器変更（識別子
   * `<resourceId>.<スロット>.<効果の番号>`）の最初の発を撃つフレーム
   * （plan/design-eunhwa-tu-burst-shot-timing.md 4 節）。窓を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）の
   * 印 + 的の表の値（f の着地点で引く）。表の行が無ければ null
   */
  const weaponChangeFirstHitAt = (i: number, weaponId: string, f: number): number | null => {
    const skill = weaponId.split('.')[1] as SkillSlot;
    const spans = options.weaponChangeFirstHits?.[i]?.[skill];
    if (spans === undefined) return null;
    const opened = activationsOf()
      .filter((a) => a.slotIndex === i && effectFrameOf(a) <= f)
      .at(-1);
    if (opened === undefined) return null;
    return hexagonFrameOf(opened) + flightFramesAt(spans, f);
  };
  /**
   * フレーム f に始まった枠 i の使用武器変更の最初の発のフレーム（plan/design-red-hood.md 7.1 節の論点 13。V-0639）。
   * 持ち替えは、変更を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）がフルバーストに入るなら窓の始まり、ほかは f。持ち替えの時の
   * 基礎の武器が、リロード中ならそのまま、構え解除の途中（最後の発から aimOutFrames 未満）なら構え解除の終わりから after を数え、
   * 構え直し・チャージの途中（まだ撃っていない枠も）なら構え解除 1 回分を足す
   */
  const firstShotAfterSwap = (i: number, f: number, after: number): number => {
    const opened = activationsOf().findLast((a) => a.slotIndex === i && effectFrameOf(a) <= f);
    const swap = opened?.startsFullBurst ? Math.max(f, hexagonFrameOf(opened)) : f;
    return weaponFreeFrameAtSwap(shooters[i]!, logs[i]?.frames.at(-1), swap, model) + after;
  };
  // V-0605: 枠ごとの撃たない区間（狙えない窓と、その枠の holdFire を合わせたもの）と、いま見ている区間の添字
  const slotBlocks = slotBlockRanges(slots.length, untargetable, options.holdFire);
  const slotNextBlock = slots.map(() => 0);
  /** 枠の順に射手を進め、発を記録し、発のゲージを足す（手順 1） */
  const stepShooters = (gauge: number, f: number): number => {
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      if (slot === null || !shooters[i]) return;
      const params = paramsAt(i, f);
      // 使用武器の変更。始まったら変更後の武器を新しい状態で撃ち、終わったら基礎の武器の状態に戻す
      const weaponId = params.weapon?.id ?? null;
      if (weaponId !== activeWeapon[i]) {
        activeWeapon[i] = weaponId;
        if (params.weapon !== null) {
          changedShooters[i] = weaponChangeShooter(params.weapon.shot, model, params);
          const firstHit = weaponChangeFirstHitAt(i, params.weapon.id, f);
          if (firstHit !== null) changedShooters[i]!.wait = Math.max(0, firstHit - f);
          // 定義の即値の待ち（録画で読む。plan/design-skill-stage11.md 2.1 節）
          else if (params.weapon.firstShotDelayFrames !== undefined) {
            changedShooters[i]!.wait = params.weapon.firstShotDelayFrames;
          }
          // 持ち替え（フルバーストに入る発動なら窓の始まり）の時の
          // 基礎の武器の状態で、最初の発を決める（plan/design-red-hood.md 7.1 節の論点 13。V-0639）
          else if (params.weapon.firstShotAfterSwapFrames !== undefined) {
            const first = firstShotAfterSwap(i, f, params.weapon.firstShotAfterSwapFrames);
            changedShooters[i]!.wait = Math.max(0, first - f);
          }
        } else {
          changedShooters[i] = null;
          resumeShooter(shooters[i]!, slot.character.shot, model, params);
        }
      }
      const state = params.weapon !== null ? changedShooters[i]! : shooters[i]!;
      const shot = params.weapon?.shot ?? slot.character.shot;
      // 枠の撃たない区間。入るフレームで hide、明けるフレームで unhide（どちらも射手を進める前）
      const own = slotBlocks[i]!;
      let k = slotNextBlock[i]!;
      while (k < own.length && own[k]!.end < f) k += 1;
      slotNextBlock[i] = k;
      const ownBlock = own[k];
      const slotBlocked = ownBlock !== undefined && ownBlock.start <= f && f < ownBlock.end;
      const slotHideNow = slotBlocked && ownBlock.start === f;
      // 狙えない窓（plan/design-hide-reload-detect.md 案 A）: 入るフレームにチャージが満ちていればふだんの刻みの時刻に撃って
      // ハイドし（同 11 節）、ほかの枠は D まで待つ（チャージの途中なら D の H 後に部分チャージで撃つ）。holdFire の区間は待たずにハイドする（V-0605）
      let windowShot: number | null = null;
      if (slotHideNow && ownBlock.untargetable) windowShot = beginHide(state, shot, model, params);
      else if (slotHideNow) hideShooter(state, shot, model, params);
      else if (slotBlocked) windowShot = stepHide(state, shot, model, params);
      const partial = windowShot;
      if (state.hideReloadStartIn !== undefined) {
        (logs[i]!.hideReloadStarts ??= []).push(f + state.hideReloadStartIn);
        delete state.hideReloadStartIn;
      }
      if (ownBlock !== undefined && ownBlock.end === f)
        unhideShooter(state, shot, ownBlock.end - ownBlock.start, model, params);
      for (const p of appliedPauses[i]!) {
        const on = lists.selfStateAt(i, p.state, f);
        if (on && !p.was) {
          pauseLeft[i] = Math.max(pauseLeft[i]!, p.frames);
          burstPauseAim[i] = p.frames;
          if (controller !== null) stunSlot(controller, i, f + p.frames);
        }
        p.was = on;
      }
      // V-0534: 射撃の止まりの間は射手を進めない（撃たず、待ち・リロードも進めない）
      if (pauseLeft[i]! > 0) {
        pauseLeft[i]! -= 1;
        // バーストの発動の止まりの明けは、狙えない窓の明けと同じく構え直す（plan/design-privaty-burst-pause.md 3 節の論点 4）
        if (pauseLeft[i] === 0 && burstPauseAim[i]! > 0) {
          reaimShooter(state, shot, burstPauseAim[i]!, model, params);
          burstPauseAim[i] = 0;
        }
        return;
      }
      const reloading = state.phase === 'reloading';
      // 撃つ前の溜めの進み（部分チャージの進みと同じ見え方）。リロード中・狙えない窓の間は溜めていない
      const progress =
        chargeWatches[i] !== null && isChargeWeapon(shot) && !reloading && !slotBlocked
          ? chargeProgressFrames(state, params, model)
          : null;
      const fired = stepShooter(state, shot, model, params, slotBlocked);
      const log = logs[i]!;
      if (chargeWatches[i] !== null) {
        const shotNow = fired || partial !== null;
        const fullShot = shotNow && isChargeWeapon(shot) && (partial === null || partial >= 1);
        watchCharge(i, f, progress, shotNow, fullShot, params.chargeFrames);
      }
      // 基礎の武器のリロードを込め終えた（plan/design-cinderella-s1-charge.md 1.1 節）。込め終えたフレームまでが
      // 「リロード完了時に解除」の窓（件の終わりは次のフレーム）
      // 1 回分が 0 フレームのリロード（リロード速度 100% 近く）は、最終弾の発の中で込め終える
      // （shooter.ts の fire。V-0601）。フレームの始めにリロード中でなくても、最終弾を撃ってリロード中でなければ込め終えている
      if (
        writesReloadEnds[i] &&
        params.weapon === null &&
        state.phase !== 'reloading' &&
        (reloading || (fired && state.lastShot))
      )
        (log.reloadEnds ??= []).push(f + 1);
      if (!fired && partial === null) return;
      log.frames.push(f);
      if (state.lastShot) log.lastShotFrames!.push(f);
      if (params.weapon !== null) (log.weaponChangeShotFrames ??= []).push(f);
      // チャージしない変更後の武器の発は fullChargeShot に数えない。チャージ武器への変更を持つチャージしない基礎の武器の発も
      // 数えない（どちらも、発の武器がチャージ武器でない。plan/design-nayuta.md 2.6 節）
      const uncharged = log.fullCharge && !isChargeWeapon(shot);
      if (uncharged) (log.unchargedShotFrames ??= []).push(f);
      // 撃ち切りで終わる変更は、最後の弾丸を撃ったら次のフレームで基礎の武器に戻す（変更後の武器はリロードしない。
      // plan/design-true-damage-element.md 9 節の論点 8）。件の終わりも同じ列から作る（skills/holders.ts）
      if (
        params.weapon !== null &&
        state.lastShot &&
        lists.openWeaponChange(i, params.weapon.id, f + WEAPON_CHANGE_END_DELAY)
      ) {
        (log.weaponChangeEnds ??= []).push(f + WEAPON_CHANGE_END_DELAY);
        weaponChangeEndOffset[i] = reloadStartOffset(shot, model, params, state.acc, state.shotsInMagazine - 1);
      }
      const isPartial = partial !== null && partial < 1;
      if (isPartial) (log.partialShots ??= []).push({ frame: f, progress: partial });
      const { hits, coreHits } = hitsAt(i, f);
      const pelletCount = pelletsAt(i, f, shotCounts[i]!, hits);
      log.hits!.push(hits);
      log.coreHits!.push(coreHits);
      // 発のクリティカルの命中の期待値（plan/design-new-chars-1029.md 5.7 節）。会心率は基礎 + 常時の▲ +
      // 時間で変わる▲（f − 1 までに付いた件）で、通常攻撃のクリティカル確率▲も足す（上限 1）
      const critRate = capCritRate(
        slot.character.crit.rate + passiveFiring[i]!.critRate + passiveFiring[i]!.normalCritRate + lists.critUpAt(i, f),
      );
      const critHits = hits * critRate;
      log.critHits!.push(critHits);
      log.pelletHits!.push(pelletCount);
      shotEvents[i] = {
        lastShot: state.lastShot,
        fullCharge: log.fullCharge && !isPartial && !uncharged,
        hits,
        coreHits,
        critHits,
        pellets: pelletCount,
      };
      if (params.weapon !== null) shotEvents[i]!.weaponChange = true;
      shotCounts[i]! += 1;
      const shotEnergy = energyAt(i, f);
      // チャージしない変更後の武器の発には、基礎の武器のフルチャージ倍率を掛けない（変更後の武器の発のゲージは確かめていない。
      // V-0528）。ヒットの数（gaugeHitsOf）は 1 発 1 ヒットのまま
      const gainEnergy = uncharged ? shotEnergy / chargeGaugeOf(i) : shotEnergy;
      const energy =
        gainEnergy * (isPartial ? partialGaugeRatio(slot.character.shot, i === controlledSlot, partial) : 1) +
        (obstacles[i]!.get(shotCounts[i]!) ?? 0) * obstacleEnergyAt(i);
      gauge += landingGauge(i, f + shotFlightAt(i, f), f, energy, gaugeHitsOf(i, shotEnergy));
    });
    return gauge;
  };
  return { stepShooters };
}

export type Shooters = ReturnType<typeof createShooters>;
