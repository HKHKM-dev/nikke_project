// 最小構成の検査編（plan/design-minimal-relevance.md 7 節の PR 1）: データの形の検査。観測値の scope、結論の subject・when・minimal、
// 台帳の枠の fires・bursts、notes の effect・refers。計算と警告は変えない（ここでは形の検査だけを見る）。
import { describe, expect, it } from 'vitest';
import {
  knownRids as loadKnownRids,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
} from '../../../scripts/records-data.ts';
import { parseSkillDefinition } from '../../skills/types.ts';
import { validateMinimalFields, type Claim } from '../claims.ts';
import { validateObservations, validateScope, type Observation } from '../observations.ts';
import { validateRecordings, type RecordingEntry } from '../recordings.ts';
import { validateClaimSubjects, type DefinedCharacter } from '../skills.ts';

const claim = (patch: Partial<Claim>): Claim => ({
  id: 'C-9001',
  text: 't',
  state: '確定',
  topic: 'スキル・キャラ固有',
  grade: '厳密一致',
  basis: '`101-01`',
  model: 'm',
  replaces: [],
  updated: '2026-10-07',
  observations: ['101-01'],
  ...patch,
});

describe('結論の subject・when・minimal', () => {
  it('accepts the shapes of the design', () => {
    expect(
      validateMinimalFields(claim({ subject: { places: ['data/skills/17.json の skill2 の effects[0]'] } })),
    ).toEqual([]);
    expect(validateMinimalFields(claim({ subject: { mechanism: 'clock' } }))).toEqual([]);
    expect(
      validateMinimalFields(
        claim({
          state: '仮説',
          when: {
            teamHas: { burstStage: 'AllStep', weaponType: 'RL', squad: 'CE003', rid: 17 },
            sameStatSources: { stat: 'damageTaken', atLeast: 2 },
            enemyElement: 'Fire',
          },
        }),
      ),
    ).toEqual([]);
    const mark = { element: 'イサベル skill2.notes[0]', reason: 'r', decided: '2026-10-07' };
    expect(validateMinimalFields(claim({ minimal: [{ observations: ['101-01'], ...mark }] }))).toEqual([]);
    expect(validateMinimalFields(claim({ minimal: [{ observations: '*', ...mark }] }))).toEqual([]);
  });

  it('rejects malformed subject', () => {
    const bad = (subject: unknown) => validateMinimalFields(claim({ subject: subject as Claim['subject'] }));
    expect(bad({ places: ['a'], mechanism: 'clock' })).toEqual([expect.stringMatching(/どちらか 1 つ/)]);
    expect(bad({})).toEqual([expect.stringMatching(/どちらか 1 つ/)]);
    expect(bad({ places: [] })).toEqual([expect.stringMatching(/1 つ以上/)]);
    expect(bad({ places: ['a', 'a'] })).toEqual([expect.stringMatching(/2 回/)]);
    expect(bad({ mechanism: 'weather' })).toEqual([expect.stringMatching(/語彙に無い/)]);
  });

  it('rejects malformed when, and when on a claim that is not 仮説', () => {
    const bad = (when: unknown, state: Claim['state'] = '仮説') =>
      validateMinimalFields(claim({ state, when: when as Claim['when'] }));
    expect(bad({ enemyElement: 'Fire' }, '確定')).toEqual([expect.stringMatching(/仮説の結論にだけ/)]);
    expect(bad({})).toEqual([expect.stringMatching(/1 つ以上/)]);
    expect(bad({ teamHas: {} })).toEqual([expect.stringMatching(/teamHas/)]);
    expect(bad({ teamHas: { burstStage: 'Step4' } })).toEqual([expect.stringMatching(/burstStage/)]);
    expect(bad({ teamHas: { weaponType: 'Bow' } })).toEqual([expect.stringMatching(/weaponType/)]);
    expect(bad({ teamHas: { rid: 0 } })).toEqual([expect.stringMatching(/rid/)]);
    expect(bad({ sameStatSources: { stat: 'damageTaken', atLeast: 1 } })).toEqual([
      expect.stringMatching(/sameStatSources/),
    ]);
    expect(bad({ sameStatSources: { stat: 'luck', atLeast: 2 } })).toEqual([expect.stringMatching(/sameStatSources/)]);
    expect(bad({ enemyElement: 'Light' })).toEqual([expect.stringMatching(/enemyElement/)]);
    expect(bad({ weather: 'rain' })).toEqual([expect.stringMatching(/知らない欄/)]);
  });

  it('rejects malformed minimal marks', () => {
    const bad = (minimal: unknown) => validateMinimalFields(claim({ minimal: minimal as Claim['minimal'] }));
    const ok = { observations: '*', element: 'e', reason: 'r', decided: '2026-10-07' };
    expect(bad([])).toEqual([expect.stringMatching(/1 つ以上/)]);
    expect(bad([{ ...ok, observations: ['102-01'] }])).toEqual([expect.stringMatching(/根拠に無い/)]);
    expect(bad([{ ...ok, observations: [] }])).toEqual([expect.stringMatching(/ID の並びか/)]);
    expect(bad([{ ...ok, element: ' ' }])).toEqual([expect.stringMatching(/element が空/)]);
    expect(bad([{ ...ok, reason: '' }])).toEqual([expect.stringMatching(/reason が空/)]);
    expect(bad([{ ...ok, decided: '10/07' }])).toEqual([expect.stringMatching(/YYYY-MM-DD/)]);
    expect(bad([{ ...ok, extra: 1 }])).toEqual([expect.stringMatching(/observations, element/)]);
  });
});

