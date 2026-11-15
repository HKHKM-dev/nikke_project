// 「〈状態〉が終了した時」のフレームの判定（plan/design-state-ended.md 2.1 節）: 件の終わりのフレームに同じ状態を付け直す編成で、
// 1 パス目の読み手（登録の順）・2 パス目（damage の { ended }）・指標（event: stateEnd）がそのフレームを終わりと見るかと、読み手の答えが
// 分かれた記録と注記（4 節）。2 パス目と指標が読む stateEndFrames の家族の扱い
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { METRICS } from '../../records/observations/metrics/index.ts';
import { runSimulation, type SimResult } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import type { SkillRaw } from '../../types.ts';
import { itemsOf, stateEndFrames, type HeldItemView } from '../holders.ts';
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
/**
 * 完全計算を 2 秒ごとに付ける。持続 2.02 秒は周期と同じフレーム数なので、件の終わりのフレームに次の付与が登録される。持続 2 秒は
 * 周期より 1 フレーム短い
 */
const prediction = (durationSeconds: number) => ({
  kind: 'state',
  state: 'prediction',
  trigger: { everySeconds: 2 },
  target: 'self',
  durationSeconds,
  contents,
});
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

/** 終わりを読む効果を、完全計算の付与の前と後に並べた定義（付与の前の付与・後の付与・窓・カウンタ・damage・残弾数減少） */
const readers = (durationSeconds: number) => [
  onEnded('heatEmission'),
  prediction(durationSeconds),
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
];
const spansOf = (result: SimResult) => (state: string) =>
  itemsOf(result.history, { holder: 0, state: state as NamedStateId }).map((i) => [i.start, i.end]);
const metricOf = (input: TeamInput, result: SimResult) =>
  METRICS.eventFrames!.sim(result, { args: { slot: 1, event: 'stateEnd', state: 'prediction' }, input });

describe('終わりの次のフレームに付け直す', () => {
  const { input, result } = run(readers(2));
  const spans = spansOf(result);
  const ends = stateEndFrames(itemsOf(result.history, { holder: 0 }), 'prediction', result.frames);

  it('is seen as an end by every reader on the same frames', () => {
    expect(spans('prediction').length).toBeGreaterThan(1);
    // 戦闘の終わりで切れた件の終わりは入らない
    expect(ends).toEqual(
      spans('prediction')
        .map(([, e]) => e!)
        .filter((e) => e < result.frames),
    );
    expect(spans('heatEmission').map(([s]) => s)).toEqual(ends);
    expect(spans('overheatI').map(([s]) => s)).toEqual(ends);
    expect(result.history.counters.map((c) => c.frame)).toEqual(ends);
    expect(result.instants.filter((x) => x.effect.kind === 'ammoDecrease').map((x) => x.frame)).toEqual(ends);
    expect(result.skillHits.map((h) => h.frame)).toEqual(ends);
    expect(metricOf(input, result)).toEqual(ends);
  });

  it('records no split read and gives no note', () => {
    expect(result.history.stateEndGuesses).toEqual([]);
    expect(result.slots[0]!.notes.filter((n) => n.code === 'state-end-regrant')).toEqual([]);
  });
});

describe('終わりのフレームに付け直す', () => {
  const { input, result } = run(readers(2.02));
  const spans = spansOf(result);
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
    expect(metricOf(input, result)).toEqual([]);
  });

  it('records the split reads and notes them on the slot', () => {
    expect(result.history.stateEndGuesses).toEqual(
      regrants.map((frame) => ({ frame, holder: 0, state: 'prediction' })),
    );
    const notes = result.slots[0]!.notes.filter((n) => n.code === 'state-end-regrant');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message.ja).toContain(
      `完全計算の終わりのフレームに同じ状態が付け直された時が ${regrants.length} 回あった`,
    );
  });
});

describe('stateEndFrames', () => {
  const item = (state: string, start: number, end: number) => ({
    start,
    end,
    origin: { kind: 'state', state } as HeldItemView['origin'],
  });

  it('joins the items of the state and its family, and drops the end at the battle end', () => {
    const items = [
      item('intoTheFraySharpenedResolve', 0, 10),
      item('intoTheFrayPenetrantWish', 10, 20),
      item('prediction', 15, 30),
      item('intoTheFray', 25, 40),
      item('intoTheFraySereneMind', 50, 60),
    ];
    expect(stateEndFrames(items, 'intoTheFray', 60)).toEqual([20, 40]);
    expect(stateEndFrames(items, 'intoTheFrayPenetrantWish', 60)).toEqual([20]);
    expect(stateEndFrames(items, 'prediction', 60)).toEqual([30]);
  });
});
