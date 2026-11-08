// 戦闘力の表（data/characters/combat.json）: 戦闘力の計算（computeCombatPower）に要るキャラの値だけを、全キャラ分 1 つにまとめたもの
// （plan/design-combat-power-sort.md 6 節の論点 3）。画面の一覧の並び替えが 1 回で読む。
// 基礎ステータスの曲線（levelCurve）は多くのキャラで同じなので、表の中に 1 回ずつ置き、キャラは番号で指す。曲線は前の Lv との差で
// 持つ（ほぼ等差なので gzip がよく効く。今のデータで 400KB → 50KB 前後）。
// 書くのは fetch-data（キャラのデータと一緒に）と scripts/combat-table.ts（手元のキャラのデータから作り直す）。
import { fixedSpecBuild } from './build.ts';
import { computeCombatPower } from './combatPower.ts';
import { fixedSpecGrowth } from './fixedSpec.ts';
import { MAX_SKILL_LEVELS } from './skills/resolve.ts';
import type { BuildMasters, CharacterData, StatKind } from './types.ts';

export const COMBAT_TABLE_FILE = 'combat.json';

/** 戦闘力の計算に要るキャラの値 */
export type CombatCharacter = Parameters<typeof computeCombatPower>[0] & Pick<CharacterData, 'corporationSubType'>;

type CombatTableEntry = Pick<
  CharacterData,
  'rarity' | 'class' | 'corporation' | 'corporationSubType' | 'weaponType' | 'statEnhance' | 'crit'
> & {
  /** levelCurves の番号 */
  levelCurve: number;
  /** 宝物があるか */
  treasure: boolean;
};

export type CombatPowerTable = {
  formatVersion: 1;
  /** 曲線を前の Lv との差にしたもの（先頭は値そのもの）。combatCharacterOf が戻す */
  levelCurves: CharacterData['levelCurve'][];
  /** resourceId → 値 */
  characters: Record<string, CombatTableEntry>;
};

type Curve = CharacterData['levelCurve'];

const mapCurve = (curve: Curve, f: (values: readonly number[]) => number[]): Curve =>
  Object.fromEntries(Object.entries(curve).map(([k, v]) => [k, f(v)])) as Record<StatKind, number[]>;
const toDeltas = (values: readonly number[]) => values.map((v, i) => v - (values[i - 1] ?? 0));
const fromDeltas = (deltas: readonly number[]) => {
  let sum = 0;
  return deltas.map((d) => (sum += d));
};

/** 表ごとに、差から戻した曲線を覚える */
const decoded = new WeakMap<CombatPowerTable, Curve[]>();
function curvesOf(table: CombatPowerTable): Curve[] {
  let curves = decoded.get(table);
  if (curves === undefined) {
    curves = table.levelCurves.map((c) => mapCurve(c, fromDeltas));
    decoded.set(table, curves);
  }
  return curves;
}

/** キャラのデータから表を作る（resourceId の順。曲線は初めて出た順に番号を振る） */
export function buildCombatPowerTable(characters: readonly CharacterData[]): CombatPowerTable {
  const levelCurves: CharacterData['levelCurve'][] = [];
  const curveIds = new Map<string, number>();
  const entries: [string, CombatTableEntry][] = [];
  for (const c of [...characters].sort((a, b) => a.resourceId - b.resourceId)) {
    const key = JSON.stringify(c.levelCurve);
    let curve = curveIds.get(key);
    if (curve === undefined) {
      curve = levelCurves.push(mapCurve(c.levelCurve, toDeltas)) - 1;
      curveIds.set(key, curve);
    }
    entries.push([
      String(c.resourceId),
      {
        rarity: c.rarity,
        class: c.class,
        corporation: c.corporation,
        // スペック固定の好感度の上限（fixedSpecAffectionRank）に要る
        corporationSubType: c.corporationSubType,
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
  const levelCurve = entry === undefined ? undefined : curvesOf(table)[entry.levelCurve];
  if (entry === undefined || levelCurve === undefined) return undefined;
  return { ...entry, levelCurve, treasure: entry.treasure ? true : null };
}

/**
 * スペック固定（Lv400・限界突破とコアは上限・好感度は上限・T9 Lv5 の装備・スキル Lv10・キューブとコレクションと宝物なし。
 * fixedSpec.ts・build.ts の fixedSpecBuild）で計算した、表の全キャラの戦闘力。一覧の戦闘力順に使う。
 * 実機のスペック固定の画面には戦闘力が出ないので、実機とは照合していない（モデルの値）
 */
export function fixedSpecCombatPowers(
  table: CombatPowerTable,
  masters: BuildMasters,
): { powers: Map<number, number>; failures: { id: number; message: string }[] } {
  const powers = new Map<number, number>();
  const failures: { id: number; message: string }[] = [];
  for (const key of Object.keys(table.characters)) {
    const id = Number(key);
    const character = combatCharacterOf(table, id);
    if (character === undefined) {
      failures.push({ id, message: 'キャラの値が表に無い' });
      continue;
    }
    try {
      const input = {
        growth: fixedSpecGrowth(character),
        build: fixedSpecBuild(character),
        skillLevels: MAX_SKILL_LEVELS,
        treasure: false,
      };
      powers.set(id, computeCombatPower(character, input, masters).value);
    } catch (e) {
      failures.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { powers, failures };
}