const definition = (notes: Record<string, unknown>[] = []): Record<string, unknown> => ({
  formatVersion: 1,
  resourceId: 9001,
  checkedAt: '2026-10-07',
  skills: {
    skill1: { effects: [{ kind: 'passive', target: 'self', stat: 'attack', ref: 1, claims: ['C-9001'] }] },
    skill2: { effects: [], notes: [{ ja: 'n', en: 'n', kind: 'noDamage' }, ...notes] },
    burst: {
      effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }],
      notes: [{ ja: 'm', en: 'm', kind: 'modeling', refers: 'effects[0]', claims: ['C-9002'] }],
    },
  },
});

describe('subject.places は定義の claims でその結論を指す場所', () => {
  const characters: DefinedCharacter[] = [
    { definition: parseSkillDefinition(definition()), name: { ja: '試し', en: 'Test' } },
  ];
  it('accepts a cited place, with or without backquotes', () => {
    const c = claim({ subject: { places: ['`data/skills/9001.json` の skill1 の effects[0]'] } });
    expect(validateClaimSubjects(characters, [c])).toEqual([]);
    const plain = claim({ id: 'C-9002', subject: { places: ['data/skills/9001.json の burst の notes[0]'] } });
    expect(validateClaimSubjects(characters, [plain])).toEqual([]);
  });
  it('rejects a place that does not cite the claim', () => {
    const c = claim({ subject: { places: ['data/skills/9001.json の burst の effects[0]'] } });
    expect(validateClaimSubjects(characters, [c])).toEqual([expect.stringMatching(/この結論を指す場所でない/)]);
  });
});

