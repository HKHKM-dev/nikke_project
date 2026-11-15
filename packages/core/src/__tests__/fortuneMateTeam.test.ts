// アルカナ：フォーチュンメイト（583）を含む編成（plan/design-fortune-mate.md。V-0786）。語彙は skills/__tests__/fortuneMate.test.ts。
// ここでは味方と組んだ時に: バーストで思い出作りが付き、フルバースト終了で外れる（フルバーストに入らなかったバーストでは続く）。
// 思い出作りの間の射撃の 2・8・14…発目に弾丸チャージ、4・10・16…発目に幸せな思い出（と青春の記録）、6・12・18…発目に大切な思い出が付く。
// フルバースト終了で SG の味方（自分も）に、発動者基準の攻撃力 × 大切な思い出のスタック数が付き、バーストの使用で自分を除く SG の
// 味方に攻撃ダメージ▲が付く。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { gameSecondsToFrames } from '../time.ts';
import { applicationsOf, slotPieces } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedTeam, skillValueOf } from './teamHelpers.ts';

const FORTUNE_MATE = 583;

const TEAMS = {
  'ツバイ + フォーチュンメイト + ソルジャーE.G.（V-0786 の編成）': fixedTeam([390, FORTUNE_MATE, 300], 2),
  '実戦寄り（リター + フォーチュンメイト + ソーダ：トゥインクルバニー + ドロシー：セレンディピティ + ツバイ）':
    fixedTeam([82, FORTUNE_MATE, 314, 234, 390], 2),
};

const S1_ATTACK = skillValueOf(FORTUNE_MATE, 'skill1', 1) / 100;
const S1_FRAMES = gameSecondsToFrames(skillValueOf(FORTUNE_MATE, 'skill1', 2));

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const a = input.slots.findIndex((s) => s?.character.resourceId === FORTUNE_MATE);
  const plan = planTeamRun(input);
  const windows = itemsOf(plan.history, { holder: a, state: 'memoryMaking' });
  const shots = plan.shots[a]!.frames;
  const fullBurstEnds = plan.schedule!.fullBurstWindows.map((w) => w.end).filter((f) => f < plan.frames);
  // 解除はフルバースト終了のフレームには付いていて、次のフレームで閉じる
  const removedAt = new Set(fullBurstEnds.map((f) => f + 1));
  const mine = plan.schedule!.activations.filter((x) => x.slotIndex === a);
  /** 思い出作りの窓の中の射撃（付いたフレームの発は数えない。窓の始まりから数えて 1 始まりの番号で引く） */
  const shotsIn = (w: { start: number; end: number }) => shots.filter((f) => w.start < f && f < w.end);
  /** 付いた記録の、きっかけの発のフレーム（件は発の次のフレームから） */
  const grantsOf = (state: 'happyMemory' | 'preciousMemory') =>
    applicationsOf(plan).flatMap((r) => (r.slotIndex === a && r.state === state ? [r.frame - 1] : []));

  it('applies Making Memories on each burst and removes it only on Full Burst end', () => {
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      expect(mine.some((x) => x.frame + 1 >= w.start && x.frame <= w.start)).toBe(true);
      if (w.end < plan.frames) expect(removedAt.has(w.end)).toBe(true);
    }
  });

  it('fires the 2nd, 4th and 6th tiers every 6 shots while in Making Memories, counted from its start', () => {
    const refills = plan.instants
      .filter((i) => i.slotIndex === a && i.effect.kind === 'ammoRefill' && i.effect.source.skill === 'skill2')
      .map((i) => i.frame);
    const happy = new Set(grantsOf('happyMemory'));
    const precious = new Set(grantsOf('preciousMemory'));
    let counted = 0;
    for (const w of windows) {
      const inside = shotsIn(w);
      inside.forEach((f, k) => {
        const n = k + 1;
        expect(refills.includes(f)).toBe(n % 6 === 2);
        expect(happy.has(f)).toBe(n % 6 === 4);
        expect(precious.has(f)).toBe(n % 6 === 0);
      });
      counted += inside.length;
    }
    expect(counted).toBeGreaterThan(6);
    // 窓の外の発では付かない
    for (const f of shots.filter((f) => !windows.some((w) => w.start < f && f < w.end))) {
      expect(refills.includes(f)).toBe(false);
      expect(happy.has(f)).toBe(false);
    }
  });

  it('adds a Snapshots of Youth stack with each Happy Memories and removes it on Full Burst end', () => {
    const youth = itemsOf(plan.history, { holder: a, state: 'youthRecord' });
    const happy = grantsOf('happyMemory');
    expect(youth.length).toBeGreaterThan(0);
    const youthApplied = applicationsOf(plan).filter((r) => r.slotIndex === a && r.state === 'youthRecord');
    // 幸せな思い出のスタックが上限の後も、付くたびに付く
    expect(youthApplied.map((r) => r.frame)).toEqual(happy.map((f) => f + 1));
    for (const it of youth) if (it.end < plan.frames) expect(removedAt.has(it.end)).toBe(true);
  });

  it('gives shotgun allies a ratio of the caster ATK × Precious Moments stacks on Full Burst end, and Attack Damage on burst use to the others', () => {
    for (const [h, slot] of input.slots.entries()) {
      if (slot === null) continue;
      const sg = slot.character.weaponType === 'SG';
      const s1 = slotPieces(plan, h).filter(
        (p) =>
          p.effect.source.resourceId === FORTUNE_MATE &&
          p.effect.source.skill === 'skill1' &&
          p.effect.stat === 'attack',
      );
      const s2 = slotPieces(plan, h).filter(
        (p) =>
          p.effect.source.resourceId === FORTUNE_MATE &&
          p.effect.source.skill === 'skill2' &&
          p.effect.stat === 'attackDamage',
      );
      expect(s1.length > 0).toBe(sg);
      expect(s2.length > 0).toBe(sg && h !== a);
      for (const p of s1) {
        const end = fullBurstEnds.find((f) => f <= p.start && p.start < f + S1_FRAMES);
        expect(end).toBeDefined();
        const stacks = Math.max(
          0,
          ...itemsOf(plan.history, { holder: a, state: 'preciousMemory' })
            .filter((it) => it.start <= end! && end! < it.end)
            .map((it) => it.stack ?? 1),
        );
        expect(p.effect.value).toBeCloseTo(S1_ATTACK * stacks, 9);
      }
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
