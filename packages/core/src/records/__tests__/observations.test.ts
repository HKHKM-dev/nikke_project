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
  loadRecordingsFile,
  loadRecordsData,
  misplacedClaims,
  misplacedObservations,
  recordingMap,
} from '../../../scripts/records-data.ts';
import {
  CLAIM_TOPICS,
  claimsByObservation,
  gatedObservations,
  observationIdsIn,
  renderClaims,
  supportedObservations,
  toClaims,
  validateClaims,
  type Claim,
  type ClaimFile,
} from '../claims.ts';
import {
  buildTeamInput,
  compareValue,
  renderResiduals,
  runObservations,
  validateObservations,
  type Observation,
} from '../observations.ts';
import { extractGeneratedSection, normalizeTable, type ProjectRecording } from '../recordings.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const observations = loadObservations();
const residuals = runObservations(observations, recordings, data);
const claims = loadClaims();
const gated = gatedObservations(claims);

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
    expect(validateClaims(claims, new Set(observations.map((o) => o.id)))).toEqual([]);
  });

  it('matches plan/claims.md (npm run records:check)', () => {
    expect(readFileSync(CLAIMS_PATH, 'utf8')).toBe(renderClaims(claims));
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
        claim({ id: 'C-0001', state: '確定', observations: ['999-01'], replaces: ['C-0002'] }),
        claim({ id: 'C-0002', state: '確定' }),
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
      for (const r of c.replaces) expect(doc).toMatch(new RegExp(`\\*\\*${r}\\*\\*[^]*?置き換えた結論: ${c.id}`));
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
    expect(manual.enemy.target).toBeUndefined();
    const auto = buildTeamInput(
      rec54,
      { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], condition: 'auto', midFarLanding: 'A' },
      data,
    );
    expect(auto.slots[0]!.conditionMode).toBe('auto');
    expect(auto.enemy.target?.id).toBe('range-bigarms');
    expect(auto.enemy.landings?.map((s) => s.landing)).toEqual(['midNear', 'near', 'far', 'midFarA', 'near', 'far']);
  });

  it('reports a mid-far landing without automatic conditions, or an unknown one', () => {
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
        ],
        recordings,
        data.enemies,
      ),
    ).toEqual([
      '054-91: midFarLanding は condition が auto のときだけ',
      '054-92: midFarLanding は A・B・C',
      '054-93: condition は auto か manual',
    ]);
  });
});
