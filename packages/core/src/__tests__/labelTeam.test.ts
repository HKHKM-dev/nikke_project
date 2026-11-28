// レーベル（582。plan/design-label.md）を含む編成で、バーストの妄想共有が 10 秒付き、その間だけ S2 の攻撃力▲（スキル発動者基準）が
// レーベルを除く味方に乗るか。妄想は戦闘の終わりまで続く状態で、S2 の妄想の間のゲージ速度▲・攻撃力▲は戦闘開始から終わりまでの効果
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { statesMatching } from '../skills/states.ts';
import { staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const LABEL = 582;
const JILL = 841;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('レーベルの定義', () => {
  const def = parseSkillDefinition(rawDefinition(LABEL));

  it('defines Delusion as a barrier-family static state, Shared Delusion from the burst, and the S2 ATK up for the others', () => {
    expect(statesMatching('barrier')).toContain('delusion');
    expect(staticStatesOf(def)).toEqual(['delusion']);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'outOfScope']);
    expect(def.skills.skill2.effects).toMatchObject([
      {
        kind: 'timed',
        trigger: 'battleStart',
        target: 'self',
        stat: 'burstGaugeSpeed',
        condition: { selfState: { state: 'delusion' } },
      },
      {
        kind: 'timed',
        trigger: 'battleStart',
        target: 'self',
        stat: 'attack',
        condition: { selfState: { state: 'delusion' } },
      },
      {
        kind: 'passive',
        target: 'allies',
        excludeSelf: 'always',
        stat: 'attack',
        scaling: 'casterAttack',
        while: { selfState: { state: 'sharedDelusion' } },
      },
    ]);
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'state', state: 'sharedDelusion', trigger: 'burstUse', target: 'self' },
    ]);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['indirect']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 T（レーベル + ジル（操作））': fixedTeam([autoSlot(LABEL), null, autoSlot(JILL)], 2, { enemy: rangeEnemy }),
  '実戦寄り（レーベル + クラウン + レイヴン + アリス + クルミ）': fixedTeam([LABEL, 330, 851, 191, 862], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const l = input.slots.findIndex((x) => x?.character.resourceId === LABEL);
  const plan = planTeamRun(input);
  const starts = plan
    .schedule!.activations.filter((a) => a.slotIndex === l)
    .map(effectFrameOf)
    .filter((f) => f < plan.frames);
  const shared = itemsOf(plan.history, { holder: l, state: 'sharedDelusion' });

  it('keeps Delusion on her from the start of battle to the end (a static state, not items)', () => {
    expect(itemsOf(plan.history, { state: 'delusion' })).toEqual([]);
  });

  it('gives her Shared Delusion from each Burst of hers, for 10 s', () => {
    expect(starts.length).toBeGreaterThan(2);
    expect(shared.map((w) => w.start)).toEqual(starts);
    for (const w of shared) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });

  it('adds the S2 ATK up to every ally but her only while she has Shared Delusion', () => {
    const atk = (holder: number) =>
      itemsOf(plan.history, { sourceSlotIndex: l, holder, kind: 'while', stat: 'attack' });
    expect(atk(l)).toEqual([]);
    input.slots.forEach((slot, holder) => {
      if (slot === null || holder === l) return;
      expect(atk(holder).map((w) => [w.start, w.end])).toEqual(shared.map((w) => [w.start, w.end]));
    });
  });

  // 実戦寄りの編成（アリスとクルミがそろう）では、味方の攻撃力が上がるとほかのキャラの効果を通してレーベルの値も動くので、レーベルの値は撮影の編成だけで見る
  it("raises the others' damage against the definition without the S2 ATK up for the others", () => {
    const without = structuredClone(input);
    const raw = rawDefinition<{ skills: { skill2: { effects: unknown[] } } }>(LABEL);
    raw.skills.skill2.effects = raw.skills.skill2.effects.slice(0, 2);
    without.slots[l] = {
      ...without.slots[l]!,
      skills: { ...without.slots[l]!.skills!, definition: parseSkillDefinition(raw) },
    };
    const damage = (t: TeamInput) => runSimulation(t).slots.map((s) => s?.totalDamage ?? 0);
    const [withUp, withoutUp] = [damage(input), damage(without)];
    if (_name.startsWith('撮影')) expect(withUp[l]).toBeCloseTo(withoutUp[l]!, 3);
    input.slots.forEach((slot, holder) => {
      if (slot !== null && holder !== l) expect(withUp[holder]).toBeGreaterThan(withoutUp[holder]!);
    });
  });
});
