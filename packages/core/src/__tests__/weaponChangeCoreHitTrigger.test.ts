// 即着弾の使用武器の変更の発の、コアの命中の回数のきっかけ（count: coreHit）。変更後の武器の発は、的の表の変更後の武器の行
// （coreHitRate.weaponChanges）のコア命中率で数える（frame/landing.ts の weaponChangeHitRateWith。plan/design-k.md 2.5 節）。
// たきな（861）のバーストは、チャージしない即着弾の連射で、行（861:burst）が帯ごとにある（C-0708・C-0713）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { ShotLog } from '../frame/shots.ts';
import { effectWindows, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const TAKINA = 861;
const ROW = '861:burst';
const auto = { conditionMode: 'auto' } as const;
// コアの命中 1 回ごとに付く、3 フレームの攻撃力▲（発火のフレームの次のフレームから。窓が重ならない長さ）
const coreHitBuff = {
  kind: 'timed',
  trigger: { count: 'coreHit' },
  target: 'self',
  stat: 'attack',
  ref: 1,
  durationSeconds: 0.05,
};

const team = (enemy: EnemyInput) =>
  fixedTeam(
    [
      fixedSlot(82, auto),
      fixedSlot(308, auto),
      fixedSlot(TAKINA, {
        ...auto,
        edit: (raw) => {
          (raw.skills.burst!.effects as unknown[]).push(coreHitBuff);
        },
      }),
    ],
    2,
    { enemy },
  );

const withRow = rangeEnemyWithEvents();
const target = withRow.target!;
const dropRow = <T extends { weaponChanges?: Readonly<Record<string, unknown>> }>(table: T): T => {
  const { [ROW]: _, ...rest } = table.weaponChanges ?? {};
  return { ...table, weaponChanges: rest };
};
const withoutRow = rangeEnemyWithEvents({ target: { ...target, coreHitRate: dropRow(target.coreHitRate) } });

/** 射撃の列のコアの命中の期待値を足し、累計が整数をまたいだ発のフレーム（skills/triggers.ts の数え方。端数の誤差を許す） */
function crossingFrames(log: ShotLog): number[] {
  let count = 0;
  const out: number[] = [];
  log.frames.forEach((f, k) => {
    const next = count + log.coreHits![k]!;
    const crossed = Math.floor(next + 1e-9) - Math.floor(count + 1e-9);
    for (let n = 0; n < crossed; n++) out.push(f);
    count = next;
  });
  return out;
}

/** 足した攻撃力▲の付いた窓の始まりの 1 つ前（発火のフレーム） */
function fireFrames(plan: ReturnType<typeof planTeamRun>): number[] {
  return effectWindows(plan, 2, { resourceId: TAKINA, skill: 'burst', stat: 'attack' }).map((w) => w.start - 1);
}

describe('即着弾の使用武器の変更の coreHit の回数のきっかけ（たきなのバースト）', () => {
  const on = planTeamRun(team(withRow));
  const off = planTeamRun(team(withoutRow));
  const log = on.shots[2]!;
  const changed = new Set(log.weaponChangeShotFrames ?? []);
  const rowValues = Object.values(target.coreHitRate.weaponChanges![ROW]!);

  it('counts the changed weapon shots with the core hit rate of its row', () => {
    expect(log.frames).toEqual(off.shots[2]!.frames);
    expect(changed.size).toBeGreaterThan(0);
    log.frames.forEach((f, k) => {
      const core = log.coreHits![k]!;
      // 変更後の武器の発は行の値（弾丸命中率 1 の SR を替えた武器）。基礎の武器の発は行を外した計算と同じ
      if (changed.has(f)) {
        expect(rowValues.some((v) => Math.abs(v - core) < 1e-12)).toBe(true);
        expect(off.shots[2]!.coreHits![k]).toBeGreaterThan(core);
      } else expect(core).toBe(off.shots[2]!.coreHits![k]);
    });
  });

  it('fires the coreHit trigger where the running total of those core hits crosses an integer', () => {
    const fires = fireFrames(on);
    expect(fires).toEqual([...new Set(crossingFrames(log))]);
    // 行のコア命中率は 1 より低いので、変更の間の発火は行を外した計算（SR の値）より少ない
    const inChange = (frames: number[]) => frames.filter((f) => changed.has(f)).length;
    expect(inChange(fires)).toBeGreaterThan(0);
    expect(inChange(fires)).toBeLessThan(inChange(fireFrames(off)));
  });
});
