// スキル定義の読み込みの検査のうち、射撃と別に出る攻撃・射撃を止める効果（autoAttack・shotPause・summon）の読み込み。型は ../types.ts
import { SUMMON_IDS } from '../summons.ts';
import {
  type AutoAttackEffect,
  DOT_FIRST_TICKS,
  type DotFirstTick,
  isShotCountTrigger,
  type ShotPauseEffect,
  type SkillSlot,
  type SummonEffect,
} from '../types.ts';
import {
  assertPositiveFinite,
  fail,
  type Json,
  oneOf,
  parseAssumes,
  parseDuration,
  parseRef,
  rejectUnknownKeys,
} from './common.ts';
import { parseAppliedTrigger, parseTrigger } from './trigger.ts';

/** 周期の自動攻撃。検証の規則は dot の同じ欄と同じ */
export function parseAutoAttackEffect(v: Record<string, Json>, path: string): AutoAttackEffect {
  rejectUnknownKeys(
    v,
    [
      'kind',
      'trigger',
      'ref',
      'intervalSeconds',
      'durationRef',
      'durationSeconds',
      'firstTick',
      'gaugePerHit',
      'projectileExplosion',
      'core',
      'assumes',
      'claims',
    ],
    path,
  );
  const interval = v.intervalSeconds;
  assertPositiveFinite(interval, `${path}.intervalSeconds`);
  const effect: AutoAttackEffect = {
    kind: 'autoAttack',
    trigger: parseTrigger(v.trigger, `${path}.trigger`, { timer: true }),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...parseDuration(v, path),
  };
  if (effect.durationSeconds !== undefined && effect.durationSeconds < interval) {
    fail(`${path}.intervalSeconds`, `must not exceed the duration (${effect.durationSeconds} s)`);
  }
  if (v.firstTick !== undefined) {
    if (typeof v.firstTick !== 'string' || !(DOT_FIRST_TICKS as readonly string[]).includes(v.firstTick)) {
      fail(`${path}.firstTick`, `expected one of ${DOT_FIRST_TICKS.join(', ')}, got ${JSON.stringify(v.firstTick)}`);
    }
    effect.firstTick = v.firstTick as DotFirstTick;
  }
  if (v.gaugePerHit !== undefined) {
    if (v.gaugePerHit !== true) fail(`${path}.gaugePerHit`, 'expected true');
    if (effect.trigger !== 'burstUse' && !isShotCountTrigger(effect.trigger)) {
      fail(`${path}.gaugePerHit`, 'needs a shot count trigger or burstUse');
    }
    if ((effect.firstTick ?? 'afterInterval') !== 'afterInterval') {
      fail(`${path}.gaugePerHit`, 'needs firstTick afterInterval');
    }
    effect.gaugePerHit = true;
  }
  if (v.projectileExplosion !== undefined) {
    if (v.projectileExplosion !== true) fail(`${path}.projectileExplosion`, 'expected true');
    effect.projectileExplosion = true;
  }
  if (v.core !== undefined) {
    if (v.core !== true) fail(`${path}.core`, 'expected true');
    effect.core = true;
  }
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * V-0534: 射撃の止まり（shotPause）。きっかけは射撃の回数（during・firesDuring・stacksRef・確率は書けない）か 'burstUse'
 * （burst スロットだけ。framesOnLastShot は書けない。plan/design-privaty-burst-pause.md 2 節）
 */
export function parseShotPauseEffect(v: Record<string, Json>, path: string, slot: SkillSlot): ShotPauseEffect {
  rejectUnknownKeys(v, ['kind', 'trigger', 'frames', 'framesOnLastShot', 'assumes', 'claims'], path);
  let trigger: ShotPauseEffect['trigger'];
  const applied = parseAppliedTrigger(v.trigger, `${path}.trigger`);
  if (applied !== undefined) {
    if (v.framesOnLastShot !== undefined)
      fail(`${path}.framesOnLastShot`, 'framesOnLastShot needs a shot count trigger');
    trigger = applied;
  } else if (v.trigger === 'burstUse') {
    if (slot !== 'burst') fail(`${path}.trigger`, 'a shotPause on burstUse can only be written in the burst slot');
    if (v.framesOnLastShot !== undefined)
      fail(`${path}.framesOnLastShot`, 'framesOnLastShot needs a shot count trigger');
    trigger = 'burstUse';
  } else {
    const parsed = parseTrigger(v.trigger, `${path}.trigger`);
    if (!isShotCountTrigger(parsed))
      fail(`${path}.trigger`, 'shotPause needs a shot count trigger ({ count }), "burstUse" or { applied }');
    for (const key of ['stacksRef', 'firesDuring'] as const) {
      if (parsed[key] !== undefined) fail(`${path}.trigger.${key}`, `${key} cannot be used in shotPause`);
    }
    trigger = parsed;
  }
  const positive = (x: Json, at: string): number => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 1)
      fail(at, `expected a positive integer, got ${JSON.stringify(x)}`);
    return x;
  };
  const effect: ShotPauseEffect = { kind: 'shotPause', trigger, frames: positive(v.frames, `${path}.frames`) };
  if (v.framesOnLastShot !== undefined) {
    effect.framesOnLastShot = positive(v.framesOnLastShot, `${path}.framesOnLastShot`);
  }
  parseAssumes(v, effect, path);
  return effect;
}

/** 召喚の展開（plan/design-ein-near-feather.md 1.1 節）。burstUse はバーストにだけ書ける */
export function parseSummonEffect(v: Record<string, Json>, path: string, slot: SkillSlot): SummonEffect {
  rejectUnknownKeys(v, ['kind', 'summon', 'trigger', 'lifetimesSeconds', 'assumes', 'claims'], path);
  const summon = oneOf(SUMMON_IDS, v.summon, `${path}.summon`);
  const trigger = oneOf(['battleStart', 'burstUse'] as const, v.trigger, `${path}.trigger`);
  if (trigger === 'burstUse' && slot !== 'burst') fail(`${path}.trigger`, 'burstUse is only allowed in burst');
  const lifetimes = v.lifetimesSeconds;
  if (!Array.isArray(lifetimes) || lifetimes.length === 0)
    fail(`${path}.lifetimesSeconds`, 'expected a non-empty array');
  const lifetimesSeconds = lifetimes.map((x, k) => {
    if (x === null) return null;
    if (typeof x !== 'number' || !(x > 0))
      fail(`${path}.lifetimesSeconds[${k}]`, `expected a positive number or null, got ${JSON.stringify(x)}`);
    return x;
  });
  const effect: SummonEffect = { kind: 'summon', summon, trigger, lifetimesSeconds };
  parseAssumes(v, effect, path);
  return effect;
}
