import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../src/types.ts';
import { diffCharacters, diffJson, renderReport } from './compare.ts';

describe('diffJson', () => {
  it('reports leaves, and a primitive array as one change', () => {
    expect(diffJson({ a: 1, b: { c: [1, 2, 3] } }, { a: 1, b: { c: [1, 2, 4] }, d: 'x' })).toEqual([
      { path: 'b.c', before: [1, 2, 3], after: [1, 2, 4] },
      { path: 'd', before: undefined, after: 'x' },
    ]);
  });

  it('matches arrays of objects with ids by id (an inserted cube does not shift the rest)', () => {
    const before = {
      cubes: [
        { id: 1, v: 1 },
        { id: 3, v: 3 },
      ],
    };
    const after = {
      cubes: [
        { id: 1, v: 1 },
        { id: 2, v: 2 },
        { id: 3, v: 30 },
      ],
    };
    expect(diffJson(before, after)).toEqual([
      { path: 'cubes[id=2]', before: undefined, after: { id: 2, v: 2 }, kind: 'added' },
      { path: 'cubes[id=3].v', before: 3, after: 30 },
    ]);
  });
});

function character(id: number, patch: (c: CharacterData) => void = () => {}): CharacterData {
  const skill = (name: string) => ({
    id: id * 10,
    name: { ja: name, en: name },
    description: { ja: `■${name}の説明`, en: `${name} text` },
    values: [['1.5']],
  });
  const c = {
    resourceId: id,
    name: { ja: `キャラ${id}`, en: `Char${id}` },
    rarity: 'SSR',
    class: 'Attacker',
    element: 'Fire',
    weaponType: 'AR',
    burstStep: 'Step3',
    shot: { reloadTime: 1.5 },
    skills: { skill1: skill('S1'), skill2: skill('S2'), burst: skill('B') },
    treasure: null,
  } as unknown as CharacterData;
  patch(c);
  return c;
}

describe('diffCharacters', () => {
  const before = new Map([1, 2, 3, 4].map((id) => [id, character(id)]));
  const after = new Map([
    [1, character(1, (c) => (c.skills.skill1.description.ja = '■S1の\n説明'))],
    [2, character(2, (c) => (c.skills.burst.description.ja = '■Bの別の説明'))],
    [3, character(3, (c) => (c.shot.reloadTime = 2))],
    [5, character(5)],
  ]);
  const diff = diffCharacters(before, after, new Set([2, 3]));

  it('separates added, removed, value and text changes, and marks defined characters', () => {
    expect(diff.added.map((c) => c.resourceId)).toEqual([5]);
    expect(diff.removed.map((c) => c.resourceId)).toEqual([4]);
    expect(diff.changed.map((c) => [c.resourceId, c.defined, c.values.length, c.texts.length])).toEqual([
      [1, false, 0, 1],
      [2, true, 0, 1],
      [3, true, 1, 0],
    ]);
    expect(diff.changed[0]!.texts[0]!.whitespaceOnly).toBe(true);
    expect(diff.changed[1]!.texts[0]!.whitespaceOnly).toBe(false);
    expect(diff.changed[2]!.values).toEqual([{ path: 'shot.reloadTime', before: 1.5, after: 2 }]);
  });

  it('prints the ja wording of defined characters in full and the rest as one line each', () => {
    const report = renderReport({ base: 'HEAD', characters: diff, masters: [], unmapped: [] });
    expect(report).toContain('- 追加: 5 キャラ5（SSR・Attacker・Fire・AR・バースト III）');
    expect(report).toContain('- **削除**: 4 キャラ4');
    expect(report).toContain('  - `shot.reloadTime`: 1.5 → 2');
    expect(report).toContain(
      '### 2 キャラ2 `skills.burst.description.ja`\n\n前:\n\n```\n■Bの説明\n```\n\n後:\n\n```\n■Bの別の説明\n```',
    );
    expect(report).toContain('- 1 キャラ1: 改行・空白だけ: `skills.skill1.description`');
    expect(report).toContain('- **定義済み** 2 キャラ2: ja の文言: `skills.burst.description`');
  });
});
