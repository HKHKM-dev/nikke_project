// ノベル（212。V-0833）を含む編成で、S1 の 10 秒ごとのダメージ（発動の 64f 後）と防御力▼（ヒットの次のフレームから 5 秒。C-1448）、
// S2 の証拠品収集（命中 100 回ごとに 5 スタック）と、バーストのダメージ（II の発動の 80f 後。C-1450）・フルスタックの時だけの
// 受けるダメージ▲（ヒットのフレームから。C-1449）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const NOVEL = 212;
// S1 の周期は ceil(10 ÷ 0.017) = 589 ティック（発動のたびに数え直す。C-0502）
const PERIOD = 589;

describe('ノベルの定義', () => {
  const def = parseSkillDefinition(rawDefinition(NOVEL));

  it('defines every slot, leaving only the S1 Burst gauge unimplemented', () => {
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['unimplemented']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.burst.support).toBe('supported');
    expect(burstDelaysOf(characterOf(NOVEL))).toEqual({ hitFrames: 80, effectFrames: 80 });
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（ノベル単騎）': fixedTeam([NOVEL], 0),
  '撮影 B の編成（I-DOLL・フラワー + ノベル + ユルハ）': fixedTeam([304, NOVEL, 171], 2),
  '実戦寄り（リター + ノベル + レッドフード + アリス + マクスウェル）': fixedTeam([82, NOVEL, 470, 191, 280], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === NOVEL);
  const plan = planTeamRun(input);
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const s1Hits = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'skill1');

  it('hits with S1 64 f after every 10 s activation, and gives the DEF down from the next frame for 5 s', () => {
    // 1 回目も 1 周期後
    expect(s1Hits.length).toBeGreaterThan(10);
    s1Hits.forEach((h, k) => expect(h.frame).toBe((k + 1) * PERIOD + 64));
    const down = items({ kind: 'timed', skill: 'skill1', stat: 'enemyDefenseDown' });
    expect(down.map((w) => w.start)).toEqual(s1Hits.map((h) => h.frame + 1));
    for (const w of down.filter((x) => x.end < plan.frames)) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
  });

  const evidence = items({ holder: s, kind: 'state', state: 'collectEvidence' });
  const stackAt = (f: number) =>
    Math.max(0, ...evidence.filter((w) => w.start <= f && f < w.end).map((w) => w.stack ?? 1));

  it('stacks Collecting Evidence up to 5 and keeps it while firing', () => {
    expect(Math.max(...evidence.map((w) => w.stack ?? 1))).toBe(5);
    // 付くたびに全部のスタックの維持を付け直すので、5 スタックに届いた後は 180 秒まで保つ
    const full = evidence.find((w) => w.stack === 5)!;
    expect(full.start).toBeLessThan(gameSecondsToFrames(40));
    expect(stackAt(plan.frames - 1)).toBe(5);
  });

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  if (input.slots.length === 1) {
    it('never uses her Burst (a lone Burst II)', () => {
      expect(bursts).toEqual([]);
    });
    return;
  }

  it('deals the Burst damage 80 f after the II activation, and Damage Taken up from that frame only at full stacks', () => {
    expect(bursts.length).toBeGreaterThan(3);
    for (const a of bursts) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 80]);
    const taken = items({ kind: 'timed', skill: 'burst', stat: 'damageTaken' });
    const full = bursts.filter((a) => stackAt(hitFramesOf(a)[0]!) === 5);
    // 1 回目のバーストはまだ 5 スタックに届いていない
    expect(full.length).toBeLessThan(bursts.length);
    expect(stackAt(hitFramesOf(bursts[0]!)[0]!)).toBeLessThan(5);
    expect(taken.map((w) => w.start)).toEqual(full.map((a) => hitFramesOf(a)[0]!));
  });
});

describeEveryShotInOneGroup(TEAMS);
