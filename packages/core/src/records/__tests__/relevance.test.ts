// 最小構成の検査（plan/design-minimal-relevance.md 7 節の PR 3）: 静的な判定と plan/minimal.md。
// 録画とキャラは実データを使い、判定の段ごとに確かめる。件数や ID の一覧は直書きしない（plan/design-stage20.md 3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MINIMAL_PATH,
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadRecordsData,
  recordingMap,
} from '../../../scripts/records-data.ts';
import type { Claim } from '../claims.ts';
import type { Observation } from '../observations.ts';
import type { RecordingEntry } from '../recordings.ts';
import {
  classOf,
  compressIds,
  elementsOf,
  impossibleReason,
  notRelevantReason,
  relevanceOf,
  renderMinimal,
  unconfirmedReason,
  whenHolds,
  type MinimalElement,
  type RelevanceContext,
} from '../relevance.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const claims = loadClaims();
const observations = loadObservations();
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

describe('plan/minimal.md（実データ）', () => {
  it('matches plan/minimal.md (npm run records:check)', () => {
    expect(readFileSync(MINIMAL_PATH, 'utf8')).toBe(renderMinimal(relevanceOf(claims, observations, ctx), claims));
  });
});

describe('要素を並べる（2 節の 2）', () => {
  it('lists effects and notes of every slot, but not noDamage notes', () => {
    const els = elementsOf(rec('162'), ctx);
    expect(els.some((e) => e.name === 'イサベル skill2.notes[0]')).toBe(true);
    const def = data.skills.get(17)!;
    def.skills.skill2.notes?.forEach((n, j) => {
      if (n.kind === 'noDamage') expect(els.some((e) => e.name === `アニス：スター skill2.notes[${j}]`)).toBe(false);
    });
  });

  it('uses the treasure version of the slots the recording had', () => {
    const els = elementsOf(rec('079'), ctx);
    expect(els.some((e) => e.name.startsWith('ヘルム treasureSkills.skill1.'))).toBe(true);
    expect(els.some((e) => e.name.startsWith('ヘルム skill1.'))).toBe(false);
  });

  it('merges a modeling note with refers into the effect it points to', () => {
    // アスカ（830）の burst の notes[1] は refers effects[2]
    const r: RecordingEntry = { ...rec('162'), team: [{ slot: 1, rid: 830, name: 'アスカ', controlled: true }] };
    const e = named(r, 'アスカ burst.effects[2]');
    expect(e.places).toContain('data/skills/830.json の burst の notes[1]');
    expect(elementsOf(r, ctx).some((x) => x.name === 'アスカ burst.notes[1]')).toBe(false);
  });
});

describe('未確定かを決める（2 節の 3）', () => {
  const el = (claimIds: string[]): MinimalElement => ({
    slot: 1,
    name: 'x',
    places: [],
    type: 'effect',
    claims: claimIds,
  });
  const claim = (patch: Partial<Claim> & { id: string }): Claim => ({
    text: 't',
    state: '仮説',
    topic: 'スキル・キャラ固有',
    grade: '推論',
    basis: 'b',
    model: 'm',
    replaces: [],
    updated: '2026-10-08',
    observations: [],
    ...patch,
  });
  const byId = (list: Claim[]) => new Map(list.map((c) => [c.id, c]));

  it('is unconfirmed without claims, and confirmed when all claims are 確定 or 範囲外', () => {
    const list = [claim({ id: 'C-9001', state: '確定' }), claim({ id: 'C-9002', state: '範囲外' })];
    expect(unconfirmedReason(el([]), rec('162'), ctx, byId(list))).toBe('根拠なし');
    expect(unconfirmedReason(el(['C-9001', 'C-9002']), rec('162'), ctx, byId(list))).toBeUndefined();
  });

  it('counts a 仮説 only when its when holds in the recording', () => {
    // 162 はアニス：スター（Step1）・デルタ（Step2）・イサベル（Step3）。AllStep のキャラはいない
    const list = [claim({ id: 'C-9003', when: { teamHas: { burstStage: 'AllStep' } } }), claim({ id: 'C-9004' })];
    expect(unconfirmedReason(el(['C-9003']), rec('162'), ctx, byId(list))).toBeUndefined();
    expect(unconfirmedReason(el(['C-9004']), rec('162'), ctx, byId(list))).toBe('仮説 C-9004');
  });

  it('evaluates when', () => {
    expect(whenHolds({ teamHas: { rid: 231 } }, rec('162'), ctx)).toBe(true);
    expect(whenHolds({ teamHas: { rid: 231, weaponType: 'RL' } }, rec('162'), ctx)).toBe(false);
    expect(whenHolds({ teamHas: { burstStage: 'Step3', weaponType: 'SG' } }, rec('162'), ctx)).toBe(true);
    expect(whenHolds({ enemyElement: rec('162').target.element! }, rec('162'), ctx)).toBe(true);
    expect(whenHolds({ sameStatSources: { stat: 'damageTaken', atLeast: 9 } }, rec('162'), ctx)).toBe(false);
  });
});

