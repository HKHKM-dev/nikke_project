// 空枠を挟む録画: 照合ランナー（buildTeamInput）と最小構成の要素（elementsOf）は、台帳の slot の位置に枠を置き、間を空枠にする。
// 枠の並びで決まる語彙（後列 row・両隣 targetAdjacent）は、ルージュ（272）の S2（plan/design-rouge.md 2.1 節）で見る。
// 編成は録画 1181（フラワー・ルージュ・ソルジャーF.A.・デルタ）の枠を並べ替えたもの
import { describe, expect, it } from 'vitest';
import { knownRids, loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { runSimulation } from '../../sim/engine.ts';
import { itemsOf } from '../../skills/holders.ts';
import type { CompareSetup } from '../observations/setup.ts';
import { buildTeamInput } from '../observations/teamInput.ts';
import type { Observation } from '../observations/types.ts';
import { validateObservations, validateScope } from '../observations/validate.ts';
import { teamBySlot, validateRecordings, type ProjectRecording, type RecordingMember } from '../recordings.ts';
import { elementsOf } from '../relevance.ts';

const file = loadRecordingsFile();
const data = loadRecordsData(file);
const base = recordingMap(file).get('1181') as ProjectRecording;
const byRid = (rid: number) => base.team.find((m) => m.rid === rid)!;
const placed = (rid: number, slot: number, controlled = false): RecordingMember => ({ ...byRid(rid), slot, controlled });
const withTeam = (team: RecordingMember[]): ProjectRecording => ({ ...base, team });
// フラワー 1・ソルジャー 2（操作）・空枠 3・ルージュ 4（後列）
const gapped = withTeam([placed(304, 1), placed(301, 2, true), placed(272, 4)]);
// 同じ 3 体を詰めると、ルージュは 3 枠目（前列）
const packed = withTeam([placed(304, 1), placed(301, 2, true), placed(272, 3)]);
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: false, noFireSlots: [4] };
const ctx = { recordings: new Map([[base.id, base]]), ...data, claims: [] };
const swordCoinPlace = 'data/skills/272.json の skill2 の effects[0]';

describe('recordings with an empty slot between members', () => {
  it('passes the ledger check and places members at their slots', () => {
    expect(validateRecordings({ recordings: [gapped] }, knownRids())).toEqual([]);
    expect(teamBySlot(gapped).map((m) => m?.rid ?? null)).toEqual([304, 301, null, 272]);
    expect(teamBySlot(withTeam([placed(272, 2)])).map((m) => m?.rid ?? null)).toEqual([null, 272]);
  });

  it('builds the model input with a null slot, and slot numbers keep pointing at the ledger slots', () => {
    const input = buildTeamInput(gapped, setup, data);
    expect(input.slots.map((s) => s?.character.resourceId ?? null)).toEqual([304, 301, null, 272]);
    expect(input.controlledSlot).toBe(1);
    expect(input.slots[3]!.condition.hitRate).toBe(0);
    expect(input.slots[1]!.condition.hitRate).toBe(1);
  });

  it('applies the back-row and adjacent vocabulary by the ledger slot', () => {
    const holders = (recording: ProjectRecording) =>
      [
        ...new Set(
          itemsOf(runSimulation(buildTeamInput(recording, setup, data)).history, { state: 'swordCoin' }).map(
            (i) => i.holder,
          ),
        ),
      ].sort();
    // 4 枠目は後列。両隣は空枠（3）と枠の外（5）なので、自分だけに付く
    expect(holders(gapped)).toEqual([3]);
    // 詰めると 3 枠目（前列）で付かない
    expect(holders(packed)).toEqual([]);
    const hasSwordCoin = (recording: ProjectRecording) =>
      elementsOf(recording, ctx).some((e) => e.places.includes(swordCoinPlace));
    expect(hasSwordCoin(gapped)).toBe(true);
    expect(hasSwordCoin(packed)).toBe(false);
  });

  it('rejects members out of slot order, repeated slots and slots past 5, and observations on the empty slot', () => {
    const slotErrors = (team: RecordingMember[]) =>
      validateRecordings({ recordings: [withTeam(team)] }, knownRids()).filter((e) => e.includes('枠は 1〜5 の整数'));
    expect(slotErrors([placed(304, 2), placed(301, 1)])).toEqual([
      '1181: 枠は 1〜5 の整数で、小さい順に並べる（2 番目が 1）',
    ]);
    expect(slotErrors([placed(304, 2), placed(301, 2)])).toHaveLength(1);
    expect(slotErrors([placed(304, 6)])).toHaveLength(1);
    expect(slotErrors([placed(304, 0)])).toHaveLength(1);
    expect(validateScope({ slot: 3, source: 'normal' }, new Set([1, 2, 4]), 'x')).toEqual([
      "x: scope.slot は録画の編成の枠（1・2・4）か 'all'（3）",
    ]);
  });

  it('rejects compare settings that point at the empty slot', () => {
    const observation: Observation = {
      id: '1181-90',
      recording: '1181',
      kind: 'hit',
      use: 'compare',
      value: 1,
      description: 'x',
      source: 'V-0001',
      compare: {
        model: 'sim',
        metric: 'slotTotalDamage',
        args: { slot: 3 },
        tolerance: { abs: 1 },
        setup: { ...setup, noFireSlots: [3], obstacles: [{ slot: 3, shot: 1, count: 'x' }] },
      },
    };
    const errors = validateObservations([observation], new Map([['1181', gapped]]), data.enemies);
    expect(errors).toContain('1181-90: slotTotalDamage の引数 slot の枠 3 が編成の外');
    expect(errors).toContain('1181-90: noFireSlots の枠 3 が編成の外');
    expect(errors).toContain('1181-90: obstacles の枠 3 が編成の外');
    const filledOnly = { ...observation.compare!, args: { slot: 4 }, setup: { ...setup, noFireSlots: [4] } };
    expect(
      validateObservations([{ ...observation, compare: filledOnly }], new Map([['1181', gapped]]), data.enemies),
    ).toEqual([]);
  });
});
