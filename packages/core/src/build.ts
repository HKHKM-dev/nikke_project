// Stage 12: 育成入力の拡張 A — ステータス層。装備・キューブ・好感度・コレクション・リサイクルルーム・その他加算から
// 「戦闘中の攻撃力（バフ前）」を作る。スペック固定（fixedSpec.ts）はこの入力の 1 つのプリセット（fixedSpecBuild）で、
// computeCombatAttack(fixedSpecBuild) が computeFixedSpecAttack と同値になることをテストで固定している（退化）。
//
// 合成順（plan/design-stage12.md 2.1 節）。好感度と装備の位置は Stage 2-A の実測（9 体で誤差ゼロ）、
// キューブ・コレクション・リサイクルルームの位置は Stage 12 の実測 (b)（2026-09-24、キャラ画面の攻撃力）で確定:
//   coreSide  = 突破後の素の攻撃力 + 好感度 + リサイクルルーム                                   ← コアが掛かる側
//   withCore  = round(coreSide × (1 + コア段 × coreAttack / 1e4))
//   attack    = withCore + 装備 4 部位 + キューブ + コレクション（宝物） + [その他加算]           ← コアの外
// 位置は BUILD_CORE_APPLIES_TO に置く。その他加算（CDN に無いもの）の位置だけは未確認。
import { fixedSpecAffectionRank } from './fixedSpec.ts';
import { applyCoreRatio, computeStat, validateGrowth, type GrowthInput } from './stats.ts';
import type {
  BuildMasters,
  CharacterData,
  CollectionData,
  CubeData,
  GearPart,
  GearType,
  OverloadOption,
  OverloadOptionData,
  StatKind,
} from './types.ts';

export const GEAR_TYPES: readonly GearType[] = ['T9', 'T9Corp', 'OL'];
export const GEAR_PARTS: readonly GearPart[] = ['head', 'body', 'arm', 'leg'];
export const GEAR_LEVEL_MAX = 5;
export const AFFECTION_RANK_MIN = 1;
export const AFFECTION_RANK_MAX = 40;
export const CUBE_LEVEL_MIN = 1;
export const CUBE_LEVEL_MAX = 15;
export const COLLECTION_LEVEL_MAX = 15;
/** Stage 13: OL 装備 1 部位のオプション行の上限と、オプションの Lv の範囲 */
export const OVERLOAD_LINE_MAX = 3;
export const OVERLOAD_LEVEL_MIN = 1;
export const OVERLOAD_LEVEL_MAX = 15;

/** Stage 13: OL のオプション（CDN の group id 順。data/masters/overload.json と同じ並び） */
export const OVERLOAD_OPTIONS: readonly OverloadOption[] = [
  'elementDamage',
  'hitRate',
  'maxAmmo',
  'attack',
  'chargeDamage',
  'chargeSpeed',
  'critRate',
  'critDamage',
  'defence',
];

/** Stage 13: OL 装備のオプション 1 行（効果は buildEffects.ts） */
export type OverloadLine = { option: OverloadOption; level: number };
/** overload は OL 装備だけ（最大 3 行。省略・空 = オプションなし）。ステータス層（攻撃力）には効かない */
export type GearInput = { type: GearType; level: number; overload?: OverloadLine[] } | null;
export type CubeInput = { id: number; level: number } | null;
export type CollectionInput = { rarity: 'R' | 'SR'; level: number } | null;
/** リサイクルルーム研究の Lv（共通・クラス・企業。0 = 未研究） */
export type RecycleRoomInput = { personal: number; class: number; corporation: number };

/** 育成入力のうち、レベル・限界突破・コア（GrowthInput）以外。素のステータスだけなら EMPTY_BUILD */
export type BuildInput = {
  /** 好感度ランク（1..40。rank 1 は加算 0） */
  affectionRank: number;
  gear: Record<GearPart, GearInput>;
  cube: CubeInput;
  /** R / SR のコレクション。宝物（SSR）を解放している枠は treasurePhase で決まるのでここには書かない */
  collection: CollectionInput;
  recycleRoom: RecycleRoomInput;
  /** 企業タワー・アウトポスト等、CDN に無い固定加算（攻撃力の実数） */
  extraAttack: number;
};

