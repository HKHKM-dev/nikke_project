// ギロチン編（plan/design-guillotine.md）: ギロチン（180）を含む編成で、S1 の現在の HP▼（30 命中ごと）、それで HP の割合が 70% 以下に
// 下がった後の S2 の攻撃力▲（失った HP の 1% ごと。HP の割合の段ごとに付け直す）、バーストのヒットの時に 50% 以下ならの追加ダメージが
// 意図どおりに出るか。攻撃力の順位（アリスの S1 の対象）も、そのフレームの失った HP の段で読む
import { describe, expect, it } from 'vitest';
import { hitFramesOf, isInFullBurst } from '../burst/schedule.ts';
import { computeFixedSpecDefence } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyAttackBuffs, ZERO_BUFFS } from '../skills/buffs.ts';
import { itemsOf, selfHpRatioOf } from '../skills/holders.ts';
import { lostHpSteps } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { slotPieces } from './historyHelpers.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam } from './teamHelpers.ts';

/** 防御力もスペック固定にし、コア命中率を 0.1 にした枠 */
const slot = (id: number): TeamSlotInput => ({
  ...fixedSlot(id),
  defenceOverride: computeFixedSpecDefence(characterOf(id)),
  condition: { coreHitRate: 0.1, distanceBonus: true },
});

const GUILLOTINE = 180;
const ALICE = 191;
const team = (ids: number[], controlledSlot: number, extra: Partial<TeamInput> = {}): TeamInput =>
  fixedTeam(ids.map(slot), controlledSlot, extra);

const TEAMS: Record<string, TeamInput> = {
  ギロチン単騎: team([GUILLOTINE], 0, { burst: false }),
  'リター + デルタ + ギロチン（撮影 B の編成）': team([82, 20, GUILLOTINE], 2),
  '実戦寄り（リター + デルタ + ギロチン + アリス + クラウン）': team([82, 20, GUILLOTINE, ALICE, 330], 2),
};

// スキル Lv10: 現在の HP 2.01%▼ を n 回で 0.9799^n。70% 以下は 18 回目、50% 以下は 35 回目
const FIRES_TO_70 = 18;
const FIRES_TO_50 = 35;
const ATK_PER_LOST_PERCENT = 0.0096;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const g = input.slots.findIndex((s) => s?.character.resourceId === GUILLOTINE);
  const plan = planTeamRun(input);
  const hpDowns = plan.instants.filter((i) => i.slotIndex === g && i.effect.kind === 'currentHpDown');
  const attackPieces = slotPieces(plan, g).filter((p) => p.effect.stat === 'attack');
  const s2Attack = attackPieces.filter((p) => p.effect.source.skill === 'skill2');

  it('lowers the current HP by 2.01% of the current HP on every S1 firing', () => {
    expect(hpDowns.length).toBeGreaterThan(FIRES_TO_50);
    hpDowns.forEach((d, n) => expect(selfHpRatioOf(plan.history, g, d.frame + 1)).toBeCloseTo(0.9799 ** (n + 1), 12));
  });

  it('opens the S2 ATK up from the frame after the HP down that drops HP to 70% or lower, until the battle ends', () => {
    const windows = itemsOf(plan.history, {
      sourceSlotIndex: g,
      holder: g,
      kind: 'timed',
      skill: 'skill2',
      stat: 'attack',
    });
    expect(windows.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: hpDowns[FIRES_TO_70 - 1]!.frame + 1, end: plan.frames },
    ]);
  });

  it('cuts the S2 ATK up into pieces of 0.96% × the lost HP in whole percent, re-read whenever the step changes', () => {
    expect(s2Attack[0]!.start).toBe(hpDowns[FIRES_TO_70 - 1]!.frame + 1);
    expect(s2Attack.at(-1)!.end).toBe(plan.frames);
    // 18 回目で 0.9799^18 ≒ 69.4%（失った HP 30%）→ 28.8%▲
    expect(s2Attack[0]!.effect.value).toBeCloseTo(0.288, 12);
    s2Attack.forEach((p, i) => {
      if (i > 0) expect(p.start).toBe(s2Attack[i - 1]!.end);
      const steps = lostHpSteps(selfHpRatioOf(plan.history, g, p.start));
      expect(p.effect.value).toBeCloseTo(ATK_PER_LOST_PERCENT * steps, 12);
      // 小片の中では段が変わらない
      expect(lostHpSteps(selfHpRatioOf(plan.history, g, p.end - 1))).toBe(steps);
    });
    expect(new Set(s2Attack.map((p) => p.effect.value)).size).toBe(s2Attack.length);
  });

  // 追加ダメージはバーストスキルダメージと同じ III の 00.00 の 105f 後に発火し（C-1372）、そのフレームの HP の割合で決まる（C-1373）
  it.skipIf(!input.burst)(
    'deals the burst additional damage with the burst hit, only when HP is at 50% or lower then',
    () => {
      const hits = (plan.schedule?.activations.filter((a) => a.slotIndex === g) ?? []).flatMap(hitFramesOf);
      const additional = plan.skillHits.filter((h) => h.slotIndex === g && h.effect.source.skill === 'burst');
      const downsBefore = (frame: number) => hpDowns.filter((i) => i.frame < frame).length;
      expect(hits.some((f) => downsBefore(f) < FIRES_TO_50)).toBe(true);
      expect(hits.some((f) => downsBefore(f) >= FIRES_TO_50)).toBe(true);
      expect(additional.map((h) => h.frame)).toEqual(hits.filter((f) => downsBefore(f) >= FIRES_TO_50));
      for (const h of additional) {
        expect(h.hit.multiplier).toBeCloseTo(12.375, 6);
        expect(isInFullBurst(plan.schedule!, h.frame)).toBe(true);
        expect(h.hit.boost.fullBurst).toBe(0.5);
      }
    },
  );

  it.skipIf(!input.slots.some((s) => s?.character.resourceId === ALICE))(
    'ranks the final ATK of Guillotine with the lost HP steps of the ranking frame',
    () => {
      const rankings = plan.history.rankings.filter((r) => r.frame > s2Attack[0]!.start);
      expect(rankings.length).toBeGreaterThan(0);
      const base = plan.history.slots[g]!.casterBaseAttack;
      let compared = 0;
      for (const r of rankings) {
        // 比率の▲の小片だけで決まる回で比べる（同じフレームに始まる発動者基準の固定加算（クラウンの S1）は、同じフレームの登録の順で
        // 順位に入るかが変わるので外す）
        const pieces = attackPieces.filter((p) => p.start <= r.frame && r.frame < p.end);
        if (pieces.some((p) => (p.effect.scaling ?? 'ratio') !== 'ratio')) continue;
        compared += 1;
        const up = pieces.reduce((sum, p) => sum + p.effect.value, 0);
        expect(r.finalAttacks[g]).toBeCloseTo(applyAttackBuffs(base, { ...ZERO_BUFFS, attackRatio: up }), 6);
      }
      expect(compared).toBeGreaterThan(0);
    },
  );
});

describeEveryShotInOneGroup(TEAMS);
