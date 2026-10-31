// 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3・3.3 節）: エイダ（840）。フルバーストの中だけ出る周期の倍率ダメージ（周期のきっかけと
// 条件 inFullBurst）、名前の無い窓の
// 周期の短縮（periodShorten の window。縮めた次の発動のフレームだけで見る）、防御力無視の倍率ダメージ（damageType "true"）、
// burstUsers の基本バースト段階、特殊改造（チャージ速度▼の発数の維持）（V-0569）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BurstSchedule } from '../../burst/schedule.ts';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { gameSecondsToFirstFrame } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { computeBurstHit } from '../burstDamage.ts';
import { shortenedTimerFrames, timerDamageFrames } from '../timeline.ts';
import { parseSkillDefinition } from '../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const def = (skill2: unknown[], skill1: unknown[] = []) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-31',
  skills: { skill1: skill1.length > 0 ? { effects: skill1 } : none, skill2: { effects: skill2 }, burst: none },
});
const grenade = {
  kind: 'damage',
  trigger: { everySeconds: 2, carry: true },
  condition: { inFullBurst: true },
  damageType: 'true',
  ref: 2,
  periodShorten: { window: { trigger: 'burstUse', durationRef: 4 }, slot: 'skill2', ref: 3 },
};

describe('語彙（V-0569）', () => {
  it('parses the unnamed window of periodShorten and true damage', () => {
    const parsed = parseSkillDefinition(def([grenade]));
    expect(parsed.skills.skill2.effects[0]).toMatchObject(grenade);
  });

  it('rejects malformed windows and a window with gaugePerHit', () => {
    expect(() =>
      parseSkillDefinition(def([{ ...grenade, condition: undefined, delayFrames: 6, gaugePerHit: true }])),
    ).toThrow(/periodShorten window/);
    expect(() =>
      parseSkillDefinition(def([{ ...grenade, periodShorten: { ...grenade.periodShorten, state: 'persona' } }])),
    ).toThrow(/exactly one of state and window/);
    expect(() =>
      parseSkillDefinition(
        def([
          {
            ...grenade,
            periodShorten: { window: { trigger: 'fullBurstStart', durationRef: 4 }, slot: 'skill2', ref: 3 },
          },
        ]),
      ),
    ).toThrow(/expected "burstUse"/);
  });

  it('allows targetBurstStep on burstUsers (timed and heal) but not on self', () => {
    const s1 = { trigger: 'fullBurstStart', target: 'burstUsers', targetBurstStep: 'Step3' };
    const parsed = parseSkillDefinition(
      def(
        [grenade],
        [
          { kind: 'timed', ...s1, stat: 'attack', scaling: 'casterAttack', ref: 1, durationRef: 2 },
          { kind: 'heal', ...s1, ref: 5, durationRef: 6 },
        ],
      ),
    );
    expect(parsed.skills.skill1.effects.map((e) => 'targetBurstStep' in e && e.targetBurstStep)).toEqual([
      'Step3',
      'Step3',
    ]);
    expect(() =>
      parseSkillDefinition(def([grenade], [{ kind: 'heal', ...s1, target: 'self', ref: 5, durationRef: 6 }])),
    ).toThrow(/only allowed with target "allies" or "burstUsers"/);
  });
});

describe('周期の発火の窓と短縮（C-0787・C-0788）', () => {
  const frames = 3000;
  const second = (s: number) => gameSecondsToFirstFrame(s);
  // 自分のバースト使用 a と、その 6f 後からのフルバーストの窓（588f）
  const scheduleOf = (a: number): BurstSchedule =>
    ({
      model: 'dynamic',
      activations: [
        { frame: a, step: 'III', slotIndex: 0, startsFullBurst: true, enteredStep: null, fullBurstStart: a + 6 },
      ],
      fullBurstWindows: [{ start: a + 6, end: a + 594, burstUsers: [0] }],
      fullBurstFramesTotal: 588,
      gaugeFullFrames: [],
      chainTimeouts: [],
      cooldownReductions: [],
    }) as unknown as BurstSchedule;
  const trigger = { everySeconds: 2, carry: true as const };
  // 2 パス目は、発火のフレームを条件 inFullBurst で絞る（frame/plan.ts の damageConditionHolds）
  const inFullBurst = (a: number) => (f: number) => a + 6 <= f && f < a + 594;
  const window = { window: { trigger: 'burstUse' as const, durationFrames: 588 }, seconds: 1 };
  const noState = () => false;

  it('counts from the start of battle and fires only inside Full Burst', () => {
    // バースト使用が 50.5 秒: 窓の外の 2 秒の格子は数え続け、窓の中の 52・54・…秒だけ出る（縮めなければ）
    const a = second(50.5);
    const fires = timerDamageFrames(trigger, undefined, frames * 2, scheduleOf(a), 0, noState);
    expect(fires.filter(inFullBurst(a))).toEqual([52, 54, 56, 58, 60].map(second));
  });

  it('shortens when the shortened next tick is in the window, without looking at the previous tick', () => {
    // 50 秒の発動は窓の前。縮めた次（51 秒）が窓の中なので 51 秒から 1 秒ごと（C-0738 の形なら 52 秒から）
    const a = second(50.5);
    const fires = timerDamageFrames(trigger, window, frames * 2, scheduleOf(a), 0, noState);
    expect(fires.filter(inFullBurst(a))).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map(second));
    const inWindow = (f: number) => a <= f && f < a + 588;
    const marian = shortenedTimerFrames(trigger, 1, frames * 2, inWindow).filter(inFullBurst(a));
    expect(marian[0]).toBe(second(52));
  });
});

