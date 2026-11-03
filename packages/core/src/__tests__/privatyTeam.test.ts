// プリバティ（170）を含む編成: 宝物版の S1（フルバーストの開始で味方全体に 4 つの▲▼）、S2（最後の弾丸の命中で受けるダメージ▲と
// 追加ダメージ、ターゲット指定状態なら追加ダメージをもう 1 つ）、バースト（自分の有利コードの攻撃ダメージ▲・敵にターゲット指定）。
// ターゲット指定は中身を持たない敵の状態（目録の withoutContents）で、S2 の条件 enemyState だけが読む（V-0660、C-0921〜C-0924）。
import { describe, expect, it } from 'vitest';
import { parseSkillDefinition } from '../skills/types.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { piecesOf, stateItemsOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedTeam, rawDefinition, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const PRIVATY = 170;
const PRIVATY_SLOT = 2;

/** 宝物版（段階 3）のプリバティを 3 枠目に置き、水のプリバティに有利な火の敵と組む */
function team(ids: readonly number[]): TeamInput {
  const input = fixedTeam(ids, PRIVATY_SLOT, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } });
  input.slots[PRIVATY_SLOT]!.skills!.treasurePhase = 3;
  return input;
}

// 撮影の編成（リター + デルタ + プリバティ。録画 0938・0939）と、プリバティが III の実戦寄りの 5 人
const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（リター + デルタ + プリバティ）': team([82, 20, PRIVATY]),
  '実戦寄り（リター + クラウン + プリバティ + アリス + ドレイク）': team([82, 330, PRIVATY, 191, 101]),
};

describe('プリバティの定義', () => {
  it('leaves the stun condition of the base S2 unimplemented and supports every treasure slot', () => {
    const def = parseSkillDefinition(rawDefinition(PRIVATY));
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill2.support).toBe('partial');
    expect(def.skills.burst.support).toBe('supported');
    for (const slot of ['skill1', 'skill2', 'burst'] as const) {
      expect(def.treasureSkills?.[slot]?.support).toBe('supported');
    }
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const lastShots = plan.shots[PRIVATY_SLOT]!.lastShotFrames!;
  // S2 の 2 つの追加ダメージは、条件（ターゲット指定状態なら）の有無で分ける
  const hitsOf = (designated: boolean) =>
    plan.skillHits.filter(
      (h) =>
        h.slotIndex === PRIVATY_SLOT &&
        h.effect.source.skill === 'skill2' &&
        (h.effect.condition?.enemyState === 'designatedTarget') === designated,
    );

  it('gives all allies the four S1 effects when Full Burst starts (C-0924)', () => {
    const s1 = piecesOf(plan).filter((p) => p.sourceSlotIndex === PRIVATY_SLOT && p.effect.source.skill === 'skill1');
    expect(new Set(s1.map((p) => p.effect.stat))).toEqual(
      new Set(['attack', 'reloadSpeed', 'maxAmmo', 'attackDamage']),
    );
    expect(new Set(s1.map((p) => p.slotIndex))).toEqual(new Set(input.slots.map((_, i) => i)));
  });

  it('fires the S2 additional damage once per last bullet, with the Damage Taken of the same trigger (C-0921)', () => {
    expect(lastShots.length).toBeGreaterThan(10);
    const hits = hitsOf(false);
    expect(hits.map((h) => h.frame)).toEqual(lastShots);
    expect(hits[0]!.hit.damageTakenMultiplier).toBeGreaterThan(1);
  });

  it('fires the Designated Target damage only on last bullets while the enemy is in Designated Target (C-0922)', () => {
    const designated = stateItemsOf(plan).filter((s) => s.state === 'designatedTarget');
    expect(designated.length).toBeGreaterThan(0);
    const inside = (f: number) => designated.some((s) => s.start <= f && f < s.end);
    const expected = lastShots.filter(inside);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(lastShots.length);
    expect(hitsOf(true).map((h) => h.frame)).toEqual(expected);
  });

  it('applies Elemental Advantage Attack Damage only on herself', () => {
    const element = piecesOf(plan).filter(
      (p) => p.sourceSlotIndex === PRIVATY_SLOT && p.effect.stat === 'elementDamage',
    );
    expect(element.length).toBeGreaterThan(0);
    expect(element.every((p) => p.slotIndex === PRIVATY_SLOT)).toBe(true);
  });
});

describeEveryShotInOneGroup(TEAMS);
