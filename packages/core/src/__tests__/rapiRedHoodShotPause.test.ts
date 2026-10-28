// V-0534: 射撃の止まり（shotPause）。ラピ：レッドフード（16）の S2 の粘着榴弾は、通常攻撃 120 回ごとに次のフレームの通常攻撃を止め
// （C-0717）、120 回目の発がマガジンの最後の弾丸ならリロードの始まりを 4f 遅らせる（C-0718）。語彙の検証と、録画 0725 の編成の発の列を見る
import { describe, expect, it } from 'vitest';
import { buildTeamInput, METRICS, type CompareSetup } from '../records/observations.ts';
import { runSimulation } from '../sim/engine.ts';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../scripts/records-data.ts';
import { parseSkillDefinition } from '../skills/types.ts';

/** skill2 に効果を 1 つだけ置いた定義（検証にかける前の JSON） */
function withSkill2(effect: unknown): unknown {
  const blank = { effects: [], notes: [{ ja: 'x', en: 'x', kind: 'noDamage' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-28',
    skills: { skill1: blank, skill2: { effects: [effect] }, burst: blank },
  };
}

const BASE = { kind: 'shotPause', trigger: { count: 'normalShot', every: 120 }, frames: 1 };

describe('語彙の検証', () => {
  it('accepts frames and framesOnLastShot', () => {
    const def = parseSkillDefinition(withSkill2({ ...BASE, framesOnLastShot: 4 }));
    expect(def.skills.skill2.effects[0]).toEqual({ ...BASE, framesOnLastShot: 4 });
  });

  it('needs a shot count trigger and positive integer frames', () => {
    expect(() => parseSkillDefinition(withSkill2({ ...BASE, trigger: 'burstUse' }))).toThrow(/shot count/);
    expect(() => parseSkillDefinition(withSkill2({ ...BASE, frames: 0 }))).toThrow(/positive integer/);
    expect(() => parseSkillDefinition(withSkill2({ ...BASE, framesOnLastShot: 1.5 }))).toThrow(/positive integer/);
    expect(() =>
      parseSkillDefinition(withSkill2({ ...BASE, trigger: { count: 'normalShot', every: 120, stacksRef: 1 } })),
    ).toThrow(/stacksRef/);
  });
});

describe('録画 0725 の編成（ラピ：レッドフード単騎）', () => {
  const file = loadRecordingsFile();
  const recording = recordingMap(file).get('0725')!;
  const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto' };
  const input = buildTeamInput(recording, setup, loadRecordsData(file));
  const result = runSimulation(input);
  const ctx = (args: Record<string, number>) => ({ args: { slot: 1, ...args }, input });

  it('skips the frame after every 120th shot and keeps one shot per frame afterwards (C-0717)', () => {
    const frames = result.shots[0]!.frames;
    // 120 発目・240 発目の次のフレームは撃たず、その次のフレームから 1 フレーム 1 発
    for (const n of [120, 240]) {
      expect(frames[n]! - frames[n - 1]!).toBe(2);
      expect(frames[n - 1]! - frames[n - 2]!).toBe(1);
      expect(frames[n + 1]! - frames[n]!).toBe(1);
    }
    expect(METRICS.steadyPauseShots!.sim(result, ctx({}))).toBe(120);
  });

  it('delays the reload by 4 frames when the 120th shot empties the magazine (C-0718)', () => {
    expect(METRICS.lastShotGapMedians!.sim(result, ctx({ every: 120 }))).toEqual([175, 171]);
  });
});
