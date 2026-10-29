// 2026-10-29 のアップデートのキャラ（マリアン：クイーン 19・紅蓮：神殺 472・ラプンツェル：サンクチュアリ 473）の定義を、実戦寄りの編成で回す
// （plan/design-new-chars-1029.md。定義は仮実装で、根拠の結論は撮影の後）。臨戦の味方への▲・槍の周期と弱点露出・コア命中ダメージ・
// 居合と身剣合一・クリティカル命中の弾丸チャージと満開の間の止まり方・射撃の列のグループ分けを見る
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { ENEMY, itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf, stateItemsOf } from './historyHelpers.ts';
import { runTeam } from './runTeam.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
const MARIAN = 19;
const SCARLET = 472;
const RAPUNZEL = 473;

// リター（I）+ ラプンツェル：サンクチュアリ（II）+ マリアン：クイーン（III・操作）+ 紅蓮：神殺（III）+ クラウン（II）
const input: TeamInput = {
  slots: [fixedSlot(82), fixedSlot(RAPUNZEL), fixedSlot(MARIAN), fixedSlot(SCARLET), fixedSlot(330)],
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};
const [rapunzel, marian, scarlet] = [1, 2, 3];
const plan = planTeamRun(input);
const calc = runTeam(input);
const uses = (slot: number) => plan.schedule!.activations.filter((a) => a.slotIndex === slot).map((a) => a.frame);

describe('ラプンツェル：サンクチュアリ（473）', () => {
  it('gives the Full Burst buffs to herself and the allies in Into the Fray only', () => {
    for (const stat of ['attackDamage', 'attack'] as const) {
      const holders = new Set(
        piecesOf(plan)
          .filter((p) => p.sourceSlotIndex === rapunzel && p.effect.stat === stat && p.effect.source.skill !== 'burst')
          .map((p) => p.slotIndex),
      );
      expect(holders).toEqual(new Set([rapunzel, marian, scarlet]));
    }
  });

  it('gives the burst ATK up (caster based) to every ally', () => {
    const holders = new Set(
      piecesOf(plan)
        .filter((p) => p.sourceSlotIndex === rapunzel && p.effect.source.skill === 'burst')
        .map((p) => p.slotIndex),
    );
    expect(holders).toEqual(new Set([0, 1, 2, 3, 4]));
  });
});

describe('マリアン：クイーン（19）', () => {
  const hits = (effectIndex: number, skill: 'skill1' | 'skill2') =>
    plan.skillHits.filter(
      (h) => h.slotIndex === marian && h.effect.source.skill === skill && h.effect.effectIndex === effectIndex,
    );

  it('fires 7 spear hits every 4 s, and every 2 s after a fire while Penetrant Wish is on', () => {
    const spear = hits(1, 'skill1');
    expect(spear.length % 7).toBe(0);
    const fires = spear.filter((_, i) => i % 7 === 0).map((h) => h.frame);
    const four = gameSecondsToFrames(4) + 1;
    const two = gameSecondsToFrames(2) + 1;
    expect(fires[0]).toBe(four);
    const wish = stateItemsOf(plan).filter((s) => s.state === 'intoTheFrayPenetrantWish');
    expect(wish.length).toBe(uses(marian).length);
    fires.slice(1).forEach((f, k) => {
      const prev = fires[k]!;
      const on = wish.some((w) => w.start < prev && prev < w.end);
      expect(f - prev).toBe(on ? two : four);
    });
    expect(fires.some((f, k) => k > 0 && f - fires[k - 1]! === two)).toBe(true);
  });

  it('keeps Open Wounds (damage taken up) on the enemy from the first spear to the end', () => {
    const wounds = itemsOf(plan.history, { holder: ENEMY }).filter(
      (i) => i.origin.kind === 'state' && i.origin.state === 'openWounds',
    );
    expect(wounds).toHaveLength(1);
    expect(wounds[0]!.start).toBe(gameSecondsToFrames(4) + 1);
    expect(wounds[0]!.end).toBe(plan.frames);
    const holders = new Set(
      piecesOf(plan)
        .filter((p) => p.effect.stat === 'damageTaken')
        .map((p) => p.slotIndex),
    );
    expect(holders).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('deals the core hit damage every 2 shots only while Penetrant Wish is on', () => {
    const core = hits(1, 'skill2');
    expect(core.length).toBeGreaterThan(0);
    const wish = stateItemsOf(plan).filter((s) => s.state === 'intoTheFrayPenetrantWish');
    expect(core.every((h) => wish.some((w) => w.start < h.frame && h.frame < w.end))).toBe(true);
    expect(core.every((h) => h.hit.boost.core > 0)).toBe(true);
  });

  it('takes the core damage up on her own bursts and the sequential attack damage up otherwise', () => {
    const own = piecesOf(plan).filter((p) => p.sourceSlotIndex === marian && p.effect.source.skill === 'skill2');
    expect(own.some((p) => p.effect.stat === 'coreDamage')).toBe(true);
    expect(own.some((p) => p.effect.stat === 'sequentialAttackDamage')).toBe(true);
  });
});

describe('紅蓮：神殺（472）', () => {
  const log = plan.shots[scarlet]!;
  const changes = piecesOf(plan).filter((p) => p.slotIndex === scarlet && p.effect.stat === 'weapon');

  it('changes the weapon for 10 s on each burst', () => {
    expect(changes.length).toBeGreaterThan(0);
    // 窓の頭は持ち替えのフレームまで削る（skills/timeline.ts の weaponStartTrim）ので、10 秒より数フレーム短い
    const lengths = new Set(changes.map((p) => p.end - p.start));
    expect(lengths.size).toBe(1);
    expect([...lengths][0]).toBeGreaterThan(gameSecondsToFrames(10) - 5);
    expect([...lengths][0]).toBeLessThanOrEqual(gameSecondsToFrames(10) + 1);
  });

  it('counts critical hits with the normal attack crit rate up (15% + 35%, and 100% in At One With the Sword)', () => {
    expect(new Set(log.critHits)).toEqual(new Set([0.5, 1]));
  });

  it('refills one bullet per 2 critical hits, but not during the weapon change', () => {
    const refills = plan.instants.filter((x) => x.effect.kind === 'ammoRefill' && x.slotIndex === scarlet);
    expect(refills.length).toBeGreaterThan(0);
    const inChange = (f: number) => changes.some((p) => p.start <= f && f < p.end);
    expect(refills.every((x) => !inChange(x.frame))).toBe(true);
  });

  it('doubles Iai only while At One With the Sword is on', () => {
    const extra = plan.skillHits.filter(
      (h) => h.slotIndex === scarlet && h.effect.source.skill === 'skill1' && h.effect.effectIndex === 3,
    );
    const sword = stateItemsOf(plan).filter((s) => s.state === 'intoTheFrayAtOneWithTheSword');
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.every((h) => sword.some((s) => s.start < h.frame && h.frame < s.end))).toBe(true);
  });
});

describe('射撃の列', () => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
