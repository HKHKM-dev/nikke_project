// Stage 5: 1 体の通常射撃をフレームごとに進める状態機械。
// cadence.ts と同じ規則（レート蓄積、チャージ + 解放遅延、リロード = 回数 × リロード時間（分割リロードは C-0154）、MG の初弾遅延）を逐次処理で書き直したもので、
// 発射フレーム列は k × cycleFrames + firstShotFrames + shotFrames[i] と 1 フレームもずれない（sim/__tests__/shooter.test.ts で固定）。
//
// wait は「撃てないフレームがあと何個残っているか」。stepShooter は先に判定してから減らす:
//   戦闘開始        wait = firstShotFrames                        → AR・SMG・SG・MG は f=12、1 秒チャージの RL は f=71・SR は f=70 に 1 発目
//                   （ハイドから構え 12f（SR は 11f）+ チャージ + 満ちてから撃つまで 1f − 1。C-0232。押下チャージ型は Stage 22-A の
//                    発と発の間 82f − 構え解除 13f。C-0537。Stage 22-C: チャージの無い武器は構え 12f の後。C-0114）
//   チャージ武器    発射したフレーム S で wait = charge + release − 1 → 次弾は S + 82
//                   （チャージの途中でチャージ時間が変われば、S からの経過を持ち越して決め直す。C-0541・C-0542・C-0523）
//   リロード        最終弾のフレーム L から、1 回分ずつ込めて最後の 1 回分を込め終えたところで 1 発目の遅延につなぐ
//                   → 次のマガジンの 1 発目は L + reload × chunks + reloadFirst（Stage 21-C3: AR・SMG・SG は 22f。C-0059。MG は 20f）
//                   分割リロードは、込め始めの前に弾を込めない 1 段を待ち、段は切り上げた整数（C-0154）
//                   → L + ceil(段) × (chunks + 1) + reloadFirst
//
// Stage 10: 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）を FiringParams として毎フレーム受け取る（frame/firing.ts）。
// 分割リロードは 1 回分ずつ込め、1 回分の弾数は込めるたびにその時点の最大装弾数で決める（録画 0037: 3 → 10 → 17 → 20、
// 録画 0019: 0 → 5 → 8 → 9）。最大装弾数が増えても残弾は増えない（録画 0037）。
// つなぎ目の −1 は「最終弾の直後」の 1 回だけにする（plan/design-stage10.md 3.3 節）。1 回分の完了ごとに −1 すると
// 1 回分につき 1 フレームずつ早くなる。
//
// Stage 11 モダニア: 装弾数無限（FiringParams.infiniteAmmo）の間は撃っても残弾を減らさない。使用武器の変更（殲滅モード）は
// frame/firstPass.ts が別の射手の状態で撃ち、終わったら resumeShooter で基礎の武器の状態に戻す（plan/design-stage11-modernia.md 3.4 節）。
//
// Stage 16-B: 敵を狙えない窓（敵のジャンプ）の間は撃たない（stepShooter の blocked）。待ち・リロードは進む。
// 窓に入ったら hideShooter、明けたら unhideShooter（plan/design-stage16.md 9.3 節。2026-09-26 ユーザー確認の仕様）:
//   攻撃できる敵がいないとハイドし、できればリロードする。窓の間に込め終われば満タンで、終わらなければ込め直しは無かったことになる。
import { ACC_EPSILON, firstShotFrames, rateAfterShots, reloadFirstShotFrames } from '../cadence.ts';
import { FRAMES_PER_GAME_SECOND } from '../time.ts';
import type { ShotParams } from '../types.ts';
import {
  DEFAULT_WEAPON_MODEL,
  MAX_RPM,
  hasSpinUp,
  isChargeWeapon,
  windowEndShorterFrames,
  type WeaponModel,
} from '../weapons.ts';
import { chargeShotIntervalFrames, firingParams, reloadChunkAmmo, type FiringParams } from './firing.ts';

/**
 * 最大装弾数が残弾より小さくなった（最大装弾数▲が切れた）ときに残弾を削るか。
 * **2026-09-23 の録画 0039（録画 A）で「削る」と確定**: リターの 5 秒窓が切れた瞬間に、デルタの表示が 9/9 → 6/6 になった
 */
export const MAX_AMMO_CLAMP_ON_DECREASE = true;

export type ShooterPhase =
  /** 撃てる（wait が切れたら撃つ） */
  | 'ready'
  /** リロード中（wait が切れたら 1 回分を込める） */
  | 'reloading'
  /** 込め終えて 1 発目の遅延中（wait が切れたら撃つ。マガジンの状態はここで戻す） */
  | 'priming';

