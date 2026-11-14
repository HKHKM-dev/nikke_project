// センチ編（V-0773・plan/design-centi.md）: センチ（80）を含む編成で、宝物版 S2 のクールタイムごとの味方全体への攻撃力▲（発動者基準・
// 10 段・8 秒）、宝物版 S1 のフルチャージの命中ごとの S2 のクールタイム▼（残りの割合）と S2 の発動ごとの鉄甲コードの味方への有利コードの
// 攻撃ダメージ▲、バーストの 2 ヒットと防御力▼が意図どおりに出るか。基礎版は S1・S2 がバリアだけで、バーストだけが効く。
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { hitFramesOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { fullChargeFrameSet } from '../frame/shots.ts';
import { itemsOf } from '../skills/holders.ts';
import { cooldownTimer } from '../skills/timeline.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import type { Element } from '../types.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const CENTI = 80;
const PRODUCT08 = 302;
const SOLINE = 71;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy = (element: Element): EnemyInput => ({
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element,
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
});

const slotOf = (id: number, treasurePhase: TreasurePhase): TeamSlotInput => {
  const slot: TeamSlotInput = { ...fixedSlot(id), conditionMode: 'auto' };
  if (id === CENTI) slot.skills = { ...slot.skills!, treasurePhase };
  return slot;
};
const team = (
  ids: number[],
  controlledSlot: number,
  element: Element = 'Fire',
  treasurePhase: TreasurePhase = 3,
): TeamInput => ({
  slots: ids.map((id) => slotOf(id, treasurePhase)),
  enemy: rangeEnemy(element),
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'センチ単騎（撮影 A の編成）': team([CENTI], 0),
  'センチ単騎・電撃の敵（撮影 C の編成）': team([CENTI], 0, 'Electronic'),
  'プロダクト08 + センチ（撮影 D の編成）': team([PRODUCT08, CENTI], 1),
  '実戦寄り（プロダクト08 + センチ + ソリン・電撃の敵）': team([PRODUCT08, CENTI, SOLINE], 1, 'Electronic'),
  'プロダクト08 + センチ（宝物の段階 1。S2 だけ宝物版）': team([PRODUCT08, CENTI], 1, 'Fire', 1),
  'プロダクト08 + センチ（基礎版）': team([PRODUCT08, CENTI], 1, 'Fire', 0),
};

/** センチの S2 のクールタイム（C-1218） */
const PERIOD = gameSecondsToFirstFrame(9);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const s = input.slots.findIndex((x) => x?.character.resourceId === CENTI);
  const phase = input.slots[s]!.skills!.treasurePhase ?? 0;
  const treasure = phase === 3;
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  /** センチの S2 の発動（フルチャージの発ごとに残りを 0.9084 倍。C-1219）を射撃の列から並べ直したもの */
  const s2Fires = (() => {
    // 部分チャージの発は「フルチャージ攻撃」でないので数えない
    const full = fullChargeFrameSet(plan.shots[s]!);
    const shots = new Set(plan.shots[s]!.frames.filter(full));
    const tick = cooldownTimer(PERIOD);
    const out: number[] = [];
    for (let f = 1; f < plan.frames; f++)
      if (tick(f, undefined, () => undefined, shots.has(f) ? 1 - 9.16 / 100 : undefined)) out.push(f);
    return out;
  })();

  if (treasure) {
    it('gives the S2 ATK up (caster based, up to 10 stacks, 8 s) to every ally from the frame after each S2, pulled in by full charge shots', () => {
      expect(s2Fires.length).toBeGreaterThan(Math.floor(plan.frames / PERIOD));
      for (const holder of input.slots.keys()) {
        const up = items({ holder, kind: 'timed', skill: 'skill2', stat: 'attack' });
        expect(Math.max(...up.map((w) => w.stack ?? 1))).toBe(10);
        // 段ごとの件の始まりは発動の次のフレーム（1 段目は維持が切れた後の付き直しも含む）
        for (const w of up) expect(s2Fires).toContain(w.start - 1);
        // 付くたびに全段の維持を付け直すので、件の終わりは最後の付き直し（発動の次のフレーム）から 8 秒（戦闘の終わりで切る）
        for (const w of up) {
          const last = Math.max(...s2Fires.filter((f) => f + 1 < w.end)) + 1;
          expect(w.end).toBe(Math.min(last + gameSecondsToFrames(8), plan.frames));
        }
      }
    });

    it('gives the S1 element damage up on each S2 only to Iron Code allies', () => {
      for (const [holder, slot] of input.slots.entries()) {
        const up = items({ holder, kind: 'timed', skill: 'skill1', stat: 'elementDamage' });
        if (slot?.character.element !== 'Iron') {
          expect(up).toEqual([]);
          continue;
        }
        expect(up.length).toBeGreaterThan(0);
        for (const w of up) expect(s2Fires).toContain(w.start - 1);
      }
    });
  } else if (phase === 1) {
    it('gives the S2 ATK up every 9 s without the base S1 reduction, and no element damage up', () => {
      const starts = items({ holder: s, kind: 'timed', skill: 'skill2', stat: 'attack' })
        .filter((w) => (w.stack ?? 1) === 1)
        .map((w) => w.start);
      expect(starts.length).toBeGreaterThan(0);
      for (const f of starts) expect((f - 1) % PERIOD).toBe(0);
      expect(items({ kind: 'timed', skill: 'skill1', stat: 'elementDamage' })).toEqual([]);
    });
  } else {
    it('has no S1 or S2 effects in the base version (barrier only)', () => {
      expect(items({ kind: 'timed', skill: 'skill2', stat: 'attack' })).toEqual([]);
      expect(items({ kind: 'timed', skill: 'skill1', stat: 'elementDamage' })).toEqual([]);
    });
  }

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  if (input.slots.length === 1) {
    it('never uses its Burst (II) alone', () => {
      expect(bursts).toEqual([]);
    });
    return;
  }
  it('deals the Burst damage and gives the DEF down for 10 s on every Burst', () => {
    expect(bursts.length).toBeGreaterThan(5);
    const down = items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' });
    expect(down.length).toBe(bursts.length);
    for (const w of down) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    if (!treasure) return;
    // 宝物版: 2 ヒット（16f おき）。防御力▼は 2 ヒット目のフレームから（C-1221）
    bursts.forEach((b, k) => {
      const hits = hitFramesOf(b);
      expect(hits[1]! - hits[0]!).toBe(16);
      expect(down[k]!.start).toBe(hits[1]);
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
