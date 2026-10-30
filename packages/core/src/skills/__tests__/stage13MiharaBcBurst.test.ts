// 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.4〜2.6・3.2 節）: ミハラ：ボンディングチェーン（162）がバーストを使う回
// （プリング・チェーンのスタックコピーとチェーンバインドの消去、S1 のフルバースト終了時のチャージ。録画 0746・0747。V-0547、C-0746・C-0747）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { dotStacksAt, latestDotTicks } from '../../frame/dot.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
const MIHARA_BC = 162;
const raw = readJson<{ skills: { skill1: Effects; burst: Effects } }>(`../../../data/skills/${MIHARA_BC}.json`);

describe('語彙の検証', () => {
  const withBurst = (index: number, patch: Record<string, unknown>) => {
    const copy = structuredClone(raw);
    copy.skills.burst.effects[index] = { ...copy.skills.burst.effects[index], ...patch };
    return () => parseSkillDefinition(copy);
  };
  const pulling = raw.skills.burst.effects.findIndex((e) => e.kind === 'dot');
  const cancel = raw.skills.burst.effects.findIndex((e) => e.kind === 'cancelState');

  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes stacksFrom { enemyState } on dot, without maxStacksRef or perCount', () => {
    expect(withBurst(pulling, { stacksFrom: { state: 'ensnaringChains' } })).toThrow(/expected \{ enemyState \}/);
    expect(withBurst(pulling, { maxStacksRef: 4, firstTick: 'afterInterval' })).toThrow(
      /cannot be used with maxStacksRef or perCount/,
    );
  });

  it('cancels an enemy state only', () => {
    expect(withBurst(cancel, { target: 'self' })).toThrow(/expected "enemy"/);
    expect(withBurst(cancel, { extra: 1 })).toThrow(/unknown field/);
  });

  it('needs the cancelled and copied states on dots of the same definition', () => {
    expect(withBurst(cancel, { state: 'draggingChain' })).toThrow(
      /needs a dot of the same state with firstTick halfAfterLatest/,
    );
    const copy = structuredClone(raw);
    copy.skills.skill1.effects = copy.skills.skill1.effects.filter((e) => e.kind !== 'dot');
    copy.skills.burst.effects = copy.skills.burst.effects.filter((e) => e.kind !== 'cancelState');
    expect(() => parseSkillDefinition(copy)).toThrow(/stacksFrom needs a dot of the state "ensnaringChains"/);
  });

  it('allows usedBurst on counterChange only with the Full Burst start or end', () => {
    const copy = structuredClone(raw);
    const charge = copy.skills.skill1.effects.findIndex((e) => e.kind === 'counterChange' && e.condition);
    copy.skills.skill1.effects[charge] = { ...copy.skills.skill1.effects[charge], trigger: 'burstUse' };
    expect(() => parseSkillDefinition(copy)).toThrow(/usedBurst is only allowed with trigger/);
  });
});

describe('dotStacksAt と消去', () => {
  it('counts the applications after the last cancel, before the frame', () => {
    expect(dotStacksAt([0, 15, 30], [], 20, 31)).toBe(3);
    expect(dotStacksAt([0, 15, 30], [20], 20, 31)).toBe(1);
    expect(dotStacksAt([0, 15, 30], [20], 20, 30)).toBe(0);
    expect(dotStacksAt([0, 15, 30], [], 2, 31)).toBe(2);
  });

  it('stops the ticks at a cancel, and restarts from one stack', () => {
    // 0 に付け、30・89 に tick。100 で消すと次の tick（148）は出ず、200 に付け直すと 1 スタックで 230 から
    expect(latestDotTicks([0, 200], 260, 20, 59.25, [100])).toEqual([
      { frame: 30, stacks: 1 },
      { frame: 89, stacks: 1 },
      { frame: 230, stacks: 1 },
    ]);
  });
});

describe('リター・デルタ・ミハラ：ボンディングチェーンのバースト（V-0547 の撮影 A の編成）', () => {
  const ids = [82, 20, MIHARA_BC] as const;
  const characters = ids.map((id) => readJson<CharacterData>(`../../../data/characters/${id}.json`));
  const slots = characters.map((character): TeamSlotInput => {
    const fixed = computeFixedSpecAttack(character);
    return {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 0.5, distanceBonus: true, fullCharge: true, hitRate: 1 },
      skills: {
        definition: parseSkillDefinition(readJson<unknown>(`../../../data/skills/${character.resourceId}.json`)),
        levels: MAX_SKILL_LEVELS,
      },
    };
  });
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const result = runSimulation({ slots, enemy, durationSeconds: 180, burst: true, controlledSlot: 2 });
  const windows = result.schedule!.fullBurstWindows;
  const hits = result.skillHits.filter((h) => h.slotIndex === 2);
  const pulling = hits.filter((h) => h.effect.source.skill === 'burst');
  const chainTicks = hits.filter((h) => h.effect.source.skill === 'skill1' && h.stacks !== undefined);
  const attacks = hits.filter((h) => h.effect.source.skill === 'skill1' && h.effect.dot === undefined);
  const first = windows[0]!;

  it('copies the 10 Ensnaring Chains stacks into 10 Dragging Chain ticks', () => {
    const ticks = pulling.filter((h) => h.frame < first.end + 60);
    expect(ticks).toHaveLength(10);
    expect(ticks.every((h) => h.stacks === 10)).toBe(true);
  });

  it('cancels Ensnaring Chains until the recharge after the Full Burst end', () => {
    const cancelled = chainTicks.filter((h) => h.frame >= pulling[0]!.frame && h.frame < first.end);
    expect(cancelled).toEqual([]);
    const after = chainTicks.find((h) => h.frame >= first.end)!;
    const recharged = attacks.filter((h) => h.frame >= first.end && h.frame < after.frame);
    expect(recharged).toHaveLength(10);
    expect(after.stacks).toBe(10);
  });
});
