// 分類の設計書の論点 7（plan/design-indirect-notes.md）: 間接の notes（indirect・path）と読む側の印（reads）の読み込み、最小構成の検査、
// キャラ単位の判定、plan/skills.md の表示。録画とキャラは実データを使う（件数や ID の一覧は直書きしない）
import { describe, expect, it } from 'vitest';
import { loadClaims, loadRecordsData, loadRecordingsFile, recordingMap } from '../../../scripts/records-data.ts';
import { parseSkillDefinition, type SkillDefinition } from '../../skills/types.ts';
import type { ClaimState } from '../claims.ts';
import { mechanismConfirmed } from '../minimal.ts';
import type { Observation } from '../observations.ts';
import type { RecordingEntry } from '../recordings.ts';
import { elementsOf, notRelevantReason, unconfirmedReason, type RelevanceContext } from '../relevance.ts';
import { renderSkills } from '../skills.ts';

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (skill1: Record<string, unknown>) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-16',
    skills: { skill1, skill2: empty, burst: empty },
  });
const note = (patch: Record<string, unknown>) => ({ ja: 'n', en: 'n', ...patch });

describe('間接の notes と読む側の印の読み込み', () => {
  it('reads an indirect note with its path, and reads on notes and effects', () => {
    const def = parse({
      effects: [
        {
          kind: 'timed',
          trigger: 'burstUse',
          target: 'self',
          stat: 'attack',
          ref: 1,
          durationSeconds: 1,
          reads: ['hp'],
        },
      ],
      notes: [
        note({ kind: 'indirect', path: 'defense' }),
        note({ kind: 'unimplemented', reads: ['barrier', 'decoy'] }),
      ],
    });
    expect(def.skills.skill1.notes![0]).toMatchObject({ kind: 'indirect', path: 'defense' });
    expect(def.skills.skill1.notes![1]!.reads).toEqual(['barrier', 'decoy']);
    expect(def.skills.skill1.effects[0]!.reads).toEqual(['hp']);
    // 対応状況は未対応に数えない（効果あり・未対応の notes ありで partial）
    expect(def.skills.skill1.support).toBe('partial');
    expect(parse({ effects: [], notes: [note({ kind: 'indirect', path: 'hp' })] }).skills.skill1.support).toBe(
      'noEffect',
    );
  });

  it('requires the path only in an indirect note, and rejects reads where paths would chain', () => {
    expect(() => parse({ effects: [], notes: [note({ kind: 'indirect' })] })).toThrow(/path: required/);
    expect(() => parse({ effects: [], notes: [note({ kind: 'indirect', path: 'mana' })] })).toThrow(/expected one of/);
    expect(() => parse({ effects: [], notes: [note({ kind: 'noDamage', path: 'hp' })] })).toThrow(
      /only allowed in an indirect note/,
    );
    expect(() => parse({ effects: [], notes: [note({ kind: 'indirect', path: 'hp', reads: ['hp'] })] })).toThrow(
      /indirect paths do not chain/,
    );
    expect(() => parse({ effects: [], notes: [note({ kind: 'noDamage', reads: ['hp'] })] })).toThrow(/reads/);
    expect(() => parse({ effects: [], notes: [note({ kind: 'unimplemented', reads: ['hp', 'hp'] })] })).toThrow(
      /duplicate path/,
    );
    expect(() => parse({ effects: [], notes: [note({ kind: 'unimplemented', reads: [] })] })).toThrow(/non-empty/);
    expect(() => parse({ effects: [], notes: [note({ kind: 'unimplemented', path2: 'hp' })] })).toThrow(
      /unknown field/,
    );
  });
});

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const claims = loadClaims();
const ctx: RelevanceContext = {
  recordings,
  characters: data.characters,
  skills: data.skills,
  enemies: data.enemies,
  claims,
};
const rec = (id: string) => recordings.get(id)!;
const named = (r: RecordingEntry, name: string) => elementsOf(r, ctx).find((e) => e.name === name)!;
const obs = (patch: Partial<Observation>): Observation => ({
  id: '162-99',
  recording: '162',
  kind: 'hit',
  use: 'record',
  value: 1,
  description: 'd',
  source: 'V-0000',
  ...patch,
});

