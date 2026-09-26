// Stage 19-B・19-C: 観測値（records/observations/）・結論（plan/claims.md）の検証と照合ランナー、残差の一覧（plan/residuals.md）が最新であること。
// 確定の結論にひもづく観測値だけ、許容幅の外なら落とす（design-stage19.md 2.5 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEDGER_PATH,
  RESIDUALS_PATH,
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  misplacedObservations,
  recordingMap,
} from '../../../scripts/records-data.ts';
import { claimsByObservation, gatedObservations, observationIdsIn, parseClaims, validateClaims } from '../claims.ts';
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

  it('keeps the ledger file where the scripts expect it', () => {
    expect(readFileSync(LEDGER_PATH, 'utf8')).toContain('<!-- records:recordings:start -->');
  });
});

describe('plan/claims.md', () => {
  it('passes validation', () => {
    expect(claims.length).toBeGreaterThanOrEqual(30);
    expect(validateClaims(claims, new Set(observations.map((o) => o.id)))).toEqual([]);
  });

  it('puts every compared observation of 19-B behind a 確定 claim', () => {
    expect(residuals.filter((r) => !gated.has(r.observation.id)).map((r) => r.observation.id)).toEqual([]);
  });

  it('keeps the corrected claims as 棄却 and points to them from the new ones', () => {
    const byId = new Map(claims.map((c) => [c.id, c]));
    for (const c of claims) for (const r of c.replaces) expect(byId.get(r)!.state).toBe('棄却');
    expect(claims.filter((c) => c.replaces.length > 0).map((c) => c.id)).toEqual(['C-0018', 'C-0022']);
  });

  it('expands observation ranges and reads the table columns', () => {
    expect(observationIdsIn('`012-01`〜`012-04`・`014-01`、verification.md Stage 4')).toEqual([
      '012-01',
      '012-02',
      '012-03',
      '012-04',
      '014-01',
    ]);
    expect(observationIdsIn('verification.md Stage 2-B')).toEqual([]);
    const parsed = parseClaims(
      [
        '| ID | 結論 | 状態 | 根拠 | モデル側 | 置き換え | 更新日 |',
        '| C-0001 | a | 確定 | `001-01` | x | C-0002 | d |',
      ].join('\n'),
    );
    expect(parsed).toEqual([
      { id: 'C-0001', text: 'a', state: '確定', observations: ['001-01'], replaces: ['C-0002'] },
    ]);
  });

  it('reports broken claims', () => {
    const errors = validateClaims(
      [
        { id: 'C-0001', text: 'a', state: '確定', observations: ['999-01'], replaces: ['C-0002'] },
        { id: 'C-0003', text: '', state: '未定' as never, observations: [], replaces: ['C-0009'] },
      ],
      new Set(),
    );
    expect(errors).toEqual([
      'C-0001: 観測値 999-01 が無い',
      'C-0001: 置き換えた結論 C-0002 が無い',
      'C-0003: ID は C-0001 から通し番号（2 行目は C-0002）',
      'C-0003: 状態が語彙に無い: 未定',
      'C-0003: 結論が空',
      'C-0003: 置き換えた結論 C-0009 が無い',
    ]);
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
