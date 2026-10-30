// 最小構成の検査の窓の端編（plan/design-minimal-edge.md）: 結論の edge の検査、端だけ未確定の判定、sim で端を動かす変換、
// 感度の結果の古さ。窓の端から離れた観測値は外れ、端の範囲の中の観測値は残る
import { describe, expect, it } from 'vitest';
import {
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
} from '../../../scripts/records-data.ts';
import { runSimulation } from '../../sim/engine.ts';
import { itemsOf, shiftEdges } from '../../skills/holders.ts';
import { validateMinimalFields, type Claim } from '../claims.ts';
import { buildTeamInput, type Observation } from '../observations.ts';
import { edgeRangeOf, elementsOf, relevanceOf, sensitivityKey, type SensitivityEntry } from '../relevance.ts';
import { edgeDefinition, edgeShiftOf, sensitivityOf } from '../sensitivity.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const claims = loadClaims();
const observations = loadObservations();
const ctx = { recordings, ...data, claims, data };

const claim = (patch: Partial<Claim>): Claim => ({
  id: 'C-9001',
  text: 't',
  state: '仮説',
  topic: 'スキル・キャラ固有',
  grade: '単独実測',
  basis: '`0101-01`',
  model: 'm',
  replaces: [],
  updated: '2026-10-17',
  observations: ['0101-01'],
  subject: { places: ['data/skills/871.json の burst の effects[1]'] },
  ...patch,
});

describe('結論の edge', () => {
  it('accepts ranges of either or both edges', () => {
    expect(validateMinimalFields(claim({ edge: { start: [0, 7], end: [0, 7] } }))).toEqual([]);
    expect(validateMinimalFields(claim({ edge: { start: [-3, 2] } }))).toEqual([]);
    expect(validateMinimalFields(claim({ edge: { end: [0, 0] } }))).toEqual([]);
  });

  it('rejects edge on a claim that is not 仮説, without subject.places, and malformed ranges', () => {
    const bad = (patch: Partial<Claim>) => validateMinimalFields(claim(patch));
    expect(bad({ state: '確定', edge: { start: [0, 7] } })).toEqual([expect.stringMatching(/仮説の結論にだけ/)]);
    expect(bad({ subject: { mechanism: 'clock' }, edge: { start: [0, 7] } })).toEqual([
      expect.stringMatching(/subject\.places/),
    ]);
    expect(bad({ edge: {} })).toEqual([expect.stringMatching(/1 つ以上/)]);
    expect(bad({ edge: { start: [3, 1] } })).toEqual([expect.stringMatching(/edge\.start/)]);
    expect(bad({ edge: { end: [0, 31] } })).toEqual([expect.stringMatching(/edge\.end/)]);
    expect(bad({ edge: { start: [0, 1.5] } })).toEqual([expect.stringMatching(/edge\.start/)]);
    expect(bad({ edge: { start: [0] as unknown as [number, number] } })).toEqual([
      expect.stringMatching(/edge\.start/),
    ]);
    expect(bad({ edge: { start: [0, 1], width: 3 } as unknown as Claim['edge'] })).toEqual([
      expect.stringMatching(/1 つ以上/),
    ]);
  });
});

// 録画 0258 は雪子のバーストを使う編成。雪子 burst の effects[1]（1more の攻撃力▲）は C-0352（確定）と C-0614 に結ぶ。
// C-0614 は確定なので、ここでは仮説・edge に戻した形（確定にする前の C-0511 と同じ）を基にする
const rec = recordings.get('0258')!;
const yukiko = elementsOf(rec, ctx).find((e) => e.places.includes('data/skills/871.json の burst の effects[1]'))!;
const asOpenEdge = (c: Claim, edge: NonNullable<Claim['edge']>) => {
  c.state = '仮説';
  c.edge = edge;
};
const withClaims = (patch: (byId: Map<string, Claim>) => void = () => {}) => {
  const byId = new Map(claims.map((c) => [c.id, structuredClone(c)]));
  asOpenEdge(byId.get('C-0614')!, { start: [0, 7], end: [0, 7] });
  patch(byId);
  return { ...ctx, claims: [...byId.values()] };
};

