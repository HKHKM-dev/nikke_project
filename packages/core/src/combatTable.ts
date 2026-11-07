// 戦闘力の表（data/characters/combat.json）: 戦闘力の計算（computeCombatPower）に要るキャラの値だけを、全キャラ分 1 つにまとめたもの
// （plan/design-combat-power-sort.md 6 節の論点 3）。画面の一覧の並び替えが 1 回で読む。
// 基礎ステータスの曲線（levelCurve）は多くのキャラで同じなので、表の中に 1 回ずつ置き、キャラは番号で指す。
// 書くのは fetch-data（キャラのデータと一緒に）と scripts/combat-table.ts（手元のキャラのデータから作り直す）。
import type { computeCombatPower } from './combatPower.ts';
import type { CharacterData } from './types.ts';

export const COMBAT_TABLE_FILE = 'combat.json';

/** 戦闘力の計算に要るキャラの値 */
export type CombatCharacter = Parameters<typeof computeCombatPower>[0];

type CombatTableEntry = Pick<
  CharacterData,
  'rarity' | 'class' | 'corporation' | 'weaponType' | 'statEnhance' | 'crit'
> & {
  /** levelCurves の番号 */
  levelCurve: number;
  /** 宝物があるか */
  treasure: boolean;
};

export type CombatPowerTable = {
  formatVersion: 1;
  levelCurves: CharacterData['levelCurve'][];
  /** resourceId → 値 */
  characters: Record<string, CombatTableEntry>;
};

/** キャラのデータから表を作る（resourceId の順。曲線は初めて出た順に番号を振る） */
export function buildCombatPowerTable(characters: readonly CharacterData[]): CombatPowerTable {
  const levelCurves: CharacterData['levelCurve'][] = [];
  const curveIds = new Map<string, number>();
  const entries: [string, CombatTableEntry][] = [];
  for (const c of [...characters].sort((a, b) => a.resourceId - b.resourceId)) {
    const key = JSON.stringify(c.levelCurve);
    let curve = curveIds.get(key);
    if (curve === undefined) {
      curve = levelCurves.push(c.levelCurve) - 1;
      curveIds.set(key, curve);
    }
    entries.push([
      String(c.resourceId),
      {
        rarity: c.rarity,
        class: c.class,
        corporation: c.corporation,
        weaponType: c.weaponType,
        statEnhance: c.statEnhance,
        crit: c.crit,
        levelCurve: curve,
        treasure: c.treasure !== null,
      },
    ]);
  }
  return { formatVersion: 1, levelCurves, characters: Object.fromEntries(entries) };
}

/** 表から 1 体分を computeCombatPower に渡せる形で引く。表に無いキャラは undefined */
export function combatCharacterOf(table: CombatPowerTable, resourceId: number): CombatCharacter | undefined {
  const entry = table.characters[String(resourceId)];
  const levelCurve = entry === undefined ? undefined : table.levelCurves[entry.levelCurve];
  if (entry === undefined || levelCurve === undefined) return undefined;
  return { ...entry, levelCurve, treasure: entry.treasure ? true : null };
}
