// 最小構成の検査の感度（plan/design-minimal-relevance.md 4.1 節・10.6 節）: 定義の変え方、観測値ごとの計算、records:check での重ね方
import { describe, expect, it } from 'vitest';
import {
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
} from '../../../scripts/records-data.ts';
import type { SkillDefinition } from '../../skills/types.ts';
import type { Claim } from '../claims.ts';
import {
  elementsOf,
  impossibleReason,
  relevanceOf,
  sensitivityKey,
  unconfirmedReason,
  usesSensitivity,
  type SensitivityEntry,
} from '../relevance.ts';
import { sensitivityOf, variantDefinition } from '../sensitivity.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const claims = loadClaims();
const observations = loadObservations();
const ctx = { recordings, characters: data.characters, skills: data.skills, enemies: data.enemies, claims, data };

describe('定義の変え方', () => {
  const def = data.skills.get(17)!;
  it('removes the effect (minus)', () => {
    const ref = { rid: 17, root: 'skills' as const, slot: 'skill2' as const, index: 0 };
    const v = variantDefinition(def, ref, 'minus', 180)!;
    expect(v.skills.skill2.effects.length).toBe(def.skills.skill2.effects.length - 1);
    expect(v.skills.skill2.effects[0]).toEqual(def.skills.skill2.effects[1]);
    // 元の定義は書き換えない
    expect(def.skills.skill2.effects.length).toBe(v.skills.skill2.effects.length + 1);
  });

  it('makes a timed effect last the whole battle from the start (plus), and skips other kinds', () => {
    const timed = def.skills.skill2.effects.findIndex((e) => e.kind === 'timed');
    const v = variantDefinition(def, { rid: 17, root: 'skills', slot: 'skill2', index: timed }, 'plus', 180)!;
    const e = v.skills.skill2.effects[timed] as unknown as Record<string, unknown>;
    expect(e.trigger).toBe('battleStart');
    expect(e.durationSeconds).toBe(180);
    expect(e.durationRef).toBeUndefined();
    const passive = def.skills.skill1.effects.findIndex((x) => x.kind === 'passive');
    expect(
      variantDefinition(def, { rid: 17, root: 'skills', slot: 'skill1', index: passive }, 'plus', 180),
    ).toBeUndefined();
  });
});

describe('観測値ごとの感度', () => {
  // 162 はアニス：スター（操作）・デルタ・イサベル。sim と比べる確定の結論の根拠の観測値を 1 つ取る
  const o = observations.find(
    (x) =>
      x.recording === '162' &&
      usesSensitivity(x) &&
      claims.some((c) => c.state === '確定' && c.observations.includes(x.id)),
  )!;
  const rec = recordings.get('162')!;

  it('lists the unconfirmed effects of the recording, with the key of the current inputs', () => {
    const entries = sensitivityOf(o, ctx);
    const expected = elementsOf(rec, ctx)
      .filter((e) => e.type === 'effect' && unconfirmedReason(e, rec, ctx) !== undefined)
      .map((e) => e.name);
    expect(entries.map((e) => e.element).sort()).toEqual(expected.sort());
    for (const e of entries) expect(e.key).toBe(sensitivityKey(o, rec, ctx));
  });

  it('changes the key when the definition of the team changes, but not when only claims change', () => {
    const base = sensitivityKey(o, rec, ctx);
    const def = structuredClone(data.skills.get(231)!) as SkillDefinition;
    def.skills.burst.effects[0]!.claims = ['C-0001'];
    expect(sensitivityKey(o, rec, { skills: new Map([...data.skills, [231, def]]) })).toBe(base);
    def.skills.burst.effects.pop();
    expect(sensitivityKey(o, rec, { skills: new Map([...data.skills, [231, def]]) })).not.toBe(base);
  });
});

describe('records:check での重ね方', () => {
  // イサベル skill2.notes[0] のような notes ではなく、定義の効果に感度を当てる。合う鍵の結果が「効かない」なら外し、鍵が古ければ静的な判定に戻す
  const o = observations.find(
    (x) =>
      usesSensitivity(x) &&
      elementsOf(recordings.get(x.recording)!, ctx).some(
        (e) =>
          e.type === 'effect' &&
          unconfirmedReason(e, recordings.get(x.recording)!, ctx) !== undefined &&
          impossibleReason(e, recordings.get(x.recording)!) === undefined,
      ),
  )!;
  const rec = recordings.get(o.recording)!;
  const element = elementsOf(rec, ctx).find(
    (e) =>
      e.type === 'effect' && unconfirmedReason(e, rec, ctx) !== undefined && impossibleReason(e, rec) === undefined,
  )!;
  const claim: Claim = {
    id: 'C-9200',
    text: 't',
    state: '確定',
    topic: 'スキル・キャラ固有',
    grade: '反復実測',
    basis: `\`${o.id}\``,
    model: 'm',
    replaces: [],
    updated: '2026-10-08',
    observations: [o.id],
  };
  const run = (entry: Partial<SensitivityEntry>) => {
    const s: SensitivityEntry = {
      observation: o.id,
      element: element.name,
      key: sensitivityKey(o, rec, ctx),
      effective: false,
      minus: 0,
      plus: null,
      ...entry,
    };
    return relevanceOf(
      [claim],
      observations,
      { ...ctx, claims: [...claims, claim] },
      new Map([[`${o.id}|${element.name}`, s]]),
    )[0]!;
  };
  const names = (r: ReturnType<typeof run>) => r.warnings.flatMap((w) => w.elements.map((e) => e.name));

  it('drops the element when a fresh result says it does not move the prediction', () => {
    const r = run({});
    expect(names(r)).not.toContain(element.name);
    expect(r.unmeasured).toBe(0);
  });

  it('keeps the element with 感度で効く when a fresh result says it moves the prediction', () => {
    const r = run({ effective: true });
    const e = r.warnings.flatMap((w) => w.elements).find((x) => x.name === element.name);
    expect(e?.reason).toMatch(/感度で効く$/);
  });

  it('falls back to the static judgement when the result is stale', () => {
    const r = run({ key: 'stale' });
    expect(r.unmeasured).toBeGreaterThan(0);
  });
});
