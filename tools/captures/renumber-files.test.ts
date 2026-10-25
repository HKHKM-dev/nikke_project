// 録画の番号の振り直しの、リポジトリの外のファイルの名前の変え方（plan/design-recording-renumber.md 5・6 節）。
// 一時フォルダを録画の置き場所（E:）とバックアップ先（I:）に見立てる。例の番号は実在と重ならない 900 番台・9 千番台。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyCaptureRenames, planCaptureRenames, renameCommand, renumberedName } from './renumber-files.ts';

let tmp: string;
const touch = (root: string, rel: string, body = '') => {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), body);
};
const FILE = '20261002-951_rl_x.mp4';
const base = (roots: { label: string; dir: string }[], mentioned: (f: string) => boolean = () => false) => ({
  roots,
  folder: 'range',
  file: FILE,
  oldId: '951',
  newId: '9605',
  sha256: 'abc',
  mentioned,
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'renumber-files-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('captures/renumber-files', () => {
  it('renames the number part of a file name, including the 2-digit writing', () => {
    expect(renumberedName(FILE, '951', '9605')).toBe('20261002-9605_rl_x.mp4');
    expect(renumberedName('20260922-0009_SG_x.mp4', '0009', '960')).toBe('20260922-960_SG_x.mp4');
    expect(renumberedName('20260922-0009_SG_x.mp4', '0010', '960')).toBeUndefined();
  });

  it('renames the video, screenshots, frames and the cache on both places, and fixes the cache meta', () => {
    const e = join(tmp, 'E');
    const i = join(tmp, 'I');
    for (const root of [e, i]) {
      touch(root, `range/${FILE}`, 'video');
      touch(root, 'range/20261002-951_rl_x_result.png');
      touch(root, 'frames/951_f1200_ammo.jpg');
    }
    touch(e, 'derived/951/hud-jumps@1.meta.json', JSON.stringify({ video: `E:\\range\\${FILE}`, sha256: 'abc' }));
    touch(e, 'range/20261003-952_rl_y.mp4'); // 別の録画
    touch(e, 'frames/951_f300_only-e.jpg'); // まだ I: に同期していない
    const plan = planCaptureRenames(
      base([
        { label: 'E:', dir: e },
        { label: 'I:', dir: i },
      ]),
    );
    expect(plan.problems).toEqual([]);
    expect(plan.notes).toEqual([
      'I: に frames/951_f300_only-e.jpg が無い（E: で frames/9605_f300_only-e.jpg にした。同期は手で）',
      'I: に derived/951 が無い（E: で derived/9605 にした。同期は手で）',
    ]);
    expect(plan.renames.map((r) => `${r.label} ${r.from} → ${r.to}`)).toEqual([
      `E: range/${FILE} → range/20261002-9605_rl_x.mp4`,
      'E: range/20261002-951_rl_x_result.png → range/20261002-9605_rl_x_result.png',
      'E: frames/951_f1200_ammo.jpg → frames/9605_f1200_ammo.jpg',
      'E: frames/951_f300_only-e.jpg → frames/9605_f300_only-e.jpg',
      'E: derived/951 → derived/9605',
      `I: range/${FILE} → range/20261002-9605_rl_x.mp4`,
      'I: range/20261002-951_rl_x_result.png → range/20261002-9605_rl_x_result.png',
      'I: frames/951_f1200_ammo.jpg → frames/9605_f1200_ammo.jpg',
    ]);
    const r = applyCaptureRenames(plan.renames, FILE, '20261002-9605_rl_x.mp4');
    expect(r.error).toBeUndefined();
    expect(readFileSync(join(e, 'range/20261002-9605_rl_x.mp4'), 'utf8')).toBe('video');
    expect(existsSync(join(i, 'frames/9605_f1200_ammo.jpg'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(e, 'derived/9605/hud-jumps@1.meta.json'), 'utf8')) as { video: string };
    expect(meta.video).toBe('E:\\range\\20261002-9605_rl_x.mp4');
    // 回し直すと、もう変えてあるものは飛ばす
    const again = planCaptureRenames(
      base([
        { label: 'E:', dir: e },
        { label: 'I:', dir: i },
      ]),
    );
    expect(again.problems).toEqual([]);
    expect(again.renames).toEqual([]);
    expect(again.done).toHaveLength(2);
  });

  it('keeps frames of the other recording with the same number, and a cache of another video', () => {
    const e = join(tmp, 'E');
    touch(e, `range/${FILE}`);
    touch(e, 'range/20261002-951_sg_other.mp4'); // 番号の重なった別の録画
    touch(e, 'frames/951_f100_mine.jpg');
    touch(e, 'frames/951_f200_theirs.jpg');
    touch(e, 'derived/951/hud-jumps@1.meta.json', JSON.stringify({ sha256: 'zzz' }));
    const plan = planCaptureRenames(base([{ label: 'E:', dir: e }], (f) => f === '951_f100_mine.jpg'));
    expect(plan.renames.map((r) => r.from)).toEqual([`range/${FILE}`, 'frames/951_f100_mine.jpg']);
    expect(plan.notes.join('\n')).toContain('frames/951_f200_theirs.jpg');
    expect(plan.notes.join('\n')).toContain('derived/951/');
  });

  it('stops when a file of the new number already exists', () => {
    const e = join(tmp, 'E');
    touch(e, `range/${FILE}`);
    touch(e, 'interception/20261005-9605_special_z.mp4');
    const plan = planCaptureRenames(base([{ label: 'E:', dir: e }]));
    expect(plan.problems).toEqual(['E: に新しい番号のファイル interception/20261005-9605_special_z.mp4 が既にある']);
  });

  it('lists the renames for a place that is not on this machine', () => {
    const e = join(tmp, 'E');
    touch(e, `range/${FILE}`);
    touch(e, 'frames/951_f1_a.jpg');
    const plan = planCaptureRenames(
      base([
        { label: 'E:', dir: e },
        { label: 'I:', dir: join(tmp, 'none') },
      ]),
    );
    const listed = plan.renames.filter((r) => !r.apply);
    expect(listed.map((r) => r.from)).toEqual([`range/${FILE}`, 'frames/951_f1_a.jpg']);
    expect(renameCommand(listed[0]!)).toBe(
      `Rename-Item -LiteralPath '${join(tmp, 'none', 'range', FILE)}' -NewName '20261002-9605_rl_x.mp4'`,
    );
    // 2 桁の時代の録画: 動画の名前で始まる証拠フレームも変える
    touch(e, 'range/20260922-0009_SG_x.mp4');
    touch(e, 'frames/20260922-0009_SG_x_f100_ammo.jpg');
    const early = planCaptureRenames({
      ...base([{ label: 'E:', dir: e }]),
      file: '20260922-0009_SG_x.mp4',
      oldId: '0009',
    });
    expect(early.renames.map((r) => r.to)).toEqual([
      'range/20260922-9605_SG_x.mp4',
      'frames/20260922-9605_SG_x_f100_ammo.jpg',
    ]);
  });
});