describe('防御力無視の倍率ダメージ（C-0783）', () => {
  it('does not subtract defence and adds true damage up to the attack damage group', () => {
    const base = {
      attack: 100_000,
      enemy: { defence: 10_000, element: 'Fire', hasCore: true } as EnemyInput,
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier: 1.2,
      elementMultiplier: 1,
      fullBurstBonus: true,
      trueDamage: 0.6,
    };
    const effect = { source: { resourceId: 1, skill: 'skill2' as const, name: { ja: '', en: '' } }, multiplier: 4.2 };
    const hit = computeBurstHit({ ...base, effects: [{ ...effect, damageType: 'true' }] });
    const skill = computeBurstHit({ ...base, effects: [{ ...effect, damageType: 'skill' }] });
    // 防御力を引かず、(1 + 0.2 + 0.6) の和。フルバースト補正 +50%
    expect(hit.perActivation).toBeCloseTo(100_000 * 4.2 * 1.8 * 1.5, 6);
    expect(skill.perActivation).toBeCloseTo(90_000 * 4.2 * 1.2 * 1.5, 6);
  });
});

describe('エイダ（V-0569）', () => {
  const read = (rid: number) => ({
    character: readJson<CharacterData>(`../../../data/characters/${rid}.json`),
    definition: parseSkillDefinition(readJson<Record<string, unknown>>(`../../../data/skills/${rid}.json`)),
  });
  const slotOf = (rid: number): TeamSlotInput => {
    const { character, definition } = read(rid);
    const fixed = computeFixedSpecAttack(character);
    return {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
      skills: { definition, levels: MAX_SKILL_LEVELS, treasurePhase: 0 },
    };
  };
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  // 撮影 C の編成（リター・デルタ・エイダ）
  const input: TeamInput = {
    slots: [slotOf(82), slotOf(20), slotOf(840)],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  };
  const result = runSimulation(input);
  const schedule = result.schedule!;
  const ada = 2;

  it('throws Flash Grenades only inside Full Burst, every 1 s after her own Burst, 6 f after the tick', () => {
    const hits = result.skillHits.filter((h) => h.slotIndex === ada && h.effect.source.skill === 'skill2');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      const tick = h.frame - 6;
      expect(schedule.fullBurstWindows.some((w) => w.start <= tick && tick < w.end)).toBe(true);
    }
    const first = schedule.fullBurstWindows[0]!;
    const inFirst = hits.filter((h) => h.frame - 6 < first.end).map((h) => h.frame);
    expect(new Set(inFirst.slice(1).map((f, i) => f - inFirst[i]!))).toEqual(new Set([58, 59]));
  });

  it('gives Special Modification to the first shot after her Burst only (charge time ×4)', () => {
    const shots = result.shots[ada]!.frames;
    const activation = schedule.activations.find((a) => a.slotIndex === ada)!.frame;
    const after = shots.filter((f) => f > activation);
    // 次の発は 82f 後（▼は 1 発で切れる）。特殊改造の発は、前の発から 4 倍の溜め（59 × 4 = 236f）の後
    expect(after[1]! - after[0]!).toBe(82);
    const before = shots.filter((f) => f <= activation).at(-1)!;
    expect(after[0]! - before).toBeGreaterThan(236);
  });
});
