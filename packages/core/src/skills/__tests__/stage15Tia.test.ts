// 2 段目の段 15 の PR 2（plan/design-skill-stage15.md 2.2・3.2 節）: ティア（451）。きっかけ { coverHealed }（「遮蔽物の HP を回復した時」）は、
// 段 17 の PR 1 から、自分の枠が遮蔽物 HP 回復（coverHeal）を受けた出来事で発火する。T4 の▼は、発動の後に付いたもの（同じ発動から付いたものも）も
// 走っている CT を縮める（V-0566）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TIA = 451;
const character = readJson<CharacterData>(`../../../data/characters/${TIA}.json`);
const rawDefinition = readJson<Record<string, unknown>>(`../../../data/skills/${TIA}.json`);
const definition = parseSkillDefinition(rawDefinition);

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const cooldown = { kind: 'timed', target: 'self', stat: 'burstCooldown', scaling: 'flat', ref: 1, durationRef: 3 };
const coverHeal = { kind: 'coverHeal', trigger: 'burstUse', target: 'self', ref: 5 };
const def = (skill1: unknown[], skill2: unknown[]) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-31',
  skills: { skill1: { effects: skill1 }, skill2: skill2.length > 0 ? { effects: skill2 } : none, burst: none },
});

describe('{ coverHealed }（遮蔽物の HP を回復した時）', () => {
  // 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節）: 置き換えでなく、遮蔽物 HP 回復を受けた出来事のきっかけとして読む
  it('keeps the trigger as the cover-healed event', () => {
    const parsed = parseSkillDefinition(def([{ ...cooldown, trigger: { coverHealed: true } }], [coverHeal]));
    expect(parsed.skills.skill1.effects[0]).toMatchObject({ trigger: { coverHealed: true } });
    expect(parsed.skills.skill2.effects[0]).toMatchObject({ kind: 'coverHeal', trigger: 'burstUse', target: 'self' });
    const resolved = resolveTimed(definition, character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill1');
    expect(resolved.map((e) => e.trigger)).toEqual([{ coverHealed: true }, { coverHealed: true }]);
  });

  it('needs no coverHeal in the same definition and is only allowed in timed', () => {
    expect(() => parseSkillDefinition(def([{ ...cooldown, trigger: { coverHealed: true } }], []))).not.toThrow();
    expect(() =>
      parseSkillDefinition(
        def([{ kind: 'damage', trigger: { coverHealed: true }, damageType: 'skill', ref: 1 }], [coverHeal]),
      ),
    ).toThrow(/only allowed in timed/);
    expect(() =>
      parseSkillDefinition(def([{ ...cooldown, trigger: { coverHealed: true, x: 1 } }], [coverHeal])),
    ).toThrow(/unknown field/);
    expect(() =>
      parseSkillDefinition(def([{ ...cooldown, trigger: 'burstUse' }], [{ ...coverHeal, target: 'enemy' }])),
    ).toThrow(/"self", "allies" or "lowestCoverHp"/);
  });
});

describe('ティア（V-0566）', () => {
  const run = (d: SkillDefinition) => {
    const fixed = computeFixedSpecAttack(character);
    const slot: TeamSlotInput = {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
      skills: { definition: d, levels: MAX_SKILL_LEVELS, treasurePhase: 0 },
    };
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
    const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
    return runSimulation(input);
  };

  it('shortens the cooldown of the activation that applied the S1 decrease (5 bursts alone, 4 without it)', () => {
    // C-0775: 単騎の発動の間隔はゲージで決まる（CT 40 − 13 = 27 秒）。▼が無ければ CT 40 秒が律速
    const withS1 = run(definition);
    const skills = definition.skills;
    const withoutS1 = run({
      ...definition,
      skills: { ...skills, skill1: { ...skills.skill1, effects: skills.skill1.effects.slice(1) } },
    });
    expect(withS1.schedule!.activations).toHaveLength(5);
    expect(withoutS1.schedule!.activations).toHaveLength(4);
    const shortened = withS1.schedule!.activations.map((a) => a.cooldownShortenedFrames ?? 0);
    expect(shortened.slice(0, 4).every((f) => f > 0)).toBe(true);
  });

  // S1 の▼の 1 スタックの秒（値 01。Lv10 で 13 秒）
  const STACK_SECONDS = Number(character.skills.skill1.values[0]![9]);

  // 単騎の発動の間隔（30 秒あまり）は維持 12 秒より長いので、どの発動の▼も、その発動から付いた 1 スタック（発動の後に付いた件を縮める
  // 処理。frame/firstPass.ts の burstCooldownStartedAt）だけ
  it('shortens each cooldown by 13 s from the stack its own activation applies', () => {
    const shortened = run(definition).schedule!.activations.map((a) => a.cooldownShortenedFrames ?? 0);
    expect(shortened.length).toBeGreaterThan(2);
    for (const f of shortened) expect(f).toBe(gameSecondsToFrames(STACK_SECONDS));
  });

  // 2 スタック（スタック数 × 13 秒。plan/design-skill-stage15.md 2.2 節）: 維持を 60 秒に延ばした定義で、前の発動の▼が残っている間に次の
  // 発動を迎える。2 回目は発動の時に付いていた 1 スタック（発動の前のフレームの件）と、その発動から付いた 2 スタック目（発動の後に付いた件）で
  // 13 + 13 秒。3 回目からは発動の時に 2 スタック（26 秒）で、上限なので新しいスタックは付かない
  it('shortens by 13 s per stack when the decrease stacks to 2', () => {
    const json = structuredClone(rawDefinition) as { skills: { skill1: { effects: Record<string, unknown>[] } } };
    const s1 = json.skills.skill1.effects[0]!;
    delete s1.durationRef;
    s1.durationSeconds = 60;
    const shortened = run(parseSkillDefinition(json)).schedule!.activations.map((a) => a.cooldownShortenedFrames ?? 0);
    expect(shortened.length).toBeGreaterThan(3);
    expect(shortened.slice(0, 2)).toEqual([gameSecondsToFrames(STACK_SECONDS), 2 * gameSecondsToFrames(STACK_SECONDS)]);
    for (const f of shortened.slice(2)) expect(f).toBe(gameSecondsToFrames(2 * STACK_SECONDS));
  });
});
