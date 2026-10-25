import { describe, expect, it } from 'vitest';
import {
  PANEL_DETECT,
  STABLE_SAMPLES,
  TOTAL_PROBE,
  isPanel,
  isTotalScreen,
  measurePanel,
  measureTotal,
  mergeReadings,
  nameMatches,
  parseCount,
  parseReading,
  parseSeconds,
  pickPanelRun,
  pickTotalFrame,
  readingTemplate,
  resultObservations,
  rowCrop,
  runsOf,
  scaleCrop,
  type Reading,
  type TotalSample,
} from './result-screen-lib.ts';

/** TOTAL_PROBE の大きさの画（元の画の座標で塗る） */
function totalFrame(paint: { band?: boolean; edge?: [number, number, number]; around?: number; digits?: number } = {}) {
  const { w, h } = TOTAL_PROBE;
  const buf = new Uint8Array(w * h * 3).fill(12);
  const set = (x: number, y: number, rgb: readonly [number, number, number]) =>
    buf.set(rgb, ((y - TOTAL_PROBE.y) * w + (x - TOTAL_PROBE.x)) * 3);
  if (paint.band !== false) {
    for (let y = 670; y < 689; y++) {
      for (let x = 684; x < 690; x++) set(x, y, paint.edge ?? [255, 1, 10]);
      for (let x = 690; x < 1180; x++) set(x, y, [130, 2, 41]);
    }
  }
  if (paint.around !== undefined)
    for (const y of [663, 664, 691, 692]) for (let x = 840; x < 900; x++) set(x, y, [paint.around, paint.around, paint.around]); // prettier-ignore
  if (paint.digits !== undefined)
    for (let y = 700; y < 750; y++) for (let x = 900 + paint.digits * 30; x < 920 + paint.digits * 30; x++) set(x, y, [240, 240, 240]); // prettier-ignore
  return buf;
}

/** PANEL_DETECT の大きさの画。暗幕・白いカード・青いヘッダー */
function panelFrame({ header = true, card = 230, outside = 15 } = {}) {
  const { w, h } = PANEL_DETECT;
  const buf = new Uint8Array(w * h * 3).fill(outside);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x >= 24 && x < 41 && y >= 8 && y < 31) buf.fill(card, i, i + 3);
      if (header && x >= 23 && x < 42 && y >= 1 && y < 7) buf.set([30, 110, 230], i);
    }
  return buf;
}

describe('(a) TOTAL DAMAGE の画面の検出', () => {
  it('赤い帯の 3 つの特徴がそろうと立つ', () => {
    expect(isTotalScreen(measureTotal(totalFrame(), null))).toBe(true);
  });

  it('左端が純な赤でない・本体が無い・上下が明るい、のどれかで立たない', () => {
    expect(isTotalScreen(measureTotal(totalFrame({ edge: [200, 120, 120] }), null))).toBe(false);
    expect(isTotalScreen(measureTotal(totalFrame({ band: false }), null))).toBe(false);
    expect(isTotalScreen(measureTotal(totalFrame({ around: 180 }), null))).toBe(false);
  });

  it('数字の領域の変わった画素の割合を、前のサンプルと比べて出す（前が無ければ 1）', () => {
    const a = totalFrame({ digits: 1 });
    expect(measureTotal(a, null).changed).toBe(1);
    expect(measureTotal(a, a).changed).toBe(0);
    expect(measureTotal(totalFrame({ digits: 2 }), a).changed).toBeGreaterThan(0.01);
  });
});

describe('(b) 戦闘履歴のパネルの検出', () => {
  it('暗幕と青いヘッダーの AND', () => {
    expect(isPanel(measurePanel(panelFrame()))).toBe(true);
    expect(isPanel(measurePanel(panelFrame({ header: false })))).toBe(false);
    expect(isPanel(measurePanel(panelFrame({ outside: 200 })))).toBe(false);
  });
});

describe('runsOf', () => {
  it('立ったサンプルを連続したものどうしでまとめる', () => {
    const s = [0, 1, 1, 0, 1, 0, 1, 1].map((v, i) => ({ frame: i * 3, v }));
    expect(runsOf(s, (x) => x.v === 1)).toEqual([
      { from: 3, to: 6 },
      { from: 12, to: 12 },
      { from: 18, to: 21 },
    ]);
  });
});