describe('最小構成の検査の間接の要素（plan/design-indirect-notes.md 2 節）', () => {
  // 162 はアニス：スター（1 枠目。S2 の対象が防御力の比べで決まる。reads: defense）・デルタ（2 枠目。S2 の防御力▲。間接の防御力）・
  // イサベル
  const defense = () => named(rec('162'), 'デルタ skill2.notes[0]');
  const hit = obs({ kind: 'hit', scope: { slot: 2, source: 'normal' } });

  it('lists indirect notes with their path, and readers with their reads', () => {
    expect(defense()).toMatchObject({ type: 'note', path: 'defense' });
    expect(named(rec('162'), 'アニス：スター skill2.effects[1]').reads).toEqual(['defense']);
  });

  it('is relevant only while a reader of the path can move the observation', () => {
    expect(notRelevantReason(defense(), hit, rec('162'), ctx)).toBeUndefined();
    // 観測した枠が分からなければ効きうるとみる
    expect(notRelevantReason(defense(), obs({ kind: 'hit' }), rec('162'), ctx)).toBeUndefined();
    // 読む側（アニス：スター S2 の発射体爆発ダメージ▲）は値にだけ効くので、間隔には効かない
    expect(notRelevantReason(defense(), obs({ kind: 'interval' }), rec('162'), ctx)).toBe(
      '防御力を読む効果がこの観測値に効かない',
    );
    // 印か感度で効かないと分かった読む側は数えない
    expect(notRelevantReason(defense(), hit, rec('162'), ctx, () => true)).toBe(
      '防御力を読む効果がこの観測値に効かない',
    );
    // 063 にはデルタがいるが、防御力を読む味方がいない
    const inTeam063 = named(rec('063'), 'デルタ skill2.notes[0]');
    expect(notRelevantReason(inTeam063, obs({ recording: '063' }), rec('063'), ctx)).toBe('防御力を読む味方がいない');
  });

  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 「自分と自分より最終防御力が低い味方」は発動者をいつも対象にする
  it('leaves out the hits of the reader itself, whose own target does not depend on DEF', () => {
    const own = obs({ kind: 'hit', scope: { slot: 1, source: 'normal' } });
    expect(notRelevantReason(defense(), own, rec('162'), ctx)).toBe('防御力を読む効果がこの観測値に効かない');
    const both = obs({ kind: 'hit', scope: { slot: [1, 2], source: 'normal' } });
    expect(notRelevantReason(defense(), both, rec('162'), ctx)).toBeUndefined();
  });

  it('stays unconfirmed with readers even when the note cites a confirmed claim (its evidence had no reader)', () => {
    const e = defense();
    expect(e.claims).not.toEqual([]);
    expect(unconfirmedReason(e, rec('162'), ctx)).toBe('間接（防御力）: 読む側のいる編成の根拠なし');
  });
});

describe('2 段目の段 7: 防御力▲ の効果（plan/design-skill-stage7.md 1.3・1.4 節）', () => {
  // 163 はデルタ（1 枠目）・アニス：スター（2 枠目）・I-DOLL・フラワー（3 枠目。RL）・イサベル
  const up = () => named(rec('163'), 'アニス：スター burst.effects[4]');
  const in163 = (patch: Partial<Observation>) => obs({ id: '163-99', recording: '163', ...patch });

  it('lists the DEF up as an effect, and the reader with its target narrowing', () => {
    expect(up()).toMatchObject({ type: 'effect', shape: { kind: 'timed', stat: 'defense', target: 'self' } });
    expect(up()).not.toHaveProperty('path');
    expect(named(rec('163'), 'アニス：スター skill2.effects[1]').shape?.targetDefense).toBe('lowerThanSelf');
  });

  it('is relevant as the indirect DEF path: only through a reader, and not on the hits of the reader itself', () => {
    expect(notRelevantReason(up(), in163({ kind: 'hit', scope: { slot: 3, source: 'normal' } }), rec('163'), ctx)).toBe(
      undefined,
    );
    expect(notRelevantReason(up(), in163({ kind: 'hit', scope: { slot: 2, source: 'normal' } }), rec('163'), ctx)).toBe(
      '防御力を読む効果がこの観測値に効かない',
    );
    expect(notRelevantReason(up(), in163({ kind: 'interval' }), rec('163'), ctx)).toBe(
      '防御力を読む効果がこの観測値に効かない',
    );
  });
});

describe('キャラ単位の判定と表示', () => {
  const def = (kind: string, claimIds?: string[]): SkillDefinition =>
    ({
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-16',
      skills: {
        skill1: {
          support: 'noEffect',
          effects: [],
          notes: [{ ja: 'n', en: 'n', kind, path: 'hp', ...(claimIds ? { claims: claimIds } : {}) }],
        },
        skill2: { support: 'noEffect', effects: [], notes: [{ ja: 'n', en: 'n', kind: 'noDamage' }] },
        burst: { support: 'noEffect', effects: [], notes: [{ ja: 'n', en: 'n', kind: 'noDamage' }] },
      },
    }) as unknown as SkillDefinition;

  it('leaves indirect notes out of the mechanism check, as noDamage notes', () => {
    const states = new Map<string, ClaimState>();
    expect(mechanismConfirmed(def('indirect'), states)).toBe(true);
    expect(mechanismConfirmed(def('outOfScope'), states)).toBe(false);
  });

  it('shows the path of an indirect note and the reads in plan/skills.md', () => {
    const d = parse({
      effects: [
        {
          kind: 'timed',
          trigger: 'burstUse',
          target: 'self',
          stat: 'attack',
          ref: 1,
          durationSeconds: 1,
          reads: ['hp'],
        },
      ],
      notes: [note({ kind: 'indirect', path: 'defense' }), note({ kind: 'unimplemented', reads: ['barrier'] })],
    });
    const text = renderSkills([{ definition: d, name: { ja: 'x', en: 'x' } }], []);
    expect(text).toContain('effects[0] timed・burstUse・attack（読む: HP）: 根拠なし');
    expect(text).toContain('notes[0] 間接（防御力）: n: 根拠なし');
    expect(text).toContain('notes[1] 未対応（読む: バリア）: n: 根拠なし');
  });
});
