// 徹甲炸裂弾の受けるダメージ▲の付く時刻（plan/design-explosive-round-lead.md 3 節。C-0816）: 状態の付与の leadFrames。
// 録画 0837（リター・ウンファ：タクティカル・アップ・ベスティー：タクティカル・アップ。V-0588）のモデルで見る
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../scripts/records-data.ts';
import { buildTeamInput, type CompareSetup } from '../records/observations.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
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

  it('cannot be written with what the first pass judges on the shot frame (condition, stacksFrom, topAttack)', () => {
    // 1 パス目は発の leadFrames 前のフレームで件を登録する（plan/design-explosive-round-lead.md 5.3 節）
    // 敵に付く状態は条件をもともと書けないので、自分に付く状態の付与で見る
    const own = { state: 'camouflage', target: 'self' };
    expect(() => parseSkillDefinition(withGrant({ ...own, condition: { inFullBurst: true } }) as never)).toThrow(
      'condition cannot be used with leadFrames',
    );
    expect(() =>
      parseSkillDefinition(withGrant({ ...own, maxStacks: 100, stacksFrom: { counter: 'firepowerGauge' } }) as never),
    ).toThrow('stacksFrom cannot be used with leadFrames');
    expect(() => parseSkillDefinition(withGrant({ ...own, target: 'topAttack', targetCount: 1 }) as never)).toThrow(
      'topAttack cannot be used with leadFrames',
    );
  });
});

// 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5 節。backlog 2-44）: ベスティー：タクティカル・アップの S2 の
// 「敵が徹甲炸裂弾状態なら発射体爆発ダメージ▲」（1 パス目の enemyState。C-0809）は、2 パス目の受けるダメージ▲の区間と同じ始まり
// （炸裂弾の 2f 前）から付く。録画 0837 のベスティーの射撃を戦闘の始めの撃たない区間でずらし、フルチャージの発を炸裂弾の直前に置く
describe('leadFrames in the first pass (Bestie: Tactical Upgrade S2 on Explosive Round)', () => {
  const PROJECTILE_UP = 0.2;
  const buffsAt = (r: SimResult, slotIndex: number, frame: number) =>
    r.timeline.segments.find((s) => s.start <= frame && frame < s.end)!.slots[slotIndex]!.buffs;
  const shifted = (frames: number): SimResult =>
    runSimulation({ ...input, holdFire: [{ slotIndex: BESTIE, ranges: [{ start: 0, end: frames }] }] });

  it.each([
    { hold: 6, lead: 3, up: 0 },
    { hold: 7, lead: 2, up: PROJECTILE_UP },
    { hold: 8, lead: 1, up: PROJECTILE_UP },
  ])('a full charge $lead frames before the round gets the up: $up', ({ hold, lead, up }) => {
    const r = shifted(hold);
    const round = r.shots[EUNHWA]!.weaponChangeShotFrames![0]!;
    const shot = r.shots[BESTIE]!.frames.find((f) => f >= round - 3 && f < round);
    expect(shot).toBe(round - lead);
    // 2 パス目の区間: 受けるダメージ▲は炸裂弾の 2f 前から
    expect(buffsAt(r, BESTIE, round - 3).damageTaken).toBe(0);
    expect(buffsAt(r, BESTIE, round - 2).damageTaken).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    // 1 パス目: その発の S2 の▲は、発が件の中なら次のフレームから付く（件より前の発なら付かない）
    expect(buffsAt(r, BESTIE, shot!).projectileExplosionDamage).toBe(0);
    expect(buffsAt(r, BESTIE, shot! + 1).projectileExplosionDamage).toBeCloseTo(up, 12);
  });
});