export type ShooterState = {
  phase: ShooterPhase;
  /** 残弾 */
  ammo: number;
  /** このマガジンで撃った数（レート上昇と 1 発目判定に使う） */
  shotsInMagazine: number;
  /** 次に何かが起きるまでの残りフレーム（初弾遅延・チャージ・リロードの 1 回分） */
  wait: number;
  /** レート蓄積（非チャージ武器の 2 発目以降） */
  acc: number;
  /** 直前に撃った射撃で残弾が 0 になったか（「最後の弾丸」の印。stepShooter が撃ったフレームだけ意味を持つ） */
  lastShot: boolean;
  /**
   * Stage 24: リロードの 1 回分のフレーム数の端数（0 以上 1 未満）。1 回分を始めるたびに端数つきのフレーム数に足して切り捨て、
   * 残りを次の回へ持ち越す（nextChunkFrames。C-0145）。最初は 0.5 で、リロードの累積の長さを四捨五入するのと同じになる
   * （最初のリロードが切り捨てに偏らない）
   */
  reloadCarry: number;
  /** 分割リロードの、込め始めの前の弾を込めない 1 段の最中（C-0154）。無ければキーごと無い */
  reloadLead?: true;
  /** Stage 16-B: ハイド中に始めたリロード（明けるまでに込め終わらなければ取り消す）。無ければキーごと無い */
  hideReload?: true;
  /**
   * 狙えない窓の始まりから D（WeaponModel.hideDetectFrames）までの待ちと、チャージの途中だった枠の部分チャージの発までの待ち
   * （beginHide・stepHide。plan/design-hide-reload-detect.md 案 A）。無ければキーごと無い
   */
  hidePending?: HidePending;
  /**
   * チャージ武器の、前の発（押下チャージ型のリロードの後は、込め終えてから解放の分の後）からのフレーム数。
   * 発と発の間で持ち、毎フレームその時の発と発の間（chargeShotIntervalFrames）で待ちを決め直す。
   * チャージの途中でチャージ時間が変わると、経過を持ち越して新しいチャージ時間に届いたら撃つ（撃った時点の待ちのまま・やり直しとは
   * 合わない）。押下チャージ型はバーストの発動（1 秒 → 0.7 秒）と窓の終わり（0.7 秒 → 1 秒）で確かめた（窓の終わりは C-0541、発動は C-0542（仮説）。V-0134・V-0151・V-0252）。
   * 入力が UP のチャージ武器は、SR（アリス）と RL（ユニ・I-DOLL・フラワー）のチャージ速度▲の付き始めで確かめた（C-0523・C-0526。
   * V-0403・V-0407・V-0410）。速度が下がるとき（▲の切れ目）も、SR（ココア）と RL（ユニ・I-DOLL・フラワー）で同じ規則と合った（C-0528・C-0529。V-0412・V-0413）。
   * 込め終えてから 1 発目までは押下チャージ型だけ持つ（込め終えた時は −解放 から数える。入力が UP は込め終えた時に待ちを決める）。
   * リロード中・ハイドの明け・戦闘開始の 1 発目は持たない。無ければキーごと無い
   */
  chargeElapsed?: number;
};

/** 窓の始まりの後の待ち（ShooterState.hidePending） */
export type HidePending = {
  /** 残りフレーム（0 になったフレームに動く）。チャージの途中だった枠は D + H（部分チャージの発）、ほかの枠は D（ハイド） */
  framesLeft: number;
  /**
   * 窓の始まりのチャージの進み（0 以上 1 未満）。0 より大きければチャージの途中だった枠。H の長い射撃姿勢維持型の部分チャージの値にも
   * 使う（plan/design-hide-reload-detect.md 8 節）
   */
  progressAtStart: number;
};

export function initialShooter(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): ShooterState {
  if (shot.maxAmmo < 1) throw new RangeError(`maxAmmo must be >= 1, got ${shot.maxAmmo}`);
  if (shot.rateOfFire <= 0) throw new RangeError(`rateOfFire must be positive, got ${shot.rateOfFire}`);
  return {
    phase: 'ready',
    ammo: params.maxAmmo,
    shotsInMagazine: 0,
    wait: firstShotFrames(shot, model, params),
    acc: 0,
    lastShot: false,
    reloadCarry: 0.5,
  };
}

