// sim-run.ts を起動して、出す順と終わり方を見る（行と文の中身は sim-run/ の下のテストが見る）
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'sim-run.ts');

/** スクリプトを起動する。stderr は、スクリプトが出した行だけ（Node の警告の行は、Node の版と環境で出たり出なかったりするので外す） */
function run(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const { NODE_OPTIONS: _options, ...env } = process.env;
  const { status, stdout, stderr } = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
  const own = stderr.split('\n').filter((line) => !/^\(node:\d+\) |^\(Use `node /.test(line));
  return { status, stdout, stderr: own.join('\n') };
}

describe('sim-run.ts', () => {
  it('prints the report in order, and ends with status 0', () => {
    // 編成の条件（271）・順位・即時効果・持続ダメージ（261）・段の循環（225）がそろう編成
    const { status, stdout, stderr } = run('--ids', '271,261,191,225,82', '--fixed-spec', '--duration', '30');
    expect(stderr).toBe('');
    expect(status).toBe(0);
    const marks = [
      /^composition conditions /m,
      /^duration 30s \(\d+f\), burst dynamic, fixed spec true, /m,
      /^landings /m,
      /^enemy events range-3min-jump: /m,
      /^full bursts \d/m,
      /^full burst intervals/m,
      /^top final ATK targets /m,
      /^instant effects /m,
      /^TOTAL \d/m,
      /^auto conditions /m,
      /^condition notes$/m,
      /^\[slot 1\] .+ — segments$/m,
      /^dot /m,
      /^\[slot 4\] .+ — segments$/m,
      /^cycle tiers: /m,
      /^\[slot 5\] .+ — segments$/m,
    ];
    const positions = marks.map((mark) => stdout.search(mark));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // 表は、発動・順位・即時効果・枠ごとの合計・自動の条件・枠ごとの区間 5 つ・編成の条件
    expect(stdout.match(/^┌/gm)!.length).toBeGreaterThanOrEqual(11);
  });

  it('prints only the trace with --trace, and stops on an unknown kind with status 2', () => {
    const trace = run('--ids', '82', '--fixed-spec', '--duration', '10', '--trace', 'shots', '--to', '5');
    expect(trace.stderr).toBe('');
    expect(trace.status).toBe(0);
    const lines = trace.stdout.trimEnd().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line).toMatch(/^f\d+ \d\.\d\ds 枠1 発 \d+ \d[\d,]*$/);

    const unknown = run('--ids', '82', '--fixed-spec', '--duration', '10', '--trace', 'shots,nope');
    expect(unknown.status).toBe(2);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toBe('--trace の種類が無い: nope（shots・bursts・buffs・hits・instants・all）\n');
  });

  it('stops with status 2 on a --trace without kinds, or a --from that is not seconds', () => {
    for (const kinds of ['', ',']) {
      const empty = run('--ids', '82', '--fixed-spec', '--duration', '10', '--trace', kinds);
      expect(empty.status).toBe(2);
      expect(empty.stdout).toBe('');
      expect(empty.stderr).toBe(`--trace に種類が無い: "${kinds}"（shots・bursts・buffs・hits・instants・all）\n`);
    }
    const from = run('--ids', '82', '--fixed-spec', '--duration', '10', '--trace', 'shots', '--from', 'x');
    expect(from.status).toBe(2);
    expect(from.stdout).toBe('');
    expect(from.stderr).toBe('--from は 0 以上の秒（数）: x\n');
  });

  it('stops with status 2 on a --duration that is not a positive number', () => {
    for (const duration of ['x', '', '0', '-5']) {
      const bad = run('--ids', '82', '--fixed-spec', `--duration=${duration}`);
      expect(bad.status).toBe(2);
      expect(bad.stdout).toBe('');
      expect(bad.stderr).toBe(`--duration は 0 より大きい秒（数）: ${duration}\n`);
    }
  });
});
