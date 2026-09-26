// Stage 19-B: 観測値（records/observations/）の検証と照合ランナー、残差の一覧（plan/residuals.md）が最新であること。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEDGER_PATH,
  RESIDUALS_PATH,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  misplacedObservations,
  recordingMap,
} from '../../../scripts/records-data.ts';
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

describe('records/observations', () => {
  it('passes validation and each file holds only its own recording', () => {
    expect(misplacedObservations()).toEqual([]);
    expect(validateObservations(observations, recordings, data.enemies)).toEqual([]);
  });

  it('compares every compare observation without errors', () => {
    expect(residuals.filter((r) => r.status === 'error').map((r) => `${r.observation.id}: ${r.message}`)).toEqual([]);
    expect(residuals).toHaveLength(observations.filter((o) => o.use === 'compare').length);
  });

  // 19-C までの暫定: 19-B で移した観測値は、今の Stage ごとのテスト・verification.md と同じく許容内になる。
  // 19-C からは「確定」の結論にひもづく観測値だけを落とす（design-stage19.md 2.5 節）
  it('keeps the observations migrated in 19-B within tolerance', () => {
    const migrated = [
      ...['010-01', '010-02', '010-03', '010-04', '012-01', '012-02', '012-03', '012-04'],
      ...['013-01', '013-02', '013-03', '013-04', '013-05', '013-06', '014-01', '014-02'],
      ...['018-01', '019-01', '020-01', '021-01', '046-01', '046-02', '047-01', '047-02'],
    ];
    expect(residuals.map((r) => r.observation.id)).toEqual(migrated);
    expect(residuals.filter((r) => r.status !== 'ok').map((r) => r.observation.id)).toEqual([]);
  });

  it('matches plan/residuals.md (npm run records:check)', () => {
    const doc = readFileSync(RESIDUALS_PATH, 'utf8');
    const section = extractGeneratedSection(doc, 'residuals');
    const expected = renderResiduals(residuals, observations);
    expect(normalizeTable(section)).toEqual(normalizeTable(expected));
    expect(section).toContain(expected.split('\n')[0]!);
  });

  it('keeps the ledger file where the scripts expect it', () => {
    expect(readFileSync(LEDGER_PATH, 'utf8')).toContain('<!-- records:recordings:start -->');
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
      '999-01: 録画 999 が records/recordings.json に無い',
      '047-96: compare は use が compare のときだけ',
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
});