/**
 * Stage 11 モダニア: 使用武器の変更（殲滅モード）で持ち替えた武器の射手の初期状態。
 * Stage 22-C の構え（aimInFrames）は入れず、持ち替えの次のフレームから撃つ（スピンアップ武器は初弾遅延、チャージ武器は
 * 戦闘開始と同じ待ち）。持ち替えはハイドではなく、構えが要るかの根拠が無いので、22-C の前のまま（録画 0044: 1 フレーム 1 発）
 */
export function weaponChangeShooter(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): ShooterState {
  const state = initialShooter(shot, model, params);
  if (!isChargeWeapon(shot)) state.wait = hasSpinUp(shot) ? model.spinUpFirstShotFrames : 0;
  return state;
}

/**
 * Stage 24: リロードの 1 回分のフレーム数（整数）を決める。端数つきの 1 回分（params.reloadChunkFrames）に前の回の端数を足して
 * 切り捨て、残りを持ち越す（C-0145。長い目で見ると 1 回分の平均は端数つきの値になる）。
 * 分割リロードの段は、端数つきの長さを切り上げた整数で、端数を持ち越さない（C-0154）
 */
function nextChunkFrames(state: ShooterState, params: FiringParams): number {
  // 割り算の誤差で整数のすぐ上に出た値を切り上げないよう、ごく小さな幅を引く
  if (params.splitReload) return Math.ceil(params.reloadChunkFrames - 1e-9);
  const total = params.reloadChunkFrames + state.reloadCarry;
  // 割り算の誤差で整数のすぐ下に出た値を切り捨てないよう、ごく小さな幅を足す
  const frames = Math.floor(total + 1e-9);
  state.reloadCarry = Math.max(0, total - frames);
  return frames;
}

/**
 * リロードを始める（最終弾の直後・ハイド中のリロード）。分割リロードは、込め始めの前に弾を込めない 1 段を待つ
 * （最終弾 → 込め終わりが段の数 + 1 段ぶん。C-0154）。
 * @returns 最初の 1 回分（分割リロードでは込めない 1 段）のフレーム数
 */
function startReload(state: ShooterState, params: FiringParams): number {
  delete state.chargeElapsed;
  state.phase = 'reloading';
  if (params.splitReload) state.reloadLead = true;
  return nextChunkFrames(state, params);
}

/**
 * リロード中に 1 回分を込め終えた（または込め始めの時点で 0 フレームの 1 回分が続く）ときの処理。
 * 分割リロードの込めない 1 段（reloadLead）が明けたときは、弾を足さずに最初の 1 回分を始める。
 * 最大に届いたら 1 発目の遅延（priming）へ。届かなければ次の 1 回分。
 * 1 回分が 0 フレーム（リロード速度 100% 以上）なら同じフレームで続けて込める。
 * @returns 1 発目の遅延が 0 で、このフレームにそのまま撃ってよいなら true
 */
function loadChunks(state: ShooterState, shot: ShotParams, model: WeaponModel, params: FiringParams): boolean {
  for (;;) {
    if (state.reloadLead) delete state.reloadLead;
    else state.ammo = Math.min(params.maxAmmo, state.ammo + reloadChunkAmmo(params.maxAmmo, shot.reloadBullet));
    if (state.ammo < params.maxAmmo) {
      const chunk = nextChunkFrames(state, params);
      if (chunk > 0) {
        state.wait = chunk - 1;
        return false;
      }
      continue;
    }
    state.phase = 'priming';
    // ハイド中のリロードは込め終わりを遅らせた分だけ 1 発目の待ちを縮める（ふだんのリロードと同じ和。hideReloadExtraFrames）
    const first = Math.max(
      0,
      reloadFirstShotFrames(shot, model, params) - (state.hideReload ? hideReloadExtraFrames(model, params) : 0),
    );
    if (first === 0) return true;
    state.wait = first - 1;
    // 押下チャージ型: 1 発目の待ち（チャージ + 解放）は、込め終えた時に決めず、解放の分を負の経過から数えて毎フレームその時の
    // チャージ時間で決め直す。窓の終わり（0.7 秒 → 1 秒）がこのチャージの途中に来ると、経過を持ち越して 1 秒に届いたら撃つ（C-0541）
    if (params.downCharge) state.chargeElapsed = -model.chargeReleaseFrames;
    return false;
  }
}

