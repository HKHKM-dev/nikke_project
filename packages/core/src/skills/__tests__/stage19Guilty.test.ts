// 2 段目の段 19 の PR 2（plan/design-skill-stage19.md 2.2 節。論点 5）: ギルティ（400）の定義。借りていくよぉ…の攻撃力のコピー
// （copyTopAttack。バフ前の攻撃力が最も高い味方を写す。C-0873）と、フルスタックのバーストの追加ダメージに同じバーストの防御力▼が乗ること（C-0874）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { fixedAttackBaseOf } from '../buffs.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };

const guilty = readJson<CharacterData>('../../../data/characters/400.json');
const sun = readJson<CharacterData>('../../../data/characters/308.json');
const liter = readJson<CharacterData>('../../../data/characters/82.json');
const literDef = parseSkillDefinition(readJson<RawDefinition>('../../../data/skills/82.json'));
const raw = readJson<RawDefinition>('../../../data/skills/400.json');
const def = parseSkillDefinition(raw);

function slotOf(character: CharacterData, definition?: SkillDefinition, attack?: number): TeamInput['slots'][number] {
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: attack ?? fixed.attack,
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: false },
    ...(definition === undefined ? {} : { skills: { definition, levels: MAX_SKILL_LEVELS } }),
  };
}

function team(slots: TeamInput['slots'], burst: boolean, controlledSlot = 0): TeamInput {
  return {
    slots,
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds: 60,
    burst,
    controlledSlot,
  };
}

describe('攻撃力のコピー（copyTopAttack）', () => {
  it('copies the highest base attack among the slots, self included', () => {
    const effect = { scaling: 'copyTopAttack' as const };
    expect(fixedAttackBaseOf(effect, 100, [{ casterBaseAttack: 100 }, null, { casterBaseAttack: 300 }])).toBe(300);
    expect(fixedAttackBaseOf(effect, 100, [{ casterBaseAttack: 100 }, { casterBaseAttack: 50 }])).toBe(100);
    // ほかのスケーリングは使い手の攻撃力のまま
    expect(fixedAttackBaseOf({ scaling: 'casterAttack' }, 100, [{ casterBaseAttack: 300 }])).toBe(100);
  });

  it('accepts copyTopAttack only on attack', () => {
    const copy = structuredClone(raw);
    copy.skills.skill1!.effects[0]!.contents = [{ stat: 'critRate', scaling: 'copyTopAttack', ref: 2 }];
    expect(() => parseSkillDefinition(copy)).toThrow(/copyTopAttack/);
  });

  it('raises the normal attacks of Guilty when an ally has a higher base attack', () => {
    const own = computeFixedSpecAttack(guilty).attack;
    const normal = (slots: TeamInput['slots']) => runSimulation(team(slots, false)).slots[0]!.normalDamage;
    const solo = normal([slotOf(guilty, def)]);
    // 効果の無い味方は、攻撃力が低ければ値を変えない。高ければ写す値が上がる
    expect(normal([slotOf(guilty, def), slotOf(sun, undefined, own / 2)])).toBeCloseTo(solo, 6);
    expect(normal([slotOf(guilty, def), slotOf(sun, undefined, own * 2)])).toBeGreaterThan(solo);
  });
});

// 撮影 G2 と同じく、リター（バースト I）とギルティ（操作）の 2 体で回す
describe('フルスタックのバースト（C-0874）', () => {
  /** バーストの防御力▼（effects[1]）を落とした定義 */
  function withoutDefenseDown(): SkillDefinition {
    const copy = structuredClone(raw);
    copy.skills.burst!.effects = copy.skills.burst!.effects.filter((e) => e.stat !== 'enemyDefenseDown');
    return parseSkillDefinition(copy);
  }
  const run = (definition: SkillDefinition) =>
    runSimulation(team([slotOf(liter, literDef), slotOf(guilty, definition)], true, 1));
  const additional = (r: ReturnType<typeof run>) =>
    r.skillHits.filter((h) => h.slotIndex === 1 && h.effect.dot === undefined).map((h) => h.hit.perActivation);

  const r = run(def);
  const bare = run(withoutDefenseDown());

  it('adds the additional damage on full stacks', () => {
    expect(additional(r).length).toBeGreaterThan(0);
    expect(additional(r).length).toBe(additional(bare).length);
  });

  it('applies the defense decrease of the same burst to the additional damage only', () => {
    // バーストスキルダメージは発動の時点の値（防御力▼が乗らない）。追加ダメージには乗る
    const burstHits = (q: ReturnType<typeof run>) => q.slots[1]!.burst.hits.map((h) => h.perActivation);
    expect(burstHits(r).length).toBeGreaterThan(0);
    burstHits(r).forEach((v, k) => expect(v).toBeCloseTo(burstHits(bare)[k]!, 6));
    expect(additional(r)[0]!).toBeGreaterThan(additional(bare)[0]!);
  });
});
