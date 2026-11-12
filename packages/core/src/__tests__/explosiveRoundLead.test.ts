// 徹甲炸裂弾の受けるダメージ▲の付く時刻（plan/design-explosive-round-lead.md 3 節。C-0816）: 状態の付与の leadFrames。
// 録画 0837（リター・ウンファ：タクティカル・アップ・ベスティー：タクティカル・アップ。V-0588）のモデルで見る
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../scripts/records-data.ts';
import { burstSnapshotState } from '../frame/plan.ts';
import { buildTeamInput } from '../records/observations/teamInput.ts';
import type { CompareSetup } from '../records/observations/setup.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
import { ENEMY, itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition, type SkillDefinition, type StateGrantEffect } from '../skills/types.ts';

const file = loadRecordingsFile();
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true };
const input = buildTeamInput(recordingMap(file).get('0837')!, setup, loadRecordsData(file));
const result = runSimulation(input);
const EUNHWA = 1;
const BESTIE = 2;
const EXPLOSIVE_ROUND = 0.2787;

const eunhwaJson = JSON.parse(readFileSync(join(import.meta.dirname, '../../data/skills/95.json'), 'utf8')) as {
  skills: { burst: { effects: Record<string, unknown>[] } };
};
const withGrant = (patch: Record<string, unknown>): unknown => {
  const json = structuredClone(eunhwaJson);
  json.skills.burst.effects[0] = { ...json.skills.burst.effects[0], ...patch };
  return json;
};