/** 撃つ（残弾・マガジンの状態を進め、次の待ちを決める） */
function fire(state: ShooterState, shot: ShotParams, model: WeaponModel, params: FiringParams): void {
  state.shotsInMagazine += 1;
  if (params.infiniteAmmo) {
    // Stage 11 モダニア: 装弾数無限。残弾は減らず、リロードも最後の弾丸も起きない
    state.lastShot = false;
    if (isChargeWeapon(shot)) {
      state.wait = Math.max(0, chargeShotIntervalFrames(params, model) - 1);
      state.chargeElapsed = 0;
    }
    return;
  }
  state.ammo -= 1;
  state.lastShot = state.ammo <= 0;
  if (state.ammo <= 0) {
    state.ammo = 0;
    const chunk = startReload(state, params);
    if (chunk > 0) {
      // 最終弾の直後の 1 回だけ −1 する（先に判定してから減らすため）。1 回分の完了は L + R、L + 2R…
      state.wait = chunk - 1;
      return;
    }
    // 1 回分が 0 フレーム: 最終弾のフレームで込め終える。1 発目は早くて次のフレーム（Stage 9 の Math.max(0, …) と同じ）
    const fireNow = loadChunks(state, shot, model, params);
    if (fireNow) state.wait = 0;
    return;
  }
  if (isChargeWeapon(shot)) {
    state.wait = Math.max(0, chargeShotIntervalFrames(params, model) - 1);
    state.chargeElapsed = 0;
  }
}

/** マガジンを戻す（込め終えて 1 発目を撃つフレーム。MG のレートもここで戻す） */
function startMagazine(state: ShooterState): void {
  state.phase = 'ready';
  state.shotsInMagazine = 0;
  state.acc = 0;
}

/**
 * 1 フレーム進める（state を書き換える）。このフレームに発射したら true。
 * params はこのフレームの射撃の実効値（省略は基礎値）。最大装弾数が残弾より小さくなっていたら先に削る（MAX_AMMO_CLAMP_ON_DECREASE）。
 * Stage 16-B: blocked（敵を狙えない）なら撃たない。待ち・リロードは進み、撃てる状態のまま明けるのを待つ
 */
export function stepShooter(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
  blocked = false,
): boolean {
  if (MAX_AMMO_CLAMP_ON_DECREASE && state.ammo > params.maxAmmo) state.ammo = params.maxAmmo;
  if (state.chargeElapsed !== undefined) {
    // チャージ武器: 前の発（押下チャージ型のリロードの後は、込め終えてから解放の分の後）からの経過と、このフレームのチャージ時間で
    // 待ちを決め直す（C-0541・C-0542・C-0523）
    state.chargeElapsed += 1;
    state.wait = chargeWaitFrames(params, model, state.chargeElapsed);
  }
  // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.2 節）: 押下チャージ型のマガジンの 2 発目以降は、AR・SMG・SG と同じく前の発の
  // 翌フレームから発射レートを蓄積し、1 発分たまるまで撃たない（チャージ 0 秒のシンデレラは 180rpm の 20・20・19f）。チャージを待つ間は
  // 1 発分で止める（貯め込まない）。チャージが発射レートの 1 発分より長いうちは、満ちた時には 1 発分たまっているので変わらない。
  // 入力が UP のチャージ武器は発射レート（どれも 60rpm）より速く撃つので掛けない（紅蓮BS 43f・アリス 31f。C-0149・C-0523）
  const rateGated = params.downCharge && state.phase === 'ready' && state.shotsInMagazine > 0;
  if (rateGated) state.acc += rateAfterShots(shot, state.shotsInMagazine) / MAX_RPM;
  if (state.wait > 0) {
    if (rateGated) state.acc = Math.min(state.acc, 1);
    state.wait -= 1;
    return false;
  }
  if (state.phase === 'reloading') {
    // 1 回分を込め終えた。最大に届いて 1 発目の遅延が 0 ならこのフレームに撃つ（Stage 21-C3 からは AR・SMG・SG も 22f 待つ）
    if (!loadChunks(state, shot, model, params)) return false;
  }
  if (blocked) return false;
  if (state.phase === 'priming') startMagazine(state);
  if (state.shotsInMagazine > 0 && !isChargeWeapon(shot)) {
    // simulateShotFrames と同じ: 前の発射の翌フレームから毎フレーム蓄積し、1 発分たまったフレームで撃つ。
    // 2 段目の段 9 の PR 2: 攻撃速度▲はこのフレームのレートに掛ける（params.rateScale。C-0600）
    state.acc += rateAfterShots(shot, state.shotsInMagazine, params.rateScale, params.spinUpScale) / MAX_RPM;
    if (state.acc < 1 - ACC_EPSILON) return false;
    state.acc -= 1;
  }
  if (rateGated) {
    if (state.acc < 1 - ACC_EPSILON) return false;
    state.acc -= 1;
  }
  fire(state, shot, model, params);
  return true;
}

