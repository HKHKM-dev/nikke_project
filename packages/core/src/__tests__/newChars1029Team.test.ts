// 2026-10-29 のアップデートのキャラの語彙（plan/design-new-chars-1029.md 5 節）を、仮のキャラの編成で回す。使い手（マリアン：クイーン
// など）の定義は CDN に載ってから書く。ここでは 5.2（N 回順番に攻撃）・5.4（コア命中ダメージ）・5.5（順番攻撃ダメージ▲）の出方を見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const values = (v: string) => Array.from({ length: 10 }, () => v);

/** skill1 の値: 1 = 1 ヒットの倍率（%）、2 = ヒット数、3 = 順番攻撃ダメージ▲（%） */
function character(): CharacterData {
  const c = makeCharacter();
  const skill = (vs: string[]) => ({
    id: 1,
    name: { ja: 'テスト', en: 'Test' },
    description: { ja: '', en: '' },
    values: vs.map(values),
  });
  return { ...c, skills: { skill1: skill(['100', '7', '50']), skill2: skill([]), burst: skill([]) } };
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const spear = {
  kind: 'damage',
  trigger: { everySeconds: 4 },
  ref: 1,
  damageType: 'skill',
  hitsRef: 2,
  hitIntervalFrames: 5,
};
const sequentialUp = {
  kind: 'timed',
  trigger: 'battleStart',
  target: 'self',
  stat: 'sequentialAttackDamage',
  ref: 3,
  durationUntil: 'battleEnd',
};

function run(effects: Record<string, unknown>[], hasCore = true) {
  const definition = parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-28',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
  const enemy: EnemyInput = { defence: 100, element: null, hasCore };
  const input: TeamInput = {
    slots: [
      {
        character: character(),
        growth: { level: 1, grade: 0, core: 0 },
        attackOverride: 10_000,
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy,
    durationSeconds: 20,
    burst: false,
    controlledSlot: 0,
  };
  return planTeamRun(input);
}

describe('5.2 「N 回順番に攻撃」（damage の hitsRef・hitIntervalFrames）', () => {
  it('splits one activation into N hits, each at the value of ref, spaced by the interval', () => {
    const hits = run([spear]).skillHits;
    // 周期の発動ごとに 7 ヒット。発動の時刻は周期のきっかけのまま（plan/design-timer-ceil.md）
    expect(hits.length % 7).toBe(0);
    expect(hits.length).toBeGreaterThan(7);
    hits.forEach((h, i) => expect(h.frame - hits[i - (i % 7)]!.frame).toBe((i % 7) * 5));
    expect(hits[7]!.frame - hits[0]!.frame).toBeGreaterThanOrEqual(gameSecondsToFrames(4));
    expect(new Set(hits.map((h) => h.hit.multiplier))).toEqual(new Set([1]));
  });

  it('puts the N hits on the same frame when the interval is left out', () => {
    const { hitIntervalFrames: _, ...sameFrame } = spear;
    const hits = run([sameFrame]).skillHits;
    expect(hits.slice(0, 7).every((h) => h.frame === hits[0]!.frame)).toBe(true);
  });
});

describe('5.5 順番攻撃ダメージ▲（sequentialAttackDamage）', () => {
  it('multiplies only the sequential hits by (1 + Σ)', () => {
    const plain = run([spear]).skillHits[0]!.hit.perActivation;
    const up = run([spear, sequentialUp]).skillHits[0]!.hit;
    expect(up.sequentialAttackDamageMultiplier).toBeCloseTo(1.5, 12);
    expect(up.perActivation).toBeCloseTo(plain * 1.5, 6);
    // 「N 回順番に攻撃」でない倍率ダメージには乗らない
    const { hitsRef: _h, hitIntervalFrames: _i, ...single } = spear;
    const other = run([single, sequentialUp]).skillHits[0]!.hit.perActivation;
    expect(other).toBeCloseTo(run([single]).skillHits[0]!.hit.perActivation, 6);
  });
});

describe('5.4 コア命中ダメージ（damage の coreHit）', () => {
  const { hitsRef: _h, hitIntervalFrames: _i, ...single } = spear;

  it('adds the core term as a hit on the core (rate 1)', () => {
    const plain = run([single]).skillHits[0]!.hit;
    const core = run([{ ...single, coreHit: true }]).skillHits[0]!.hit;
    // コア倍率 2 → コアの項 1。会心の期待値 0.15 × 0.5
    expect(core.boost.core).toBeCloseTo(1, 12);
    expect(core.perActivation / plain.perActivation).toBeCloseTo((1 + 0.075 + 1) / (1 + 0.075), 9);
  });

  it('adds nothing on an enemy without a core', () => {
    const plain = run([single], false).skillHits[0]!.hit.perActivation;
    expect(run([{ ...single, coreHit: true }], false).skillHits[0]!.hit.perActivation).toBeCloseTo(plain, 9);
  });
});