describe('pickTotalFrame', () => {
  /** (a) の外 → 数字が増える → 行き過ぎて戻る（短く止まる）→ 止まる → (a) の外 */
  const series = (stableTail: number): TotalSample[] => {
    const changed = [
      ...Array<number>(5).fill(0.2),
      ...Array<number>(4).fill(0), // 増える途中で短く止まる（STABLE_SAMPLES 未満）
      ...Array<number>(3).fill(0.1), // 行き過ぎて戻る
      ...Array<number>(stableTail).fill(0.001),
    ];
    return [
      { frame: 0, total: false, changed: 0.3 },
      ...changed.map((c, i) => ({ frame: (i + 1) * 3, total: true, changed: c })),
      { frame: (changed.length + 1) * 3, total: false, changed: 0.5 },
    ];
  };

  it('止まった最後の伸びの中央を取る', () => {
    // 止まった伸びは 13〜32 番目（frame 39〜96）の 20 点。中央は 22 番目と 23 番目の前の方
    expect(pickTotalFrame(series(20))).toBe(66);
  });

  it('止まった伸びが STABLE_SAMPLES に満たなければ null', () => {
    expect(pickTotalFrame(series(STABLE_SAMPLES - 1))).toBeNull();
  });

  it('(a) が無ければ null', () => {
    expect(pickTotalFrame([{ frame: 0, total: false, changed: 0 }])).toBeNull();
  });
});

describe('pickPanelRun', () => {
  const runs = [
    { from: 600, to: 660 }, // 戦闘中の一時停止
    { from: 2595, to: 2805 },
  ];

  it('(a) の後の最初の区間', () => {
    expect(pickPanelRun(runs, 2520)).toEqual({ run: runs[1] });
    expect(pickPanelRun(runs, 3000).run).toBeNull();
  });

  it('(a) が無ければ最後の区間。2 つ以上なら注意', () => {
    const r = pickPanelRun(runs, null);
    expect(r.run).toEqual(runs[1]);
    expect(r.warning).toContain('一時停止');
    expect(pickPanelRun([runs[1]!], null)).toEqual({ run: runs[1] });
  });
});

describe('切り出しの位置', () => {
  it('枠の行は 129.25px おき', () => {
    expect(rowCrop(1)).toEqual({ x: 826, y: 255, w: 372, h: 112 });
    expect(rowCrop(5)).toEqual({ x: 826, y: 772, w: 372, h: 112 });
    expect(() => rowCrop(6)).toThrow();
  });

  it('ほかの大きさの録画は比で直す', () => {
    expect(scaleCrop(rowCrop(2), 2560, 1440)).toEqual({ x: 1101, y: 512, w: 496, h: 149 });
    expect(scaleCrop(rowCrop(2), 1920, 1080)).toEqual(rowCrop(2));
  });
});

describe('読みの解釈', () => {
  it('数とカンマ付きの文字列。null は読めない', () => {
    expect(parseCount('4,652,679', 'x')).toBe(4652679);
    expect(parseCount('372433', 'x')).toBe(372433);
    expect(parseCount(0, 'x')).toBe(0);
    expect(parseCount(null, 'x')).toBeNull();
  });

  it('負・小数・数字以外・カンマの位置の誤りは拒否', () => {
    for (const v of [-1, 1.5, 'abc', '4,65,679', '1.000']) expect(() => parseCount(v, 'x')).toThrow();
  });

  it('秒は "mm:ss" か数', () => {
    expect(parseSeconds('00:16', 'x')).toBe(16);
    expect(parseSeconds('03:00', 'x')).toBe(180);
    expect(parseSeconds(17, 'x')).toBe(17);
    expect(() => parseSeconds('0:75', 'x')).toThrow();
  });

  it('雛形は値が null で、名札が空なので読みとしては拒否', () => {
    const t = readingTemplate('0051', { total: 2520, panel: 2702 });
    expect(t.slots).toHaveLength(5);
    expect(t.slots.every((s) => s.damage === null)).toBe(true);
    expect(() => parseReading(t, 'x')).toThrow('名札');
  });
});

const TEAM = [
  { slot: 1, name: 'リター' },
  { slot: 2, name: '紅蓮：ブラックシャドウ' },
];

function reading(reader: string, patch: (r: Reading) => void = () => {}): Reading {
  const json = {
    recording: '0051',
    reader,
    frames: { total: 2520, panel: 2702 },
    totalDamage: '62,010,484',
    phase: 9,
    engagementSeconds: '00:16',
    slots: [
      { slot: 1, name: 'リター', damage: '4,652,679', shield: 0, heal: 0 },
      { slot: 2, name: '蓮：ブラックシ', damage: '10,271,016', shield: '372,433', heal: '65,620' },
      { slot: 3, name: null, damage: null, shield: null, heal: null },
    ],
  };
  const r = parseReading(json, reader);
  patch(r);
  return r;
}