export const EMPTY_BUILD: Readonly<BuildInput> = Object.freeze({
  affectionRank: AFFECTION_RANK_MIN,
  gear: Object.freeze({ head: null, body: null, arm: null, leg: null }),
  cube: null,
  collection: null,
  recycleRoom: Object.freeze({ personal: 0, class: 0, corporation: 0 }),
  extraAttack: 0,
});

export function emptyBuild(): BuildInput {
  return {
    affectionRank: AFFECTION_RANK_MIN,
    gear: { head: null, body: null, arm: null, leg: null },
    cube: null,
    collection: null,
    recycleRoom: { personal: 0, class: 0, corporation: 0 },
    extraAttack: 0,
  };
}

/** 素のステータスと同じ（何も足さない）入力か。宝物の段階は見ない */
export function isEmptyBuild(build: BuildInput): boolean {
  return (
    build.affectionRank <= AFFECTION_RANK_MIN &&
    GEAR_PARTS.every((p) => build.gear[p] === null) &&
    build.cube === null &&
    build.collection === null &&
    build.recycleRoom.personal === 0 &&
    build.recycleRoom.class === 0 &&
    build.recycleRoom.corporation === 0 &&
    build.extraAttack === 0
  );
}

/**
 * コア強化の +2%/段が掛かる側に入る加算。好感度（常に内）と装備（常に外）は Stage 2-A の実測。
 * キューブ・コレクション・リサイクルルームは Stage 12 の実測 (b)（plan/verification.md Stage 12 節）: リター（コア 7）の
 * キャラ画面 406,172 は 8 通りのうちこの組だけが一致し、Lv15 のキューブを付けると +2,780（コアの外）。ほか 7 体も差 0。
 * 宝物（SSR）のステータスもコレクションと同じくコアの外（ヘルム・ロザンナ・シュガーのキャラ画面で差 0）。
 * extra（その他加算）は未確認のまま外に置く
 */
export const BUILD_CORE_APPLIES_TO = {
  cube: false,
  collection: false,
  recycleRoom: true,
  extra: false,
} as const;

export type CombatAttack = {
  /** 戦闘中の攻撃力（バフ前）。キャラ画面の表示値と一致させる */
  attack: number;
  growth: GrowthInput;
  /** 突破のみ（コアなし）の素の攻撃力 */
  gradeBase: number;
  affection: number;
  cube: number;
  collection: number;
  recycleRoom: number;
  extra: number;
  gear: number;
  /** コアが掛かる側の合計（gradeBase + 好感度 + 仮定で内側にある加算） */
  coreSide: number;
  /** round(coreSide × (1 + コア%)) */
  withCore: number;
};

