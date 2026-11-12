import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_TREASURE_OPTION,
  collectionPatch,
  treasureOptionValue,
  type CollectionSelect,
} from './collectionChoice.ts';
import { growthFieldsActions, initialTeamState, teamReducer, type TeamState } from './team.ts';

const LAPLACE = 100; // 宝物あり

describe('collectionPatch: the collection select', () => {
  const build = initialTeamState().slots[0]!.build;
  const free: CollectionSelect = { fixedSpec: false, hasTreasure: false, build, level: 7 };

  it('sets the collection, or the treasure phase, outside fixed spec', () => {
    expect(collectionPatch('SR', free)).toEqual({ build: { ...build, collection: { rarity: 'SR', level: 7 } } });
    expect(collectionPatch('', free)).toEqual({ build: { ...build, collection: null } });
    expect(collectionPatch(treasureOptionValue(2), free)).toEqual({ treasurePhase: 2 });
    // 宝物から R に替えたら、宝物の段階を 0 にする
    expect(collectionPatch('R', { ...free, hasTreasure: true })).toEqual({
      treasurePhase: 0,
      build: { ...build, collection: { rarity: 'R', level: 7 } },
    });
  });

  it('changes only the treasure phase in fixed spec, and never the saved build', () => {
    const fixed: CollectionSelect = { ...free, fixedSpec: true, hasTreasure: true };
    expect(collectionPatch('', fixed)).toEqual({ treasurePhase: 0 });
    expect(collectionPatch(treasureOptionValue(1), fixed)).toEqual({ treasurePhase: 1 });
    expect(collectionPatch('', { ...fixed, hasTreasure: false })).toEqual({});
  });

  it('changes nothing for the undecided treasure (it only shows the current value)', () => {
    expect(collectionPatch(UNKNOWN_TREASURE_OPTION, { ...free, hasTreasure: true })).toEqual({});
  });

  it('brings the saved collection back when fixed spec is turned off', () => {
    // 2026-11-01 の不具合: スペック固定の間に「なし」を選ぶと、保存しているコレクションが消えていた
    const collection = { rarity: 'SR' as const, level: 12 };
    let s: TeamState = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: LAPLACE });
    s = teamReducer(s, { type: 'setBuild', index: 0, build: { ...s.slots[0]!.build, collection } });
    s = teamReducer(s, { type: 'setTreasurePhase', index: 0, treasurePhase: 2 });
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: true });
    const patch = collectionPatch('', { fixedSpec: true, hasTreasure: true, build: s.slots[0]!.build, level: 15 });
    for (const action of growthFieldsActions(0, patch)) s = teamReducer(s, action);
    s = teamReducer(s, { type: 'setFixedSpec', fixedSpec: false });
    expect(s.slots[0]!.build.collection).toEqual(collection);
    expect(s.slots[0]!.treasurePhase).toBe(0);
  });
});
