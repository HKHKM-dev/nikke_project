// 起案と結論の下書き・最小構成の警告・確定の等級の検査（plan/design-records-automation.md 3.1・3.5・3.6 節）
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import {
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  loadVerifications,
  recordingMap,
} from '../../../scripts/records-data.ts';
import { toClaims, validateClaims, type ClaimFile, type ClaimState } from '../claims.ts';
import {
  claimDraft,
  nextId,
  RESULTS_MARKERS,
  verificationFileName,
  verificationTemplate,
  type ClaimDraftInput,
} from '../drafts.ts';
import { mechanismConfirmed, minimalWarnings, normalConditionMeasured, renderMinimalLines } from '../minimal.ts';
import type { Observation } from '../observations.ts';
import { parseVerification } from '../verifications.ts';
import type { SkillDefinition } from '../../skills/types.ts';

describe('nextId・verificationTemplate', () => {
  it('次の空き番号は最大 + 1（桁は既存に合わせる）', () => {
    expect(nextId('V', ['V-0012', 'V-0079', 'C-0100'])).toBe('V-0080');
    expect(nextId('C', [])).toBe('C-0001');
    expect(nextId('C', ['C-10000'])).toBe('C-10001');
  });

  it('ひな形は README の書式で読めて、状態は調査中、結果に生成ブロックの印がある', () => {
    const draft = {
      id: 'V-0099',
      title: '題名',
      name: 'trial',
      topic: '命中率・距離' as const,
      question: '問い',
      date: '2026-10-02',
      derivedFrom: 'V-0063',
    };
    const file = verificationFileName(draft);
    expect(file).toBe('V-0099-trial.md');
    const text = verificationTemplate(draft);
    const v = parseVerification(file, text);
    expect(v.problems).toEqual([]);
    expect(v.state).toBe('調査中');
    expect(v.derivedFrom).toEqual(['V-0063']);
    expect(v.sections.get('結果')).toContain(RESULTS_MARKERS[0]);
    expect(() => verificationTemplate({ ...draft, name: 'Bad Name' })).toThrow();
  });

  it('ひな形は Prettier で整えた後も書式に合う（records:check は records/verifications を Prettier にかける）', async () => {
    const draft = {
      id: 'V-0099',
      title: '題名',
      name: 'trial',
      topic: '命中率・距離' as const,
      question: '問い',
      date: '2026-10-02',
    };
    const file = verificationFileName(draft);
    const path = `records/verifications/${file}`;
    const formatted = await format(verificationTemplate(draft), { ...(await resolveConfig(path)), filepath: path });
    const v = parseVerification(file, formatted);
    expect(v.problems).toEqual([]);
    expect(v.recordings).toEqual([]);
  });
});

const obs = (id: string, readAt = '2026-10-02', invalid = false): Observation => ({
  id,
  recording: id.replace(/-\d+$/, ''),
  kind: 'count',
  use: 'compare',
  value: 1,
  description: '',
  source: 'V-0099',
  readAt,
  ...(invalid ? { invalid: { reason: '読み違い', date: '2026-10-02' } } : {}),
});

