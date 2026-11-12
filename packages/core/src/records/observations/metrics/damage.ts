// 指標: 与ダメージと 1 ヒットの値・命中率（plan/design-stage19.md 2.3.1 節）
import { hitFrameOf } from '../../../burst/schedule.ts';
import { DISTANCE_BONUS, PER_SHOT_DAMAGE_CORE, SKILL_HIT_FULL_BURST_BONUS } from '../../../damage.ts';
import type { SimResult } from '../../../sim/engine.ts';
import { applyCritBuffs, capCritRate, pelletsPerShot } from '../../../skills/buffs.ts';
import { oneHitValue } from '../../../skills/burstDamage.ts';
import type { CharacterData } from '../../../types.ts';
import {
  atShotFrame,
  eachOrOne,
  type Metric,
  type MetricContext,
  nthActivationOf,
  slotIndexOf,
  slotOf,
  withArgs,
} from './context.ts';
import { hitMatches, slotSkillHits } from './skillHits.ts';

export const damageMetrics: Readonly<Record<string, Metric>> = {
  teamTotalDamage: { args: [], sim: (r) => r.totalDamage },
  slotTotalDamage: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).totalDamage,
  },
  rangeDamage: {
    args: ['fromSec', 'toSec'],
    sim: (r, c) => {
      const perSecond = c.args.slot === undefined ? r.damagePerSecond.total : slotOf(r.damagePerSecond.slots, c);
      return perSecond.slice(Number(c.args.fromSec), Number(c.args.toSec)).reduce((a, b) => a + b, 0);
    },
  },
  critRateAt: { args: ['slot', 'frame'], sim: critRateAt },
  hitDamage: { args: ['slot', 'frame', 'core', 'crit', 'distance'], sim: hitDamage },
  hitDamageAtShot: { args: ['slot', 'shot', 'core', 'crit', 'distance'], sim: hitDamageAtShot },
  // 対象の語彙編（plan/design-target-vocab.md 4.1 節）: 同じ区間・同じ部位の、会心した 1 ヒットと会心しない 1 ヒットの比。
  // 敵に掛かる別枠の乗数（受けるダメージ▲）と攻撃力は比で消え、倍率グループの会心の項（クリティカルダメージ）だけが残る
  critHitRatio: {
    args: ['slot', 'frame', 'core', 'distance'],
    sim: (r, c) =>
      hitDamage(r, { ...c, args: { ...c.args, crit: true } }) /
      hitDamage(r, { ...c, args: { ...c.args, crit: false } }),
  },
  coreHitRate: { args: ['slot', 'frame'], sim: coreHitRate },
  bulletHitRate: { args: ['slot', 'frame'], sim: bulletHitRate },
  coreHitRateDiff: {
    args: ['slot', 'frame', 'baseFrame'],
    sim: (r, c) => coreHitRate(r, c) - coreHitRate(r, { ...c, args: { ...c.args, frame: c.args.baseFrame! } }),
  },
  perShotHitDamage: { args: ['slot', 'frame', 'crit'], sim: perShotHitDamage },
  burstHitDamage: { args: ['slot', 'n', 'crit'], sim: burstHitDamage },
  burstHitWithSkillHits: { args: ['slot', 'n', 'crit'], sim: burstHitWithSkillHits },
  dotHitDamage: { args: ['slot', 'n', 'crit'], sim: dotHitDamage },
  dotStackTickDamage: { args: ['slot', 'frame', 'stacks', 'crit'], sim: dotStackTickDamage },
  skillHitDamage: { args: ['slot', 'n', 'crit'], sim: skillHitDamage },
  skillHitsDamage: { args: ['slot', 'n', 'count', 'crit'], sim: skillHitsDamage },
};

/**
 * ウンファ：TU S2 の撮影計画: そのフレームの区間の、通常攻撃の会心率（素の会心率 + クリティカル確率▲ + 通常攻撃のクリティカル
 * 確率▲）。録画では、その枠の通常攻撃のヒットのうち会心だった割合と比べる
 */
function critRateAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return capCritRate(
    applyCritBuffs(input.character.crit, segment.trigger.buffs).rate + segment.trigger.buffs.normalCritRate,
  );
}

