// 起案と結論の下書き・最小構成の警告・確定の等級の検査（plan/design-records-automation.md 3.1・3.5・3.6 節）
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { loadClaims, loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { toClaims, validateClaims, type ClaimFile, type ClaimState, type Judgment } from '../claims.ts';
import {
  appendBasis,
  claimBasisObservations,
  claimDraft,
  claimUpdateBasis,
  idsInPaths,
  keptClaimGrade,
  mergeClaimUpdate,
  nextId,
  parseJudgment,
  updatedClaim,
  RESULTS_MARKERS,
  verificationFileName,
  verificationTemplate,
  type ClaimDraftInput,
} from '../drafts.ts';
import { mechanismConfirmed, normalConditionMeasured } from '../minimal.ts';
import { invalidatedObservation, repointClaim } from '../observationEdits.ts';
import { elementsOf } from '../relevance.ts';
import type { Observation } from '../observations/types.ts';
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
    observations: [obs('0101-01'), obs('0102-01')],
    gradeCandidate: '反復実測',
    compared: new Map([
      ['0101-01', true],
      ['0102-01', true],
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
    expect(d.file.basis).toBe('`0101-01`・`0102-01`。V-0099');
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
    const given = [{ recording: '0101', role: '仮説の出どころ' as const }];
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
            observation: '0101-01',
            recordings: ['0101'],
            elements: [{ name: 'a skill1.effects[0]', reason: '根拠なし' }],
            marked: [],
          },
        ],
      }).reasons[0],
    ).toContain('最小構成の警告がある（a skill1.effects[0]（0101-01））');
    // 印だけの組は警告ではない
    expect(
      claimDraft({ ...base, minimal: [{ observation: '0101-01', recordings: ['0101'], elements: [], marked: ['a'] }] })
        .reasons,
    ).toEqual([]);
    // 結論の対象が無い・compare も scope も無い観測値（設計書 9 節の 2）
    const { subject: _subject, ...noSubject } = base;
    expect(claimDraft(noSubject).reasons[0]).toContain('結論の対象');
    const bare = { ...obs('0103-01'), scope: undefined };
    expect(claimDraft({ ...base, observations: [bare] }).reasons.some((r) => r.includes('scope の無い観測値'))).toBe(
      true,
    );
    expect(claimDraft(base).file.subject).toEqual({ mechanism: 'targetTable' });
    expect(
      claimDraft({ ...base, observations: [obs('0101-01'), obs('0102-01', '2026-10-02', true)] }).reasons[0],
    ).toContain('失効');
    expect(claimDraft({ ...base, compared: new Map([['0101-01', false]]) }).reasons[0]).toContain('許容外');
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
      predicted: { at: '2026-10-03', commit: 'abc1234', values: {}, seen: { '0101': ['0101-01'] } },
    };
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(1, 0) } }).reasons).toEqual([]);
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(0, 0) } }).reasons).toEqual([]);
    expect(claimDraft({ ...base, prediction: { file: late, targets: [], score: score(1, 1) } }).reasons[0]).toContain(
      '合う仮説が 2 つ',
    );
  });

  it('judgment で上書きした条件は理由にせず、judgment を結論に書く（records:close と同じ。設計書 17 の 2 節）', () => {
    const judgment = (overrides: Judgment['overrides']): Judgment => ({
      decided: '2026-11-18',
      overrides,
      reason: '理由',
    });
    const outside = { ...base, compared: new Map([['0101-01', false]]) };
    expect(claimDraft(outside).file.state).toBe('仮説');
    const judged = claimDraft({ ...outside, judgment: judgment(['許容外']) });
    expect(judged.reasons).toEqual([]);
    expect(judged.file.state).toBe('確定');
    expect(judged.file.judgment).toEqual(judgment(['許容外']));
    const warned = {
      ...base,
      minimal: [{ observation: '0101-01', recordings: ['0101'], elements: [{ name: 'a', reason: 'r' }], marked: [] }],
    };
    expect(claimDraft({ ...warned, judgment: judgment(['最小構成の警告']) }).reasons).toEqual([]);
    // 指標なしを上書きしても、等級が確定にできるものでなければ仮説
    const noMetric = claimDraft({ ...base, gradeCandidate: undefined, judgment: judgment(['指標なし']) });
    expect(noMetric.file.state).toBe('仮説');
    expect(noMetric.reasons[0]).toContain('等級が 単独実測');
  });

  it('人が決めた等級（grade）は等級の欄に入り、候補が確定にできる等級でないことを理由にしない', () => {
    const kept = claimDraft({ ...base, gradeCandidate: '単独実測', grade: '反復実測' });
    expect(kept.file.grade).toBe('反復実測');
    expect(kept.reasons).toEqual([]);
    // 比べる指標の無いデータ明記は、指標なしを上書きしなくても確定にできる（records:close と同じ）
    const data = claimDraft({ ...base, gradeCandidate: undefined, grade: 'データ明記' });
    expect(data.file.grade).toBe('データ明記');
    expect(data.reasons).toEqual([]);
  });
});