/**
 * Stage 10: 弾丸チャージ。残弾に amount を足し、最大で止める。リロード中に最大に届いたらリロードを終え、1 発目の遅延に入る
 * （遅延は次のフレームから数える。遅延 0 の武器は次のフレームに撃つ）。値の端数処理は呼ぶ側で行う
 */
export function refillAmmo(
  state: ShooterState,
  amount: number,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): void {
  if (amount <= 0) return;
  state.ammo = Math.min(params.maxAmmo, state.ammo + amount);
  if (state.phase === 'reloading' && state.ammo >= params.maxAmmo) {
    delete state.reloadLead;
    state.phase = 'priming';
    state.wait = Math.max(0, reloadFirstShotFrames(shot, model, params) - 1);
  }
}

/**
 * 2 段目の段 11（plan/design-skill-stage11.md 2.2 節）: 残弾数減少。残弾から amount を減らす（0 で止める）。0 になったら、
 * リロード中でなければリロードを始める（最後の弾丸を撃ったときと同じ。チャージの途中なら取りやめる）。値の端数処理は呼ぶ側で行う
 */
export function drainAmmo(state: ShooterState, amount: number, params: FiringParams): void {
  if (amount <= 0 || params.infiniteAmmo) return;
  state.ammo = Math.max(0, state.ammo - amount);
  if (state.ammo > 0 || state.phase === 'reloading') return;
  if (state.phase === 'priming') startMagazine(state);
  // このフレームの射手は進め終えているので、最終弾の直後と同じく −1 する（1 回分の完了は L フレーム後）
  state.wait = Math.max(0, startReload(state, params) - 1);
}

/**
 * ルドミラ：ウィンターオーナー編（V-0163）: 最後の弾丸を撃ったのと同じフレームの弾丸チャージで残弾が戻ったら、始めたリロードを
 * 取り消して、そのマガジンのまま撃ち続ける（マガジンの状態・MG のレートの蓄積はそのまま。残弾が 0 にならなかったのと同じ）。
 * 呼ぶのは、このフレームに撃った発が最後の弾丸だったときだけ（後のフレームの弾丸チャージはリロード中に弾を足すだけ。refillAmmo）
 * @returns リロードを取り消したら true
 */
export function resumeAfterLastShotRefill(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): boolean {
  if (state.phase !== 'reloading' || state.ammo <= 0) return false;
  state.phase = 'ready';
  delete state.reloadLead;
  state.lastShot = false;
  state.wait = isChargeWeapon(shot) ? Math.max(0, chargeShotIntervalFrames(params, model) - 1) : 0;
  if (isChargeWeapon(shot)) state.chargeElapsed = 0;
  return true;
}

/**
 * Stage 11 モダニア: 使用武器の変更が終わって基礎の武器に戻るときの扱い。
 * **2026-09-24 の録画 0044 で 'refill' と確定**（起案時の仮定は 'resume' = バースト前の残弾のまま）:
 * バースト前の残弾に関係なく最大装弾数まで込め直した状態で戻る（4 回とも 224。連射中の 149 からでも 224）。
 * MG のレートの蓄積はバースト前の状態を引き継ぎ（連射中なら最高レートのまま、リロード中ならスピンアップから）、
 * どちらも殲滅モードの終わりから 1 発目まで約 22〜23f 空く（ふだんのリロード明けの 1 発目の遅延と同じとみなす）
 */
export const WEAPON_CHANGE_RESTORE = 'refill' as const;

/** Stage 11 モダニア: 使用武器の変更が終わった枠の基礎の武器の状態を戻す（state を書き換える） */
export function resumeShooter(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): void {
  // リロード中・込め終えて 1 発目を待っていた枠は、込め終えたマガジンの 1 発目から（スピンアップも最初から）
  if (state.phase !== 'ready') startMagazine(state);
  delete state.reloadLead;
  delete state.chargeElapsed;
  state.ammo = params.maxAmmo;
  state.lastShot = false;
  state.wait = reloadFirstShotFrames(shot, model, params);
}