describe('notes の effect・refers', () => {
  it('reads effect and refers', () => {
    const def = parseSkillDefinition(
      definition([
        {
          ja: 'u',
          en: 'u',
          kind: 'unimplemented',
          effect: { kind: 'timed', stat: 'critDamage', target: 'allies', trigger: 'unknown' },
        },
        { ja: 'o', en: 'o', kind: 'outOfScope', effect: { kind: 'heal', target: 'self', trigger: 'damaged' } },
        { ja: 'x', en: 'x', kind: 'modeling', effect: { kind: 'unknown' } },
      ]),
    );
    expect(def.skills.skill2.notes?.[1]?.effect).toEqual({
      kind: 'timed',
      stat: 'critDamage',
      target: 'allies',
      trigger: 'unknown',
    });
    expect(def.skills.skill2.notes?.[2]?.effect?.trigger).toBe('damaged');
    expect(def.skills.skill2.notes?.[3]?.effect).toEqual({ kind: 'unknown' });
    expect(def.skills.burst.notes?.[0]?.refers).toBe('effects[0]');
    // 対応状況の決め方は変えない（unimplemented の notes があるので unsupported）
    expect(def.skills.skill2.support).toBe('unsupported');
  });

  it('rejects malformed effect and refers', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ kind: 'noDamage', effect: { kind: 'unknown' } }, /not allowed in a noDamage note/],
      [{ kind: 'unimplemented', effect: { kind: 'timed', stat: 'attack', target: 'self' } }, /trigger.*required/],
      [{ kind: 'unimplemented', effect: { kind: 'passive', target: 'self' } }, /stat.*required/],
      [{ kind: 'unimplemented', effect: { kind: 'buff' } }, /expected one of/],
      [{ kind: 'unimplemented', effect: { kind: 'timed', stat: 'luck', target: 'self', trigger: 'x' } }, /stat/],
      [{ kind: 'unimplemented', effect: { kind: 'damage', value: 1 } }, /unknown field/],
      [{ kind: 'unimplemented', refers: 'effects[0]' }, /only allowed in a modeling note/],
      [{ kind: 'modeling', refers: 'effect0' }, /expected "effects\[<index>\]"/],
      [{ kind: 'modeling', refers: 'effects[0]', effect: { kind: 'unknown' } }, /takes its effect from there/],
    ];
    for (const [note, message] of cases) {
      const raw = definition();
      (raw.skills as Record<string, { notes: Record<string, unknown>[] }>).burst!.notes = [
        { ja: 'n', en: 'n', ...note },
      ];
      expect(() => parseSkillDefinition(raw), JSON.stringify(note)).toThrow(message);
    }
    const outOfRange = definition();
    (outOfRange.skills as Record<string, { notes: Record<string, unknown>[] }>).burst!.notes = [
      { ja: 'n', en: 'n', kind: 'modeling', refers: 'effects[1]' },
    ];
    expect(() => parseSkillDefinition(outOfRange)).toThrow(/not an effect of this slot/);
  });
});

describe('観測値の scope', () => {
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const data = loadRecordsData(file);
  const base = loadObservations().find((o) => o.compare === undefined && o.invalid === undefined)!;
  const teamSize = recordings.get(base.recording)!.team.length;
  const check = (scope: unknown): string[] =>
    validateObservations([{ ...base, scope: scope as Observation['scope'] }], recordings, data.enemies);

  it('accepts slot numbers, arrays and all, with or without frames', () => {
    expect(check({ slot: 1, source: 'normal' })).toEqual([]);
    expect(check({ slot: 'all', source: 'clock', frames: [100, 200] })).toEqual([]);
    expect(validateScope({ slot: [1, 2], source: 'gauge' }, 2, 'x')).toEqual([]);
  });

  it('rejects slots outside the team, unknown sources and bad frames', () => {
    expect(check({ slot: teamSize + 1, source: 'normal' })).toEqual([
      expect.stringMatching(/scope.slot は録画の編成の枠/),
    ]);
    expect(check({ slot: [], source: 'normal' })).toEqual([expect.stringMatching(/scope.slot が空/)]);
    expect(validateScope({ slot: [1, 1], source: 'normal' }, 2, 'x')).toEqual([expect.stringMatching(/2 回/)]);
    expect(check({ slot: 1, source: 'weather' })).toEqual([expect.stringMatching(/scope.source/)]);
    expect(check({ slot: 1, source: 'normal', frames: [200, 100] })).toEqual([expect.stringMatching(/scope.frames/)]);
    expect(check({ slot: 1, source: 'normal', frames: [1.5, 2] })).toEqual([expect.stringMatching(/scope.frames/)]);
  });
});

describe('台帳の枠の fires・bursts', () => {
  const file = loadRecordingsFile();
  const knownRids = loadKnownRids();
  const first = file.recordings.find((r) => r.team.length >= 2)!;
  const withMember = (patch: Record<string, unknown>): RecordingEntry => ({
    ...first,
    team: first.team.map((m, i) => (i === 0 ? { ...m, ...patch } : m)),
  });

  it('accepts true and false', () => {
    const file1 = { recordings: [withMember({ fires: false, bursts: true })] };
    expect(validateRecordings(file1, knownRids)).toEqual([]);
  });

  it('rejects anything else', () => {
    const file1 = { recordings: [withMember({ fires: 'no', bursts: 0 })] };
    expect(validateRecordings(file1, knownRids)).toEqual([
      expect.stringMatching(/fires は true か false/),
      expect.stringMatching(/bursts は true か false/),
    ]);
  });
});