/**
 * 1 ヒットの値。モデルは会心・コアを期待値で持っているので、その時点の区間の 1 トリガーの値から、
 * 倍率グループ（1 + コア + 会心 + 距離 + フルバースト）だけをパターンに差し替えて組み直す。通常攻撃の 1 ヒット。
 * SG は 1 トリガー（武器倍率 = 全ペレットの合計）を、その区間の 1 発のペレットの数（shotCount。ドロシー：セレンディピティ編の固定と
 * ペレット数▲を入れた数。skills/buffs.ts の pelletsPerShot）で割った 1 ペレットの値
 */
function hitDamage(result: SimResult, ctx: MetricContext): number {
  if ((ctx.args.source ?? 'normal') !== 'normal')
    throw new Error(`hitDamage の source ${String(ctx.args.source)} は未対応`);
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = frameArgOf(result, ctx);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  if (t.hitRate === 0 || t.boost.total === 0) throw new Error('命中率か倍率グループが 0');
  const character: CharacterData = input.character;
  const shot = t.buffs.weapon?.shot ?? character.shot;
  const core = ctx.args.core === true && ctx.input.enemy.hasCore ? shot.coreDamageRate - 1 + t.buffs.coreDamage : 0;
  const crit = ctx.args.crit === true ? applyCritBuffs(character.crit, t.buffs).damage - 1 : 0;
  // エード：エージェントバニー編（plan/design-agent-bunny.md 10 節）: distance 'model' は、その区間のモデルの距離ボーナス（条件が自動の枠では、
  // 着地点と適正最小射程距離▲ で決まる。配分の区間は重みの平均）。帯の中か外かもモデルと比べる
  const distance =
    ctx.args.distance === 'model'
      ? t.boost.distance
      : ctx.args.distance === true && character.bonusRange !== null
        ? DISTANCE_BONUS
        : 0;
  const boost = 1 + core + crit + distance + t.boost.fullBurst;
  // V-0119: 1 発のヒット数（的の表の hitsPerShot）は 1 ヒットの値に含めない
  return ((t.normal / t.hitRate / t.hitsPerShot / t.boost.total) * boost) / pelletsPerShot(shot.shotCount, t.buffs);
}

/**
 * 2 段目の段 19 の PR 2（V-0627）: 枠の shot 発目（1 始まり）の撃ったフレームの hitDamage。shot はカンマ区切りの並び（"1,7,13"）も書け、
 * そのときは発ごとの列。射撃の回数のきっかけで段が上がるスタックの攻撃力▲を、録画のその発の増分から読んだ 1 ヒットの値と比べる
 * （モデルの発のフレームは動くので、発の番号で引く）
 */
function hitDamageAtShot(result: SimResult, ctx: MetricContext): number | number[] {
  const at = (n: number): number => hitDamage(result, atShotFrame(result, ctx, n));
  return eachOrOne(ctx.args.shot, at);
}

/**
 * V-0165: その時点の区間で通常攻撃に使うコア命中率（条件が自動の枠は、着地点の表の値をその区間の命中率▲ N で出し直したもの。
 * C-0036・C-0170）。1 トリガーの倍率グループのコアの項を、コアのダメージ倍率で割って戻す。着地点の配分が複数の区間（中遠）では
 * 配分の重みの平均で、弾丸命中率の重みは付けない（録画の「コア / 当たった数」と比べるのは、配分が 1 つの区間（近・中近・遠）だけにする）
 */
function coreHitRate(result: SimResult, ctx: MetricContext): number {
  if (!ctx.input.enemy.hasCore) return 0;
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  const shot = t.buffs.weapon?.shot ?? input.character.shot;
  return t.boost.core / (shot.coreDamageRate - 1 + t.buffs.coreDamage);
}

/** その時点の区間の弾丸命中率（1 トリガーの命中の期待値。条件が自動なら的の表と着地点の値。backlog 2-25） */
function bulletHitRate(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return segment.trigger.hitRate;
}

/**
 * アニス：スター編: 射撃ごとの倍率ダメージ（perShot。「フルチャージ攻撃が命中した時、最終攻撃力の X% の追加ダメージ」など）の 1 回の値。
 * hitDamage と同じく、その時点の区間の 1 トリガーの perShot から、倍率グループ（1 + 会心 + フルバースト）だけをパターンに差し替えて
 * 組み直す。枠に射撃ごとの倍率ダメージが複数あれば合計の値になる
 */