describe('mergeReadings', () => {
  it('全欄一致なら全部を採る（空き枠は入れない）', () => {
    const m = mergeReadings(reading('a'), reading('b'), TEAM);
    expect(m.mismatches).toEqual([]);
    expect(m.warnings).toEqual([]);
    expect(m.agreed).toEqual({
      totalDamage: 62010484,
      phase: 9,
      engagementSeconds: 16,
      damage: [4652679, 10271016],
      shield: [0, 372433],
      heal: [0, 65620],
    });
  });

  it('1 欄だけ違えば、その欄とそれを含む配列を採らない', () => {
    const m = mergeReadings(
      reading('a'),
      reading('b', (r) => (r.slots[1]!.damage = 10271018)),
      TEAM,
    );
    expect(m.mismatches).toEqual(['slots[2].damage: a=10271016 / b=10271018']);
    expect(m.agreed.damage).toBeUndefined();
    expect(m.agreed.shield).toEqual([0, 372433]);
  });

  it('片方が読めない欄は採らない', () => {
    const m = mergeReadings(
      reading('a', (r) => (r.totalDamage = null)),
      reading('b'),
      TEAM,
    );
    expect(m.mismatches).toEqual(['totalDamage: a=読めない / b=62010484']);
    expect(m.agreed.totalDamage).toBeUndefined();
  });

  it('(a) の画面が無い録画では TOTAL DAMAGE と段階を比べない', () => {
    const noTotal = (r: Reading) => {
      r.frames.total = null;
      r.totalDamage = null;
      r.phase = null;
    };
    const m = mergeReadings(reading('a', noTotal), reading('b', noTotal), TEAM);
    expect(m.mismatches).toEqual([]);
    expect(m.agreed.totalDamage).toBeUndefined();
  });

  it('名前が台帳と合わなければ注意（値は採る）', () => {
    const m = mergeReadings(
      reading('a', (r) => (r.slots[0]!.name = 'クラウン')),
      reading('b'),
      TEAM,
    );
    expect(m.warnings).toEqual(['枠 1: a の名前「クラウン」が台帳の「リター」と合わない']);
    expect(m.agreed.damage).toEqual([4652679, 10271016]);
  });

  it('同じ名札・違うフレームは拒否', () => {
    expect(() => mergeReadings(reading('a'), reading('a'), TEAM)).toThrow('名札');
    expect(() =>
      mergeReadings(
        reading('a'),
        reading('b', (r) => (r.frames.panel = 2700)),
        TEAM,
      ),
    ).toThrow('フレーム');
  });
});

describe('nameMatches', () => {
  it('横スクロールで切れた名前は部分一致で合う', () => {
    expect(nameMatches('蓮：ブラックシ', '紅蓮：ブラックシャドウ')).toBe(true);
    expect(nameMatches('ルジャーE.G.', 'ソルジャーE.G.')).toBe(true);
    expect(nameMatches('クラウン', 'リター')).toBe(false);
    expect(nameMatches('', 'リター')).toBe(false);
  });
});

describe('resultObservations', () => {
  const ctx = {
    recording: '0051',
    team: TEAM,
    target: 'トーカティブ',
    readers: ['a', 'b'] as [string, string],
    frames: { total: 2520, panel: 2702 },
  };

  it('6 件を設計書の表の順に、証拠フレームを付けて出す', () => {
    const obs = resultObservations(mergeReadings(reading('a'), reading('b'), TEAM).agreed, ctx);
    expect(obs.map((o) => [o.kind, o.value])).toEqual([
      ['total', [4652679, 10271016]],
      ['total', [0, 372433]],
      ['total', [0, 65620]],
      ['timing', 16],
      ['total', 62010484],
      ['count', 9],
    ]);
    expect(obs.every((o) => o.use === 'record' && o.method?.tool === 'result-screen.ts@1')).toBe(true);
    expect(obs[0]!.description).toBe('戦闘履歴のパネルの与ダメージ（枠順: リター・紅蓮：ブラックシャドウ）');
    expect(obs[0]!.evidence).toEqual(['frames/0051_f2702_result-panel.jpg']);
    expect(obs[3]!.unit).toBe('s');
    expect(obs[4]!.description).toBe('リザルト画面の TOTAL DAMAGE（トーカティブ）');
    expect(obs[4]!.evidence).toEqual(['frames/0051_f2520_result-total.jpg']);
  });

  it('採らなかった欄は出さない', () => {
    expect(resultObservations({ phase: 9 }, ctx).map((o) => o.kind)).toEqual(['count']);
  });
});
