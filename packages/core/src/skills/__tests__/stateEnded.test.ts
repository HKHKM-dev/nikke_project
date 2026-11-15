// 「〈状態〉が終了した時」のフレームの判定（plan/design-state-ended.md 2.1 節）: 件の終わりのフレームに同じ状態を付け直す編成で、
// 1 パス目の読み手（登録の順）・2 パス目（damage の { ended }）・指標（event: stateEnd）がそのフレームを終わりと見るか
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { METRICS } from '../../records/observations/metrics/index.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import type { SkillRaw } from '../../types.ts';
import { itemsOf } from '../holders.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import type { NamedStateId } from '../states.ts';
import { parseSkillDefinition } from '../types.ts';

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const skill = (values: string[]): SkillRaw => ({
  id: 9,
  name: { ja: 'テスト', en: 'Test' },
  description: { ja: '', en: '' },
  values: values.map(tenLevels),
});
const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const contents = [{ stat: 'attack', ref: 1 }];
const ended = { ended: 'prediction' };
/** 完全計算を 2 秒ごとに付ける。持続は周期と同じフレーム数なので、件の終わりのフレームに次の付与が登録される */
const prediction = {
  kind: 'state',
  state: 'prediction',
  trigger: { everySeconds: 2 },
  target: 'self',
  durationSeconds: 2.02,
  contents,
};
const onEnded = (state: string) => ({
  kind: 'state',
  state,
  trigger: ended,
  target: 'self',
  durationSeconds: 0.5,
  contents,
});

function run(effects: unknown[]) {
  const definition = parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-15',
    skills: { skill1: { effects }, skill2: none, burst: none },
  });
  const character = makeCharacter({}, { skills: { skill1: skill(['10', '50']), skill2: skill([]), burst: skill([]) } });
  const input: TeamInput = {
    slots: [
      {
        character,
        growth: { level: 1, grade: 0, core: 0 },
        attackOverride: 1000,
        hpOverride: 10000,
        defenceOverride: 100,
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: { defence: 100, element: null, hasCore: false },
    durationSeconds: 10,
    burst: false,
  };
  return { input, result: runSimulation(input) };
}

describe('終わりのフレームに同じ状態を付け直す', () => {
  const { input, result } = run([
    onEnded('heatEmission'),
    prediction,
    onEnded('overheatI'),
    {
      kind: 'state',
      state: 'overheatII',
      trigger: { everySeconds: 2 },
      target: 'self',
      durationUntil: { stateEnd: 'prediction' },
      contents,
    },
    { kind: 'counterChange', counter: 'firepowerGauge', trigger: ended, target: 'self', amount: 1 },
    { kind: 'damage', trigger: ended, damageType: 'skill', ref: 2 },
    { kind: 'ammoDecrease', trigger: ended, target: 'self', ref: 1 },
  ]);
  const spans = (state: string) =>
    itemsOf(result.history, { holder: 0, state: state as NamedStateId }).map((i) => [i.start, i.end]);
  // 付け直しが件を延ばし、完全計算は 1 つの件につながる。付け直しのフレーム
  const [[start, end]] = spans('prediction') as [[number, number]];
  const period = start;
  const regrants = [2, 3, 4].map((n) => n * period).filter((f) => f < end);

  it('re-grants on the end frame and joins into one item', () => {
    expect(spans('prediction')).toHaveLength(1);
    expect(regrants.length).toBeGreaterThan(0);
  });

  it('is seen as an end by readers before the re-grant in the frame', () => {
    // 段 1 で付け直しより前に書いた付与は付く
    expect(spans('heatEmission').map(([s]) => s)).toEqual(regrants);
    // { stateEnd } の窓（registerEnds。段 1 の付与より前）は最初の付け直しのフレームで閉じる
    expect(spans('overheatII')).toEqual([[period, regrants[0]]]);
  });

  it('is not seen as an end by readers after the re-grant, the second pass or the metric', () => {
    expect(spans('overheatI')).toEqual([]);
    expect(result.history.counters).toEqual([]);
    expect(result.instants.filter((x) => x.effect.kind === 'ammoDecrease')).toEqual([]);
    expect(result.skillHits).toEqual([]);
    expect(
      METRICS.eventFrames!.sim(result, { args: { slot: 1, event: 'stateEnd', state: 'prediction' }, input }),
    ).toEqual([]);
  });
});
