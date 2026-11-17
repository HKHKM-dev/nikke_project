import type { CharacterIndexEntry, FilterTable } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import {
  applyTrayFilter,
  burstCooldownValues,
  EMPTY_TRAY_FILTER,
  needsFilterTable,
  trayFilterActive,
} from './trayFilter.ts';

const char = (resourceId: number, ja: string, en: string) => ({ resourceId, name: { ja, en } }) as CharacterIndexEntry;
const rapi = char(10, 'ラピ', 'Rapi');
const anis = char(11, 'アニス', 'Anis');
const neon = char(12, 'ネオン', 'Neon');
const all = [rapi, anis, neon];
const table: FilterTable = {
  formatVersion: 1,
  characters: {
    10: {
      burstCooldown: 40,
      skillText: 'フォーメーション ■自分ニ 「攻撃力21.81%▲」',
      effects: ['attack:self', 'taunt:enemy'],
      special: [],
      traits: [],
    },
    11: {
      burstCooldown: 20,
      skillText: 'グレネード ■味方全体ニ 「クリティカル確率▲」',
      effects: ['critRate:ally'],
      special: ['distributed'],
      traits: ['splitReload'],
    },
    12: {
      burstCooldown: 40,
      skillText: 'ファイアー ■自分ニ 「攻撃力▲」「クリティカル確率▲」',
      effects: ['attack:self', 'critRate:self'],
      special: ['pierce'],
      traits: [],
    },
  },
};

describe('ニケ一覧の絞り込み（文字とバースト CT）', () => {
  it('絞っていなければ、受けた並びをそのまま返す', () => {
    expect(applyTrayFilter(all, EMPTY_TRAY_FILTER, null)).toBe(all);
    expect(trayFilterActive({ ...EMPTY_TRAY_FILTER, name: '  ' })).toBe(false);
  });

  it('名前はひらがな・英語名でも合い、表を待たない', () => {
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, name: 'らぴ' }, null)).toEqual([rapi]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, name: 'NEON' }, null)).toEqual([neon]);
  });

  it('スキルの語はすべてを含むものに、バースト CT は押した値のどれかに合う。項目どうしは AND', () => {
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, skill: 'くりてぃかる' }, table)).toEqual([anis, neon]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, skill: '攻撃力 クリティカル' }, table)).toEqual([neon]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, burstCooldowns: [20, 60] }, table)).toEqual([anis]);
    expect(
      applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, skill: '攻撃力', burstCooldowns: [40], name: 'ネ' }, table),
    ).toEqual([neon]);
  });

  it('表を読み終えるまでは、スキルとバースト CT では絞らない。表に無いニケは、それらで絞る間は出さない', () => {
    const filter = { ...EMPTY_TRAY_FILTER, burstCooldowns: [20] };
    expect(needsFilterTable(filter)).toBe(true);
    expect(applyTrayFilter(all, filter, null)).toEqual(all);
    const stray = char(99, 'ほか', 'Other');
    expect(applyTrayFilter([...all, stray], filter, table)).toEqual([anis]);
    expect(applyTrayFilter([stray], { ...EMPTY_TRAY_FILTER, name: 'ほか' }, table)).toEqual([stray]);
  });

  it('スキルの効果は、同じ効果の自・味は OR、効果どうしは AND', () => {
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, effects: ['critRate:self', 'critRate:ally'] }, table)).toEqual([
      anis,
      neon,
    ]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, effects: ['critRate:self', 'attack:self'] }, table)).toEqual([
      neon,
    ]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, effects: ['critRate:ally', 'attack:self'] }, table)).toEqual(
      [],
    );
  });

  it('特殊攻撃・特性は、押したもののどれか', () => {
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, special: ['pierce', 'distributed'] }, table)).toEqual([
      anis,
      neon,
    ]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, traits: ['splitReload'] }, table)).toEqual([anis]);
    expect(applyTrayFilter(all, { ...EMPTY_TRAY_FILTER, special: ['pierce'], traits: ['splitReload'] }, table)).toEqual(
      [],
    );
  });

  it('バースト CT のボタンは表にある値を小さい順に', () => {
    expect(burstCooldownValues(table)).toEqual([20, 40]);
  });
});