function perShotHitDamage(result: SimResult, ctx: MetricContext): number {
  if (PER_SHOT_DAMAGE_CORE) throw new Error('perShotHitDamage はコアの補正が乗る perShot に未対応');
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = frameArgOf(result, ctx);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  if (t.hitRate === 0 || t.perShot === 0) throw new Error('命中率か射撃ごとの倍率ダメージが 0');
  const crit = applyCritBuffs(input.character.crit, t.buffs);
  const fullBurst = SKILL_HIT_FULL_BURST_BONUS ? t.boost.fullBurst : 0;
  const expected = 1 + crit.rate * (crit.damage - 1) + fullBurst;
  const pattern = 1 + (ctx.args.crit === true ? crit.damage - 1 : 0) + fullBurst;
  return (t.perShot / t.hitRate / expected) * pattern;
}

/**
 * バーストの倍率ダメージ（burstDamage）の n 回目（0 始まり）の 1 発動の値。hitDamage と同じく、
 * 会心の期待値を外して、会心したか（crit）で組み直す。効果が複数あるときは、その合計（HUD の 1 ヒットと同じとは限らない）
 */
function burstHitDamage(result: SimResult, ctx: MetricContext): number {
  const hit = slotOf(result.slots, ctx).burst.hits[Number(ctx.args.n)];
  if (hit === undefined) throw new Error(`${String(ctx.args.n)} 回目のバーストの倍率ダメージが無い`);
  return oneHitValue(hit, ctx.args.crit === true);
}

/**
 * V-0715（ヘルム：アクアマリンのバーストの電撃の敵への追加ダメージ）: 枠の n 回目（0 始まり）のバーストの倍率ダメージ（burstHitDamage）と、
 * そのヒットと同じフレームに出る同じ枠の burst スロットの倍率ダメージ（持続ダメージを除く）の和。録画では HUD の 1 つの増分に合わさる。
 * 会心（crit）はバーストの倍率ダメージにだけ当て、倍率ダメージは会心なしの値で足す。2 つが同じ値なら、録画の会心の増分はどちらが会心したかを
 * 見分けない
 */
function burstHitWithSkillHits(result: SimResult, ctx: MetricContext): number {
  const frame = hitFrameOf(nthActivationOf(result, ctx).activation);
  const skills = slotSkillHits(result, withArgs(ctx, { skill: 'burst' })).filter((h) => h.frame === frame);
  return burstHitDamage(result, ctx) + skills.reduce((sum, h) => sum + oneHitValue(h.hit, false), 0);
}

/**
 * ニヒリスター編: 持続ダメージ（dot）の n 回目（0 始まり。枠の全 tick を通した順）の 1 tick の値。burstHitDamage と同じく、
 * 会心の期待値を外して、会心したか（crit）で組み直す（plan/design-nihilister.md 4 節）。
 * コアの経路編（plan/design-anis-star-core-path.md 3.1 節）: 省略できる引数 core が true なら、コアに当たったヒットの値
 * （boost に コア倍率 − 1 を足す）。core の効果でないヒットに core: true は拒否する
 */
function dotHitDamage(result: SimResult, ctx: MetricContext): number {
  // 2 段目の段 13 の PR 2（V-0547）: hitMatches の省略できる引数 skill で、そのスロットの持続ダメージだけを数える（プリング・チェーン）。
  // 簡素化・第 7 回の案 1: 省略できる引数 frame（と fullBurst。frameArgOf）で、そのフレーム以降の tick だけを数える（skillHitDamage と同じ）
  const from = ctx.args.frame === undefined ? null : frameArgOf(result, ctx);
  const ticks = result.skillHits.filter(
    (h) =>
      h.slotIndex === slotIndexOf(ctx) &&
      h.effect.dot !== undefined &&
      hitMatches(h, ctx) &&
      (from === null || h.frame >= from),
  );
  const tick = ticks[Number(ctx.args.n)];
  if (tick === undefined) throw new Error(`${String(ctx.args.n)} 回目の持続ダメージの tick が無い`);
  if (ctx.args.core === true && tick.effect.core !== true) throw new Error('コアに当たらない効果の tick に core: true');
  return oneHitValue(tick.hit, ctx.args.crit === true, ctx.args.core === true);
}

