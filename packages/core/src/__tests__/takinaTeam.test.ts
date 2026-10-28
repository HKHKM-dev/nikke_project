// たきな（861）を含む編成（V-0507。plan/design-skill-unrecorded.md 2 節）。
// S1: 戦闘開始時とフルバーストタイム終了時の自分の攻撃力▲（5 秒）、フルバーストタイム発動時の防御力無視ダメージ▲（V-0531）。
// S2: 15 秒ごとの敵全体の受けるダメージ▲と味方全体の防御力無視ダメージ▲（V-0531。周期は C-0418）。
// バースト: 使用武器の変更（チャージしない 150rpm・リロードしない 10 秒）と命中した敵の受けるダメージ▲（V-0531。段 11 の PR 4）。
// 射撃の列のグループ分け。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const TAKINA = 861;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = { character: c, growth: fixed.growth, attackOverride: fixed.attack, condition: MANUAL };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number, burst: boolean): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst, controlledSlot };
}

describe('たきなの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${TAKINA}.json`));

  it('defines every damage-relevant line of S1, S2 and the burst (only the unexplained missing shots stay in notes)', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toEqual([
      expect.objectContaining({ kind: 'timed', trigger: 'battleStart', target: 'self', stat: 'attack', ref: 1 }),
      expect.objectContaining({ kind: 'timed', trigger: 'fullBurstEnd', target: 'self', stat: 'attack', ref: 1 }),
      expect.objectContaining({ kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'trueDamage', ref: 3 }),
    ]);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toEqual([
      expect.objectContaining({ trigger: { everySeconds: 15 }, target: 'allies', stat: 'damageTaken', ref: 1 }),
      expect.objectContaining({ trigger: { everySeconds: 15 }, target: 'allies', stat: 'trueDamage', ref: 4 }),
    ]);
    // 変更後の武器の発が総ダメージに出ない回（V-0531）だけが未対応の notes
    expect(def.skills.burst.support).toBe('partial');
    expect((def.skills.burst.notes ?? []).filter((n) => n.kind === 'unimplemented')).toHaveLength(1);
    expect(def.skills.burst.effects[0]).toMatchObject({
      kind: 'weaponChange',
      trueDamage: true,
      instantFire: true,
      firstShotDelayFrames: 12,
      infiniteAmmo: true,
    });
  });

  it('rejects infiniteAmmo on a weapon change that ends when its magazine is empty', () => {
    const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
    const change = { kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, maxAmmoRef: 2, infiniteAmmo: true };
    expect(() =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-28',
        skills: { skill1: none, skill2: none, burst: { effects: [change] } },
      }),
    ).toThrow(/infiniteAmmo cannot be combined with maxAmmoRef/);
  });
});

// V-0531 の編成（リター・I-DOLL・サン・たきな（操作））
describe('リター + I-DOLL・サン + たきな', () => {
  const input = team([fixedSlot(82), fixedSlot(308), fixedSlot(TAKINA)], 2, true);
  const plan = planTeamRun(input);
  const activations = (plan.schedule?.activations ?? []).filter((a) => a.slotIndex === 2);
  const changed = plan.shots[2]!.weaponChangeShotFrames ?? [];

  it('fires the changed weapon 13 frames after the Burst II activation (8 after the hexagon change; C-0708)', () => {
    expect(activations.length).toBeGreaterThan(0);
    for (const a of activations) expect(changed.find((f) => f > a.frame)! - a.frame).toBe(13);
  });

  it('fires 25 uncharged shots in 10 s at 150 rpm without reloading', () => {
    const a = activations[0]!.frame;
    const mine = changed.filter((f) => f > a && f < a + 600);
    expect(mine).toHaveLength(25);
    const gaps = new Set(mine.slice(1).map((f, i) => f - mine[i]!));
    expect([...gaps].sort()).toEqual([23, 24]);
  });
});

describe('たきな単騎', () => {
  const input = team([fixedSlot(TAKINA)], 0, false);
  const plan = planTeamRun(input);

  // ゲーム内の 5 秒は 294 フレーム（C-0050）
  it('puts the S1 ATK on self from the first frame for 5 s of game time', () => {
    const pieces = slotPieces(plan, 0).filter((p) => p.effect.stat === 'attack');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ start: 0, end: 294 });
  });
});

const TEAMS: Record<string, TeamInput> = {
  単騎: team([fixedSlot(TAKINA)], 0, false),
  'ラム + デルタ + たきな + I-DOLL・サン': team(
    [fixedSlot(822), fixedSlot(20), fixedSlot(TAKINA), fixedSlot(308)],
    2,
    true,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
