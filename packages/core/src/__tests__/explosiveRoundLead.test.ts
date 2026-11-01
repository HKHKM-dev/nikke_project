// 徹甲炸裂弾の受けるダメージ▲の付く時刻（plan/design-explosive-round-lead.md 3 節。C-0816）: 状態の付与の leadFrames。
// 録画 0837（リター・ウンファ：タクティカル・アップ・ベスティー：タクティカル・アップ。V-0588）のモデルで見る
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../scripts/records-data.ts';
import { buildTeamInput, type CompareSetup } from '../records/observations.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/types.ts';

const file = loadRecordingsFile();
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true };
const input = buildTeamInput(recordingMap(file).get('0837')!, setup, loadRecordsData(file));
const result = runSimulation(input);
const EUNHWA = 1;
const BESTIE = 2;
const EXPLOSIVE_ROUND = 0.2787;

const eunhwaJson = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/skills/95.json'), 'utf8')) as {
  skills: { burst: { effects: Record<string, unknown>[] } };
};
const withGrant = (patch: Record<string, unknown>): unknown => {
  const json = structuredClone(eunhwaJson);
  json.skills.burst.effects[0] = { ...json.skills.burst.effects[0], ...patch };
  return json;
};

describe('leadFrames（徹甲炸裂弾の▲の付く時刻）', () => {
  it('puts the ▲ on the Burst III hits whose round came 5 frames or more before 00.00, not on the far one', () => {
    // 1 回目（中近。発は 00.00 の 5f 前）・2 回目（近。7f 前）は乗り、3 回目（遠。1f 前）は乗らない（V-0588 の 0837-06〜08）
    const hits = result.slots[BESTIE]!.burst.hits.slice(0, 3);
    expect(hits.map((h) => h.damageTakenMultiplier)).toEqual([1 + EXPLOSIVE_ROUND, 1 + EXPLOSIVE_ROUND, 1]);
  });

  it('starts the state 2 frames before the round for the allies, and on the frame after it for the user', () => {
    const shot = result.shots[EUNHWA]!.weaponChangeShotFrames![0]!;
    const damageTakenAt = (slotIndex: number, frame: number): number => {
      const segment = result.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
      return segment.slots[slotIndex]!.buffs.damageTaken;
    };
    expect(damageTakenAt(BESTIE, shot - 3)).toBe(0);
    expect(damageTakenAt(BESTIE, shot - 2)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    // 炸裂弾自身には乗らない（C-0312）
    expect(damageTakenAt(EUNHWA, shot)).toBe(0);
    expect(damageTakenAt(EUNHWA, shot + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
  });

  it('is written only on a grant triggered by { count: "weaponChangeShot" }, without delayFrames', () => {
    expect(() => parseSkillDefinition(withGrant({ trigger: 'burstUse' }) as never)).toThrow(
      'leadFrames needs the trigger { count: "weaponChangeShot" }',
    );
    expect(() => parseSkillDefinition(withGrant({ leadFrames: 0 }) as never)).toThrow('positive integer');
  });
});
