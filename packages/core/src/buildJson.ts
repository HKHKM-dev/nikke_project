// 育成入力の JSON の値の検査（範囲だけ。キューブの種類・OL の項目のマスタとの照合は計算の時の validateBuild）。
// 画面の編成の保存の読み込み（apps/web/src/team.ts）と、育成状況の読み込み（buildSnapshot.ts）が同じものを使う
// （plan/design-combat-power-sort.md 5.3 節）。形が合わないと null（装備は undefined）を返し、issues に「欄の場所: 理由」を足す。
import {
  AFFECTION_RANK_MAX,
  AFFECTION_RANK_MIN,
  COLLECTION_LEVEL_MAX,
  CUBE_LEVEL_MAX,
  CUBE_LEVEL_MIN,
  GEAR_LEVEL_MAX,
  GEAR_PARTS,
  GEAR_TYPES,
  OVERLOAD_LEVEL_MAX,
  OVERLOAD_LEVEL_MIN,
  OVERLOAD_LINE_MAX,
  OVERLOAD_OPTIONS,
  overloadPositionsUnique,
  type BuildInput,
  type GearInput,
  type OverloadLine,
} from './build.ts';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN, type SkillLevels } from './skills/resolve.ts';
import { isRecord } from './skills/parse/common.ts';
import { SKILL_SLOTS } from './skills/types.ts';
import type { GearType, OverloadOption } from './types.ts';

/** スロットごとの育成の項目（リサイクルルームとその他攻撃加算を除いた BuildInput） */
export type BuildFields = Pick<BuildInput, 'affectionRank' | 'gear' | 'cube' | 'collection'>;

/** min..max の整数か。違えば issues に足す */
export function checkInt(v: unknown, min: number, max: number, path: string, issues: string[]): v is number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) return true;
  const range = Number.isFinite(max) ? `${min}〜${max}` : `${min} 以上`;
  issues.push(`${path}: ${range} の整数でない（${JSON.stringify(v) ?? 'なし'}）`);
  return false;
}

/** OL のオプションの行。欠落は空（古い保存データには無い） */
function parseOverload(v: unknown, type: GearType, path: string, issues: string[]): OverloadLine[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > OVERLOAD_LINE_MAX) {
    issues.push(`${path}: ${OVERLOAD_LINE_MAX} 行までの配列でない`);
    return undefined;
  }
  if (v.length > 0 && type !== 'OL') {
    issues.push(`${path}: OL のほかの装備に OL のオプションがある`);
    return undefined;
  }
  const lines: OverloadLine[] = [];
  for (const [i, line] of (v as unknown[]).entries()) {
    const at = `${path}[${i}]`;
    if (!isRecord(line)) {
      issues.push(`${at}: オブジェクトでない`);
      return undefined;
    }
    if (!(OVERLOAD_OPTIONS as readonly unknown[]).includes(line.option)) {
      issues.push(`${at}.option: 知らない項目（${JSON.stringify(line.option) ?? 'なし'}）`);
      return undefined;
    }
    if (!checkInt(line.level, OVERLOAD_LEVEL_MIN, OVERLOAD_LEVEL_MAX, `${at}.level`, issues)) return undefined;
    // 古い保存データには無いので、欠落は配列の並び
    if (line.position !== undefined && !checkInt(line.position, 0, OVERLOAD_LINE_MAX - 1, `${at}.position`, issues))
      return undefined;
    lines.push({
      option: line.option as OverloadOption,
      level: line.level,
      ...(line.position === undefined ? {} : { position: line.position }),
    });
  }
  if (!overloadPositionsUnique(lines)) {
    issues.push(`${path}: 行の位置が重なる`);
    return undefined;
  }
  return lines;
}

/** 装備 1 部位。null は未装備。形が合わなければ undefined */
function parseGearJson(v: unknown, path: string, issues: string[]): GearInput | undefined {
  if (v === null) return null;
  if (!isRecord(v)) {
    issues.push(`${path}: オブジェクトか null でない`);
    return undefined;
  }
  if (!(GEAR_TYPES as readonly unknown[]).includes(v.type)) {
    issues.push(`${path}.type: 知らない装備（${JSON.stringify(v.type) ?? 'なし'}）`);
    return undefined;
  }
  if (!checkInt(v.level, 0, GEAR_LEVEL_MAX, `${path}.level`, issues)) return undefined;
  const type = v.type as GearType;
  const overload = parseOverload(v.overload, type, `${path}.overload`, issues);
  if (overload === undefined) return undefined;
  return overload.length === 0 ? { type, level: v.level } : { type, level: v.level, overload };
}

/** 好感度・装備・キューブ・コレクション。ほかの欄（リサイクルルームなど）は読まない */
export function parseBuildFieldsJson(v: unknown, path: string, issues: string[]): BuildFields | null {
  if (!isRecord(v)) {
    issues.push(`${path}: オブジェクトでない`);
    return null;
  }
  const before = issues.length;
  checkInt(v.affectionRank, AFFECTION_RANK_MIN, AFFECTION_RANK_MAX, `${path}.affectionRank`, issues);
  const gear = {} as BuildFields['gear'];
  if (!isRecord(v.gear)) issues.push(`${path}.gear: オブジェクトでない`);
  else
    for (const part of GEAR_PARTS) {
      const g = parseGearJson(v.gear[part], `${path}.gear.${part}`, issues);
      if (g !== undefined) gear[part] = g;
    }
  let cube: BuildFields['cube'] = null;
  if (v.cube !== null) {
    if (!isRecord(v.cube)) issues.push(`${path}.cube: オブジェクトか null でない`);
    else if (
      checkInt(v.cube.id, 1, Infinity, `${path}.cube.id`, issues) &&
      checkInt(v.cube.level, CUBE_LEVEL_MIN, CUBE_LEVEL_MAX, `${path}.cube.level`, issues)
    )
      cube = { id: v.cube.id, level: v.cube.level };
  }
  let collection: BuildFields['collection'] = null;
  if (v.collection !== null) {
    if (!isRecord(v.collection)) issues.push(`${path}.collection: オブジェクトか null でない`);
    else if (v.collection.rarity !== 'R' && v.collection.rarity !== 'SR')
      issues.push(`${path}.collection.rarity: R・SR でない（${JSON.stringify(v.collection.rarity) ?? 'なし'}）`);
    else if (checkInt(v.collection.level, 0, COLLECTION_LEVEL_MAX, `${path}.collection.level`, issues))
      collection = { rarity: v.collection.rarity, level: v.collection.level };
  }
  if (issues.length > before) return null;
  return { affectionRank: v.affectionRank as number, gear, cube, collection };
}

/** スキル Lv（1..10 の整数） */
export function parseSkillLevelsJson(v: unknown, path: string, issues: string[]): SkillLevels | null {
  if (!isRecord(v)) {
    issues.push(`${path}: オブジェクトでない`);
    return null;
  }
  const levels = {} as SkillLevels;
  let ok = true;
  for (const slot of SKILL_SLOTS) {
    const level = v[slot];
    if (checkInt(level, SKILL_LEVEL_MIN, SKILL_LEVEL_MAX, `${path}.${slot}`, issues)) levels[slot] = level;
    else ok = false;
  }
  return ok ? levels : null;
}