describe('録画で起きうるか（2 節の 4）', () => {
  it('drops burst-slot and burstUse elements in a single-unit recording (C-0024)', () => {
    const solo = rec('045');
    const burst = elementsOf(solo, ctx).find((e) => e.skillSlot === 'burst')!;
    expect(impossibleReason(burst, solo)).toBe('単騎（C-0024）');
  });

  it('drops shot-triggered elements of a slot that did not fire', () => {
    const r = rec('248');
    const shot = elementsOf(r, ctx).find(
      (e) =>
        e.slot === 3 &&
        e.shape?.trigger !== undefined &&
        ['normalShot', 'normalHit', 'fullChargeShot'].includes(e.shape.trigger),
    );
    if (shot !== undefined) expect(impossibleReason(shot, r)).toBe('撃たない枠');
    const fake: MinimalElement = { slot: 3, name: 'n', places: [], type: 'normalCondition', claims: [] };
    expect(impossibleReason(fake, r)).toBe('撃たない枠');
    expect(impossibleReason({ ...fake, slot: 1 }, r)).toBeUndefined();
  });
});

describe('静的な判定（4.2 節）', () => {
  const el = (shape: MinimalElement['shape'], slot = 2): MinimalElement => ({
    slot,
    name: 'x',
    places: [],
    type: 'effect',
    shape,
    claims: [],
  });

  it('classifies by stat and kind', () => {
    expect(classOf(el({ kind: 'timed', stat: 'attack' }))).toBe('damageValue');
    expect(classOf(el({ kind: 'timed', stat: 'reloadSpeed' }))).toBe('firing');
    expect(classOf(el({ kind: 'cooldownReduction' }))).toBe('burstTiming');
    expect(classOf(el({ kind: 'dot' }))).toBe('otherHit');
    expect(classOf(el({ kind: 'timed', stat: 'unknown' }))).toBe('unknown');
    expect(classOf(el({ kind: 'unknown' }))).toBe('unknown');
  });

  it('excludes another hit from a normal-attack hit value', () => {
    const o = obs({
      compare: { model: 'sim', metric: 'hitDamage', args: { slot: 1 }, tolerance: { abs: 1 }, setup: { enemy: 'x' } },
    });
    expect(notRelevantReason(el({ kind: 'damage' }), o, rec('162'), ctx)).toBe('別のヒット');
  });

  it('excludes a self effect of another slot from a hit or rate of the observed slot', () => {
    const o = obs({ kind: 'rate', scope: { slot: 1, source: 'normal' } });
    expect(notRelevantReason(el({ kind: 'timed', stat: 'hitRate', target: 'self' }, 2), o, rec('162'), ctx)).toBe(
      '対象が観測した枠でない',
    );
    expect(
      notRelevantReason(el({ kind: 'timed', stat: 'hitRate', target: 'allies' }, 2), o, rec('162'), ctx),
    ).toBeUndefined();
    // 時刻・回数の観測値では対象で外さない
    const t = obs({ kind: 'timing', scope: { slot: 1, source: 'gauge' } });
    expect(
      notRelevantReason(el({ kind: 'timed', stat: 'hitRate', target: 'self' }, 2), t, rec('162'), ctx),
    ).toBeUndefined();
  });

  it('excludes by weapon type of the target', () => {
    // 162 の枠 3 はイサベル（SG）
    const o = obs({ kind: 'hit', scope: { slot: 3, source: 'normal' } });
    const e = el({ kind: 'timed', stat: 'attack', target: 'allies', targetWeapon: 'RL' }, 1);
    expect(notRelevantReason(e, o, rec('162'), ctx)).toBe('対象の武器種が観測した枠と違う');
  });

  it('excludes classes that cannot move the kind of observation, and never excludes unknown or a character without definition', () => {
    const interval = obs({ kind: 'interval' });
    expect(notRelevantReason(el({ kind: 'timed', stat: 'attack' }), interval, rec('162'), ctx)).toMatch(/効かない分類/);
    expect(notRelevantReason(el({ kind: 'timed', stat: 'reloadSpeed' }), interval, rec('162'), ctx)).toBeUndefined();
    expect(notRelevantReason(el({ kind: 'unknown' }), interval, rec('162'), ctx)).toBeUndefined();
    const total = obs({ kind: 'total' });
    expect(notRelevantReason(el({ kind: 'timed', stat: 'attack' }), total, rec('162'), ctx)).toBeUndefined();
    const nodef: MinimalElement = { slot: 1, name: 'n', places: [], type: 'noDefinition', claims: [] };
    expect(notRelevantReason(nodef, obs({ kind: 'position' }), rec('162'), ctx)).toBeUndefined();
  });

  it('lets burst timing move an interval of the burst chain or the clock, but not a firing interval (10.5 節)', () => {
    const ct = el({ kind: 'cooldownReduction', target: 'self', trigger: 'fullBurstEnd' });
    expect(notRelevantReason(ct, obs({ kind: 'interval' }), rec('162'), ctx)).toMatch(/効かない分類/);
    for (const source of ['burstChain', 'clock'] as const)
      expect(
        notRelevantReason(ct, obs({ kind: 'interval', scope: { slot: 'all', source } }), rec('162'), ctx),
      ).toBeUndefined();
    expect(
      notRelevantReason(ct, obs({ kind: 'interval', scope: { slot: 'all', source: 'firing' } }), rec('162'), ctx),
    ).toMatch(/効かない分類/);
  });
});