describe('claimDraft（結論の下書きの状態）', () => {
  const base: ClaimDraftInput = {
    id: 'C-9999',
    verification: 'V-0099',
    topic: '命中率・距離',
    text: undefined,
    today: '2026-10-02',
    observations: [obs('101-01'), obs('102-01')],
    gradeCandidate: '反復実測',
    compared: new Map([
      ['101-01', true],
      ['102-01', true],
    ]),
    warnings: [],
    prediction: undefined,
  };

  it('等級の候補が厳密一致か反復実測で、疑問の印が無ければ確定', () => {
    const d = claimDraft(base);
    expect(d.reasons).toEqual([]);
    expect(d.file.state).toBe('確定');
    expect(d.file.grade).toBe('反復実測');
    expect(d.file.basis).toBe('`101-01`・`102-01`。V-0099');
    expect(d.file.text).toContain('書く');
  });

  it('疑問の印が 1 つでもあれば仮説にし、理由を返す', () => {
    expect(claimDraft({ ...base, gradeCandidate: '単独実測' })).toMatchObject({
      file: { state: '仮説', grade: '単独実測' },
    });
    expect(claimDraft({ ...base, gradeCandidate: undefined }).reasons[0]).toContain('比べた観測値が無い');
    expect(claimDraft({ ...base, gradeCandidate: undefined }).file.grade).toBe('単独実測');
    expect(claimDraft({ ...base, observations: [], gradeCandidate: undefined }).file.grade).toBe('推論');
    expect(
      claimDraft({ ...base, warnings: [{ verification: 'V-0099', recording: '048', unconfirmed: ['a', 'b'] }] })
        .reasons[0],
    ).toContain('最小構成');
    expect(
      claimDraft({ ...base, observations: [obs('101-01'), obs('102-01', '2026-10-02', true)] }).reasons[0],
    ).toContain('失効');
    expect(claimDraft({ ...base, compared: new Map([['101-01', false]]) }).reasons[0]).toContain('許容外');
  });

  it('予測ファイルがあれば、予測を出したこと・日付が読んだ日より前・合う仮説が 1 つを求める', () => {
    const file = {
      verification: 'V-0099',
      team: [{ rid: 307 }],
      fixedSpec: true,
      hypotheses: [{ id: 'H1' }, { id: 'H2' }],
      targets: [],
      predicted: null as null | { at: string; commit: string; values: Record<string, Record<string, number>> },
    };
    const score = (h1: number, h2: number) =>
      new Map([
        ['H1', { ok: h1, total: 1 }],
        ['H2', { ok: h2, total: 1 }],
      ]);
    expect(claimDraft({ ...base, prediction: { file, targets: [], score: score(1, 0) } }).reasons[0]).toContain(
      '予測を出していない',
    );
    const done = { ...file, predicted: { at: '2026-10-03', commit: 'abc1234', values: {} } };
    expect(claimDraft({ ...base, prediction: { file: done, targets: [], score: score(1, 0) } }).reasons[0]).toContain(
      'より後',
    );
    const early = { ...file, predicted: { at: '2026-10-01', commit: 'abc1234', values: {} } };
    expect(claimDraft({ ...base, prediction: { file: early, targets: [], score: score(1, 0) } }).file.state).toBe(
      '確定',
    );
    expect(claimDraft({ ...base, prediction: { file: early, targets: [], score: score(1, 1) } }).reasons[0]).toContain(
      '2 つ',
    );
    expect(claimDraft({ ...base, prediction: { file: early, targets: [], score: score(0, 0) } }).reasons[0]).toContain(
      '合う仮説が無い',
    );
    // 読み直し: 予測の時点で既にあった観測値（控え seen）を根拠にしていれば仮説（design-reread-prediction.md）
    const seen = (ids: string[]) => ({
      ...file,
      predicted: { at: '2026-10-01', commit: 'abc1234', values: {}, seen: { '101': ids } },
    });
    expect(claimDraft({ ...base, prediction: { file: seen([]), targets: [], score: score(1, 0) } }).file.state).toBe(
      '確定',
    );
    expect(
      claimDraft({ ...base, prediction: { file: seen(['101-01']), targets: [], score: score(1, 0) } }).reasons[0],
    ).toContain('既にあった観測値がある（101-01）');
  });
});

describe('validateClaims: 確定の等級', () => {
  const claim = (state: ClaimState, grade: ClaimFile['grade']): ClaimFile => ({
    id: 'C-9999',
    text: 't',
    state,
    topic: '命中率・距離',
    grade,
    basis: 'b',
    model: 'm',
    replaces: [],
    updated: '2026-10-02',
  });
  it('確定にできるのは厳密一致・反復実測・データ明記だけ', () => {
    expect(validateClaims(toClaims([claim('確定', '単独実測')]), new Set())).toEqual([
      'C-9999: 確定にできるのは等級が厳密一致・反復実測・データ明記のときだけ（単独実測）',
    ]);
    expect(validateClaims(toClaims([claim('確定', 'データ明記')]), new Set())).toEqual([]);
    expect(validateClaims(toClaims([claim('仮説', '単独実測')]), new Set())).toEqual([]);
  });
});

