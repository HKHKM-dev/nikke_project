// Stage 19-B・19-C: 観測値（records/observations/）・結論（plan/claims.md）の検証と照合ランナー、残差の一覧（plan/residuals.md）が最新であること。
// 確定の結論にひもづく観測値だけ、許容幅の外なら落とす（design-stage19.md 2.5 節）。
// Stage 20-A: 件数や ID の一覧は直書きしない（plan/design-stage20.md 3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLAIMS_PATH,
  RESIDUALS_PATH,
  loadClaims,
  loadSensitivity,
  loadObservations,
  loadPredictions,
  loadRecordingsFile,
  loadRecordsData,
  loadSkillDefinitions,
  loadVerifications,
  misplacedClaims,
  misplacedObservations,
  recordingMap,
  rereadOnlyClaimsOf,
} from '../../../scripts/records-data.ts';
import {
  CLAIM_TOPICS,
  claimsByObservation,
  gatedObservations,
  gradeCandidate,
  observationIdsIn,
  renderClaims,
  supportedObservations,
  toClaims,
  validateClaims,
  type Claim,
  type ClaimFile,
  type ClaimGrade,
} from '../claims.ts';
import { coreHitRateWithHitRateUp } from '../../frame/landing.ts';
import { computeBurstHit } from '../../skills/burstDamage.ts';
import { runSimulation, type SimResult } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import {
  METRICS,
  buildTeamInput,
  compareValue,
  invalidReasonsOf,
  renderResiduals,
  runObservations,
  validateObservations,
  type Observation,
  jumpWindowsOf,
} from '../observations.ts';
import { extractGeneratedSection, normalizeTable, type ProjectRecording } from '../recordings.ts';
import { relevanceCounts, relevanceOf } from '../relevance.ts';
import { definitionPlacesByClaim } from '../skills.ts';
import { verificationsByClaim } from '../verifications.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const observations = loadObservations();
const residuals = runObservations(observations, recordings, data);
const claims = loadClaims();
const invalidReasons = invalidReasonsOf(observations);
const gated = gatedObservations(claims, new Set(invalidReasons.keys()));

describe('records/observations', () => {
  it('passes validation and each file holds only its own recording', () => {
    expect(misplacedObservations()).toEqual([]);
    expect(validateObservations(observations, recordings, data.enemies)).toEqual([]);
  });

  it('compares every compare observation without errors', () => {
    expect(residuals.filter((r) => r.status === 'error').map((r) => `${r.observation.id}: ${r.message}`)).toEqual([]);
    expect(residuals).toHaveLength(observations.filter((o) => o.use === 'compare').length);
  });

  it('keeps every observation behind a 確定 claim within tolerance', () => {
    const failing = residuals.filter((r) => gated.has(r.observation.id) && r.status !== 'ok');
    expect(failing.map((r) => `${r.observation.id}: ${r.status} ${r.message ?? ''}`)).toEqual([]);
  });

  it('matches plan/residuals.md (npm run records:check)', () => {
    const doc = readFileSync(RESIDUALS_PATH, 'utf8');
    const section = extractGeneratedSection(doc, 'residuals');
    const expected = renderResiduals(residuals, observations, claimsByObservation(claims));
    expect(normalizeTable(section)).toEqual(normalizeTable(expected));
    expect(section).toContain(expected.split('\n')[0]!);
  });
});

