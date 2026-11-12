// 簡素化・第 7 回の案 2（plan/design-workflow-simplification-7.md 2 節）: 出来事の動画のフレームの列の指標 eventFrames と、それの包みに
// した時刻の指標。録画 0746（ミハラ：ボンディングチェーンのバーストを使う回。V-0547）のモデルで見る
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import { buildTeamInput } from '../observations/teamInput.ts';
import { METRICS } from '../observations/metrics/index.ts';
import type { CompareSetup } from '../observations/setup.ts';

const file = loadRecordingsFile();
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true };
const data = loadRecordsData(file);
const input = buildTeamInput(recordingMap(file).get('0746')!, setup, data);
const result = runSimulation(input);
const metric = (name: string, args: Record<string, number | string | boolean>) =>
  METRICS[name]!.sim(result, { args, input: input as TeamInput });
const frames = (args: Record<string, number | string | boolean>) => metric('eventFrames', { slot: 3, ...args });

describe('eventFrames', () => {
  it('gives the same lists as the time metrics it replaces', () => {
    expect(frames({ event: 'dot', skill: 'burst', anchor: 'activation:1', within: 'untilNext' })).toEqual(
      metric('dotTickOffsets', { slot: 3, n: 1 }),
    );
    expect(
      frames({ event: 'dotApply', skill: 'skill1', anchor: 'fullBurst:2', within: 'afterWindow', count: 10 }),
    ).toEqual(
      metric('skillHitFramesFromFullBurst', {
        slot: 3,
        skill: 'skill1',
        fullBurst: 2,
        count: 10,
        after: true,
        kind: 'apply',
      }),
    );
    expect(frames({ event: 'skillHit', skill: 'skill1', count: 5 })).toEqual(
      metric('skillHitVideoFrameList', { slot: 3, skill: 'skill1', count: 5 }),
    );
    expect(frames({ event: 'dotTick', count: 3 })).toEqual(
      metric('dotHitVideoFrames', { slot: 3, kind: 'tick', count: 3 }),
    );
  });

  it('measures from the anchor and keeps only the range', () => {
    // 発動から次の発動までのバーストのヒットは、発動の後で、次の発動の前
    const activations = frames({ event: 'activation' }) as number[];
    const hits = frames({ event: 'burstHit', anchor: 'activation:0', within: 'untilNext' }) as number[];
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((f) => f >= 0 && f < activations[1]! - activations[0]!)).toBe(true);
    // 窓の後の倍率ダメージは、窓の中のものより後
    const inside = frames({ event: 'skillHit', skill: 'skill1', anchor: 'fullBurst:1', within: 'window' }) as number[];
    const after = frames({
      event: 'skillHit',
      skill: 'skill1',
      anchor: 'fullBurst:1',
      within: 'afterWindow',
    }) as number[];
    expect(Math.max(...inside)).toBeLessThan(Math.min(...after));
  });

  it('gives the slot shots as video frames (V-0742)', () => {
    // 枠の発の列を動画のフレームにしたもの。戦闘の始めからは、発の列の頭と同じ順で並ぶ
    const shots = frames({ event: 'shot' }) as number[];
    expect(shots.length).toBe(result.shots[2]!.frames.length);
    expect(frames({ event: 'shot', skip: 3, count: 2 })).toEqual(shots.slice(3, 5));
    // フルバーストの窓の始まりからの最初の発は 0 以上
    expect((frames({ event: 'shot', anchor: 'fullBurst:0', count: 1 }) as number[])[0]).toBeGreaterThanOrEqual(0);
  });

  it('skips the head and cuts to count, and refuses when too few', () => {
    const all = frames({
      event: 'skillHit',
      skill: 'skill1',
      anchor: 'fullBurst:1',
      within: 'afterWindow',
    }) as number[];
    expect(
      frames({ event: 'skillHit', skill: 'skill1', anchor: 'fullBurst:1', within: 'afterWindow', skip: 2, count: 3 }),
    ).toEqual(all.slice(2, 5));
    expect(() =>
      frames({
        event: 'skillHit',
        skill: 'skill1',
        anchor: 'fullBurst:1',
        within: 'afterWindow',
        count: all.length + 1,
      }),
    ).toThrow(/回しか無い/);
  });

  it('refuses unknown events and anchors, and ranges that do not fit the anchor', () => {
    expect(() => frames({ event: 'reload' })).toThrow(/event は/);
    expect(() => frames({ event: 'skillHit', anchor: 'jump:0' })).toThrow(/anchor は/);
    expect(() => frames({ event: 'skillHit', within: 'window' })).toThrow(/within は使えない/);
    expect(() => frames({ event: 'skillHit', anchor: 'activation:0', within: 'window' })).toThrow(/untilNext だけ/);
    expect(() => frames({ event: 'skillHit', anchor: 'fullBurst:99' })).toThrow(/フルバーストが無い/);
  });
});

