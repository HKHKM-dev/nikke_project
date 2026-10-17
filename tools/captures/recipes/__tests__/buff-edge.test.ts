import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classify, commonRange, edgeOf, rangeOf, withScales, type Edge } from '../buff-edge.ts';

// fixtures は録画の HUD の増分（hud-jumps@2 のキャッシュ）のうち、事象の前後の行だけ（[フレーム, 増分]）
type Fixture = { recording: string; events: number[]; rows: [number, number][] };
function fixture(id: string): { events: number[]; rows: { frame: number; increment: number }[] } {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/buff-edge-${id}.json`, import.meta.url), 'utf8')) as Fixture;
  return { events: f.events, rows: f.rows.map(([frame, increment]) => ({ frame, increment })) };
}

// モデルの hitDamage（コア × 会心 × 距離の 8 通り。I-DOLL・サン。灼熱の的・3 分モード）。
// 302・402: ▲なしはモデルの f1300、▲あり（クラウンの攻撃ダメージ▲）は f380。042: ▲あり（アドミのクリティカルダメージ▲）は f1570、
// 切れ目はフルバースト中の f982（▲なし）・f600（▲あり）
const SUN_OFF = [9972.64, 12964.44, 14958.97, 17950.76, 19945.29, 22937.08, 24931.61, 27923.4];
const CROWN_ON = [13586.73, 17662.75, 20380.1, 24456.12, 27173.46, 31249.48, 33966.83, 38042.85];
const ADMI_ON = [9972.64, 12964.44, 17785.21, 20777.01, 19945.29, 22937.08, 27757.86, 30749.65];
const SUN_OFF_FB = [14958.97, 17950.76, 19945.29, 22937.08, 24931.61, 27923.4, 29917.93, 32909.73];
const ADMI_ON_FB = [14958.97, 17950.76, 22771.54, 25763.33, 24931.61, 27923.4, 32744.18, 35735.97];
// サンの S2 の攻撃力▲（攻撃を受けた時。モデルは被弾を扱わない。C-0275）
const SUN_S2 = [1.091];

function edges(id: string, off: number[], on: number[], o: { tol: number; from: number; to: number; edge: Edge }) {
  const { events, rows } = fixture(id);
  const g = { ...o, off: withScales(off, SUN_S2), on: withScales(on, SUN_S2) };
  return events.map((e) => edgeOf(rows, e, g));
}

describe('classify', () => {
  it('片方の格子だけに合えば▲なし・▲あり、両方ならば区別できない、どちらにも合わなければ外れ', () => {
    expect(classify(14959, SUN_OFF, ADMI_ON, 1.5)).toBe('absent');
    expect(classify(17785, SUN_OFF, ADMI_ON, 1.5)).toBe('present');
    expect(classify(9973, SUN_OFF, ADMI_ON, 1.5)).toBe('both');
    expect(classify(336261, SUN_OFF, ADMI_ON, 1.5)).toBe('none');
  });
});

describe('commonRange', () => {
  it('前の役の最も遅い発 + 1 〜 後の役の最も早い発。片側だけの回も、その側で狭める', () => {
    expect(commonRange([{ before: 8, after: 24 }, { before: 15 }, { before: 12, after: 22 }])).toEqual({
      low: 16,
      high: 22,
    });
    expect(commonRange([{ before: 30 }, { after: 22 }])).toBeUndefined();
    expect(commonRange([{ before: 3 }])).toBeUndefined();
  });
});

// 手で読んだ境（V-0378 の 302-23、V-0389 の 402-10、V-0368 の 042-32・042-33）と同じになる
describe('手で読んだ境との一致', () => {
  const crown = { tol: 2, from: -200, to: 60, edge: 'start' as const };

  it('録画 302: クラウンの攻撃ダメージ▲の▲の無い最後の発・▲の乗った最初の発（302-23）', () => {
    const es = edges('302', SUN_OFF, CROWN_ON, crown);
    expect(es.map((e) => e.before)).toEqual([-9, -7, -7, -10, -10, -7, -8, -9, -11]);
    expect(es.map((e) => e.after)).toEqual([3, 0, -1, 1, -3, -1, -2, -3, -5]);
    expect(es.every((e) => e.conflicts.length === 0)).toBe(true);
    expect(rangeOf(es[0]!)).toEqual({ low: -8, high: 3 }); // 302-14
    expect(commonRange(es)).toEqual({ low: -6, high: -5 });
  });

  it('録画 402: 同じ（402-10。6 回目は発動の前がリロードで -149f）', () => {
    const es = edges('402', SUN_OFF, CROWN_ON, crown);
    expect(es.map((e) => e.before)).toEqual([-9, -11, -10, -9, -6, -149, -6, -11, -8]);
    expect(es.map((e) => e.after)).toEqual([3, -5, -5, -3, 0, 0, 0, -5, -1]);
  });

  it('録画 042: アドミのクリティカルダメージ▲の付き始め（042-32 の 16〜22f）', () => {
    const es = edges('042', SUN_OFF, ADMI_ON, { tol: 1.5, from: -30, to: 50, edge: 'start' });
    expect(es[6]!.before).toBe(8);
    expect(es[6]!.after).toBe(24);
    expect(es[8]!.after).toBe(22);
    expect(Math.max(...es.flatMap((e) => (e.before === undefined ? [] : [e.before])))).toBe(15);
    expect(commonRange(es)).toEqual({ low: 16, high: 22 });
  });

  it('録画 042: 切れ目（042-33 の▲の乗った最後の発と▲の無い最初の発）', () => {
    const es = edges('042', SUN_OFF_FB, ADMI_ON_FB, { tol: 1.5, from: 590, to: 638, edge: 'end' });
    expect(es.flatMap((e) => (e.before === undefined ? [] : [e.before]))).toEqual([614, 605, 614, 617, 600, 621]);
    expect(es.flatMap((e) => (e.after === undefined ? [] : [e.after]))).toEqual([635]);
  });
});