function assertInt(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}], got ${value}`);
  }
}

export function findCube(masters: Pick<BuildMasters, 'cubes'>, id: number): CubeData | undefined {
  return masters.cubes.cubes.find((c) => c.id === id);
}

export function findOverloadOption(
  masters: Pick<BuildMasters, 'overload'>,
  option: OverloadOption,
): OverloadOptionData | undefined {
  return masters.overload.options.find((o) => o.option === option);
}

export function findCollection(
  masters: Pick<BuildMasters, 'collections'>,
  rarity: 'R' | 'SR',
  weaponType: CharacterData['weaponType'],
): CollectionData | undefined {
  return masters.collections.collections.find((c) => c.rarity === rarity && c.weaponType === weaponType);
}

/** 範囲外・マスタに無いものは RangeError */
export function validateBuild(
  character: Pick<CharacterData, 'weaponType' | 'corporation'>,
  build: BuildInput,
  masters: BuildMasters,
): void {
  assertInt('affectionRank', build.affectionRank, AFFECTION_RANK_MIN, AFFECTION_RANK_MAX);
  if (masters.affection.ranks.length < AFFECTION_RANK_MAX) {
    throw new RangeError(
      `affection master has ${masters.affection.ranks.length} ranks, expected ${AFFECTION_RANK_MAX}`,
    );
  }
  for (const part of GEAR_PARTS) {
    const gear = build.gear[part];
    if (gear === null) continue;
    if (!GEAR_TYPES.includes(gear.type)) throw new RangeError(`gear.${part}.type: unknown gear type ${gear.type}`);
    assertInt(`gear.${part}.level`, gear.level, 0, GEAR_LEVEL_MAX);
    const lines = gear.overload ?? [];
    if (lines.length > 0 && gear.type !== 'OL') {
      throw new RangeError(`gear.${part}: overload options are only allowed on OL gear, got ${gear.type}`);
    }
    if (lines.length > OVERLOAD_LINE_MAX) {
      throw new RangeError(`gear.${part}: at most ${OVERLOAD_LINE_MAX} overload lines, got ${lines.length}`);
    }
    lines.forEach((line, i) => {
      if (findOverloadOption(masters, line.option) === undefined) {
        throw new RangeError(`gear.${part}.overload[${i}]: unknown option ${String(line.option)}`);
      }
      assertInt(`gear.${part}.overload[${i}].level`, line.level, OVERLOAD_LEVEL_MIN, OVERLOAD_LEVEL_MAX);
    });
  }
  if (build.cube !== null) {
    if (findCube(masters, build.cube.id) === undefined)
      throw new RangeError(`cube ${build.cube.id} is not in the master`);
    assertInt('cube.level', build.cube.level, CUBE_LEVEL_MIN, CUBE_LEVEL_MAX);
  }
  if (build.collection !== null) {
    if (build.collection.rarity !== 'R' && build.collection.rarity !== 'SR') {
      throw new RangeError(`collection.rarity must be R or SR, got ${String(build.collection.rarity)}`);
    }
    if (findCollection(masters, build.collection.rarity, character.weaponType) === undefined) {
      throw new RangeError(`no ${build.collection.rarity} collection for weapon ${character.weaponType}`);
    }
    assertInt('collection.level', build.collection.level, 0, COLLECTION_LEVEL_MAX);
  }
  assertInt('recycleRoom.personal', build.recycleRoom.personal, 0, Number.MAX_SAFE_INTEGER);
  assertInt('recycleRoom.class', build.recycleRoom.class, 0, Number.MAX_SAFE_INTEGER);
  assertInt('recycleRoom.corporation', build.recycleRoom.corporation, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(build.extraAttack) || build.extraAttack < 0) {
    throw new RangeError(`extraAttack must be a non-negative number, got ${build.extraAttack}`);
  }
}

function statOf(values: number[] | undefined, index: number, what: string): number {
  const v = values?.[index];
  if (v === undefined) throw new RangeError(`${what}: no value at index ${index}`);
  return v;
}

/** 装備 1 部位の加算（kind のステータス）。未装備は 0 */
export function gearStat(
  masters: Pick<BuildMasters, 'gear'>,
  nikkeClass: CharacterData['class'],
  part: GearPart,
  gear: GearInput,
  kind: StatKind,
): number {
  if (gear === null) return 0;
  const stats = masters.gear.tiers[gear.type]?.[nikkeClass]?.[part]?.[kind];
  return statOf(stats, gear.level, `gear ${gear.type} ${nikkeClass} ${part} ${kind}`);
}

export type CombatAttackOptions = {
  /** Stage 9 の宝物の段階（0..3）。1 以上なら宝物のステータス（treasureStats）が collection の代わりに乗る */
  treasurePhase?: number;
};

const CORE_RATIO_KEY = { attack: 'coreAttack', hp: 'coreHp', defence: 'coreDefence' } as const;

/** 攻撃力以外も含む、戦闘中のステータス（バフ前）の内訳。フィールドの意味は CombatAttack と同じ */
export type CombatStat = Omit<CombatAttack, 'attack'> & { kind: StatKind; value: number };

/**
 * 戦闘中のステータス（バフ前）。growth は Stage 1 の育成値（レベル・限界突破・コア）。
 * 装備・キューブ・コレクション（宝物）はコアの外、好感度・リサイクルルームはコアの内側（実測。BUILD_CORE_APPLIES_TO）。
 * コア倍率の丸めは偶数への丸め（applyCoreRatio）。攻撃力・HP・防御力とも 13 体のキャラ画面と差 0（plan/verification.md Stage 12 節）
 */
export function computeCombatStat(
  character: Pick<
    CharacterData,
    'rarity' | 'class' | 'corporation' | 'weaponType' | 'levelCurve' | 'statEnhance' | 'treasure'
  >,
  growth: GrowthInput,
  build: BuildInput,
  masters: BuildMasters,
  kind: StatKind,
  options: CombatAttackOptions = {},
): CombatStat {
  validateGrowth(character, growth);
  validateBuild(character, build, masters);
  const treasurePhase = options.treasurePhase ?? 0;
  if (treasurePhase > 0 && character.treasure === null) {
    throw new RangeError(`treasurePhase ${treasurePhase} but the character has no treasure`);
  }

  const gradeBase = computeStat(character, kind, { ...growth, core: 0 });
  const affection = statOf(
    masters.affection.ranks.map((r) => r[kind][character.class]),
    build.affectionRank - 1,
    'affection',
  );
  const cube =
    build.cube === null ? 0 : statOf(findCube(masters, build.cube.id)?.stats[kind], build.cube.level - 1, 'cube');
  const collection =
    treasurePhase > 0
      ? masters.collections.treasureStats[kind]
      : build.collection === null
        ? 0
        : statOf(
            findCollection(masters, build.collection.rarity, character.weaponType)?.stats[kind],
            build.collection.level,
            'collection',
          );
  const rr = masters.recycleRoom;
  const recycleRoom =
    rr.personal[kind] * build.recycleRoom.personal +
    rr.class[character.class][kind] * build.recycleRoom.class +
    (rr.corporation[character.corporation]?.[kind] ?? 0) * build.recycleRoom.corporation;
  // その他加算は攻撃力の実数だけ（HP・防御力には無い）
  const extra = kind === 'attack' ? build.extraAttack : 0;
  const gear = GEAR_PARTS.reduce(
    (sum, part) => sum + gearStat(masters, character.class, part, build.gear[part], kind),
    0,
  );

  const inner = (flag: boolean, value: number) => (flag ? value : 0);
  const coreSide =
    gradeBase +
    affection +
    inner(BUILD_CORE_APPLIES_TO.cube, cube) +
    inner(BUILD_CORE_APPLIES_TO.collection, collection) +
    inner(BUILD_CORE_APPLIES_TO.recycleRoom, recycleRoom) +
    inner(BUILD_CORE_APPLIES_TO.extra, extra);
  const withCore = applyCoreRatio(coreSide, growth.core, character.statEnhance[CORE_RATIO_KEY[kind]]);
  const outer =
    gear +
    inner(!BUILD_CORE_APPLIES_TO.cube, cube) +
    inner(!BUILD_CORE_APPLIES_TO.collection, collection) +
    inner(!BUILD_CORE_APPLIES_TO.recycleRoom, recycleRoom) +
    inner(!BUILD_CORE_APPLIES_TO.extra, extra);
  return {
    kind,
    value: withCore + outer,
    growth,
    gradeBase,
    affection,
    cube,
    collection,
    recycleRoom,
    extra,
    gear,
    coreSide,
    withCore,
  };
}

/** 戦闘中の攻撃力（バフ前）。computeCombatStat の攻撃力版 */
export function computeCombatAttack(
  character: Parameters<typeof computeCombatStat>[0],
  growth: GrowthInput,
  build: BuildInput,
  masters: BuildMasters,
  options: CombatAttackOptions = {},
): CombatAttack {
  const { kind: _kind, value, ...rest } = computeCombatStat(character, growth, build, masters, 'attack', options);
  return { attack: value, ...rest };
}

/**
 * ユニオン射撃場スペック固定に相当する育成入力（plan/verification.md Stage 2-A）: 好感度 rank30（ピルグリム SSR は 40、R は 10）、
 * 装備 4 部位 T9 Lv5、キューブ・コレクション・リサイクルルーム・その他なし。レベル・凸・コアは fixedSpecGrowth
 */
export function fixedSpecBuild(character: Pick<CharacterData, 'rarity' | 'corporation'>): BuildInput {
  const gear = { type: 'T9' as const, level: GEAR_LEVEL_MAX };
  return {
    ...emptyBuild(),
    affectionRank: fixedSpecAffectionRank(character),
    gear: { head: { ...gear }, body: { ...gear }, arm: { ...gear }, leg: { ...gear } },
  };
}
