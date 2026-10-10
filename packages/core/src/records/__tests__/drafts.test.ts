// 起案と結論の下書き・最小構成の警告・確定の等級の検査（plan/design-records-automation.md 3.1・3.5・3.6 節）
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { loadClaims, loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { toClaims, validateClaims, type ClaimFile, type ClaimState } from '../claims.ts';
import {
  claimDraft,
  idsInPaths,
  nextId,
  RESULTS_MARKERS,
  verificationFileName,
  verificationTemplate,
  type ClaimDraftInput,
} from '../drafts.ts';
import { mechanismConfirmed, normalConditionMeasured } from '../minimal.ts';
import { elementsOf } from '../relevance.ts';
import type { Observation } from '../observations.ts';
import { parseVerification } from '../verifications.ts';
import type { SkillDefinition } from '../../skills/types.ts';

describe('idsInPaths', () => {
  it('takes verification and claim IDs from git file names (V-0378)', () => {
    const out = [
      '',
      'records/verifications/V-0379-foo-bar.md',
      'records/claims/C-0500.json',
      'records/claims/C-0500.json',
      'records/verifications/README.md',
      'records/predictions/V-0381.json',
      'records/claims/C-10001.json',
      '',
    ].join('\n');
    expect(idsInPaths(out)).toEqual(['V-0379', 'C-0500', 'C-10001']);
    expect(nextId('V', ['V-0378', ...idsInPaths(out)])).toBe('V-0380');
  });
});

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
  scope: { slot: 1, source: 'normal' },
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
    subject: { mechanism: 'targetTable' },
    minimal: [],
    prediction: undefined,
    decidedOn: [],
  };

  it('等級の候補が厳密一致か反復実測で、疑問の印が無ければ確定', () => {
    const d = claimDraft(base);
    expect(d.reasons).toEqual([]);
    expect(d.file.state).toBe('確定');
    expect(d.file.grade).toBe('反復実測');
    expect(d.file.basis).toBe('`101-01`・`102-01`。V-0099');
    expect(d.file.text).toContain('書く');
    expect(d.file.decidedOn).toEqual([]);
  });

  it('反復実測の候補で decidedOn が無ければ仮説（plan/design-investigation-review.md 1.3 節）', () => {
    const { decidedOn: _decidedOn, ...noDecided } = base;
    const d = claimDraft(noDecided);
    expect(d.file.state).toBe('仮説');
    expect(d.reasons[0]).toContain('decidedOn が無い');
    expect('decidedOn' in d.file).toBe(false);
    // 厳密一致なら問わない
    expect(claimDraft({ ...noDecided, gradeCandidate: '厳密一致' }).reasons).toEqual([]);
    // 書けば結論のファイルに入る
    const given = [{ recording: '101', role: '仮説の出どころ' as const }];
    expect(claimDraft({ ...base, decidedOn: given }).file.decidedOn).toEqual(given);
  });

  it('疑問の印が 1 つでもあれば仮説にし、理由を返す', () => {
    expect(claimDraft({ ...base, gradeCandidate: '単独実測' })).toMatchObject({
      file: { state: '仮説', grade: '単独実測' },
    });
    expect(claimDraft({ ...base, gradeCandidate: undefined }).reasons[0]).toContain('比べた観測値が無い');
    expect(claimDraft({ ...base, gradeCandidate: undefined }).file.grade).toBe('単独実測');
    expect(claimDraft({ ...base, observations: [], gradeCandidate: undefined }).file.grade).toBe('推論');
    expect(
      claimDraft({
        ...base,
        minimal: [
          {
            observation: '101-01',
            recordings: ['101'],
            elements: [{ name: 'a skill1.effects[0]', reason: '根拠なし' }],
            marked: [],
          },
        ],
      }).reasons[0],
    ).toContain('最小構成の警告がある（a skill1.effects[0]（101-01））');
    // 印だけの組は警告ではない
    expect(
      claimDraft({ ...base, minimal: [{ observation: '101-01', recordings: ['101'], elements: [], marked: ['a'] }] })
        .reasons,
    ).toEqual([]);
    // 結論の対象が無い・compare も scope も無い観測値（設計書 9 節の 2）
    const { subject: _subject, ...noSubject } = base;
    expect(claimDraft(noSubject).reasons[0]).toContain('結論の対象');
    const bare = { ...obs('103-01'), scope: undefined };
    expect(claimDraft({ ...base, observations: [bare] }).reasons.some((r) => r.includes('scope の無い観測値'))).toBe(
      true,
    );
    expect(claimDraft(base).file.subject).toEqual({ mechanism: 'targetTable' });
    expect(
      claimDraft({ ...base, observations: [obs('101-01'), obs('102-01', '2026-10-02', true)] }).reasons[0],
    ).toContain('失効');
    expect(claimDraft({ ...base, compared: new Map([['101-01', false]]) }).reasons[0]).toContain('許容外');
  });

  it('予測は任意: 順と日付は見ず、仮説が 2 つ以上あって 2 つ以上と合うときだけ理由にする（同 1.3 節）', () => {
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
    // まだ出していない・読んだ日より後に出した・控えに入った観測値がある・どの仮説とも合わない、はどれも理由にしない
    expect(claimDraft({ ...base, prediction: { file, targets: [], score: score(1, 0) } }).reasons).toEqual([]);
    const late = {
      ...file,
      predicted: { at: '2026-10-03', commit: 'abc1234', values: {}, seen: { '101': ['101-01'] } },
    };
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(1, 0) } }).reasons).toEqual([]);
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(0, 0) } }).reasons).toEqual([]);
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(1, 1) } }).reasons[0]).toContain(
      '合う仮説が 2 つ',
    );
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

  it('人の判断（judgment）の形を見る（plan/design-investigation-review.md 3 節）', () => {
    const withJudgment = (judgment: unknown) => ({ ...claim('確定', '反復実測'), judgment }) as ClaimFile;
    expect(
      validateClaims(
        toClaims([withJudgment({ decided: '2026-10-11', overrides: ['指標なし', '許容外'], reason: '理由' })]),
        new Set(),
      ),
    ).toEqual([]);
    expect(
      validateClaims(toClaims([withJudgment({ decided: '10/11', overrides: ['勘'], reason: '' })]), new Set()),
    ).toEqual([
      'C-9999: judgment.decided は YYYY-MM-DD',
      'C-9999: judgment.overrides が語彙に無い: 勘',
      'C-9999: judgment.reason が空',
    ]);
    expect(validateClaims(toClaims([withJudgment({ decided: '2026-10-11', overrides: [] })]), new Set())).toEqual([
      'C-9999: judgment.overrides は上書きした条件の並び（1 つ以上。指標なし・最小構成の警告・許容外・合う仮説が 2 つ以上）',
      'C-9999: judgment.reason が空',
    ]);
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
    // RL は弾の種類ごとの行で、的のどの着地点でも値があるときだけ測られている。誘導弾 100（フラワー）は中遠も測った（C-0174・C-0530）、
    // 直進弾 100（ラプラス：アルティメットヒーロー）・曲射 1500（シンデレラ）も 4 つの距離帯とも測った（C-0175・C-0242）
    expect(normalConditionMeasured(data.characters.get(304)!, recording, data.enemies)).toBe(true);
    expect(normalConditionMeasured(data.characters.get(511)!, recording, data.enemies)).toBe(true);
    expect(normalConditionMeasured(data.characters.get(103)!, recording, data.enemies)).toBe(true);
    const raid = { ...recording, mode: 'interception-special' as const, target: { name: 'boss', element: null } };
    expect(normalConditionMeasured(data.characters.get(307)!, raid, data.enemies)).toBe(false);
    // 台帳の属性が空の射撃場 3 分モードの録画も、射撃場の表を引く（5 つの属性のプリセットが同じ表を指す。D1）
    const noElement = { ...recording, target: { ...recording.target, element: null } };
    expect(normalConditionMeasured(data.characters.get(307)!, noElement, data.enemies)).toBe(true);
    const noMode = { ...noElement, mode: null };
    expect(normalConditionMeasured(data.characters.get(307)!, noMode, data.enemies)).toBe(false);
    // 射撃場のプリセットが属性ごとに別の表を指すなら、属性が空では決まらない
    const firstRange = data.enemies.enemies.find((p) => p.content === 'range')!;
    const split = {
      ...data.enemies,
      enemies: data.enemies.enemies.map((p) => (p === firstRange ? { ...p, targetProfile: 'other' } : p)),
    };
    expect(normalConditionMeasured(data.characters.get(307)!, noElement, split)).toBe(false);
    const water = { ...recording, target: { ...recording.target, element: 'Water' as const } };
    expect(firstRange.element).not.toBe('Water');
    expect(normalConditionMeasured(data.characters.get(307)!, water, split)).toBe(true);
  });

  it('編成の条件で外れる効果は見ない（録画 192 のラムの S1 の CT▼。同じ部隊の味方がいない）', () => {
    const ctx = { recordings, characters: data.characters, skills: data.skills, enemies: data.enemies, claims };
    const names = elementsOf(recordings.get('192')!, ctx).map((e) => e.name);
    expect(names.some((n) => n.startsWith('ラム skill1.effects['))).toBe(false);
    // 外さずに見ると、CT▼ の根拠の C-0235（仮説）でラムが未確定になる
    expect(mechanismConfirmed(data.skills.get(822), states)).toBe(false);
  });
});