describe('parseJudgment', () => {
  it('reads "<条件>・<条件>|<理由>" with today as the decided date', () => {
    expect(parseJudgment('許容外・最小構成の警告|丸めの差', '2026-11-18')).toEqual({
      decided: '2026-11-18',
      overrides: ['許容外', '最小構成の警告'],
      reason: '丸めの差',
    });
    expect(parseJudgment('合う仮説が 2 つ以上, 指標なし | 理由', '2026-11-18')).toMatchObject({
      overrides: ['合う仮説が 2 つ以上', '指標なし'],
      reason: '理由',
    });
  });

  it('returns the problems for a wrong form', () => {
    expect(parseJudgment('許容外', '2026-11-18')).toEqual([expect.stringContaining('--judgment は')]);
    expect(parseJudgment('ほか|理由', '2026-11-18')).toEqual([expect.stringContaining('語彙に無い: ほか')]);
    expect(parseJudgment('許容外|', '2026-11-18')).toEqual([expect.stringContaining('reason が空')]);
  });
});

describe('records:new claim --update の欄', () => {
  const existing: ClaimFile = {
    id: 'C-0500',
    text: '結論',
    state: '仮説',
    topic: '命中率・距離',
    grade: '単独実測',
    basis: '`0101-01`（注記）。V-0099',
    model: 'モデル',
    replaces: ['C-0400'],
    updated: '2026-10-01',
    decidedOn: [{ recording: '0101', role: '仮説の出どころ' }],
    minimal: [{ observations: ['0101-01'], element: 'a', reason: 'r', decided: '2026-10-01' }],
  };

  it('appendBasis adds the new observations and the verification after the old basis', () => {
    expect(appendBasis(existing.basis, ['0102-01', '0102-02'], 'V-0100')).toBe(
      '`0101-01`（注記）。V-0099。`0102-01`・`0102-02`。V-0100',
    );
    expect(appendBasis(existing.basis, ['0101-02'], 'V-0099')).toBe('`0101-01`（注記）。V-0099。`0101-02`');
    expect(appendBasis(existing.basis, [], 'V-0100')).toBe(existing.basis);
  });

  it('mergeClaimUpdate adds decidedOn・runs to the old lists and replaces the rest when given', () => {
    const merged = mergeClaimUpdate(existing, {
      decidedOn: [
        { recording: '0101', role: '仮説の出どころ' },
        { recording: '0102', role: '値を合わせた' },
      ],
      subject: { mechanism: 'targetTable' },
    });
    expect(merged.decidedOn).toEqual([
      { recording: '0101', role: '仮説の出どころ' },
      { recording: '0102', role: '値を合わせた' },
    ]);
    expect(merged.subject).toEqual({ mechanism: 'targetTable' });
    expect('runs' in merged).toBe(false);
    expect(mergeClaimUpdate(existing, {})).toEqual({ decidedOn: existing.decidedOn });
  });

  it('updatedClaim keeps the text, topic, model, replaces and marks, and takes the state, grade and date from the draft', () => {
    const draft = {
      file: { ...existing, state: '確定' as const, grade: '反復実測' as const, updated: '2026-11-18' },
      reasons: [],
    };
    const merged = { decidedOn: existing.decidedOn!, subject: { mechanism: 'targetTable' as const } };
    const basis = appendBasis(existing.basis, ['0102-01'], 'V-0100');
    const result = updatedClaim(existing, draft, merged, basis, undefined);
    expect(result.reasons).toEqual([]);
    expect(result.file).toMatchObject({
      text: '結論',
      topic: '命中率・距離',
      model: 'モデル',
      replaces: ['C-0400'],
      minimal: existing.minimal,
      state: '確定',
      grade: '反復実測',
      basis,
      subject: { mechanism: 'targetTable' },
      updated: '2026-11-18',
    });
    expect(updatedClaim(existing, draft, merged, basis, '新しいモデル').file.model).toBe('新しいモデル');
    // when・edge は仮説にだけ書ける欄なので、書いてあれば仮説のまま
    const withWhen = { ...existing, when: { enemyElement: 'Fire' } } as ClaimFile;
    const kept = updatedClaim(withWhen, draft, merged, basis, undefined);
    expect(kept.file.state).toBe('仮説');
    expect(kept.reasons[0]).toContain('when・edge');
    // 等級が変われば、前の等級の理由（gradeReason）は外す。同じ等級なら残す
    const reasoned = { ...existing, grade: '厳密一致' as const, gradeReason: '理由' };
    expect(updatedClaim(reasoned, draft, merged, basis, undefined).file.gradeReason).toBeUndefined();
    const same = { ...draft, file: { ...draft.file, grade: '厳密一致' as const } };
    expect(updatedClaim(reasoned, same, merged, basis, undefined).file.gradeReason).toBe('理由');
    // 書き戻した結論は形の検査に通る
    expect(validateClaims(toClaims([{ ...result.file, replaces: [] }]), new Set(['0101-01', '0102-01']))).toEqual([]);
  });

  // 新しい検証 V-0100 の観測値: 0102-01 は有効、0102-02 は無効
  const fromV0100 = (o: Observation): Observation => ({ ...o, source: 'V-0100' });
  const all = [obs('0101-01'), fromV0100(obs('0102-01')), fromV0100(obs('0102-02', '2026-10-02', true))];

  it('claimBasisObservations leaves out invalid observations, from the verification or from --observations', () => {
    const byVerification = claimBasisObservations(all, 'V-0100', undefined);
    expect(byVerification.given.map((o) => o.id)).toEqual(['0102-01']);
    expect(byVerification.excluded.map((o) => o.id)).toEqual(['0102-02']);
    const picked = claimBasisObservations(all, 'V-0100', [all[0]!, all[2]!]);
    expect(picked.given.map((o) => o.id)).toEqual(['0101-01']);
    expect(picked.excluded.map((o) => o.id)).toEqual(['0102-02']);
  });

  it('claimUpdateBasis adds only the observations not in the old basis, and keeps the old ones in own', () => {
    const { given } = claimBasisObservations(all, 'V-0100', undefined);
    const update = claimUpdateBasis({ basis: existing.basis, observations: ['0101-01'] }, given, 'V-0100', all);
    expect(update.added).toEqual(['0102-01']);
    expect(update.basis).toBe('`0101-01`（注記）。V-0099。`0102-01`。V-0100');
    expect(update.own.map((o) => o.id)).toEqual(['0101-01', '0102-01']);
    // 足すものが無ければ根拠の文は前のまま
    const none = claimUpdateBasis(
      { basis: existing.basis, observations: ['0101-01', '0102-01'] },
      given,
      'V-0100',
      all,
    );
    expect(none.added).toEqual([]);
    expect(none.basis).toBe(existing.basis);
  });

  it('--update with a verification that has an invalid observation keeps a confirmed claim confirmed', () => {
    const confirmed: ClaimFile = {
      ...existing,
      state: '確定',
      grade: '反復実測',
      subject: { mechanism: 'targetTable' },
      decidedOn: [],
    };
    const { given } = claimBasisObservations(all, 'V-0100', undefined);
    const { added, basis, own } = claimUpdateBasis(
      { basis: confirmed.basis, observations: ['0101-01'] },
      given,
      'V-0100',
      all,
    );
    const merged = mergeClaimUpdate(confirmed, {});
    const input: ClaimDraftInput = {
      id: confirmed.id,
      verification: 'V-0100',
      topic: confirmed.topic,
      text: confirmed.text,
      today: '2026-11-21',
      observations: own,
      gradeCandidate: '反復実測',
      compared: new Map(own.map((o) => [o.id, true])),
      subject: merged.subject,
      minimal: [],
      prediction: undefined,
      decidedOn: merged.decidedOn,
    };
    const draft = claimDraft(input);
    const result = updatedClaim(confirmed, draft, merged, basis, undefined);
    expect(added).toEqual(['0102-01']);
    expect(result.reasons).toEqual([]);
    expect(result.file).toMatchObject({ state: '確定', grade: '反復実測', basis, updated: '2026-11-21' });
    expect(result.file.basis).not.toContain('0102-02');
    // 無効の観測値を根拠に入れると、失効を理由に仮説に戻る（除く理由）
    const withInvalid = claimDraft({ ...input, observations: all });
    expect(withInvalid.file.state).toBe('仮説');
    expect(withInvalid.reasons).toEqual(['失効した観測値がある（0102-02）']);
  });

  it('keptClaimGrade keeps a grade without a candidate, or one written above the candidate with gradeReason', () => {
    expect(keptClaimGrade({}, '反復実測')).toBeUndefined();
    expect(keptClaimGrade({ grade: 'データ明記' }, undefined)).toBe('データ明記');
    expect(keptClaimGrade({ grade: '厳密一致' }, '反復実測')).toBeUndefined();
    expect(keptClaimGrade({ grade: '厳密一致', gradeReason: '理由' }, '反復実測')).toBe('厳密一致');
    expect(keptClaimGrade({ grade: '単独実測', gradeReason: '理由' }, '反復実測')).toBeUndefined();
  });

  // records:new observation --invalidate 0101-01 --by 0102-01 の付け替えの後の出し直し（records-new.ts の rewriteClaim と同じ組み立て）
  it('--invalidate --by re-evaluates the repointed claim: out of tolerance goes back to a hypothesis', () => {
    const confirmed: ClaimFile = {
      ...existing,
      state: '確定',
      grade: '反復実測',
      subject: { mechanism: 'targetTable' },
      decidedOn: [],
    };
    const after = [invalidatedObservation(obs('0101-01'), '読み違い', '2026-11-21'), obs('0102-01')];
    const repointed = repointClaim(confirmed, '0101-01', '0102-01', '2026-11-21')!;
    const ownIds = toClaims([repointed])[0]!.observations;
    expect(ownIds).toEqual(['0102-01']);
    const own = after.filter((o) => ownIds.includes(o.id));
    const merged = mergeClaimUpdate(repointed, {});
    const rewrite = (inTolerance: boolean, candidate: ClaimDraftInput['gradeCandidate']) =>
      updatedClaim(
        repointed,
        claimDraft({
          id: repointed.id,
          verification: 'V-0100',
          topic: repointed.topic,
          text: repointed.text,
          today: '2026-11-21',
          observations: own,
          gradeCandidate: candidate,
          compared: new Map([['0102-01', inTolerance]]),
          subject: merged.subject,
          minimal: [],
          prediction: undefined,
          decidedOn: merged.decidedOn,
          judgment: merged.judgment,
          grade: keptClaimGrade(repointed, candidate),
        }),
        merged,
        repointed.basis,
        undefined,
      );
    const outside = rewrite(false, '反復実測');
    expect(outside.file.state).toBe('仮説');
    expect(outside.reasons).toEqual(['許容外の観測値がある（0102-01）']);
    expect(outside.file.basis).toBe('`0102-01`（注記）。V-0099');
    // 1 本の録画に減って等級の候補が単独実測になれば、等級も下がって仮説
    const single = rewrite(true, '単独実測');
    expect(single.file).toMatchObject({ state: '仮説', grade: '単独実測' });
    // 許容内で候補が確定にできる等級なら確定のまま
    expect(rewrite(true, '反復実測').file).toMatchObject({ state: '確定', grade: '反復実測', updated: '2026-11-21' });
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

  it('録画の中の反復（runs）の形を見る（plan/design-grade-runs.md 2 節）', () => {
    const withRuns = (decidedOn: ClaimFile['decidedOn'], runs: unknown) =>
      ({ ...claim('確定', '反復実測'), basis: '`0101-01`・`0102-01`', decidedOn, runs }) as ClaimFile;
    const obs = new Set(['0101-01', '0102-01']);
    const decided: ClaimFile['decidedOn'] = [{ recording: '0101', role: '値を合わせた' }];
    expect(
      validateClaims(
        toClaims([
          withRuns(decided, [
            { recording: '0101', decided: '1 回目', reproduced: '2 回目', observations: ['0101-01'] },
          ]),
        ]),
        obs,
      ),
    ).toEqual([]);
    expect(
      validateClaims(
        toClaims([
          withRuns(decided, [
            { recording: '0101', reproduced: '', observations: ['0102-01'] },
            { recording: '0102', decided: '1 回目', reproduced: '2 回目', observations: ['0102-09'] },
          ]),
        ]),
        obs,
      ),
    ).toEqual([
      'C-9999: runs[0].decided が要る（録画 0101 は decidedOn にある。決めた回を書く）',
      'C-9999: runs[0].reproduced が空',
      'C-9999: runs[0].observations の 0102-01 は録画 0101 の観測値でない',
      'C-9999: runs[1].decided は書かない（録画 0102 は decidedOn に無い。決めた回があるなら decidedOn に書く）',
      'C-9999: runs[1].observations の 0102-09 はこの結論の根拠に無い',
    ]);
    expect(
      validateClaims(
        toClaims([withRuns(undefined, [{ recording: '0101', reproduced: '2 回目', observations: ['0101-01'] }])]),
        obs,
      ),
    ).toEqual(['C-9999: runs を書くなら decidedOn も書く（無ければ []）']);
  });

  it('合わせ込みの定数なし（parameterFree）の形を見る（同 3 節）', () => {
    const other = { ...claim('確定', '厳密一致'), id: 'C-0001' };
    const draft = { ...claim('仮説', '単独実測'), id: 'C-0002' };
    const withFree = (parameterFree: string, decidedOn: ClaimFile['decidedOn']): ClaimFile => ({
      ...claim('確定', '反復実測'),
      parameterFree,
      ...(decidedOn === undefined ? {} : { decidedOn }),
    });
    expect(
      validateClaims(
        toClaims([other, withFree('説明文の 10% と C-0001', [{ recording: '0101', role: '仮説の出どころ' }])]),
        new Set(),
      ),
    ).toEqual([]);
    expect(
      validateClaims(
        toClaims([other, draft, withFree('C-0002・C-0003・C-9999', [{ recording: '0101', role: '値を合わせた' }])]),
        new Set(),
      ),
    ).toEqual([
      'C-9999: parameterFree は、値を合わせた録画（decidedOn の 0101）のある結論には書けない',
      'C-9999: parameterFree の C-0002 が確定でない（仮説）',
      'C-9999: parameterFree の C-0003 が無い',
      'C-9999: parameterFree に自分（C-9999）を書いている',
    ]);
    expect(validateClaims(toClaims([withFree('説明文', undefined)]), new Set())).toEqual([
      'C-9999: parameterFree を書くなら decidedOn も書く（無ければ []）',
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
    const recording = recordings.get('0101')!;
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

  it('編成の条件で外れる効果は見ない（録画 0192 のラムの S1 の CT▼。同じ部隊の味方がいない）', () => {
    const ctx = { recordings, ...data, claims };
    const names = elementsOf(recordings.get('0192')!, ctx).map((e) => e.name);
    expect(names.some((n) => n.startsWith('ラム skill1.effects['))).toBe(false);
    // 外さずに見ると、CT▼ の根拠の C-0235（仮説）でラムが未確定になる
    expect(mechanismConfirmed(data.skills.get(822), states)).toBe(false);
  });
});