describe('leadFrames（徹甲炸裂弾の▲の付く時刻）', () => {
  it('puts the ▲ on the Burst III hits whose round came 5 frames or more before 00.00, not on the far one', () => {
    // 1 回目（中近。発は 00.00 の 5f 前）・2 回目（近。7f 前）は乗り、3 回目（遠。1f 前）は乗らない（V-0588 の 0837-06〜08）
    const hits = result.slots[BESTIE]!.burst.hits.slice(0, 3);
    expect(hits.map((h) => h.damageTakenMultiplier)).toEqual([1 + EXPLOSIVE_ROUND, 1 + EXPLOSIVE_ROUND, 1]);
  });

  it('starts the state 2 frames before the round for the allies, and on the frame after it for the user', () => {
    const shot = result.shots[EUNHWA]!.weaponChangeShotFrames![0]!;
    const damageTakenAt = (slotIndex: number, frame: number): number => {
      const segment = result.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
      return segment.slots[slotIndex]!.buffs.damageTaken;
    };
    expect(damageTakenAt(BESTIE, shot - 3)).toBe(0);
    expect(damageTakenAt(BESTIE, shot - 2)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    // 炸裂弾自身には乗らない（C-0312）
    expect(damageTakenAt(EUNHWA, shot)).toBe(0);
    expect(damageTakenAt(EUNHWA, shot + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
  });

  it('is written only on a grant triggered by { count: "weaponChangeShot" }, without delayFrames', () => {
    expect(() => parseSkillDefinition(withGrant({ trigger: 'burstUse' }) as never)).toThrow(
      'leadFrames needs the trigger { count: "weaponChangeShot" }',
    );
    expect(() => parseSkillDefinition(withGrant({ leadFrames: 0 }) as never)).toThrow('positive integer');
  });

  it('cannot be written with what the first pass judges on the shot frame (condition, stacksFrom, topAttack)', () => {
    // 1 パス目は発の leadFrames 前のフレームで件を登録する（plan/design-explosive-round-lead.md 5.3 節）
    // 敵に付く状態は条件をもともと書けないので、自分に付く状態の付与で見る
    const own = { state: 'camouflage', target: 'self' };
    expect(() => parseSkillDefinition(withGrant({ ...own, condition: { inFullBurst: true } }) as never)).toThrow(
      'condition cannot be used with leadFrames',
    );
    expect(() =>
      parseSkillDefinition(withGrant({ ...own, maxStacks: 100, stacksFrom: { counter: 'firepowerGauge' } }) as never),
    ).toThrow('stacksFrom cannot be used with leadFrames');
    expect(() => parseSkillDefinition(withGrant({ ...own, target: 'topAttack', targetCount: 1 }) as never)).toThrow(
      'topAttack cannot be used with leadFrames',
    );
  });

  it('cannot be written with targets chosen by the fire context (burstUsers, targetDefense)', () => {
    // 前倒しの件は発火の文脈なし（null）で登録するので、文脈で対象を決めるものは誰にも掛からない（skills/targets.ts の isEffectTarget）。
    // 状態の付与には targetDefense を書けず、burstUsers はトリガーの検査（フルバーストの始まり・終わりだけ）が先に止める
    const own = { state: 'camouflage' };
    expect(() =>
      parseSkillDefinition(withGrant({ ...own, target: 'allies', targetDefense: 'lowerThanSelf' }) as never),
    ).toThrow('targetDefense: unknown field');
    expect(() => parseSkillDefinition(withGrant({ ...own, target: 'burstUsers' }) as never)).toThrow(
      'burstUsers is only allowed with trigger',
    );
  });
});

// 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5 節。backlog 2-44）: ベスティー：タクティカル・アップの S2 の
// 「敵が徹甲炸裂弾状態なら発射体爆発ダメージ▲」（1 パス目の enemyState。C-0809）は、2 パス目の受けるダメージ▲の区間と同じ始まり
// （炸裂弾の 2f 前）から付く。録画 0837 のベスティーの射撃を戦闘の始めの撃たない区間でずらし、フルチャージの発を炸裂弾の直前に置く
describe('leadFrames in the first pass (Bestie: Tactical Upgrade S2 on Explosive Round)', () => {
  const PROJECTILE_UP = 0.2;
  const buffsAt = (r: SimResult, slotIndex: number, frame: number) =>
    burstSnapshotState(r.timeline, frame, slotIndex, false).buffs;
  const shifted = (frames: number): SimResult =>
    runSimulation({ ...input, holdFire: [{ slotIndex: BESTIE, ranges: [{ start: 0, end: frames }] }] });

  it.each([
    { hold: 5, lead: 3, up: 0 },
    { hold: 6, lead: 2, up: PROJECTILE_UP },
    { hold: 7, lead: 1, up: PROJECTILE_UP },
  ])('a full charge $lead frames before the round gets the up: $up', ({ hold, lead, up }) => {
    const r = shifted(hold);
    const round = r.shots[EUNHWA]!.weaponChangeShotFrames![0]!;
    const shot = r.shots[BESTIE]!.frames.find((f) => f >= round - 3 && f < round);
    expect(shot).toBe(round - lead);
    // 2 パス目の区間: 受けるダメージ▲は炸裂弾の 2f 前から
    expect(buffsAt(r, BESTIE, round - 3).damageTaken).toBe(0);
    expect(buffsAt(r, BESTIE, round - 2).damageTaken).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    // 1 パス目: その発の S2 の▲は、発が件の中なら次のフレームから付く（件より前の発なら付かない）
    expect(buffsAt(r, BESTIE, shot!).projectileExplosionDamage).toBe(0);
    expect(buffsAt(r, BESTIE, shot! + 1).projectileExplosionDamage).toBeCloseTo(up, 12);
  });
});

describe('leadFrames の境目（skills/holders.ts）', () => {
  /** ウンファ：タクティカル・アップの定義を替えて録画 0837 のモデルを回す */
  const runWith = (definition: SkillDefinition): SimResult =>
    runSimulation({
      ...input,
      slots: input.slots.map((s, i) => (i === EUNHWA ? { ...s!, skills: { ...s!.skills!, definition } } : s)),
    });
  const round = result.shots[EUNHWA]!.weaponChangeShotFrames![0]!;

  it('starts the state on the battle start when the round comes less than leadFrames after it', () => {
    // 発 − leadFrames が負になる付与は、戦闘の始まり（0）から
    const r = runWith(parseSkillDefinition(withGrant({ leadFrames: round + 10 }) as never));
    const first = itemsOf(r.history, { state: 'explosiveRound' })[0]!;
    expect(first.holder).toBe(ENEMY);
    expect(first.start).toBe(0);
  });

  // 発が戦闘の始まりから leadFrames より前に来る付与（発が 0f・1f の場合と同じ形。backlog 5 節の行）: ほかの枠の小片は件の始まり（0）から、
  // 付けた枠の小片は、件の始まり + leadFrames ではなく発の次のフレームから（C-0312）
  it.each([10, 1])(
    'starts the user piece on the frame after the round when the state start stops at 0 (leadFrames = round + %i)',
    (extra) => {
      // 件が発を覆うように、維持も延ばす
      const grant = { leadFrames: round + extra, durationRef: undefined, durationSeconds: 30 };
      const r = runWith(parseSkillDefinition(withGrant(grant) as never));
      const shot = r.shots[EUNHWA]!.weaponChangeShotFrames![0]!;
      expect(shot).toBe(round);
      const damageTakenAt = (slotIndex: number, frame: number): number =>
        burstSnapshotState(r.timeline, frame, slotIndex, false).buffs.damageTaken;
      expect(damageTakenAt(BESTIE, 0)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
      expect(damageTakenAt(EUNHWA, 0)).toBe(0);
      expect(damageTakenAt(EUNHWA, shot)).toBe(0);
      expect(damageTakenAt(EUNHWA, shot + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    },
  );

  // 2 つの発の件の始まりが、どちらも戦闘の始まり（0）で止まる付与: 同じ始まりに発が 2 つある。付けた枠の小片は、件を作る関数の並び
  // （スタックの段の順）で発を当て、和集合にまとまった件は最初の発から
  describe('two rounds whose state starts both stop at 0', () => {
    const second = result.shots[EUNHWA]!.weaponChangeShotFrames![1]!;
    const run = (extra: Record<string, unknown>) => {
      const grant = { leadFrames: second + 10, durationRef: undefined, durationSeconds: 60, ...extra };
      const r = runWith(parseSkillDefinition(withGrant(grant) as never));
      const [first, next] = r.shots[EUNHWA]!.weaponChangeShotFrames!;
      expect([first, next]).toEqual([round, second]);
      const damageTakenAt = (slotIndex: number, frame: number): number =>
        burstSnapshotState(r.timeline, frame, slotIndex, false).buffs.damageTaken;
      return { r, damageTakenAt };
    };

    it('gives each stack of a stacking state its own round for the user piece', () => {
      const { r, damageTakenAt } = run({ maxStacks: 2 });
      const items = itemsOf(r.history, { state: 'explosiveRound' });
      expect(items.slice(0, 2).map((it) => [it.start, it.stack])).toEqual([
        [0, 1],
        [0, 2],
      ]);
      // ほかの枠は 0 から 2 スタック
      expect(damageTakenAt(BESTIE, 0)).toBeCloseTo(2 * EXPLOSIVE_ROUND, 12);
      // 付けた枠は、1 段目が 1 つ目の発の次、2 段目が 2 つ目の発の次から
      expect(damageTakenAt(EUNHWA, round)).toBe(0);
      expect(damageTakenAt(EUNHWA, round + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
      expect(damageTakenAt(EUNHWA, second)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
      expect(damageTakenAt(EUNHWA, second + 1)).toBeCloseTo(2 * EXPLOSIVE_ROUND, 12);
      // 1 パス目も、2 つの発の件を 0 に登録する: ベスティーの最初のフルチャージ（1 つ目の発より前）の次のフレームから S2 の▲
      const shot = r.shots[BESTIE]!.frames[0]!;
      expect(shot).toBeLessThan(round);
      const projectileAt = (frame: number) =>
        burstSnapshotState(r.timeline, frame, BESTIE, false).buffs.projectileExplosionDamage;
      expect(projectileAt(shot)).toBe(0);
      expect(projectileAt(shot + 1)).toBeCloseTo(0.2, 12);
    });

    it('starts the user piece of a merged item on the frame after the first round', () => {
      const { r, damageTakenAt } = run({});
      expect(itemsOf(r.history, { state: 'explosiveRound' })[0]!.start).toBe(0);
      expect(damageTakenAt(BESTIE, 0)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
      expect(damageTakenAt(EUNHWA, round)).toBe(0);
      expect(damageTakenAt(EUNHWA, round + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
      expect(damageTakenAt(EUNHWA, second + 1)).toBeCloseTo(EXPLOSIVE_ROUND, 12);
    });
  });

  it('throws when a grant with leadFrames is not in stage 1', () => {
    // 型の検証が条件を止めるので、検証の後の定義に件を見る条件を足して、1 パス目の段の検査に届かせる
    const definition = parseSkillDefinition(eunhwaJson as never);
    const grant = definition.skills.burst.effects[0] as StateGrantEffect;
    grant.condition = { selfState: { state: 'camouflage', present: true } };
    expect(() => runWith(definition)).toThrow('a grant with leadFrames must be in stage 1');
  });
});