/**
 * チャージ武器の溜めの進み（フレーム）。このフレームの stepShooter の前に呼ぶ。次の発までの残りの待ちが k のとき C + H − k（C はチャージの
 * フレーム数、H は満ちてから撃つまで。射撃姿勢維持型は stance.holdFrames、ほかは 1）で、溜め始めのフレームで 0、満ちたフレームで C、
 * 撃つフレームで C + H。0 以下は構え解除・構えの間（溜めていない）。部分チャージの進み（partialChargeProgress）は これ ÷ C。
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: きっかけ { chargeTick }・{ chargeFull } の溜め始めと満ちた時も
 * この値で決める（frame/firstPass.ts）。マガジンの中の発は、チャージ時間が溜めの途中で変わっても前の発からの経過（chargeElapsed）で
 * 待ちを決め直すので、この値は 1 フレームに 1 ずつ進む（入力が UP の 1 秒チャージの SR なら、前の発の 22f 後が溜め始め）。
 * リロード中・狙えない窓の間は呼ぶ側が溜めていないとみなす。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 前の発からの経過（chargeElapsed）があれば、待ちは前のフレームに決めた値でなく、
 * このフレームの stepShooter が決め直す値（このフレームのチャージ時間 − 経過）で見る。チャージ時間がこのフレームに変わっても（溜めの途中で
 * セブンスドワーフ・フルアクティブの 3.2 秒の固定が付く）、進みが跳ばない（変わらなければ前のフレームに決めた値と同じ）
 */
export function chargeProgressFrames(
  state: ShooterState,
  params: FiringParams,
  model: Pick<WeaponModel, 'chargeReleaseFrames' | 'aimInFrames'>,
): number {
  const wait =
    state.chargeElapsed === undefined ? state.wait : chargeWaitFrames(params, model, state.chargeElapsed + 1);
  return params.chargeFrames + holdFramesOf(params) - wait;
}

/** 満ちてから撃つまで（H）。射撃姿勢維持型は stance.holdFrames、ほかのチャージ武器は 1f（plan/design-fire-stance-cadence.md 3.2 節） */
function holdFramesOf(params: FiringParams): number {
  return params.stance?.holdFrames ?? 1;
}

/** チャージ武器の、前の発からの経過 elapsed のときの次の発までの待ち（そのフレームのチャージ時間で決める。C-0541・C-0542・C-0523） */
function chargeWaitFrames(
  params: FiringParams,
  model: Pick<WeaponModel, 'chargeReleaseFrames' | 'aimInFrames'>,
  elapsed: number,
): number {
  return Math.max(0, chargeShotIntervalFrames(params, model) - elapsed);
}

/**
 * Stage 22-B: 部分チャージで撃つときのチャージの進み p（C-0840・C-0843）。撃てない枠は null。
 * - 次の発までの残りの待ちが k のとき、p = min(1, (C + H − k) / C)（C はチャージのフレーム数、H は満ちてから撃つまで。
 *   ほかのチャージ武器は H = 1 で、満ちた次のフレームで撃つ。射撃姿勢維持型は満ちてから H フレーム待つので、その間は p = 1。
 *   plan/design-fire-stance-cadence.md 3.2 節）。0 以下は構え解除・構えの間（撃たない）。k = 0（このフレームに撃つはずだった）は p = 1。
 * - 押下チャージ型（DOWN_Charge）・チャージの無い武器は null（design-stage22.md 0.4 節。アニス：スター単騎の録画 0161 でも、
 *   的のジャンプの前にフルチャージでない発は無い。V-0134）。
 * - リロード中は null。込め終えて 1 発目を待っている（priming）枠は、そのマガジンの 1 発目の溜めの進み
 */
