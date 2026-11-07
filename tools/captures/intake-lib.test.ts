import { describe, expect, it } from 'vitest';
import {
  batchNamesAndNotes,
  isRecordingName,
  nextRecordingIds,
  parseOnOff,
  parseTreasureArg,
  reservedLabel,
  sequentialRecordingIds,
  transientDriveError,
  UPLOAD_POLL_LIMIT,
  UPLOAD_POLL_MS,
  uploadSettled,
  waitUploadSettled,
  type UploadPoll,
} from './intake-lib.ts';

describe('番号の割り当て', () => {
  it('takes the numbers after the largest used one, comparing old 3-digit numbers as numbers', () => {
    expect(nextRecordingIds(3, ['0640', '0702', '700', 'L-AN'])).toEqual(['0703', '0704', '0705']);
    // ブランチの歴史に残る 3 桁の番号のほうが大きくても、数として比べる
    expect(nextRecordingIds(1, ['0099', '120'])).toEqual(['0121']);
    expect(nextRecordingIds(2, [])).toEqual(['0001', '0002']);
    expect(() => nextRecordingIds(2, ['9999'])).toThrow(/9999 を超える/);
  });

  it('numbers from --id in order and refuses a bad --id or going past 9999', () => {
    expect(sequentialRecordingIds('0640', 3)).toEqual(['0640', '0641', '0642']);
    expect(() => sequentialRecordingIds('640', 1)).toThrow(/4 桁の数字/);
    expect(() => sequentialRecordingIds('0000', 1)).toThrow(/4 桁の数字/);
    expect(sequentialRecordingIds('9998', 2)).toEqual(['9998', '9999']);
    expect(() => sequentialRecordingIds('9998', 3)).toThrow('録画の番号が 9999 を超える（9998 から 3 本）');
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

describe('drive: の取り込み元を上げ終えるまで待つか', () => {
  it('re-reads the size every 30 seconds and takes the upload as settled only when it did not change', () => {
    expect(UPLOAD_POLL_MS).toBe(30_000);
    expect(uploadSettled('245100000', '245100000')).toBe(true);
    expect(uploadSettled('237600000', '245100000')).toBe(false);
    expect(uploadSettled(undefined, '245100000')).toBe(false);
    expect(uploadSettled(undefined, undefined)).toBe(false);
  });

  it('gives up after 10 polls (5 minutes)', () => {
    expect(UPLOAD_POLL_LIMIT).toBe(10);
  });

  it('keeps waiting on network failures, timeouts, 429 and 5xx, and stops on other HTTP errors', () => {
    expect(transientDriveError(new TypeError('fetch failed'))).toBe(true);
    expect(transientDriveError(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))).toBe(true);
    expect(transientDriveError(Object.assign(new Error('rate'), { status: 429 }))).toBe(true);
    expect(transientDriveError(Object.assign(new Error('server'), { status: 503 }))).toBe(true);
    expect(transientDriveError(Object.assign(new Error('auth'), { status: 401 }))).toBe(false);
    expect(transientDriveError(Object.assign(new Error('gone'), { status: 404 }))).toBe(false);
  });

  // read が返す（Error なら投げる）ものの列で、waitUploadSettled を回す。sleep は待たずに数える
  type File = { id: string; size?: string };
  const run = async (first: File, reads: (File | Error)[]) => {
    const queue = [...reads];
    const slept: number[] = [];
    const polls: UploadPoll<File>[] = [];
    const result = await waitUploadSettled(
      first,
      async () => {
        const next = queue.shift();
        if (next === undefined) throw new Error('read が多すぎる');
        if (next instanceof Error) throw next;
        return next;
      },
      { sleep: async (ms) => slept.push(ms), onPoll: (p) => polls.push(p) },
    );
    return { result, slept, polls, left: queue.length };
  };
  const at = (size: string): File => ({ id: 'f', size });
  const offline = () => new TypeError('fetch failed');

  it('returns the re-read file once the size stops changing', async () => {
    const { result, slept, polls } = await run(at('1'), [at('2'), at('3'), at('3')]);
    expect(result).toEqual(at('3'));
    expect(slept).toEqual([UPLOAD_POLL_MS, UPLOAD_POLL_MS, UPLOAD_POLL_MS]);
    expect(polls.map((p) => [p.i, p.before.size, p.now?.size, p.settled])).toEqual([
      [1, '1', '2', false],
      [2, '2', '3', false],
      [3, '3', '3', true],
    ]);
  });

  it('gives null after UPLOAD_POLL_LIMIT reads that keep changing', async () => {
    const reads = Array.from({ length: UPLOAD_POLL_LIMIT }, (_, i) => at(String(i + 2)));
    const { result, slept, left } = await run(at('1'), reads);
    expect(result).toBeNull();
    expect(slept).toHaveLength(UPLOAD_POLL_LIMIT);
    expect(left).toBe(0);
  });

  it('counts a network failure as one poll and compares the next read with the last size it read', async () => {
    const { result, polls } = await run(at('5'), [offline(), at('5')]);
    expect(result).toEqual(at('5'));
    expect(polls[0]).toMatchObject({ i: 1, settled: false });
    expect(polls[0]!.error).toBeInstanceOf(TypeError);
    expect(polls[1]).toMatchObject({ i: 2, settled: true });
  });

  it('gives null when every read fails with a network failure', async () => {
    const { result, polls } = await run(at('5'), Array.from({ length: UPLOAD_POLL_LIMIT }, offline));
    expect(result).toBeNull();
    expect(polls).toHaveLength(UPLOAD_POLL_LIMIT);
  });

  it('throws other HTTP errors at once', async () => {
    const denied = Object.assign(new Error('Drive API が失敗（403）'), { status: 403 });
    await expect(run(at('5'), [denied, at('5')])).rejects.toBe(denied);
  });

  it('does not take the upload as settled while the size is unknown', async () => {
    const { result } = await run({ id: 'f' }, [{ id: 'f' }, at('7'), at('7')]);
    expect(result).toEqual(at('7'));
  });
});
