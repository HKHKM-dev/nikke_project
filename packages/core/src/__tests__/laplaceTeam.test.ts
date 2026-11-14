// ラプラス編（plan/design-laplace.md）: ラプラス（100）を含む編成で、S1 のヒーロービジョン（フルチャージごとのスタック）、
// 宝物版 S2 のフルチャージごとの追加ダメージ、バーストの使用武器変更（ビーム）・初回ダメージ・フルスタックの時の防御力無視ダメージが
// 意図どおりに出るか（V-0772。C-1200・C-1201・C-1204〜C-1206）
import { describe, expect, it } from 'vitest';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rawDefinition, readJson } from './teamHelpers.ts';

const LAPLACE = 100;

type Entry = { effects: Record<string, unknown>[] };
type Raw = { skills: Record<string, Entry>; treasureSkills: Record<string, Entry> };

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

/** 撮影の編成（ココア + ソルジャーF.A. + ラプラス（操作））。ラプラスは 3 枠目 */
function rangeTeam(treasurePhase: TreasurePhase, raw?: Raw): TeamInput {
  const slots = [311, 301].map((id): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' }));
  const laplace: TeamSlotInput = { ...fixedSlot(LAPLACE, raw), conditionMode: 'auto' };
  laplace.skills!.treasurePhase = treasurePhase;
  return { slots: [...slots, laplace], enemy: rangeEnemy, durationSeconds: 180, burst: true, controlledSlot: 2 };
}

/** 宝物版のヒーロービジョンを 3 秒にした定義（バーストの途中で切れる回を作る） */
function shortVision(): Raw {
  const raw = structuredClone(rawDefinition<Raw>(LAPLACE));
  const grant = raw.treasureSkills.skill1!.effects[0]!;
  delete grant.durationRef;
  grant.durationSeconds = 3;
  return raw;
}

const CASES: Record<string, { input: TeamInput; treasure: boolean }> = {
  '撮影の編成・宝物版（段階 3）': { input: rangeTeam(3), treasure: true },
  '撮影の編成・基礎版': { input: rangeTeam(0), treasure: false },
  '撮影の編成・宝物版・ヒーロービジョンが途中で切れる': { input: rangeTeam(3, shortVision()), treasure: true },
  '実戦寄り（リター + ドレイク + ラプラス + アリス + クラウン）': {
    input: fixedTeam([82, 101, LAPLACE, 191, 330], 2),
    treasure: false,
  },
};
const L = 2;

describe.each(Object.entries(CASES))('編成: %s', (name, { input, treasure }) => {
  const plan = planTeamRun(input);
  const changed = plan.shots[L]!.weaponChangeShotFrames ?? [];
  const weapon = itemsOf(plan.history, { sourceSlotIndex: L, holder: L, kind: 'timed', skill: 'burst', stat: 'weapon' });
  const vision = itemsOf(plan.history, { holder: L, kind: 'state', state: 'heroVision' });
  // 倍率ダメージの条件 selfState と同じ見え方（frame より前に付いて frame に続いている件）
  const fullAt = (f: number) => vision.some((w) => w.stack === 5 && w.start < f && f < w.end);
  const activations = plan.schedule!.activations.filter((a) => a.slotIndex === L);
  const hitsOf = (skill: string) => plan.skillHits.filter((h) => h.slotIndex === L && h.effect.source.skill === skill);

  it('stacks Hero Vision up to 5 on fully charged shots', () => {
    expect(Math.max(...vision.map((w) => w.stack ?? 1))).toBe(5);
  });

  it('fires the beam every 2 or 3 frames without reloading, through each Burst', () => {
    expect(weapon.length).toBe(activations.length);
    expect(weapon.length).toBeGreaterThanOrEqual(3);
    // 的のジャンプ（撃てない窓）にかかる回は発が少ない
    const counts = weapon.map((w) => {
      const inside = changed.filter((f) => f >= w.start && f < w.end);
      expect(inside.slice(1).every((f, k) => [2, 3].includes(f - inside[k]!))).toBe(true);
      return inside.length;
    });
    expect(Math.max(...counts)).toBeGreaterThan(100);
  });

  it('starts the beam 6 frames and lands the first damage 7 frames after 00.00 (treasure version)', () => {
    if (!treasure) return;
    activations.forEach((a, k) => {
      expect(changed.find((f) => f >= weapon[k]!.start)! - hexagonFrameOf(a)).toBe(6);
      expect(hitFrameOf(a) - hexagonFrameOf(a)).toBe(7);
    });
  });

  it('makes the beam true damage only when Hero Vision is at max stacks at the Burst (judged once)', () => {
    for (const w of weapon) {
      const effect = w.origin.kind === 'timed' ? w.origin.effect : null;
      expect(effect?.weapon?.trueDamage === true).toBe(treasure && fullAt(w.start));
    }
  });

  it('deals the true damage on each beam shot while at max stacks, and two more on the first-damage frame', () => {
    const burst = hitsOf('burst');
    const perShot = burst.filter((h) => h.effect.trigger !== 'burstUse');
    expect(perShot.map((h) => h.frame)).toEqual(changed.filter(fullAt));
    const onHit = burst.filter((h) => h.effect.trigger === 'burstUse');
    expect(onHit.length).toBe(2 * activations.filter((a) => fullAt(hitFrameOf(a))).length);
    for (const h of onHit) expect(activations.some((a) => hitFrameOf(a) === h.frame)).toBe(true);
    if (name.includes('途中で切れる')) {
      // 切れる前の発には出て、切れた後の発には出ない。ビームは防御力無視のまま
      expect(perShot.length).toBeGreaterThan(0);
      expect(changed.some((f) => !fullAt(f))).toBe(true);
    }
  });

  it('deals the S2 additional damage on fully charged shots only, not on the beam shots', () => {
    const changedSet = new Set(changed);
    expect(hitsOf('skill2').length).toBeGreaterThan(0);
    expect(hitsOf('skill2').some((h) => changedSet.has(h.frame))).toBe(false);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