/**
 * 持続ダメージ▲編（レイヴン。V-0227）: スタックする持続ダメージの、フレーム frame 以降の最初の tick を、スタックの数 stacks の tick に
 * 組み直した値（1 スタックの値 × stacks。会心は dotHitDamage と同じく組み直す）。録画の tick のスタックの数がモデルと違っても、
 * その時点のバフの乗り方だけを比べられる（tick は全スタックの和が 1 つのダメージ。C-0182）
 */
function dotStackTickDamage(result: SimResult, ctx: MetricContext): number {
  const frame = Number(ctx.args.frame);
  // 簡素化・第 7 回の案 1: 省略できる引数 skill（hitMatches）で、そのスロットの持続ダメージだけを見る
  const tick = result.skillHits.find(
    (h) => h.slotIndex === slotIndexOf(ctx) && h.effect.dot !== undefined && hitMatches(h, ctx) && h.frame >= frame,
  );
  if (tick === undefined) throw new Error(`フレーム ${frame} 以降に持続ダメージの tick が無い`);
  if (tick.stacks === undefined) throw new Error('スタックしない持続ダメージの tick');
  return (oneHitValue(tick.hit, ctx.args.crit === true) / tick.stacks) * Number(ctx.args.stacks);
}

/**
 * 受けるダメージ編（イサベル）: 倍率ダメージ（damage。持続ダメージを除く）の n 回目（0 始まり。枠の発動を通した順）の 1 発動の値。
 * dotHitDamage と同じく、会心の期待値を外して、会心したか（crit）で組み直す。
 * 2 段目の段 12 の PR 2（V-0537）: 省略できる引数で数える発動を絞る（hitMatches）。frame（と fullBurst。frameArgOf）= そのフレーム以降の
 * 発動だけを数える。core・distance が true なら、コアに当たった・距離ボーナスの付いたヒットの値（core・distance の効果のヒットだけ。core はコア命中ダメージ（coreHit）にも。V-0538）
 */
function skillHitDamage(result: SimResult, ctx: MetricContext): number {
  const from = ctx.args.frame === undefined ? null : frameArgOf(result, ctx);
  const hits = result.skillHits.filter(
    (h) =>
      h.slotIndex === slotIndexOf(ctx) &&
      h.effect.dot === undefined &&
      hitMatches(h, ctx) &&
      (from === null || h.frame >= from),
  );
  const hit = hits[Number(ctx.args.n)];
  if (hit === undefined) throw new Error(`${String(ctx.args.n)} 回目の倍率ダメージが無い`);
  if (ctx.args.core === true && hit.effect.core !== true && hit.effect.coreHit !== true)
    throw new Error('コアに当たらない効果のヒットに core: true');
  if (ctx.args.distance === true && hit.effect.distance !== true)
    throw new Error('距離ボーナスの付かない効果のヒットに distance: true');
  return oneHitValue(hit.hit, ctx.args.crit === true, ctx.args.core === true, ctx.args.distance === true);
}

/**
 * V-0265: 倍率ダメージの n 回目から count 回（skillHitDamage と同じ通し番号）の和。同じ発で出る 2 つの倍率ダメージ
 * （ドレイクの S2 の毎回のヒットと「5 回攻撃」）は HUD の総ダメージの 1 つの増分に乗るので、和で比べる
 */
function skillHitsDamage(result: SimResult, ctx: MetricContext): number {
  const n = Number(ctx.args.n);
  let sum = 0;
  for (let i = n; i < n + Number(ctx.args.count); i++)
    sum += skillHitDamage(result, { ...ctx, args: { ...ctx.args, n: i } });
  return sum;
}

/**
 * シンデレラ S1 編（plan/design-cinderella-s1-charge.md 3 節）: 引数 frame のフレーム。省略できる引数 fullBurst（n。0 始まり）があれば、
 * frame は n 回目のフルバーストの開始からの相対。モデルの時刻表が変わっても、録画と同じ場面（何回目のフルバーストの中か）を指す
 */
function frameArgOf(result: SimResult, ctx: MetricContext): number {
  const frame = Number(ctx.args.frame);
  if (ctx.args.fullBurst === undefined) return frame;
  const start = result.schedule?.fullBurstWindows[Number(ctx.args.fullBurst)]?.start;
  if (start === undefined) throw new Error(`${String(ctx.args.fullBurst)} 回目のフルバーストが無い`);
  return start + frame;
}
