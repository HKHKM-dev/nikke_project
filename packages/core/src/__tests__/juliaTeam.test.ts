// ジュリア編（plan/design-julia.md）: ジュリア（150）を含む編成で、S1 のクールタイムごとの▲と戦闘開始時の強制使用、S2 のクレッシェンドの
// スタック（宝物版はクリティカル命中の期待値の回数、基礎版は最後の弾丸）、マルカートとその会心の追加ダメージ（onSkillCrit）、バーストの
// フルスタックの時の追加ダメージが意図どおりに出るか（V-0792）
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hitFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFirstFrame } from '../time.ts';
import { itemsOf } from '../skills/holders.ts';
import { applyTreasure, type TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam, readJson } from './teamHelpers.ts';

const JULIA = 150;

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

/** 撮影の編成（ココア + ソルジャーF.A. + ジュリア（操作））。ジュリアは 3 枠目 */
function rangeTeam(treasurePhase: TreasurePhase): TeamInput {
  const slots = [311, 301].map((id): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' }));
  const julia: TeamSlotInput = { ...fixedSlot(JULIA), conditionMode: 'auto' };
  julia.skills!.treasurePhase = treasurePhase;
  return { slots: [...slots, julia], enemy: rangeEnemy, durationSeconds: 180, burst: true, controlledSlot: 2 };
}

const CASES: Record<string, { input: TeamInput; treasure: boolean }> = {
  '撮影の編成・宝物版（段階 3）': { input: rangeTeam(3), treasure: true },
  '撮影の編成・基礎版': { input: rangeTeam(0), treasure: false },
  '実戦寄り（リター + ドレイク + ジュリア + アリス + クラウン）': {
    input: fixedTeam([82, 101, JULIA, 191, 330], 2),
    treasure: false,
  },
};
const J = 2;
/** 定義の S1 のクールタイム（撮る前の仮の値 20 秒。V-0792）。発動は時刻に達した最初のフレーム */
const S1_PERIOD = gameSecondsToFirstFrame(20);

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, treasure }) => {
  const plan = planTeamRun(input);
  const s1 = itemsOf(plan.history, { sourceSlotIndex: J, holder: J, kind: 'timed', skill: 'skill1', stat: 'attack' });
  const crescendo = itemsOf(plan.history, { holder: J, kind: 'state', state: 'crescendo' });
  // 倍率ダメージの条件 selfState と同じ見え方（frame より前に付いて frame に続いている件）
  const fullAt = (f: number) => crescendo.some((w) => w.stack === 5 && w.start < f && f < w.end);
  const activations = plan.schedule!.activations.filter((a) => a.slotIndex === J);
  const hitsOf = (skill: string) => plan.skillHits.filter((h) => h.slotIndex === J && h.effect.source.skill === skill);

  it('applies the S1 buffs at the start of battle and every cooldown (treasure version only)', () => {
    if (!treasure) {
      expect(s1).toEqual([]);
      return;
    }
    const starts = [...new Set(s1.map((w) => w.start))].sort((a, b) => a - b);
    // 戦闘開始時の強制使用は 0 から、周期の発動は発動の次のフレームから付く
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(S1_PERIOD + 1);
    starts.slice(2).forEach((f, k) => expect(f - starts[k + 1]!).toBe(S1_PERIOD));
    expect(starts.length).toBeGreaterThanOrEqual(9);
  });

  it('stacks Crescendo (up to 5 with the treasure version; the base version stacks on last bullets only)', () => {
    expect(crescendo.length).toBeGreaterThan(0);
    // 基礎版も、マガジンの間（約 6 秒）が維持の 15 秒より短く、付くたびに維持を付け直すので、5 マガジンでフルスタックに届く
    expect(Math.max(...crescendo.map((w) => w.stack ?? 1))).toBe(5);
    if (!treasure) {
      // 付くのはマガジン（60 発）を撃ち切った発ごと（ハイドのリロードで撃ち切らなかったマガジンでは付かない）
      const shots = plan.shots[J]!.frames;
      const grants = [...new Set(crescendo.map((w) => w.start))].sort((a, b) => a - b);
      grants.slice(1).forEach((f, k) => {
        expect(shots.filter((s) => s >= grants[k]! && s < f).length).toBeGreaterThanOrEqual(60);
      });
    }
  });

  it('deals Marcato and its critical follow-up on the same shot frames (treasure version only)', () => {
    const skill2 = hitsOf('skill2');
    if (!treasure) {
      expect(skill2).toEqual([]);
      return;
    }
    const marcato = skill2.filter((h) => h.effect.onSkillCrit !== true);
    const follow = skill2.filter((h) => h.effect.onSkillCrit === true);
    expect(marcato.length).toBeGreaterThan(50);
    expect(follow.map((h) => h.frame)).toEqual(marcato.map((h) => h.frame));
    for (const h of follow) {
      const rate = h.hit.onSkillCritRate!;
      // 倍率ダメージの会心率（基礎 15% + S1 の 26.04%。通常攻撃のクリティカル確率▲は入れない）
      expect([0.15, 0.4104].some((r) => Math.abs(rate - r) < 1e-9)).toBe(true);
    }
  });

  it('deals the Burst additional damage on each Burst hit only while Crescendo is at full stacks', () => {
    const extra = hitsOf('burst').filter((h) => h.effect.damageType === 'additional');
    const full = activations.filter((a) => fullAt(hitFrameOf(a)));
    // 宝物版は順番の攻撃のヒットごと（遅れの表の分かれたヒットの数。表に行の無いあいだは 1）
    const character = applyTreasure(characterOf(JULIA), null, treasure ? 3 : 0).character;
    const splits = burstDelaysOf(character).hitOffsets?.length ?? 1;
    expect(extra.length).toBe(full.length * splits);
    for (const h of extra) expect(full.some((a) => hitFrameOf(a) === h.frame)).toBe(true);
    if (treasure) expect(full.length).toBe(activations.length);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
