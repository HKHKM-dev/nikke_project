import { describe, expect, it } from 'vitest';
import {
  batchNamesAndNotes,
  isRecordingName,
  nextRecordingIds,
  parseOnOff,
  parseTreasureArg,
  reservedLabel,
  sequentialRecordingIds,
} from './intake-lib.ts';

describe('番号の割り当て', () => {
  it('takes the numbers after the largest used one, comparing old 3-digit numbers as numbers', () => {
    expect(nextRecordingIds(3, ['0640', '0702', '700', 'L-AN'])).toEqual(['0703', '0704', '0705']);
    // ブランチの歴史に残る 3 桁の番号のほうが大きくても、数として比べる
    expect(nextRecordingIds(1, ['0099', '120'])).toEqual(['0121']);
    expect(nextRecordingIds(2, [])).toEqual(['0001', '0002']);
  });

  it('numbers from --id in order and refuses a bad --id or going past 9999', () => {
    expect(sequentialRecordingIds('0640', 3)).toEqual(['0640', '0641', '0642']);
    expect(() => sequentialRecordingIds('640', 1)).toThrow(/4 桁の数字/);
    expect(() => sequentialRecordingIds('0000', 1)).toThrow(/4 桁の数字/);
    expect(sequentialRecordingIds('9998', 2)).toEqual(['9998', '9999']);
    expect(() => sequentialRecordingIds('9998', 3)).toThrow(/9999 を超える/);
  });

  it('labels the reserved numbers', () => {
    expect(reservedLabel(['0640'])).toBe('録画 0640');
    expect(reservedLabel(['0640', '0641', '0642'])).toBe('録画 0640〜0642');
  });
});

describe('まとめて取り込むときの識別子と注記', () => {
  it('splits --name to one per source and spreads --note', () => {
    expect(batchNamesAndNotes(2, 'helm-s1, helm-s2', [])).toEqual({
      names: ['helm-s1', 'helm-s2'],
      notes: [undefined, undefined],
    });
    expect(batchNamesAndNotes(2, 'a,b', ['同じ'])).toEqual({ names: ['a', 'b'], notes: ['同じ', '同じ'] });
    expect(batchNamesAndNotes(2, 'a,b', ['1 本目', '2 本目'])).toEqual({
      names: ['a', 'b'],
      notes: ['1 本目', '2 本目'],
    });
  });

  it('refuses counts that do not match the sources', () => {
    expect(() => batchNamesAndNotes(3, 'a,b', [])).toThrow(
      '--name は元ファイルと同じ数（3）を , で並べる（2 個あった）',
    );
    expect(() => batchNamesAndNotes(3, 'a,b,c', ['x', 'y'])).toThrow(
      '--note は 1 つか、元ファイルと同じ数（3）を繰り返す（2 個あった）',
    );
  });
});

describe('引数の検査', () => {
  it('accepts only names under the naming rule', () => {
    expect(isRecordingName('scarlet-bs_solo+1')).toBe(true);
    expect(isRecordingName('0abc')).toBe(true);
    for (const bad of ['Helm', '-helm', '_helm', 'helm s1', 'ヘルム', ''])
      expect(isRecordingName(bad), bad).toBe(false);
  });

  it('reads on and off', () => {
    expect(parseOnOff(undefined, '--auto-fire')).toBeNull();
    expect(parseOnOff('on', '--auto-fire')).toBe(true);
    expect(parseOnOff('off', '--auto-fire')).toBe(false);
    expect(() => parseOnOff('yes', '--auto-fire')).toThrow('--auto-fire は on か off');
  });

  it('reads --treasure as slot to phase for slots whose character has a treasure', () => {
    const rids = [271, 870, 10];
    const hasTreasure = (rid: number) => rid !== 10;
    expect(parseTreasureArg(undefined, rids, hasTreasure)).toEqual(new Map());
    expect(parseTreasureArg('1:3, 2:0', rids, hasTreasure)).toEqual(
      new Map([
        [1, 3],
        [2, 0],
      ]),
    );
    expect(() => parseTreasureArg('1:4', rids, hasTreasure)).toThrow(/<枠>:<段階/);
    expect(() => parseTreasureArg('1', rids, hasTreasure)).toThrow(/<枠>:<段階/);
    expect(() => parseTreasureArg('4:1', rids, hasTreasure)).toThrow('--treasure の枠 4 が --rid に無い');
    expect(() => parseTreasureArg('0:1', rids, hasTreasure)).toThrow('--treasure の枠 0 が --rid に無い');
    expect(() => parseTreasureArg('3:1', rids, hasTreasure)).toThrow(
      '--treasure の枠 3（rid 10）のキャラは宝物を持たない',
    );
  });
});