export function partialChargeProgress(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number | null {
  if (!isChargeWeapon(shot) || shot.inputType === 'DOWN_Charge') return null;
  if (state.phase === 'reloading') return null;
  const charge = params.chargeFrames;
  return charge <= 0 ? 1 : Math.min(1, chargeProgressFrames(state, params, model) / charge);
}

/**
 * 窓の中で撃ってハイドする（込め終えて 1 発目を待っている枠は、そのマガジンの 1 発目として撃つ）。startedFramesAgo は hideShooter と同じ
 */
function fireAndHide(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel,
  params: FiringParams,
  startedFramesAgo = 0,
): void {
  if (state.phase === 'priming') startMagazine(state);
  fire(state, shot, model, params);
  hideShooter(state, shot, model, params, startedFramesAgo);
}

/**
 * ハイド中のリロードの込め終わりを、ふだんのリロードより遅らせるフレーム（WeaponModel.hideReloadExtraFrames。射撃姿勢維持型は
 * reloadChunkFrames に入っている stanceReloadExtraFrames との差。分割リロードは 0）。込め終えた後の 1 発目の待ちからは同じだけ引く
 */
function hideReloadExtraFrames(model: WeaponModel, params: FiringParams): number {
  if (params.splitReload) return 0;
  return Math.max(0, model.hideReloadExtraFrames - (params.stance === null ? 0 : model.stanceReloadExtraFrames));
}

/**
 * Stage 16-B: 敵を狙えなくなった（窓の最初のフレーム、stepShooter の前に呼ぶ）。
 * 撃てる状態で残弾が減っていれば、ハイド中のリロードを始める（チャージ中の分は捨てる）。
 * リロード中（弾切れ）・込め終えて 1 発目を待っている・装弾数無限・満タンならそのまま。
 * C-0841（plan/design-hide-reload.md）: 込め終わりは hideReloadExtraFrames だけ遅い。
 * plan/design-hide-reload-detect.md 案 A: 射撃姿勢維持型は、前の発の姿勢の終わり（撃ってから ⌈S⌉ − H）より前には始めない。
 * startedFramesAgo は、このフレームより前に始まっていたとみなすフレーム数（射撃姿勢維持型でない武器が D の H 後に部分チャージで
 * 撃ったときの H。リロードは D から数える）
 */
export function hideShooter(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
  startedFramesAgo = 0,
): void {
  if (state.phase !== 'ready' || params.infiniteAmmo || state.ammo >= params.maxAmmo) return;
  state.hideReload = true;
  // 射撃姿勢維持型: 前の発からの経過（chargeElapsed）が姿勢の終わりに届くまで待つ
  const stance = params.stance;
  const lead = stance === null ? 0 : Math.max(0, stance.frames - stance.holdFrames - (state.chargeElapsed ?? Infinity));
  const chunk = startReload(state, params) + lead + hideReloadExtraFrames(model, params) - startedFramesAgo;
  if (chunk > 0) {
    // 最終弾の直後のリロードと同じく、窓の最初のフレームを 1 フレーム目に数える
    state.wait = chunk - 1;
    return;
  }
  loadChunks(state, shot, model, params);
}

/**
 * 狙えない窓（敵のジャンプ）の始まりのフレーム（stepShooter の前に呼ぶ）。plan/design-hide-reload-detect.md 案 A:
 * - チャージが満ちている（満ちてから撃つまでの間か、このフレームに撃つはずだった）枠は、その場で撃ち（進み 1）、ハイドする。
 * - ほかの枠は D（WeaponModel.hideDetectFrames）まで待つ（stepHide）。チャージの途中だったかは、ここで決める。
 * @returns このフレームに撃った発のチャージの進み（撃たなければ null）
 */
export function beginHide(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number | null {
  const progress = partialChargeProgress(state, shot, model, params) ?? 0;
  if (progress >= 1) {
    fireAndHide(state, shot, model, params);
    return 1;
  }
  if (state.phase === 'reloading') return null;
  const hold = progress > 0 ? holdFramesOf(params) : 0;
  state.hidePending = { framesLeft: model.hideDetectFrames + hold, progressAtStart: progress };
  return settleHide(state, shot, model, params);
}

/**
 * 狙えない窓の始まりの次のフレームから、待ち（hidePending）がある間、毎フレーム stepShooter の前に呼ぶ。
 * 待ちが尽きたら、チャージの途中だった枠は（D の H 後に）部分チャージで撃ち、ほかの枠は（D に）ハイドする。待ちが無ければ何もしない。
 * 部分チャージの発の値は、H が 1f の武器は撃つフレームの進み、H の長い射撃姿勢維持型は窓の始まりの進み（設計書 8 節）。
 * 撃った後のリロードは、射撃姿勢維持型でない武器は D から（H 前から数える）、射撃姿勢維持型は姿勢の終わりから。
 * @returns このフレームに撃った部分チャージの発の進み（撃たなければ null）
 */
export function stepHide(
  state: ShooterState,
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number | null {
  if (state.hidePending === undefined) return null;
  state.hidePending.framesLeft -= 1;
  return settleHide(state, shot, model, params);
}

/** 待ちが尽きたら、チャージの途中だった枠は部分チャージで撃ってハイドし、ほかの枠はハイドする */
function settleHide(state: ShooterState, shot: ShotParams, model: WeaponModel, params: FiringParams): number | null {
  const { framesLeft, progressAtStart } = state.hidePending!;
  if (framesLeft > 0) return null;
  delete state.hidePending;
  if (progressAtStart <= 0) {
    hideShooter(state, shot, model, params);
    return null;
  }
  if (state.phase === 'reloading') return null;
  const progress =
    holdFramesOf(params) > 1 ? progressAtStart : (partialChargeProgress(state, shot, model, params) ?? 0);
  // 射撃姿勢維持型でない武器のリロードは D から（撃った 1f 前から）数える
  fireAndHide(state, shot, model, params, params.stance === null ? 1 : 0);
  return progress;
}

/**
 * Stage 16-B: 敵を狙えるようになった（窓の明けのフレーム、stepShooter の前に呼ぶ）。stoppedFrames は窓の長さ。
 * - ハイド中のリロードが終わっていなければ取り消す（込め終えた分割リロードの分は残る。残弾は減らない）。
 * - 撃てる状態なら撃ち直す。窓が rateOfFireResetTime 以上ならレートは最初から（録画 0041 のクラウン: 間隔 23・13・10・8…）。
 *   Stage 22-C: チャージの無い武器は、明けから構え（aimInFrames）の後に撃つ（C-0114。MG は明けから 11f）。
 *   チャージ武器は構えてチャージし直す（戦闘開始と同じ待ち。C-0232）。入力が UP の RL は、明けの構えが
 *   戦闘開始より 1f 短いので、そのぶん早く撃つ（windowEndShorterFrames。C-0229）。
 * - 込め終えて 1 発目を待っている枠（窓の中でリロードが終わった）は、残りの待ちと、明けからの待ち（チャージの無い武器は構え、
 *   チャージ武器は戦闘開始と同じ待ち）の長いほう。入力が UP のチャージ武器は、ゲームのリロードの完了がモデルの完了より構え解除のぶん遅く、
 *   完了からも戦闘開始と同じ待ちで撃つ（C-0537）。完了が窓の終わりの構え解除の長さより前なら明けから、近ければ残りの待ちで撃つ
 *   （V-0135。071 の 1 回目の明け）。
 * - 弾切れのリロード中はそのまま続ける
 */
/**
 * 窓の明けに、止まっていた（ready の）枠が 1 発目を撃つまで（フレーム）。チャージ武器は構え + チャージ（入力が UP の RL は 1f 短い。
 * C-0229）、そうでない武器は構え（C-0114）。unhideShooter と、着地の後の照準の注記（frame/landing.ts。plan/design-landing-aim.md）で使う
 */
export function windowEndFirstShotFrames(
  shot: ShotParams,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): number {
  return isChargeWeapon(shot)
    ? Math.max(0, firstShotFrames(shot, model, params) - windowEndShorterFrames(shot, model))
    : model.aimInFrames;
}

export function unhideShooter(
  state: ShooterState,
  shot: ShotParams,
  stoppedFrames: number,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  params: FiringParams = firingParams(shot),
): void {
  delete state.hidePending;
  if (state.hideReload) {
    delete state.hideReload;
    if (state.phase === 'reloading') {
      delete state.reloadLead;
      state.phase = 'ready';
      state.wait = 0;
    }
  }
  if (state.phase === 'reloading') return;
  if (state.phase === 'ready' && stoppedFrames >= shot.rateOfFireResetTime * FRAMES_PER_GAME_SECOND) {
    state.shotsInMagazine = 0;
    state.acc = 0;
  }
  // チャージは狙えない間には進まないので、込め終えて 1 発目を待っていた枠も明けからチャージする（入力が UP のチャージ武器は、
  // リロードの完了が窓の終わりに近く、残りの待ちのほうが長ければそちら。C-0537。押下チャージ型は確かめていない）
  delete state.chargeElapsed;
  if (isChargeWeapon(shot)) {
    // 入力が UP の RL は、明けの構えが戦闘開始より 1f 短い（C-0229。V-0143）
    const first = windowEndFirstShotFrames(shot, model, params);
    state.wait = state.phase === 'priming' && shot.inputType !== 'DOWN_Charge' ? Math.max(state.wait, first) : first;
  } else if (state.phase === 'ready') state.wait = model.aimInFrames;
  else state.wait = Math.max(state.wait, model.aimInFrames);
}

/** 最初の frames フレームで発射したフレームの列（テスト・CLI 用） */
export function shotFramesUpTo(shot: ShotParams, frames: number, model: WeaponModel = DEFAULT_WEAPON_MODEL): number[] {
  const state = initialShooter(shot, model);
  const fired: number[] = [];
  for (let f = 0; f < frames; f++) if (stepShooter(state, shot, model)) fired.push(f);
  return fired;
}
