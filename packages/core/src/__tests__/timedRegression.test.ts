// Stage 6: 射撃場の実測を固定する回帰テスト。
// 録画 14（2026-09-22、plan/verification.md Stage 4 節）で、クイーン（真）の「戦闘開始時、自分に攻撃力 50.28%▲（15 秒間維持）」が
// 15 秒で切れ、1 ペレットのダメージが 47,172 → 31,381 に変わることを実測している。Stage 6 の timed（battleStart）はこれを再現する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { type TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function load<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const QUEEN = 870;
const character = load<CharacterData>(`../../data/characters/${QUEEN}.json`);
const definition = parseSkillDefinition(load(`../../data/skills/${QUEEN}.json`));
const fixed = computeFixedSpecAttack(character);

// 録画 14 と同じ条件: 灼熱の的（炎属性なので有利なし）、非コア・距離ボーナスなし。会心は 1 ヒットごとなので期待値を外して読む
const slot: TeamSlotInput = {
  character,
  growth: fixed.growth,
  attackOverride: fixed.attack,
  condition: { coreHitRate: 0, distanceBonus: false, fullCharge: false },
  skills: { definition, levels: MAX_SKILL_LEVELS },
};

/** 1 ペレットの非コア非会心ダメージ（HUD のポップアップ数値に対応）。倍率グループから会心期待値を外す */
function perPelletNonCrit(trigger: {
  baseHit: number;
  weaponMultiplier: number;
  boost: { crit: number; total: number };
  attackDamageMultiplier: number;
  elementMultiplier: number;
}): number {
  const withoutCrit = trigger.boost.total - trigger.boost.crit;
  return (
    (trigger.baseHit *
      trigger.weaponMultiplier *
      withoutCrit *
      trigger.attackDamageMultiplier *
      trigger.elementMultiplier) /
    character.shot.shotCount
  );
}

/** 灼熱の的（BigArms）。クイーン（真）も炎なので属性有利なし */
const enemy = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire' as const, hasCore: false };

describe('録画 14: クイーン（真）の戦闘開始時 攻撃力 +50.28%（15 秒）', () => {
  // バーストなし（burst: false）でも battleStart は発火する。180 秒を「0〜15 秒」「15 秒〜」に割る
  const team = computeTeamDamage({ slots: [slot], enemy, durationSeconds: 180 });
  const s = team.slots[0]!;

  it('splits the battle at 15 s', () => {
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0]).toMatchObject({ start: 0, end: 900 });
    expect(s.windows[0]?.effect.trigger).toBe('battleStart');
    expect(s.segments.map((g) => [g.seconds, g.buffs.attackRatio !== 0])).toEqual([
      [15, true],
      [165, false],
    ]);
  });

  it('applies the +50.28% only in the first 15 s and keeps attackDamage +30% throughout', () => {
    expect(fixed.attack).toBe(119896);
    expect(s.segments[0]!.buffs.attackRatio).toBeCloseTo(0.5028, 12);
    expect(s.segments[1]!.buffs.attackRatio).toBe(0);
    for (const g of s.segments) expect(g.trigger.attackDamageMultiplier).toBeCloseTo(1.3, 12);
    expect(s.segments[0]!.trigger.attack).toBeCloseTo(119896 * 1.5028, 6);
    expect(s.segments[1]!.trigger.baseHit).toBe(119796);
  });

  it('reproduces the measured 1-pellet numbers 47,172 → 31,381', () => {
    // 15 秒以内: (119,896 × 1.5028 − 100) × 0.2015 × 1.30 = 47,171.9
    expect(perPelletNonCrit(s.segments[0]!.trigger)).toBeCloseTo(47171.9, 0);
    // 15 秒経過後: 119,796 × 0.2015 × 1.30 = 31,380.6
    expect(perPelletNonCrit(s.segments[1]!.trigger)).toBeCloseTo(31380.6, 0);
    // 会心は ×1.5 なので 70,757.8 / 47,070.8（録画 14 の実測 70,758 / 47,071）
    expect(perPelletNonCrit(s.segments[0]!.trigger) * 1.5).toBeCloseTo(70757.8, 0);
    expect(perPelletNonCrit(s.segments[1]!.trigger) * 1.5).toBeCloseTo(47070.8, 0);
  });

  it('adds the fullBurstEnd window on top once bursts are running', () => {
    const withBurst = computeTeamDamage({
      slots: [slot],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    const b = withBurst.slots[0]!;
    // battleStart 1 本 + fullBurstEnd 8 本（最後のフルバースト窓は戦闘終了で切れる）
    expect(b.windows.filter((w) => w.effect.trigger === 'battleStart')).toHaveLength(1);
    expect(b.windows.filter((w) => w.effect.trigger === 'fullBurstEnd')).toHaveLength(8);
    // 前サイクルの 15 秒窓（1200k〜1200k+900）が発動フレーム 1200k+600 に生きているので、2 回目以降のバーストヒットは強い
    const hits = b.burst.activations.map((a) => a.hit.baseHit);
    expect(hits[0]).toBeCloseTo(119896 * 1.5028 - 100, 6); // battleStart の窓 [0, 900) に 600f が入る
    expect(hits[1]).toBeCloseTo(119896 * 1.5028 - 100, 6); // fullBurstEnd の窓 [1200, 2100) に 1800f が入る
    expect(new Set(hits.map((h) => Math.round(h))).size).toBe(1);
  });
});
