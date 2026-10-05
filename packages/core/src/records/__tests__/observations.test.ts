// Stage 19-B・19-C: 観測値（records/observations/）・結論（plan/claims.md）の検証と照合ランナー、残差の一覧（plan/residuals.md）が最新であること。
// 確定の結論にひもづく観測値だけ、許容幅の外なら落とす（design-stage19.md 2.5 節）。
// Stage 20-A: 件数や ID の一覧は直書きしない（plan/design-stage20.md 3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CLAIMS_PATH,
  RESIDUALS_PATH,
  loadClaims,
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

  it('sums the gauge of the first shot fired in a full burst window and landing after it (plan/design-anis-star-gauge-timing.md 3.5 節)', () => {
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
    expect(() => value({ slot: 3 })).toThrow('跨ぐ発が無い');
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