describe('対象と印（2 節の 1・4.3 節）', () => {
  // イサベル skill2.notes[0] は仮説 C-0402 の要素。162 の観測値に立つ確定の結論を作り、対象・印で外れるかを見る
  // 回数の観測値には、別のヒット（イサベルの S2 の notes の effect は damage）が効きうる
  const o = observations.find((x) => x.recording === '162' && x.invalid === undefined && x.kind === 'count')!;
  const base: Claim = {
    id: 'C-9100',
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
  const elementsFor = (c: Claim) =>
    relevanceOf([c], observations, { ...ctx, claims: [...claims, c] })[0]!.warnings.flatMap((w) => [
      ...w.elements.map((e) => e.name),
      ...w.marked.map((m) => `印 ${m}`),
    ]);
  const target = 'イサベル skill2.notes[0]';

  it('counts the element when it is not the subject', () => {
    expect(elementsFor(base)).toContain(target);
  });

  it('drops the subject', () => {
    const c = { ...base, subject: { places: ['data/skills/231.json の skill2 の notes[0]'] } };
    expect(elementsFor(c)).not.toContain(target);
  });

  it('moves a marked element to the marks', () => {
    const c = {
      ...base,
      minimal: [{ observations: '*' as const, element: target, reason: 'r', decided: '2026-10-08' }],
    };
    const names = elementsFor(c);
    expect(names).not.toContain(target);
    expect(names).toContain(`印 ${target}`);
  });
});

describe('観測値の ID のまとめ方', () => {
  it('compresses consecutive ids of the same recording', () => {
    expect(compressIds(['010-01', '010-02', '010-03', '013-05', '013-07', 'L-AD-01'])).toEqual([
      '`010-01`〜`010-03`',
      '`013-05`',
      '`013-07`',
      '`L-AD-01`',
    ]);
  });
});