describe('端だけ未確定の判定', () => {
  it('returns the range of the open edge hypothesis', () => {
    expect(edgeRangeOf(yukiko, rec, withClaims())).toEqual({ start: [0, 7], end: [0, 7] });
  });

  it('is not edge-only without edge, without a confirmed claim, with another open claim, or for another place', () => {
    const noEdge = withClaims((m) => delete m.get('C-0614')!.edge);
    expect(edgeRangeOf(yukiko, rec, noEdge)).toBeUndefined();
    const noConfirmed = withClaims((m) => (m.get('C-0352')!.state = '仮説'));
    expect(edgeRangeOf(yukiko, rec, noConfirmed)).toBeUndefined();
    const otherPlace = withClaims(
      (m) => (m.get('C-0614')!.subject = { places: ['data/skills/871.json の burst の effects[0]'] }),
    );
    expect(edgeRangeOf(yukiko, rec, otherPlace)).toBeUndefined();
    const mixed = { ...yukiko, claims: [...yukiko.claims, 'C-0510'] };
    const both = withClaims((m) => (m.get('C-0510')!.state = '仮説'));
    expect(edgeRangeOf(mixed, rec, both)).toBeUndefined();
  });

  it('takes the union of the ranges of two edge hypotheses', () => {
    const mixed = { ...yukiko, claims: [...yukiko.claims, 'C-0510'] };
    const two = withClaims((m) => {
      const c = m.get('C-0510')!;
      c.subject = { places: ['data/skills/871.json の burst の effects[1]'] };
      asOpenEdge(c, { start: [-2, 3], end: [1, 9] });
    });
    expect(edgeRangeOf(mixed, rec, two)).toEqual({ start: [-2, 7], end: [0, 9] });
  });

  it('does not make an earlier start on an effect read in the first pass edge-only', () => {
    // アニス：スター burst の effects[1] はチャージ時間の固定（射撃の分類）
    const anis = recordings.get('0162')!;
    const e = elementsOf(anis, ctx).find((x) => x.places.includes('data/skills/17.json の burst の effects[1]'))!;
    const early = withClaims((m) => (m.get('C-0520')!.edge = { start: [-1, 3], end: [0, 3] }));
    expect(edgeRangeOf(e, anis, early)).toBeUndefined();
    // 攻撃ダメージ▲（effects[2]。与ダメージの値の分類）には当てる。ただし C-0203 などほかの開いた結論があれば端だけ未確定にならない
    const damage = elementsOf(anis, ctx).find((x) => x.places.includes('data/skills/17.json の burst の effects[2]'))!;
    const onlyEdge = withClaims((m) => {
      m.get('C-0520')!.edge = { start: [-1, 3], end: [0, 3] };
      for (const id of damage.claims) if (id !== 'C-0520' && m.get(id)!.state !== '確定') m.get(id)!.state = '確定';
    });
    expect(edgeRangeOf(damage, anis, onlyEdge)).toEqual({ start: [-1, 3], end: [0, 3] });
  });
});

