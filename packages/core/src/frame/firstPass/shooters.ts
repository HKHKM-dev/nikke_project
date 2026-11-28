// 1 パス目（../firstPass.ts の runFirstPassOnce）の射手（plan/design-split-first-pass.md 3.4 節・9.4 節）:
// 射手の実効値と状態（createShooterStates）と、フレームごとに枠の射手を進めて発を記録する手順（createShooters）。
import { stunSlot } from '../../burst/controller.ts';
import { partialGaugeRatio } from '../../burst/dynamic.ts';
import { effectFrameOf, hexagonFrameOf } from '../../burst/schedule.ts';
import { capCritRate, ZERO_BUFFS, type ChangedWeapon } from '../../skills/buffs.ts';
import { isChargeWeapon, lastBulletShotsOf } from '../../weapons.ts';
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
  spunBeforeLastShot,
  type ShooterState,
} from '../shooter.ts';
import { flightFramesAt } from '../landing.ts';
import type { ShotParams, SkillSlot } from '../../types.ts';
import { reloadStartOffset } from '../../cadence.ts';
import type { FrameRange, TimelineSlot } from '../../skills/timeline.ts';
import type { HoldFire } from '../../team.ts';
import { unionRanges } from '../events.ts';
import { shotEventOf } from '../../skills/triggers.ts';
import type { FirstPassBase } from './base.ts';
import type { Gauge } from './gauge.ts';
import type { GaugeEffects } from './gaugeEffects.ts';
import { WEAPON_CHANGE_END_DELAY, type ShotLogs } from './shotLogs.ts';
import type { BurstScheduleLayer } from './burst.ts';
import type { ShotPauses } from './shotPauses.ts';

/** 射手のある枠 */
type Slot = NonNullable<TimelineSlot>;

/**
 * V-0605: 枠の撃たない区間。untargetable は区間の始まりが狙えない窓の始まりか（そのときだけ窓の始まりの D を待ち、部分チャージの発を撃つ。
 * holdFire の区間は待たずにハイドする。plan/design-hide-reload-detect.md 案 A）。manualEnd は区間の終わりが holdFire の終わりで、
 * 同じフレームに狙えない窓が明けないか（オート射撃を手で ON に戻した明け。C-1550）
 */
type SlotBlock = FrameRange & { untargetable: boolean; manualEnd: boolean };

/**
 * V-0605: 枠ごとの撃たない区間。狙えない窓に枠の holdFire を合わせて 1 つにする（同じフレームに始まれば狙えない窓の側）。
 * holdFire の無い枠は、狙えない窓の列を共有する
 */