describe('最小構成の警告', () => {
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const data = loadRecordsData(file);
  const claims = loadClaims();
  const states = new Map(claims.map((c) => [c.id, c.state]));

  it('機構が確定: 定義の効果と notes の根拠がすべて確定か範囲外の結論', () => {
    expect(mechanismConfirmed(undefined, states)).toBe(false);
    const def = (claimsOf: string[] | undefined): SkillDefinition =>
      ({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-02',
        skills: {
          skill1: {
            effects: [],
            notes: [{ ja: 'n', en: 'n', ...(claimsOf ? { claims: claimsOf } : {}) }],
          },
          skill2: { support: 'unsupported', effects: [], notes: [{ ja: 'n', en: 'n', claims: ['C-0001'] }] },
          burst: { support: 'unsupported', effects: [], notes: [{ ja: 'n', en: 'n', claims: ['C-0001'] }] },
        },
      }) as unknown as SkillDefinition;
    const confirmed = new Map<string, ClaimState>([['C-0001', '確定']]);
    expect(mechanismConfirmed(def(['C-0001']), confirmed)).toBe(true);
    expect(mechanismConfirmed(def(undefined), confirmed)).toBe(false);
    expect(mechanismConfirmed(def(['C-0001']), new Map([['C-0001', '仮説']]))).toBe(false);
  });

  it('通常攻撃の条件: 射撃場の的の表に、その武器種のコア命中率と弾丸命中率がある', () => {
    const recording = recordings.get('101')!;
    expect(normalConditionMeasured(data.characters.get(307)!, recording, data.enemies)).toBe(true);
    // SR の弾丸命中率も表にある（C-0168）
    const sr = [...data.characters.values()].find((c) => c.weaponType === 'SR');
    if (sr) expect(normalConditionMeasured(sr, recording, data.enemies)).toBe(true);
    // RL は弾の種類ごとの行で、的のどの着地点でも値があるときだけ測られている。誘導弾 100（フラワー）は中遠も測った（C-0174・C-0241）、
    // 直進弾 100（ラプラス：アルティメットヒーロー）・曲射 1500（シンデレラ）も 4 つの距離帯とも測った（C-0175・C-0242）
    expect(normalConditionMeasured(data.characters.get(304)!, recording, data.enemies)).toBe(true);
    expect(normalConditionMeasured(data.characters.get(511)!, recording, data.enemies)).toBe(true);
    expect(normalConditionMeasured(data.characters.get(103)!, recording, data.enemies)).toBe(true);
    const raid = { ...recording, target: { name: 'boss', element: null } };
    expect(normalConditionMeasured(data.characters.get(307)!, raid, data.enemies)).toBe(false);
  });

  it('単騎の録画には出ず、未確定の枠が 2 つ以上の多人数の録画に出る', () => {
    const ctx = { recordings, characters: data.characters, skills: data.skills, enemies: data.enemies, claims };
    const verifications = loadVerifications();
    const solo = verifications.find((v) => v.id === 'V-0063')!;
    expect(minimalWarnings([solo], ctx)).toEqual([]);
    const team = verifications.find((v) => v.recordings.some((r) => (recordings.get(r)?.team.length ?? 0) >= 3));
    if (team) {
      const w = minimalWarnings([team], ctx);
      expect(w.length).toBeGreaterThan(0);
      expect(renderMinimalLines(w)[0]).toContain('最小構成の警告');
    }
    expect(renderMinimalLines([])).toEqual([]);
    const o: Observation = loadObservations()[0]!;
    expect(o.id).toBeTruthy();
  });
});