describe('sim で端を動かす', () => {
  it('shifts each item and drops empty ones', () => {
    const items = [
      { start: 0, end: 10 },
      { start: 100, end: 104 },
    ];
    expect(shiftEdges(items, { start: -3, end: 2 }, 200)).toEqual([
      { start: 0, end: 12 },
      { start: 97, end: 106 },
    ]);
    expect(shiftEdges(items, { start: 3, end: -3 }, 200)).toEqual([{ start: 3, end: 7 }]);
  });

  it('widens to the outer and narrows to the inner ends of the range', () => {
    const range = { start: [0, 7], end: [-2, 5] } as const satisfies Parameters<typeof edgeShiftOf>[0];
    expect(edgeShiftOf({ start: [0, 7], end: [-2, 5] }, 'widen')).toEqual({ start: 0, end: 5 });
    expect(edgeShiftOf({ start: [...range.start], end: [...range.end] }, 'narrow')).toEqual({ start: 7, end: -2 });
    expect(edgeShiftOf({ start: [0, 0], end: [0, 0] }, 'widen')).toBeUndefined();
  });

  it('moves the windows of the effect in the simulation', () => {
    const o = observations.find((x) => x.id === '0258-04')!;
    const slot = rec.team.findIndex((m) => m.rid === 871);
    const filter = { sourceSlotIndex: slot, kind: 'timed' as const, skill: 'burst' as const, effectIndex: 1 };
    const base = itemsOf(runSimulation(buildTeamInput(rec, o.compare!.setup, data)).history, filter);
    const def = edgeDefinition(data.skills.get(871)!, yukiko.effectRef!, { start: 3, end: -4 })!;
    const moved = itemsOf(
      runSimulation(buildTeamInput(rec, o.compare!.setup, { ...data, skills: new Map([...data.skills, [871, def]]) }))
        .history,
      filter,
    );
    expect(base.length).toBeGreaterThan(0);
    expect(moved.map((i) => [i.start, i.end])).toEqual(base.map((i) => [i.start + 3, i.end - 4]));
    // 状態の付与や passive には付けない
    expect(
      edgeDefinition(data.skills.get(871)!, { ...yukiko.effectRef!, index: 0 }, { start: 3, end: 0 }),
    ).toBeUndefined();
  });
});

describe('感度で外れる組と残る組', () => {
  const openCtx = withClaims();
  const o = observations.find((x) => x.id === '0258-04')!;
  const slot = rec.team.findIndex((m) => m.rid === 871);
  const windows = itemsOf(runSimulation(buildTeamInput(rec, o.compare!.setup, data)).history, {
    sourceSlotIndex: slot,
    kind: 'timed',
    skill: 'burst',
    effectIndex: 1,
  });
  const entryOf = (obs: Observation) => sensitivityOf(obs, openCtx).find((e) => e.element === yukiko.name)!;

  it('drops the element for an observation far from the edges (0258-04)', () => {
    const e = entryOf(o);
    expect(e.edge?.range).toEqual({ start: [0, 7], end: [0, 7] });
    expect(e.effective).toBe(false);
  });

  it('keeps the element for an observation inside the range of an edge (must not be dropped)', () => {
    // 同じ観測値の比べるフレームを、窓の付き始めの 3f 後（縮めると▲が外れる）と、切れ目の 3f 後（広げると▲が乗る）に動かす
    const holder = windows[0]!.holder;
    for (const frame of [windows[0]!.start + 3, windows[0]!.end + 3]) {
      const near: Observation = {
        ...o,
        id: '0258-04',
        compare: { ...o.compare!, args: { ...o.compare!.args, slot: holder + 1, frame } },
      };
      expect(entryOf(near).effective).toBe(true);
    }
  });

  it('treats a result of another range, or of P−・P+, as stale', () => {
    const c: Claim = { ...claims.find((x) => x.id === 'C-0350')!, minimal: undefined, observations: [o.id] };
    const key = sensitivityKey(o, rec, openCtx);
    const run = (entry: Partial<SensitivityEntry>) =>
      relevanceOf(
        [c],
        observations,
        openCtx,
        new Map([
          [
            `${o.id}|${yukiko.name}`,
            { observation: o.id, element: yukiko.name, key, effective: false, minus: null, plus: null, ...entry },
          ],
        ]),
      )[0]!;
    const fresh = run({ edge: { range: { start: [0, 7], end: [0, 7] }, widen: 0, narrow: 0 } });
    expect(fresh.warnings.flatMap((w) => w.elements.map((x) => x.name))).not.toContain(yukiko.name);
    for (const stale of [{}, { edge: { range: { start: [0, 5], end: [0, 7] }, widen: 0, narrow: 0 } }] as const) {
      const r = run(stale as Partial<SensitivityEntry>);
      expect(r.unmeasured).toBeGreaterThan(0);
    }
  });
});