describe('records/claims・plan/claims.md', () => {
  it('passes validation and each file holds the claim of its name', () => {
    expect(claims.length).toBeGreaterThanOrEqual(30);
    expect(misplacedClaims()).toEqual([]);
    expect(validateClaims(claims, new Set(observations.map((o) => o.id)), new Set(invalidReasons.keys()))).toEqual([]);
  });

  it('matches plan/claims.md (npm run records:check)', () => {
    // Stage 20-D: 検証記録の「結論」から逆に引いた結び付きも載る。スキル定義の claims から逆に引いた場所も載る。
    // 等級の候補（機械。plan/design-records-automation.md 3.5 節）も載る
    const residualOf = new Map(
      residuals.map((r) => [
        r.observation.id,
        { status: r.status, diff: r.diff, value: r.observation.value, metric: r.observation.compare?.metric },
      ]),
    );
    const gradeCandidates = new Map<string, ClaimGrade>();
    for (const c of claims) {
      const g = gradeCandidate(c, residualOf, new Set(invalidReasons.keys()));
      if (g !== undefined) gradeCandidates.set(c.id, g);
    }
    expect(readFileSync(CLAIMS_PATH, 'utf8')).toBe(
      renderClaims(
        claims,
        verificationsByClaim(loadVerifications()),
        invalidReasons,
        definitionPlacesByClaim(loadSkillDefinitions()),
        gradeCandidates,
        rereadOnlyClaimsOf(claims, observations, loadPredictions(), loadVerifications(), recordings),
        relevanceCounts(
          relevanceOf(
            claims,
            observations,
            {
              recordings,
              characters: data.characters,
              skills: data.skills,
              enemies: data.enemies,
              claims,
            },
            loadSensitivity(),
          ),
        ),
      ),
    );
  });

  it('ties every observation compared under manual conditions to a 確定 or 仮説 claim (Stage 20-A)', () => {
    // 許容幅の外で落とすのは確定の結論の根拠だけ。仮説の結論の根拠は、残差の一覧に出すだけ（design-stage19.md 2.5 節）
    const supported = supportedObservations(claims);
    const manual = residuals.filter((r) => r.observation.compare?.setup.condition !== 'auto');
    expect(manual.filter((r) => !supported.has(r.observation.id)).map((r) => r.observation.id)).toEqual([]);
  });

  it('does not gate the totals under automatic conditions by a claim (Stage 18-C)', () => {
    // 自動の条件での単騎の与ダメージは、残差として並べるだけで結論には結び付けない（design-stage18.md 12.4 節）
    const auto = residuals.filter((r) => r.observation.compare?.setup.condition === 'auto');
    expect(auto.filter((r) => gated.has(r.observation.id)).map((r) => r.observation.id)).toEqual([]);
  });

  it('keeps the corrected claims as 棄却', () => {
    const byId = new Map(claims.map((c) => [c.id, c]));
    for (const c of claims) for (const r of c.replaces) expect(byId.get(r)!.state).toBe('棄却');
  });

  it('expands observation ranges', () => {
    expect(observationIdsIn('`012-01`〜`012-04`・`014-01`、verification.md Stage 4')).toEqual([
      '012-01',
      '012-02',
      '012-03',
      '012-04',
      '014-01',
    ]);
    expect(observationIdsIn('verification.md Stage 2-B')).toEqual([]);
    // Stage 20-A: 桁を決め打ちしない。範囲は始めの ID の桁にそろえる
    expect(observationIdsIn('`1000-01`、`010-100`、`010-099`〜`010-101`、`L-AD-01`')).toEqual([
      '010-099',
      '010-100',
      '010-101',
      '1000-01',
      'L-AD-01',
    ]);
  });

  it('reads the claim files in number order, taking the observations from the basis (Stage 20-B)', () => {
    const file = (id: string, basis: string): ClaimFile => ({
      id,
      text: 't',
      state: '確定',
      topic: '射撃（間隔・リロード・チャージ）',
      grade: '厳密一致',
      basis,
      model: 'm',
      replaces: [],
      updated: '2026-09-27',
    });
    const read = toClaims([file('C-10000', 'x'), file('C-0002', '`001-01`、verification.md'), file('C-0010', 'y')]);
    expect(read.map((c) => c.id)).toEqual(['C-0002', 'C-0010', 'C-10000']);
    expect(read[0]!.observations).toEqual(['001-01']);
  });

  it('reports broken claims', () => {
    const claim = (patch: Partial<Claim> & { id: string }): Claim => ({
      text: 'a',
      state: '仮説',
      topic: '射撃（間隔・リロード・チャージ）',
      grade: '推論',
      basis: 'b',
      model: 'm',
      replaces: [],
      updated: '2026-09-27',
      observations: [],
      ...patch,
    });
    const errors = validateClaims(
      [
        claim({ id: 'C-0001', state: '確定', grade: '反復実測', observations: ['999-01'], replaces: ['C-0002'] }),
        claim({ id: 'C-0002', state: '確定', grade: '反復実測' }),
        claim({ id: 'C-0003', text: '', state: '未定' as never, replaces: ['C-0009'] }),
        claim({ id: 'C-0003' }),
        claim({ id: 'C-12' }),
        claim({ id: 'C-10000', topic: '未知' as never, grade: undefined, basis: ' ', updated: '9/27' }),
        claim({ id: 'C-10001', state: '棄却', grade: undefined }),
      ],
      new Set(),
    );
    // 番号の抜け（C-0003 → C-10000）と 5 桁は許す。棄却の結論は等級を省ける
    expect(errors).toEqual([
      'C-0001: 観測値 999-01 が無い',
      'C-0001: 置き換えた結論 C-0002 の状態が棄却でない（確定）',
      'C-0003: 状態が語彙に無い: 未定',
      'C-0003: 結論が空',
      'C-0003: 置き換えた結論 C-0009 が無い',
      'C-0003: ID が重複している',
      'C-12: ID は C-<4 桁以上の数字>',
      'C-10000: 話題が語彙に無い: 未知',
      'C-10000: 根拠の等級が無い（省けるのは棄却だけ）',
      'C-10000: 根拠が空',
      'C-10000: 更新日は YYYY-MM-DD',
    ]);
  });

  it('renders claims.md by topic, with the reverse of the replacements', () => {
    const doc = renderClaims(claims);
    const topics = [...doc.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(topics).toEqual(CLAIM_TOPICS.filter((t) => claims.some((c) => c.topic === t)));
    for (const c of claims) expect(doc).toContain(`- **${c.id}** ${c.text}`);
    for (const c of claims.filter((x) => x.replaces.length > 0))
      for (const r of c.replaces)
        expect(doc).toMatch(new RegExp(`\\*\\*${r}\\*\\*[^]*?置き換えた結論: (?:[^\n]*、)?${c.id}`));
  });
});

describe('照合の部品', () => {
  it('compares by ratio or by difference, element by element for lists', () => {
    expect(compareValue(100, 101, { rel: 0.02 })).toEqual({ diff: 0.01, ok: true });
    expect(compareValue(100, 103, { rel: 0.02 }).ok).toBe(false);
    expect(compareValue(5, 5, { abs: 0 })).toEqual({ diff: 0, ok: true });
    expect(compareValue([10, 20], [11, 20], { abs: 1 })).toEqual({ diff: 1, ok: true });
    expect(compareValue([10, 20], [10], { abs: 1 }).ok).toBe(false);
    expect(compareValue(10, [10], { abs: 1 }).ok).toBe(false);
  });

  it('rebuilds one burst hit without the crit expectation, or as a crit', () => {
    const hit = computeBurstHit({
      attack: 54316,
      enemy: { defence: 100 } as TeamInput['enemy'],
      crit: { rate: 0.15, damage: 1.5 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      effects: [
        {
          source: { resourceId: 304, skill: 'burst', name: { ja: '', en: '' } },
          damageType: 'skill',
          multiplier: 3.3061,
        },
      ],
      fullBurstBonus: false,
    });
    const result = { slots: [{ burst: { hits: [hit] } }] } as unknown as SimResult;
    const metric = METRICS.burstHitDamage!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 1, n: 0, crit: false })).toBeCloseTo(54216 * 3.3061, 6);
    expect(value({ slot: 1, n: 0, crit: true })).toBeCloseTo(54216 * 3.3061 * 1.5, 6);
    expect(() => value({ slot: 1, n: 1, crit: false })).toThrow('1 回目');
  });

  it('rebuilds one dot tick of the slot, skipping other skill hits (plan/design-nihilister.md 4 節)', () => {
    const source = { resourceId: 261, skill: 'burst' as const, name: { ja: '', en: '' } };
    const tick = (multiplier: number) =>
      computeBurstHit({
        attack: 120694,
        enemy: { defence: 100 } as TeamInput['enemy'],
        crit: { rate: 0.15, damage: 1.5 },
        attackDamageMultiplier: 1,
        elementMultiplier: 1,
        effects: [{ source, damageType: 'skill', multiplier }],
        fullBurstBonus: false,
      });
    const dot = { source, damageType: 'skill', multiplier: 0.1319, trigger: 'burstUse', effectIndex: 1 };
    const result = {
      skillHits: [
        {
          frame: 10,
          slotIndex: 0,
          effect: { ...dot, dot: { intervalSeconds: 1, durationSeconds: 10 } },
          hit: tick(0.1),
        },
        { frame: 20, slotIndex: 1, effect: { ...dot, effectIndex: 0 }, hit: tick(1.1264) },
        {
          frame: 30,
          slotIndex: 1,
          effect: { ...dot, dot: { intervalSeconds: 1, durationSeconds: 10 } },
          hit: tick(0.1319),
        },
      ],
    } as unknown as SimResult;
    const metric = METRICS.dotHitDamage!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 2, n: 0, crit: false })).toBeCloseTo(120594 * 0.1319, 6);
    expect(value({ slot: 2, n: 0, crit: true })).toBeCloseTo(120594 * 0.1319 * 1.5, 6);
    expect(() => value({ slot: 2, n: 1, crit: false })).toThrow('1 回目');
  });

  it('sums consecutive skill hits of a slot, skipping dot ticks (V-0265)', () => {
    const source = { resourceId: 101, skill: 'skill2' as const, name: { ja: '', en: '' } };
    const hit = (multiplier: number) =>
      computeBurstHit({
        attack: 119896,
        enemy: { defence: 100 } as TeamInput['enemy'],
        crit: { rate: 0.15, damage: 1.5 },
        attackDamageMultiplier: 1,
        elementMultiplier: 1,
        effects: [{ source, damageType: 'skill', multiplier }],
        fullBurstBonus: false,
      });
    const damage = { source, damageType: 'skill', multiplier: 1, trigger: 'burstUse', effectIndex: 0 };
    const result = {
      skillHits: [
        { frame: 10, slotIndex: 2, effect: damage, hit: hit(0.9855) },
        {
          frame: 10,
          slotIndex: 2,
          effect: { ...damage, dot: { intervalSeconds: 1, durationSeconds: 5 } },
          hit: hit(5),
        },
        { frame: 10, slotIndex: 1, effect: damage, hit: hit(7) },
        { frame: 10, slotIndex: 2, effect: damage, hit: hit(2.016) },
        { frame: 20, slotIndex: 2, effect: damage, hit: hit(3) },
      ],
    } as unknown as SimResult;
    const metric = METRICS.skillHitsDamage!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 3, n: 0, count: 2, crit: false })).toBeCloseTo(119796 * (0.9855 + 2.016), 6);
    expect(value({ slot: 3, n: 1, count: 1, crit: true })).toBeCloseTo(119796 * 2.016 * 1.5, 6);
    expect(() => value({ slot: 3, n: 2, count: 2, crit: false })).toThrow('3 回目');
  });

  it('lists the video frames of a slot skill and their mean interval (V-0268)', () => {
    const effect = (skill: string, dot?: object) => ({ source: { resourceId: 261, skill }, ...(dot ? { dot } : {}) });
    const result = {
      schedule: null,
      skillHits: [
        { frame: 588, slotIndex: 1, effect: effect('skill2') },
        { frame: 600, slotIndex: 1, effect: effect('burst') },
        { frame: 700, slotIndex: 1, effect: effect('skill2', { intervalSeconds: 1, durationSeconds: 5 }) },
        { frame: 1176, slotIndex: 1, effect: effect('skill2') },
        { frame: 1200, slotIndex: 0, effect: effect('skill2') },
        { frame: 1766, slotIndex: 1, effect: effect('skill2') },
      ],
    } as unknown as SimResult;
    const value = (metric: string, args: Record<string, unknown>) =>
      METRICS[metric]!.sim(result, { args, input: {} as TeamInput } as Parameters<(typeof METRICS)[string]['sim']>[1]);
    expect(value('skillHitVideoFrame', { slot: 2, skill: 'skill2', n: 1 })).toBe(1176);
    expect(value('skillHitMeanInterval', { slot: 2, skill: 'skill2' })).toBe(589);
    expect(() => value('skillHitMeanInterval', { slot: 1, skill: 'skill2' })).toThrow('2 回');
  });

  it('rescales the first stacking dot tick at or after a frame to a given stack count (V-0227)', () => {
    const source = { resourceId: 851, skill: 'skill1' as const, name: { ja: '', en: '' } };
    const tick = (multiplier: number) =>
      computeBurstHit({
        attack: 119896,
        enemy: { defence: 100 } as TeamInput['enemy'],
        crit: { rate: 0.15, damage: 1.5 },
        attackDamageMultiplier: 1,
        elementMultiplier: 1,
        effects: [{ source, damageType: 'skill', multiplier }],
        fullBurstBonus: false,
      });
    const dot = { source, damageType: 'skill', multiplier: 0.6846, trigger: 'fullChargeShot', effectIndex: 0 };
    const withDot = { ...dot, dot: { intervalSeconds: 1, durationSeconds: 5 } };
    const result = {
      skillHits: [
        { frame: 10, slotIndex: 2, effect: withDot, hit: tick(0.6846 * 2), stacks: 2 },
        { frame: 20, slotIndex: 1, effect: withDot, hit: tick(0.6846 * 9), stacks: 9 },
        { frame: 30, slotIndex: 2, effect: { ...dot, effectIndex: 1 }, hit: tick(1) },
        { frame: 40, slotIndex: 2, effect: withDot, hit: tick(0.6846 * 10), stacks: 10 },
        { frame: 50, slotIndex: 2, effect: { ...dot, dot: { intervalSeconds: 1, durationSeconds: 10 } }, hit: tick(1) },
      ],
    } as unknown as SimResult;
    const metric = METRICS.dotStackTickDamage!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 3, frame: 0, stacks: 3, crit: false })).toBeCloseTo(119796 * 0.6846 * 3, 6);
    expect(value({ slot: 3, frame: 11, stacks: 7, crit: true })).toBeCloseTo(119796 * 0.6846 * 7 * 1.5, 6);
    expect(() => value({ slot: 3, frame: 41, stacks: 1, crit: false })).toThrow('スタックしない');
    expect(() => value({ slot: 3, frame: 51, stacks: 1, crit: false })).toThrow('tick が無い');
  });

  it('sums the gauge of the first shot fired in or after a full burst window and landing after it (plan/design-anis-star-gauge-timing.md 3.5 節、V-0189 の X1)', () => {
    const result = {
      schedule: {
        fullBurstWindows: [
          { start: 100, end: 400 },
          { start: 1000, end: 1300 },
        ],
      },
      shotGauges: [
        { slotIndex: 0, shotFrame: 380, frame: 390, energy: 74200 },
        { slotIndex: 1, shotFrame: 1290, frame: 1305, energy: 50000 },
        { slotIndex: 0, shotFrame: 1295, frame: 1309, energy: 74200 },
        { slotIndex: 0, shotFrame: 1295, frame: 1309, energy: 29680 },
        { slotIndex: 0, shotFrame: 1337, frame: 1351, energy: 74200 },
      ],
    } as unknown as SimResult;
    const metric = METRICS.fullBurstCrossingShotGauge!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 1 })).toBe(10.39);
    expect(value({ slot: 2 })).toBe(5);
    expect(() => value({ slot: 3 })).toThrow('窓の後に着く発が無い');
    // 跨ぐ発が無くても、窓の終わりのフレームに撃った発（窓の外の発）の 1 発分を返す（発の位相に依らない）
    const atEnd = {
      ...result,
      shotGauges: [
        { slotIndex: 0, shotFrame: 380, frame: 390, energy: 74200 },
        { slotIndex: 0, shotFrame: 400, frame: 414, energy: 74200 },
        { slotIndex: 0, shotFrame: 400, frame: 414, energy: 29680 },
      ],
    } as unknown as SimResult;
    expect(metric.sim(atEnd, { args: { slot: 1 }, input: {} as TeamInput } as Parameters<typeof metric.sim>[1])).toBe(
      10.39,
    );
  });

  it('sums the gauge of the n-th shot of a slot (plan/design-anis-star-gauge-timing.md 7 節の V-B)', () => {
    const result = {
      shots: [{ frames: [69, 128] }, { frames: [70] }],
      shotGauges: [
        { slotIndex: 0, shotFrame: 69, frame: 83, energy: 74200 + 74200 },
        { slotIndex: 0, shotFrame: 69, frame: 83, energy: 29680 },
        { slotIndex: 1, shotFrame: 70, frame: 70, energy: 56180 },
        { slotIndex: 0, shotFrame: 128, frame: 142, energy: 74200 },
      ],
    } as unknown as SimResult;
    const metric = METRICS.shotGauge!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 1, n: 1 })).toBe(17.81);
    expect(value({ slot: 1, n: 2 })).toBe(7.42);
    expect(value({ slot: 2, n: 1 })).toBe(5.62);
    expect(() => value({ slot: 2, n: 2 })).toThrow('2 発目が無い');
  });

  it('counts the shot intervals from the n-th burst activation of the slot (V-0227)', () => {
    const result = {
      frames: 2000,
      shots: [{ frames: [100, 142, 184, 367, 409, 1200, 1242] }],
      schedule: {
        activations: [
          { slotIndex: 0, frame: 90 },
          { slotIndex: 1, frame: 95 },
          { slotIndex: 0, frame: 1190 },
        ],
      },
    } as unknown as SimResult;
    const metric = METRICS.shotIntervals!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 1, from: 100, to: 400 })).toEqual([42, 42, 183]);
    expect(value({ slot: 1, burst: 0, from: 0, to: 300 })).toEqual([42, 42, 183]);
    expect(value({ slot: 1, burst: 1, from: 0, to: 588 })).toEqual([42]);
    expect(() => value({ slot: 1, burst: 2, from: 0, to: 588 })).toThrow('発動 2 回目');
  });

  it('measures the first shot at or after the burst effect, from the activation or from the first shot (backlog 2-4)', () => {
    const result = {
      shots: [{ frames: [88, 91, 93, 96, 98, 101, 400, 402] }],
      schedule: {
        activations: [
          { slotIndex: 0, frame: 90 },
          { slotIndex: 0, frame: 300, effectFrame: 310 },
        ],
      },
    } as unknown as SimResult;
    const metric = METRICS.burstEffectFirstShot!;
    const value = (args: Record<string, unknown>) =>
      metric.sim(result, { args, input: {} as TeamInput } as Parameters<typeof metric.sim>[1]);
    expect(value({ slot: 1, n: 0 })).toBe(1);
    expect(value({ slot: 1, n: 0, fromShot: true })).toBe(0);
    expect(value({ slot: 1, n: 1 })).toBe(100);
    expect(value({ slot: 1, n: 1, fromShot: true })).toBe(0);
    expect(() => value({ slot: 1, n: 2 })).toThrow('2 回目の発動が無い');
  });

  it('reports unknown metrics, missing args, calc-less metrics and unknown presets', () => {
    const base = observations.find((o) => o.id === '047-02')!;
    const broken = (patch: Partial<NonNullable<Observation['compare']>>, id = '047-99'): Observation => ({
      ...base,
      id,
      compare: { ...base.compare!, ...patch },
    });
    const errors = validateObservations(
      [
        broken({ metric: 'nope' }, '047-91'),
        broken({ args: {} }, '047-92'),
        broken({ metric: 'shotCount', model: 'calc' }, '047-93'),
        broken({ setup: { enemy: 'nope' } }, '047-94'),
        broken({ setup: { enemy: 'range-bigarms-fire', events: ['nope'] } }, '047-95'),
        { ...base, id: '999-01', recording: '999' },
        { ...base, id: '047-96', use: 'input' },
        broken({}, '047-7'),
        broken({}, '047-100'),
      ],
      recordings,
      data.enemies,
    );
    expect(errors).toEqual([
      '047-91: metric が語彙に無い: nope',
      '047-92: slotTotalDamage の引数 slot が無い',
      '047-93: shotCount は calc の出力に無い',
      '047-94: 敵のプリセット nope が無い',
      '047-95: 出来事のセット nope は range-bigarms-fire に無い',
      '999-01: 録画 999 が records/recordings/ に無い',
      '047-96: compare は use が compare のときだけ',
      '047-7: id は <録画 id>-<2 桁以上の連番>',
    ]);
  });

  it('builds the team like npm run sim --fixed-spec and refuses what it cannot build', () => {
    const rec47 = recordings.get('047') as ProjectRecording;
    const input = buildTeamInput(rec47, { enemy: 'range-bigarms-fire', events: ['range-3min-jump'] }, data);
    expect(input.slots.map((s) => s!.character.resourceId)).toEqual([822, 20, 225]);
    expect(input.controlledSlot).toBe(2);
    expect(input.enemy.events).toHaveLength(5);
    expect(input.slots[0]!.condition).toEqual({ coreHitRate: 1, distanceBonus: true, fullCharge: true, hitRate: 1 });
    const setup = { enemy: 'range-bigarms-fire' };
    expect(() => buildTeamInput(recordings.get('048')!, setup, data)).toThrow(/スペック固定 OFF/);
    expect(() => buildTeamInput(recordings.get('001')!, setup, data)).toThrow(/記録が無い/);
    expect(() => buildTeamInput({ ...rec47, team: [{ ...rec47.team[0]!, cube: 'assault-7' }] }, setup, data)).toThrow(
      /キューブ/,
    );
  });

  it('builds a fixed-spec OFF slot from the recorded build (Stage 13 の残り)', () => {
    const rec086 = recordings.get('086') as ProjectRecording;
    const mana = data.characters.get(290) ?? loadRecordsData(file, [290]).characters.get(290)!;
    const withMana = { ...data, characters: new Map([...data.characters, [290, mana]]) };
    const build = {
      attack: 400000,
      overload: {
        arm: [
          { option: 'attack' as const, level: 15 },
          { option: 'maxAmmo' as const, level: 11 },
        ],
      },
      cube: { id: 1000303, level: 15 },
      collection: { rarity: 'SR' as const, level: 5 },
      skillLevels: { skill1: 7 },
    };
    const rec = { ...rec086, team: [{ slot: 1, rid: 290, name: 'マナ', controlled: true, build }] };
    const setup = { enemy: 'range-bigarms-fire', durationSeconds: 20 };
    const input = buildTeamInput(rec, setup, withMana);
    const slot = input.slots[0]!;
    expect(slot.attackOverride).toBe(400000);
    expect(slot.skills!.levels).toEqual({ skill1: 7, skill2: 10, burst: 10 });
    expect(slot.buildEffects!.map((e) => `${e.source.kind}:${e.stat}`)).toEqual([
      'overload:attack',
      'overload:maxAmmo',
      'cube:reloadSpeed',
      'cube:elementDamage',
      'collection:coreDamage',
    ]);
    const off = buildTeamInput(rec, { ...setup, buildEffectsOff: ['cube'] }, withMana);
    expect(off.slots[0]!.buildEffects!.some((e) => e.source.kind === 'cube')).toBe(false);
    expect(off.slots[0]!.attackOverride).toBe(400000);

    // リロード 1 回分の長さ（reloadFramesAt）と最大装弾数（maxAmmoAt）に、キューブと OL の行が効く
    const ctx = (i: TeamInput) => ({ args: { slot: 1, frame: 100 }, input: i });
    const reload = mana.shot.reloadTime / 0.017;
    expect(METRICS.reloadFramesAt!.sim(runSimulation(input), ctx(input))).toBeCloseTo(reload * (1 - 0.2969), 6);
    expect(METRICS.reloadFramesAt!.sim(runSimulation(off), ctx(off))).toBeCloseTo(reload, 6);
    // 最終弾 → 次の 1 発目（reloadToNextShotAt）は、リロード 1 回分 + 24f（C-0148）。sim の発の間の平均とも合う
    expect(METRICS.reloadToNextShotAt!.sim(runSimulation(input), ctx(input))).toBeCloseTo(
      reload * (1 - 0.2969) + 24,
      6,
    );
    const shots = runSimulation(buildTeamInput(rec, { ...setup, durationSeconds: 180 }, withMana)).shots[0]!;
    const gaps = shots.lastShotFrames!.slice(0, -1).map((f) => shots.frames[shots.frames.indexOf(f) + 1]! - f);
    expect(gaps.length).toBeGreaterThan(1);
    expect(gaps.reduce((a, b) => a + b, 0) / gaps.length).toBeCloseTo(reload * (1 - 0.2969) + 24, 0);
    const olAmmo = data.buildMasters!.overload.options.find((o) => o.option === 'maxAmmo')!.values[10]! / 100;
    expect(METRICS.maxAmmoAt!.sim(runSimulation(input), ctx(input))).toBe(Math.round(60 * (1 + olAmmo)));

    expect(() => buildTeamInput({ ...rec, team: [{ ...rec.team[0]!, build: undefined }] }, setup, withMana)).toThrow(
      /枠 1 の育成/,
    );
    expect(() => buildTeamInput(rec, setup, { ...withMana, buildMasters: undefined })).toThrow(/マスタ/);
    expect(() =>
      buildTeamInput(recordings.get('047')!, { enemy: 'range-bigarms-fire', buildEffectsOff: ['cube'] }, data),
    ).toThrow(/buildEffectsOff/);
  });

  it('builds automatic conditions with the target profile and a fixed mid-far landing (Stage 18-C)', () => {
    const rec54 = recordings.get('054') as ProjectRecording;
    const manual = buildTeamInput(rec54, { enemy: 'range-bigarms-fire', events: ['range-3min-jump'] }, data);
    expect(manual.slots[0]!.conditionMode).toBeUndefined();
    // 的の表は手入力の枠にも付ける（飛ぶ時間。plan/design-anis-star-gauge-timing.md 3.3 節）。命中率・コアは手入力のまま
    expect(manual.enemy.target?.id).toBe('range-bigarms');
    const auto = buildTeamInput(
      rec54,
      { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto', midFarLanding: 'A' },
      data,
    );
    expect(auto.slots[0]!.conditionMode).toBe('auto');
    expect(auto.enemy.target?.id).toBe('range-bigarms');
    expect(auto.enemy.landings?.map((s) => s.landing)).toEqual(['midNear', 'near', 'far', 'midFarA', 'near', 'far']);
    // C-0155: 近の着地点も 1 回目・2 回目の順に固定できる
    const fixedNear = buildTeamInput(
      rec54,
      { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto', nearLanding: ['A', 'B'] },
      data,
    );
    expect(fixedNear.enemy.landings?.map((s) => s.landing)).toEqual([
      'midNear',
      'nearA',
      'far',
      'midFar',
      'nearB',
      'far',
    ]);
  });

  it('builds the obstacle breaks from input observations, and reports bad ones (plan/design-anis-star-gauge-timing.md 2.2 節)', () => {
    const o = observations.find((x) => x.id === '161-13')!;
    const input = buildTeamInput(recordings.get('161') as ProjectRecording, o.compare!.setup, data);
    expect(input.obstacleBreaks).toEqual([{ slotIndex: 0, shot: 1, count: 2 }]);
    const withObstacles = (count: string, id: string): Observation => ({
      ...o,
      id,
      compare: { ...o.compare!, setup: { ...o.compare!.setup, obstacles: [{ slot: 1, shot: 1, count }] } },
    });
    expect(
      validateObservations(
        [
          ...observations.filter((x) => x.recording === '161' || x.id === '181-04'),
          withObstacles('161-99', '161-91'),
          withObstacles('161-13', '161-92'),
          withObstacles('181-04', '161-93'),
        ],
        recordings,
        data.enemies,
      ),
    ).toEqual([
      '161-91: obstacles の観測値 161-99 が無い',
      '161-92: obstacles の観測値 161-13 の use は input',
      '161-93: obstacles の観測値は同じ録画のもの',
    ]);
  });

  it('reads the core hit rate of a segment, with or without the timed hit rate and the treasure (V-0165)', () => {
    const rec132 = recordings.get('132') as ProjectRecording;
    const setup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto' as const };
    const rate = (extra: Record<string, unknown>, frame: number, baseFrame?: number): number => {
      const input = buildTeamInput(rec132, { ...setup, ...extra }, data);
      const sim = runSimulation(input);
      const fb = sim.schedule!.fullBurstWindows[0]!;
      const f = frame < 0 ? fb.start + 10 : frame;
      const args = { slot: 1, frame: f, ...(baseFrame === undefined ? {} : { baseFrame }) };
      const metric = baseFrame === undefined ? METRICS.coreHitRate! : METRICS.coreHitRateDiff!;
      return metric.sim(sim, { args, input }) as number;
    };
    // 中近（1 区間目）の▲の外は的の表の値、▲の窓はドレイクの S1 の N で出し直した値
    const out = rate({}, 10);
    expect(rate({}, -1)).toBeCloseTo(coreHitRateWithHitRateUp(out, 0.2009), 9);
    expect(rate({}, -1, 10)).toBeCloseTo(rate({}, -1) - out, 12);
    // 持続の▲を効かせない（C-0170 の前の形）と差は 0、基礎版のスキルなら N は 0.1185
    expect(rate({ sustainedHitRateUp: false }, -1, 10)).toBe(0);
    expect(rate({ treasure: false }, -1)).toBeCloseTo(coreHitRateWithHitRateUp(out, 0.1185), 9);
    expect(buildTeamInput(rec132, { ...setup, treasure: false }, data).slots[2]!.skills!.treasurePhase).toBe(0);
    expect(buildTeamInput(rec132, setup, data).slots[2]!.skills!.treasurePhase).toBe(3);
  });

  it('reads the bullet hit rate of a segment from the target table (backlog 2-25)', () => {
    const rec145 = recordings.get('145') as ProjectRecording;
    const setup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto' as const };
    const rate = (frame: number, extra: Record<string, unknown> = {}): number => {
      const input = buildTeamInput(rec145, { ...setup, ...extra }, data);
      return METRICS.bulletHitRate!.sim(runSimulation(input), { args: { slot: 1, frame }, input }) as number;
    };
    const smg = data.enemies.targetProfiles.find((p) => p.id === 'range-bigarms')!.bulletHitRate.SMG as Record<
      string,
      number
    >;
    const profile = data.enemies.targetProfiles.find((p) => p.id === 'range-bigarms')!;
    expect(rate(1000)).toBeCloseTo(smg.midNear!, 9);
    expect(rate(3000)).toBeCloseTo(smg.near!, 9);
    // 中遠は 3 か所の配分の期待値。SMG は着地点 A だけ着地点の値（C-0319）で、B・C は帯の値
    const mixed = profile.mixes.midFar!.reduce((a, [id, w]) => a + w * (smg[id] ?? smg.midFar!), 0);
    expect(rate(7500)).toBeCloseTo(mixed, 9);
    expect(rate(7500, { midFarLanding: 'A' })).toBeCloseTo(smg.midFarA!, 9);
    expect(rate(3000, { condition: 'manual', hitRate: 0.95 })).toBeCloseTo(0.95, 9);
  });

  it('drops the heal effects of the listed characters only (V-0231)', () => {
    const rec182 = recordings.get('182') as ProjectRecording;
    const setup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'] };
    const heals = (extra: Record<string, unknown>, slot: number): number => {
      const def = buildTeamInput(rec182, { ...setup, ...extra }, data).slots[slot]!.skills!.definition!;
      const entries = [...Object.values(def.skills), ...Object.values(def.treasureSkills ?? {})];
      return entries.flatMap((e) => e.effects).filter((e) => e.kind === 'heal').length;
    };
    // ヘルム（枠 2）の宝物版 S1 とバースト（基礎版・宝物版）の回復（C-0345・C-0346）
    expect(heals({}, 1)).toBe(3);
    expect(heals({ dropHeals: [352] }, 1)).toBe(0);
    // 落とすのは指定した rid だけ。ほかの効果は残る
    expect(heals({ dropHeals: [17] }, 1)).toBe(3);
    const helm = buildTeamInput(rec182, { ...setup, dropHeals: [352] }, data).slots[1]!.skills!.definition!;
    expect(helm.treasureSkills!.skill1!.effects.map((e) => e.kind)).toEqual(['timed', 'burstGauge']);
  });

  it('reports a mid-far or near landing without automatic conditions, or an unknown one', () => {
    const base = observations.find((o) => o.id === '054-02')!;
    const withSetup = (setup: Record<string, unknown>, id: string): Observation => ({
      ...base,
      id,
      compare: { ...base.compare!, setup: { ...base.compare!.setup, ...setup } },
    });
    expect(
      validateObservations(
        [
          withSetup({ condition: 'manual' }, '054-91'),
          withSetup({ midFarLanding: 'D' }, '054-92'),
          withSetup({ condition: 'maybe', midFarLanding: undefined }, '054-93'),
          withSetup({ nearLanding: ['A', 'C'] }, '054-94'),
          withSetup({ condition: 'manual', midFarLanding: undefined, nearLanding: ['A'] }, '054-95'),
        ],
        recordings,
        data.enemies,
      ),
    ).toEqual([
      '054-91: midFarLanding は condition が auto のときだけ',
      '054-92: midFarLanding は A・B・C',
      '054-93: condition は auto か manual',
      '054-94: nearLanding は A・B の並び（1 回目・2 回目の順）',
      '054-95: nearLanding は condition が auto のときだけ',
    ]);
  });

  it('replaces the jump windows and the landing cuts with the recorded ones (setup.jumpWindows, V-0086)', () => {
    expect(jumpWindowsOf([1, 2, 3, 4])).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
    expect(jumpWindowsOf([1, 2, 3])).toBeUndefined();
    expect(jumpWindowsOf([2, 1])).toBeUndefined();
    expect(jumpWindowsOf([1, 3, 2, 4])).toBeUndefined();
    expect(jumpWindowsOf(5)).toBeUndefined();
    const rec074 = recordings.get('074') as ProjectRecording;
    const setup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto' as const };
    const windows = [10, 12, 50, 52.5];
    const withValues = { ...data, observationValues: new Map([['074-99', windows]]) };
    const input = buildTeamInput(rec074, { ...setup, jumpWindows: '074-99' }, withValues);
    expect(input.enemy.events).toEqual([
      { kind: 'untargetable', start: 10, end: 12 },
      { kind: 'untargetable', start: 50, end: 52.5 },
    ]);
    expect(input.enemy.landings?.map((s) => [s.start, s.end])).toEqual([
      [0, 12],
      [12, 52.5],
      [52.5, 180],
    ]);
    expect(() => buildTeamInput(rec074, { ...setup, jumpWindows: '074-98' }, withValues)).toThrow(/jumpWindows/);
    const base = observations.find((o) => o.id === '074-08')!;
    const ref = observations.find((o) => o.id === '102-15')!;
    const withRef = (jumpWindows: string, id: string): Observation => ({
      ...base,
      id,
      compare: { ...base.compare!, setup: { ...base.compare!.setup, jumpWindows } },
    });
    expect(
      validateObservations(
        [
          ref,
          { ...ref, id: '102-98', value: [3, 2] },
          withRef('074-97', '074-91'),
          withRef('102-15', '074-92'),
          withRef('102-98', '074-93'),
        ],
        recordings,
        data.enemies,
      ),
    ).toEqual([
      '074-91: jumpWindows の観測値 074-97 が無い',
      '074-92: jumpWindows の観測値は同じ録画のもの',
      '074-93: jumpWindows の観測値は同じ録画のもの',
      '074-93: jumpWindows の観測値 102-98 は [始まり, 終わり, …] の昇順の窓の並びでない',
    ]);
  });
});