function slotBlockRanges(
  slotCount: number,
  untargetable: readonly FrameRange[],
  holdFire: readonly HoldFire[] | undefined,
): (readonly SlotBlock[])[] {
  const shared: SlotBlock[] = untargetable.map((r) => ({
    start: r.start,
    end: r.end,
    untargetable: true,
    manualEnd: false,
  }));
  return Array.from({ length: slotCount }, (_, i) => {
    const holds = (holdFire ?? []).filter((h) => h.slotIndex === i).flatMap((h) => h.ranges);
    if (holds.length === 0) return shared;
    const all = [
      ...shared,
      ...holds.map((r) => ({ start: r.start, end: r.end, untargetable: false, manualEnd: false })),
    ];
    const merged = unionRanges(
      all.sort((a, b) => a.start - b.start || Number(b.untargetable) - Number(a.untargetable)),
    );
    return merged.map((b) => ({
      ...b,
      manualEnd: holds.some((r) => r.end === b.end) && !untargetable.some((r) => r.end === b.end),
    }));
  });
}

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
    // 和が 0 でも、常時の値が 0 でなければ基礎の実効値と違う（値の固定が常時のチャージ速度を 0 にした時など。plan/design-stat-lock.md）
    if (buffs === null || (isZeroFiring(buffs) && isZeroFiring(passiveFiring[i]!))) return base;
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
  cooldownHoldUntil,
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
  muzzleHits,
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
  // 枠がいま持っている変更後の武器（戻る時に、戻りの待ちの欄を読む）
  const heldWeapon: (ChangedWeapon | null)[] = slots.map(() => null);
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
   * 基礎の武器の状態で武器が空くフレーム（frame/shooter.ts の weaponFreeFrameAtSwap）から after を数える
   */
  const firstShotAfterSwap = (i: number, f: number, after: number): number => {
    const opened = activationsOf().findLast((a) => a.slotIndex === i && effectFrameOf(a) <= f);
    const swap = opened?.startsFullBurst ? Math.max(f, hexagonFrameOf(opened)) : f;
    const base = slots[i]!.character.shot;
    return weaponFreeFrameAtSwap(shooters[i]!, logs[i]?.frames.at(-1), swap, model, isChargeWeapon(base)) + after;
  };
  // V-0605: 枠ごとの撃たない区間（狙えない窓と、その枠の holdFire を合わせたもの）と、いま見ている区間の添字
  const slotBlocks = slotBlockRanges(slots.length, untargetable, options.holdFire);
  const slotNextBlock = slots.map(() => 0);
  /** 使用武器の変更。始まったら変更後の武器を新しい状態で撃ち、終わったら基礎の武器の状態に戻す */
  const switchWeapon = (i: number, slot: Slot, params: FiringParams, f: number): void => {
    const weaponId = params.weapon?.id ?? null;
    if (weaponId === activeWeapon[i]) return;
    activeWeapon[i] = weaponId;
    const ended = heldWeapon[i];
    heldWeapon[i] = params.weapon;
    if (params.weapon !== null) {
      const changed = weaponChangeShooter(params.weapon.shot, model, params);
      changedShooters[i] = changed;
      const firstHit = weaponChangeFirstHitAt(i, params.weapon.id, f);
      if (firstHit !== null) changed.wait = Math.max(0, firstHit - f);
      // 定義の即値の待ち（録画で読む。plan/design-skill-stage11.md 2.1 節）
      else if (params.weapon.firstShotDelayFrames !== undefined) {
        changed.wait = params.weapon.firstShotDelayFrames;
      }
      // 持ち替え（フルバーストに入る発動なら窓の始まり）の時の
      // 基礎の武器の状態で、最初の発を決める（plan/design-red-hood.md 7.1 節の論点 13。V-0639）
      else if (params.weapon.firstShotAfterSwapFrames !== undefined) {
        const first = firstShotAfterSwap(i, f, params.weapon.firstShotAfterSwapFrames);
        changed.wait = Math.max(0, first - f);
      }
    } else {
      changedShooters[i] = null;
      // 撃ち切りで戻った後の待ち（録画で読む即値。plan/design-snow-white.md 8.1 節の論点 4）は、変更後の武器の最後の弾丸
      // （枠の最後の発）から数える（戻るフレームは最後の弾丸の次のフレームより遅れることがある）
      const lastShot = logs[i]?.frames.at(-1);
      const wait =
        ended?.returnFirstShotFrames !== undefined && lastShot !== undefined
          ? Math.max(0, lastShot + ended.returnFirstShotFrames - f)
          : undefined;
      resumeShooter(shooters[i]!, slot.character.shot, model, params, wait);
    }
  };
  /** 枠 i の撃たない区間のうち、フレーム f にかかるか、f より後の最初のもの（見ている区間の添字を進める） */
  const blockAt = (i: number, f: number): SlotBlock | undefined => {
    const own = slotBlocks[i]!;
    let k = slotNextBlock[i]!;
    while (k < own.length && own[k]!.end < f) k += 1;
    slotNextBlock[i] = k;
    return own[k];
  };
  /**
   * 枠の撃たない区間。入るフレームで hide、明けるフレームで unhide（どちらも射手を進める前）。狙えない窓で撃った部分チャージの発の
   * 進みを返す（撃たなければ null）
   */
  const stepBlock = (
    i: number,
    state: ShooterState,
    shot: ShotParams,
    params: FiringParams,
    f: number,
    ownBlock: SlotBlock | undefined,
    slotBlocked: boolean,
  ): number | null => {
    const slotHideNow = slotBlocked && ownBlock?.start === f;
    // 狙えない窓（plan/design-hide-reload-detect.md 案 A）: 入るフレームにチャージが満ちていればふだんの刻みの時刻に撃って
    // ハイドし（同 11 節）、ほかの枠は D まで待つ（チャージの途中なら D の H 後に部分チャージで撃つ）。holdFire の区間は待たずにハイドする（V-0605）
    let windowShot: number | null = null;
    if (slotHideNow && ownBlock?.untargetable === true) windowShot = beginHide(state, shot, model, params);
    else if (slotHideNow) hideShooter(state, shot, model, params);
    else if (slotBlocked) windowShot = stepHide(state, shot, model, params);
    if (state.hideReloadStartIn !== undefined) {
      (logs[i]!.hideReloadStarts ??= []).push(f + state.hideReloadStartIn);
      delete state.hideReloadStartIn;
    }
    if (ownBlock !== undefined && ownBlock.end === f) {
      // オート射撃を手で ON に戻した明けは、構えが短い（C-1550・C-1564。使用武器の変更の間は確かめていないので窓の明けと同じ）
      const shorter = ownBlock.manualEnd && params.weapon === null ? model.manualOnAimShorterFrames : 0;
      unhideShooter(state, shot, ownBlock.end - ownBlock.start, model, params, shorter);
    }
    return windowShot;
  };
  /** 状態で止まる射撃（appliedPauses）を始め、止まりを 1 フレーム数える。止まりの間なら true（射手を進めない） */
  const stepPause = (i: number, state: ShooterState, shot: ShotParams, params: FiringParams, f: number): boolean => {
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
    if (!(pauseLeft[i]! > 0)) return false;
    pauseLeft[i]! -= 1;
    // バーストの発動の止まりの明けは、狙えない窓の明けと同じく構え直す（plan/design-privaty-burst-pause.md 3 節の論点 4）。
    // 止まりの中でオート射撃を手で ON に戻した枠も、ここで窓の明けと同じ待ちになる（C-1550 の短さは止まりの中では確かめていない）
    if (pauseLeft[i] === 0 && burstPauseAim[i]! > 0) {
      reaimShooter(state, shot, burstPauseAim[i]!, model, params);
      burstPauseAim[i] = 0;
    }
    return true;
  };
  /**
   * 射手を 1 フレーム進め、チャージの見張り・撃ち切りのクールタイムの待ち・リロードの込め終わりを書く。このフレームに撃ったら
   * true（ふだんの発か、partial の狙えない窓で撃った部分チャージの発）
   */
  const advanceShooter = (
    i: number,
    state: ShooterState,
    shot: ShotParams,
    params: FiringParams,
    f: number,
    slotBlocked: boolean,
    partial: number | null,
  ): boolean => {
    const reloading = state.phase === 'reloading';
    // 撃つ前の溜めの進み（部分チャージの進みと同じ見え方）。リロード中・狙えない窓の間は溜めていない
    const progress =
      chargeWatches[i] !== null && isChargeWeapon(shot) && !reloading && !slotBlocked
        ? chargeProgressFrames(state, params, model)
        : null;
    const fired = stepShooter(state, shot, model, params, slotBlocked);
    const shotNow = fired || partial !== null;
    // 撃ち切りで終わる変更の最後の弾丸から、この枠のクールタイムの周期の発動を待たせる（plan/design-snow-white.md 8.3 節の論点 7）。
    // 敵のジャンプの始まりの部分チャージの発で撃ち切った回も同じ（V-0840）
    if (shotNow && params.weapon?.returnCooldownFrames !== undefined && state.ammo === 0) {
      cooldownHoldUntil[i] = f + params.weapon.returnCooldownFrames;
    }
    if (chargeWatches[i] !== null) {
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
      (logs[i]!.reloadEnds ??= []).push(f + 1);
    return shotNow;
  };
  /**
   * 発のクリティカルのペレット（plan/design-k.md 2.2 節。V-0848）。ペレット数を替える使用武器変更の発は、変更後のペレット数で
   * 数える。SG でない基礎の武器は変更後のペレット数 × 1 銃口の命中の期待値（二丁持ちの銃口の数を掛けない）、SG の基礎の武器は当たった
   * ペレットの数を変更後のペレット数の比で直す。ほかは当たったペレットの数
   */
  const critPelletsOf = (
    i: number,
    slot: Slot,
    shot: ShotParams,
    params: FiringParams,
    critRate: number,
    hits: number,
    pelletCount: number,
  ): number => {
    const base = slot.character.shot;
    const changedPellets = params.weapon !== null && shot.shotCount !== base.shotCount;
    return (
      critRate *
      (!changedPellets
        ? pelletCount
        : slot.character.weaponType === 'SG'
          ? (pelletCount * shot.shotCount) / base.shotCount
          : (shot.shotCount * hits) / muzzleHits[i]!)
    );
  };
  /** 発のゲージ（着地のフレームに足す分）。partialProgress は 1 未満の部分チャージの発の進み（ほかの発は null） */
  const shotGauge = (i: number, slot: Slot, f: number, uncharged: boolean, partialProgress: number | null): number => {
    const shotEnergy = energyAt(i, f);
    // チャージしない変更後の武器の発には、基礎の武器のフルチャージ倍率を掛けない（変更後の武器の発のゲージは確かめていない。
    // V-0528）。ヒットの数（gaugeHitsOf）は 1 発 1 ヒットのまま
    const gainEnergy = uncharged ? shotEnergy / chargeGaugeOf(i) : shotEnergy;
    const energy =
      gainEnergy *
        (partialProgress !== null ? partialGaugeRatio(slot.character.shot, i === controlledSlot, partialProgress) : 1) +
      (obstacles[i]!.get(shotCounts[i]!) ?? 0) * obstacleEnergyAt(i);
    return landingGauge(i, f + shotFlightAt(i, f), f, energy, gaugeHitsOf(i, shotEnergy));
  };
  /** 撃った発を記録し（射撃の列・命中・クリティカル・ペレット・出来事）、発のゲージを返す */
  const recordShot = (
    i: number,
    slot: Slot,
    state: ShooterState,
    shot: ShotParams,
    params: FiringParams,
    f: number,
    partial: number | null,
  ): number => {
    const log = logs[i]!;
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
      weaponChangeEndOffset[i] = reloadStartOffset(shot, model, params, state.acc, spunBeforeLastShot(state, params));
    }
    const isPartial = partial !== null && partial < 1;
    if (isPartial) (log.partialShots ??= []).push({ frame: f, progress: partial });
    const { hits, coreHits } = hitsAt(i, f, params.weapon?.targetRowKey);
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
    const critPellets = critPelletsOf(i, slot, shot, params, critRate, hits, pelletCount);
    log.critPellets!.push(critPellets);
    log.pelletHits!.push(pelletCount);
    // 「最後の弾丸」が最後の 1 発でない武器（二丁持ち）は、撃った後の残弾がその発の数より少ない発がきっかけ
    // （基礎の武器だけ。装弾数無限の発は残弾が減らないので起きない）
    const bullets = params.weapon === null ? lastBulletShotsOf(slot.character.weaponType, shot) : 1;
    let lastBullet: boolean | undefined;
    if (bullets > 1) {
      lastBullet = state.lastShot || (!params.infiniteAmmo && state.ammo < bullets);
      log.lastBulletFrames ??= [];
      if (lastBullet) log.lastBulletFrames.push(f);
    }
    // 装弾数無限の発は残弾を減らさないので、味方が消費した弾の合計（teamAmmo）に数えない（plan/design-cinderella-cw.md 2.3 節）。
    // 流し直し（replayEvents）も同じに数えるよう、射撃の列にも残す
    if (params.infiniteAmmo) (log.infiniteAmmoShotFrames ??= []).push(f);
    shotEvents[i] = shotEventOf(
      state.lastShot,
      lastBullet,
      log.fullCharge && !isPartial && !uncharged,
      hits,
      coreHits,
      critHits,
      critPellets,
      pelletCount,
      params.weapon !== null,
      params.infiniteAmmo,
    );
    shotCounts[i]! += 1;
    return shotGauge(i, slot, f, uncharged, isPartial ? partial : null);
  };
  /** 枠の順に射手を進め、発を記録し、発のゲージを足す（手順 1） */
  const stepShooters = (gauge: number, f: number): number => {
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      if (slot === null || !shooters[i]) return;
      const params = paramsAt(i, f);
      switchWeapon(i, slot, params, f);
      const state = params.weapon !== null ? changedShooters[i]! : shooters[i]!;
      const shot = params.weapon?.shot ?? slot.character.shot;
      const ownBlock = blockAt(i, f);
      const slotBlocked = ownBlock !== undefined && ownBlock.start <= f && f < ownBlock.end;
      const partial = stepBlock(i, state, shot, params, f, ownBlock, slotBlocked);
      if (stepPause(i, state, shot, params, f)) return;
      if (!advanceShooter(i, state, shot, params, f, slotBlocked, partial)) return;
      gauge += recordShot(i, slot, state, shot, params, f, partial);
    });
    return gauge;
  };
  return { stepShooters };
}