// V-0622: 出来事ごとの、戦闘の始めからの発の数・命中の期待値の和。録画 0754（ミハラ：ボンディングチェーンが枠 4。S2 のスタック量▲は
// 命中 40 回ごと）のモデルで、弾丸命中率を 0.97 にして見る
describe('eventTallies', () => {
  const input0754 = buildTeamInput(recordingMap(file).get('0754')!, { ...setup, hitRate: 0.97 }, data);
  const result0754 = runSimulation(input0754);
  const tallies = (args: Record<string, number | string | boolean>) =>
    METRICS.eventTallies!.sim(result0754, {
      args: { slot: 4, event: 'dotApply', skill: 'skill1', anchor: 'fullBurst:0', within: 'window', ...args },
      input: input0754,
    }) as number[];
  const shots = tallies({ tally: 'shots' });

  it('counts shots and expected hits from the start of battle up to each event', () => {
    const hits = tallies({ tally: 'hits' });
    expect(shots.length).toBe(hits.length);
    shots.forEach((s, i) => expect(hits[i]).toBeCloseTo(s * 0.97, 6));
    // 命中で数える回数のきっかけなので、▲の命中の通しの数は 40 を越えた所
    hits.forEach((h) => expect(h % 40).toBeLessThan(0.97));
  });

  it('folds the tally into (-modulo/2, modulo/2] with modulo', () => {
    const phases = tallies({ tally: 'shots', modulo: 40 });
    shots.forEach((s, i) => {
      expect(phases[i]).toBeGreaterThan(-20);
      expect(phases[i]).toBeLessThanOrEqual(20);
      expect((s - phases[i]!) % 40).toBe(0);
    });
    expect(() => tallies({ tally: 'kills' })).toThrow(/tally は/);
    expect(() => tallies({ tally: 'shots', anchor: 'start' })).toThrow(/within は使えない/);
  });
});

// 課題 2-59（plan/design-debuff-removal.md 7.3 節）: 出来事 stateEnd・引数 modulo・別の枠の発動の基準（from）。V-0686 の撮影 C の編成
// （クレア・I-DOLL・フラワー・マスト：ロマンチックメイド（操作））をオートバーストで回す。クレアは 1 つおきに撃ち、2 回目から 2 スタックを外す
describe('eventFrames の stateEnd・modulo・from', () => {
  const rids = [842, 304, 354];
  const recording = {
    ...recordingMap(file).get('0969')!,
    team: rids.map((rid, i) => ({ slot: i + 1, rid, name: String(rid), controlled: i === 2 })),
  };
  const team = buildTeamInput(recording, setup, data);
  const run = runSimulation(team);
  const ev = (args: Record<string, number | string | boolean>) =>
    METRICS.eventFrames!.sim(run, { args: { slot: 3, event: 'stateEnd', state: 'drunken', ...args }, input: team });

  it('lists the frames where Drunken comes off, and their phase with modulo', () => {
    const ends = ev({}) as number[];
    expect(ends.length).toBeGreaterThan(0);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    const phases = ev({ modulo: 1000 }) as number[];
    expect(phases).toEqual(ends.map((f) => (f % 1000 > 500 ? (f % 1000) - 1000 : f % 1000)));
  });

  it('measures from the activation of another slot (from)', () => {
    const claire = METRICS.eventFrames!.sim(run, { args: { slot: 1, event: 'activation' }, input: team }) as number[];
    const after = ev({ anchor: 'activation:1', from: 1, within: 'untilNext' }) as number[];
    expect(after.length).toBe(1);
    expect(Math.abs(after[0]!)).toBeLessThan(10);
    expect(claire.length).toBeGreaterThan(1);
  });
});
