// 2 段目の段 11 の PR 3（plan/design-skill-stage11.md 2.3・3.3 節）: 回数のきっかけの発火の窓 firesDuring: "weaponChange"（モラン S1 の
// 「自分が武器変更状態の場合、通常攻撃が N 回命中した時」。H1）と、バーストスキルのクールタイム▼ の維持の付いた形（stat burstCooldown。
// T4。宝物版 S1 の熱血）。使い手はモラン（281）のバースト・S1（V-0530）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { createTriggerTracker, type FrameEvents, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const MORAN = 281;
const character = readJson<CharacterData>(`../../../data/characters/${MORAN}.json`);
const definition = parseSkillDefinition(readJson<unknown>(`../../../data/skills/${MORAN}.json`));

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
function withSkill1(...effects: unknown[]): unknown {
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-28',
    skills: { skill1: { effects }, skill2: none, burst: none },
  };
}

describe('firesDuring: "weaponChange"（発火の窓）', () => {
  const base: ShotEvent = { lastShot: false, fullCharge: false, hits: 1, coreHits: 0 };
  const changed: ShotEvent = { ...base, weaponChange: true };
  const frameOf = (frame: number, s: ShotEvent): FrameEvents => ({
    frame,
    shots: [s],
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: [],
  });
  // 基礎の武器で 4 発、変更後の武器で 7 発、基礎の武器で 2 発、変更後の武器で 3 発
  const shots = [
    ...Array.from({ length: 4 }, () => base),
    ...Array.from({ length: 7 }, () => changed),
    ...Array.from({ length: 2 }, () => base),
    ...Array.from({ length: 3 }, () => changed),
  ];
  const events = shots.map((s, i) => frameOf(i + 1, s));

  it('counts base-weapon shots too and fires only on weapon-change shots', () => {
    // 通し番号 3（基礎の武器）は発火せずに過ぎ、6・9（変更後の武器）が発火し、12（基礎の武器）は過ぎ、15（変更後の武器）が発火する
    const fires = createTriggerTracker({ count: 'normalHit', every: 3, firesDuring: 'weaponChange' }, 0, null);
    expect(events.filter((ev) => fires(ev)).map((ev) => ev.frame)).toEqual([6, 9, 15]);
  });

  it('differs from counting only the weapon-change shots (weaponChangeShot)', () => {
    const fires = createTriggerTracker({ count: 'weaponChangeShot', every: 3 }, 0, null);
    expect(events.filter((ev) => fires(ev)).map((ev) => ev.frame)).toEqual([7, 10, 15]);
  });

  it('parses the window, which is a firing window only (not a counting window)', () => {
    const damage = (trigger: unknown) => ({ kind: 'damage', trigger, damageType: 'additional', ref: 2 });
    const trigger = { count: 'normalHit', everyRef: 3, firesDuring: 'weaponChange' };
    expect(parseSkillDefinition(withSkill1(damage(trigger))).skills.skill1.effects[0]).toMatchObject({ trigger });
    expect(() =>
      parseSkillDefinition(
        withSkill1(damage({ count: 'normalHit', every: 3, during: 'weaponChange', reset: 'never' })),
      ),
    ).toThrow(/during/);
  });
});

describe('stat burstCooldown（バーストスキルのクールタイム▼ の維持の付いた形）', () => {
  const fervor = (content: Record<string, unknown>) => ({
    kind: 'state',
    state: 'fervor',
    trigger: 'battleStart',
    target: 'self',
    durationUntil: 'battleEnd',
    contents: [content],
  });

  it('needs scaling "flat" (seconds) and no decrease', () => {
    expect(() =>
      parseSkillDefinition(withSkill1(fervor({ stat: 'burstCooldown', scaling: 'flat', ref: 4 }))),
    ).not.toThrow();
    expect(() => parseSkillDefinition(withSkill1(fervor({ stat: 'burstCooldown', ref: 4 })))).toThrow(
      /burstCooldown needs scaling "flat"/,
    );
    expect(() =>
      parseSkillDefinition(withSkill1(fervor({ stat: 'burstCooldown', scaling: 'flat', ref: 4, decrease: true }))),
    ).toThrow(/do not write decrease/);
  });
});

describe('モランのバースト・S1（V-0530）', () => {
  const fixed = computeFixedSpecAttack(character);
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const run = (treasurePhase: 0 | 3, def: SkillDefinition = definition) => {
    const slot: TeamSlotInput = {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 0.5, distanceBonus: true, fullCharge: true, hitRate: 1 },
      skills: { definition: def, levels: MAX_SKILL_LEVELS, treasurePhase },
    };
    const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
    return runSimulation(input);
  };
  const treasure = run(3);
  const log = treasure.shots[0]!;
  const changed = log.weaponChangeShotFrames ?? [];
  const activations = treasure.schedule!.activations.map((a) => a.frame);

  it('starts each change 13 frames after the activation and shoots the CDN rate without a reload for 10 s', () => {
    expect(activations.length).toBeGreaterThan(1);
    for (const a of activations) {
      const window = changed.filter((f) => f > a && f <= a + gameSecondsToFrames(10));
      expect(window[0]! - a).toBe(13);
      // 1440rpm は 2f と 3f の並び。リロードの空きが無い
      expect(new Set(window.slice(1).map((f, i) => f - window[i]!))).toEqual(new Set([2, 3]));
    }
  });

  it('deals the S1 additional damage only on weapon-change shots, every 5th hit counted over the battle', () => {
    const hits = treasure.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill1');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(changed).toContain(h.frame);
      // 弾丸命中率 1 なので、命中の通し番号は射撃の通し番号
      expect(log.frames.filter((f) => f <= h.frame).length % 5).toBe(0);
    }
  });

  it('shortens the cooldown by Fervor (treasure S1) so that bursts come sooner than the base 40 s', () => {
    const base = run(0).schedule!.activations.map((a) => a.frame);
    const cooldown = gameSecondsToFrames(character.burstSkill.cooldownSeconds);
    for (let i = 1; i < base.length; i++) expect(base[i]! - base[i - 1]!).toBeGreaterThanOrEqual(cooldown);
    expect(activations.slice(1).some((f, i) => f - activations[i]! < cooldown)).toBe(true);
    expect(activations.length).toBeGreaterThan(base.length);
    // 熱血を外すと（S1 の state を消すと）基礎の CT のまま
    const withoutFervor = {
      ...definition,
      treasureSkills: {
        ...definition.treasureSkills!,
        skill1: {
          ...definition.treasureSkills!.skill1,
          effects: definition.treasureSkills!.skill1.effects.filter((e) => e.kind !== 'state'),
        },
      },
    } as SkillDefinition;
    expect(run(3, withoutFervor).schedule!.activations.length).toBe(base.length);
  });
});