describe('観測値の形の拡張（Stage 20-E）', () => {
  const record = observations.find((o) => o.id === '047-03')!;
  const compared = observations.find((o) => o.id === '047-02')!;

  it('checks recordings, unit, spread, readAt and invalid', () => {
    const errors = validateObservations(
      [
        { ...record, id: '047-81', recordings: ['047', '046'] },
        { ...record, id: '046-82', recording: '046', recordings: ['046', '999'] },
        { ...compared, id: '046-83', recording: '046', recordings: ['046', '047'] },
        { ...record, id: '047-84', value: 10, unit: ' ', spread: { kind: 'range', low: 12, high: 11 } },
        { ...record, id: '047-85', value: 10, spread: { kind: 'ci95', low: 11, high: 13 } },
        { ...record, id: '047-86', readAt: '9/27', invalid: { reason: '', date: '2026-09-27' } },
        {
          ...record,
          id: '046-87',
          recording: '046',
          recordings: ['046', '047', 'L-AD'],
          value: 0.3,
          unit: '倍',
          spread: { kind: 'range', low: 0.2, high: 0.4 },
          readAt: '2026-09-27',
        },
      ],
      recordings,
      data.enemies,
    );
    expect(errors).toEqual([
      '047-81: recording は recordings のうち最も若い番号にし、recordings にも含める',
      '046-82: 録画 999 が records/recordings/ に無い',
      '046-83: 複数の録画にまたがる観測値は compare に使わない',
      '047-84: unit が空',
      '047-84: spread は low ≤ high',
      '047-84: 値が spread の外にある',
      '047-85: 値が spread の外にある',
      '047-86: readAt は YYYY-MM-DD',
      '047-86: invalid には reason と date（YYYY-MM-DD）が要る',
    ]);
  });

  it('does not compare an invalid observation, and lists it as 失効', () => {
    const invalid: Observation = { ...compared, invalid: { reason: '読み違い', date: '2026-09-27' } };
    const [r] = runObservations([invalid], recordings, data);
    expect(r).toMatchObject({ status: 'invalid', predicted: null, message: '読み違い' });
    const text = renderResiduals([r!], [invalid]);
    expect(text).toContain('比べられない 0・失効 1。');
    expect(text).toContain('（失効: 読み違い）');
    expect(
      renderResiduals([], [{ ...record, value: 12, unit: 'px', spread: { kind: 'ci95', low: 10, high: 14 } }]),
    ).toContain('| 12 px（95% 区間 10〜14） |');
    expect(invalidReasonsOf([invalid, record])).toEqual(new Map([['047-02', '読み違い']]));
  });

  it('keeps an invalid basis on a claim, but fails a 確定 claim with no valid basis left', () => {
    const claim = (id: string, state: Claim['state'], obs: string[]): Claim => ({
      id,
      text: 't',
      state,
      topic: '射撃（間隔・リロード・チャージ）',
      grade: '反復実測',
      basis: obs.map((o) => `\`${o}\``).join('、') || 'verification.md',
      model: 'm',
      replaces: [],
      updated: '2026-09-27',
      observations: obs,
    });
    const list = [
      claim('C-0001', '確定', ['010-01']),
      claim('C-0002', '確定', ['010-01', '010-02']),
      claim('C-0003', '棄却', ['010-01']),
      claim('C-0004', '確定', []),
    ];
    const ids = new Set(['010-01', '010-02']);
    const invalid = new Set(['010-01']);
    expect(validateClaims(list, ids, invalid)).toEqual(['C-0001: 確定の結論の根拠の観測値が、すべて失効している']);
    expect(gatedObservations(list, invalid)).toEqual(new Set(['010-02']));
    expect(renderClaims(list, new Map(), new Map([['010-01', '読み違い']]))).toContain(
      '  - **失効した根拠**: 010-01（読み違い）',
    );
  });
});
