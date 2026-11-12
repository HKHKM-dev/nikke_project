// 育成状況の JSON（スナップショット）の形・読み込みの検査・戦闘力（plan/design-combat-power-sort.md 5 節。版 2 は
// plan/design-roster-edit.md 4 節）。画面（apps/web の育成状況）と CLI（sim-run.ts --build・build:combat-power）が同じものを使う。
// ShiftyPad の生のデータからの写しは shiftypad.ts（plan/design-build-snapshot.md 3 節）。
import type { BuildInput } from './build.ts';
import { checkInt, parseBuildFieldsJson, parseSkillLevelsJson } from './buildJson.ts';
import { computeCombatPower, type CombatPower } from './combatPower.ts';
import { treasureLevelOfPhase, treasurePhaseOfLevel } from './shiftypad.ts';
import { isRecord } from './skills/parse/common.ts';
import type { SkillLevels } from './skills/resolve.ts';
import type { TreasurePhase } from './skills/treasure.ts';
import { CORE_MAX, GRADE_MAX, type GrowthInput } from './stats.ts';
import type { BuildMasters, CharacterIndexEntry } from './types.ts';

/**
 * 宝物（SSR のコレクション）。段階は API の Lv から決める（shiftypad.ts の treasurePhaseOfLevel。決まらない Lv は null）か、
 * 版 2 からは画面で選んだもの（Lv はその段階の treasureLevelOfPhase。allowedTreasurePhases）
 */
export type SnapshotTreasure = { tid: number; level: number; phase: Exclude<TreasurePhase, 0> | null };

/** 1 体分。growth と BuildInput の項目は sim-run.ts の --build の 1 件と同じ形 */
export type SnapshotCharacter = BuildInput & {
  growth: GrowthInput;
  skillLevels: SkillLevels;
  treasure: SnapshotTreasure | null;
};

/**
 * スナップショットの版（書く版）。形を変えるときは上げ、readBuildSnapshot に前の版からの写しを足す。
 * 版 2 で、Lv 0 の宝物の段階 1（画面で選んだ値）と editedAt を足した。版 1 はどちらも持たない版 2 と同じ形なので、
 * 写しは要らず、版 2 で足したものを読まないだけ（readBuildSnapshotValue）。読んだものは版 2 として持つ
 */
export const BUILD_SNAPSHOT_FORMAT_VERSION = 2;
/** 読める版のうち、いちばん古いもの */
const OLDEST_READABLE_FORMAT_VERSION = 1;

export type BuildSnapshot = {
  formatVersion: typeof BUILD_SNAPSHOT_FORMAT_VERSION;
  fetchedAt: string;
  /** 画面で編集した育成状況の、最後に編集した日時（ISO）。取得のままのスナップショットには無い */
  editedAt?: string;
  synchroLevel: number;
  /** リサイクルルームの研究の Lv（tid → Lv） */
  recycleRoom: Record<string, number>;
  /** resourceId → 1 体分 */
  characters: Record<string, SnapshotCharacter>;
  /** 写せなかった値（黙って捨てない） */
  unmapped: string[];
};

/** formatVersion と characters を持つ（スナップショットのつもりの JSON か。版と中身は見ない） */
export function isBuildSnapshotShaped(json: unknown): json is Record<string, unknown> {
  return isRecord(json) && json.formatVersion !== undefined && isRecord(json.characters);
}

export type BuildSnapshotRead =
  { ok: true; snapshot: BuildSnapshot; notices: string[] } | { ok: false; errors: string[] };

/** 止める理由を出す数の上限（残りは件数だけ） */
const ERROR_LIMIT = 5;

/** 宝物の段階（無し = 0 を除く） */
const TREASURE_PHASES = [1, 2, 3] as const;

/**
 * その Lv の宝物が持てる段階。Lv から決まる段階（決まらない Lv は未確定の null）と、版 2 からは、画面で選んでその Lv に書いた段階
 * （Lv 0 の段階 1。Lv 1・2 は Lv から決まる段階と同じ）
 */
function allowedTreasurePhases(level: number, version: number): SnapshotTreasure['phase'][] {
  const allowed: SnapshotTreasure['phase'][] = [treasurePhaseOfLevel(level)];
  if (version >= 2)
    for (const phase of TREASURE_PHASES)
      if (treasureLevelOfPhase(phase) === level && !allowed.includes(phase)) allowed.push(phase);
  return allowed;
}

function parseTreasure(
  v: unknown,
  path: string,
  version: number,
  issues: string[],
): SnapshotTreasure | null | undefined {
  if (v === null) return null;
  if (!isRecord(v)) {
    issues.push(`${path}: オブジェクトか null でない`);
    return undefined;
  }
  const tidOk = checkInt(v.tid, 1, Infinity, `${path}.tid`, issues);
  if (!checkInt(v.level, 0, Infinity, `${path}.level`, issues) || !tidOk) return undefined;
  // 段階は Lv で決まる範囲だけを通す（Lv 0 は未確定の null か、版 2 からは段階 1）。合わない段階（Lv 0 の段階 3 など）は止める
  const allowed = allowedTreasurePhases(v.level, version);
  const phase = allowed.find((p) => p === v.phase);
  if (phase === undefined) {
    const expected = allowed.map((p) => p ?? 'null').join(' か ');
    issues.push(`${path}.phase: Lv ${v.level} なら ${expected}（${JSON.stringify(v.phase) ?? 'なし'}）`);
    return undefined;
  }
  return { tid: v.tid as number, level: v.level, phase };
}

function parseCharacter(
  v: unknown,
  path: string,
  entry: Pick<CharacterIndexEntry, 'rarity'>,
  version: number,
  issues: string[],
): SnapshotCharacter | null {
  if (!isRecord(v)) {
    issues.push(`${path}: オブジェクトでない`);
    return null;
  }
  const before = issues.length;
  const g = v.growth;
  if (!isRecord(g)) issues.push(`${path}.growth: オブジェクトでない`);
  else {
    checkInt(g.level, 1, Infinity, `${path}.growth.level`, issues);
    checkInt(g.grade, 0, GRADE_MAX[entry.rarity], `${path}.growth.grade`, issues);
    checkInt(g.core, 0, CORE_MAX[entry.rarity], `${path}.growth.core`, issues);
  }
  const fields = parseBuildFieldsJson(v, path, issues);
  const r = v.recycleRoom;
  if (!isRecord(r)) issues.push(`${path}.recycleRoom: オブジェクトでない`);
  else
    for (const key of ['personal', 'class', 'corporation'] as const)
      checkInt(r[key], 0, Infinity, `${path}.recycleRoom.${key}`, issues);
  if (typeof v.extraAttack !== 'number' || !Number.isFinite(v.extraAttack) || v.extraAttack < 0)
    issues.push(`${path}.extraAttack: 0 以上の数でない（${JSON.stringify(v.extraAttack) ?? 'なし'}）`);
  const skillLevels = parseSkillLevelsJson(v.skillLevels, `${path}.skillLevels`, issues);
  const treasure = parseTreasure(v.treasure, `${path}.treasure`, version, issues);
  if (treasure && fields?.collection) issues.push(`${path}: 宝物とコレクションの両方がある`);
  if (issues.length > before || fields === null || skillLevels === null || treasure === undefined) return null;
  const growth = g as GrowthInput;
  const room = r as BuildInput['recycleRoom'];
  return {
    growth: { level: growth.level, grade: growth.grade, core: growth.core },
    ...fields,
    recycleRoom: { personal: room.personal, class: room.class, corporation: room.corporation },
    extraAttack: v.extraAttack as number,
    skillLevels,
    treasure,
  };
}

/**
 * 育成状況の JSON を読む（plan/design-combat-power-sort.md 5.3 節）。
 * 止める（ok: false）: JSON として読めない・スナップショットの形でない・知らない版・範囲の外の値（理由は ERROR_LIMIT 件まで）。
 * 版は OLDEST_READABLE_FORMAT_VERSION から BUILD_SNAPSHOT_FORMAT_VERSION までを読む（古い版は、後の版で足したものを読まない）。
 * 進めて知らせる（notices）: キャラのデータに無い resourceId（飛ばす）・写せなかった値（unmapped）がある。
 */
export function readBuildSnapshot(
  text: string,
  index: readonly Pick<CharacterIndexEntry, 'resourceId' | 'rarity'>[],
): BuildSnapshotRead {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSON として読めない'] };
  }
  return readBuildSnapshotValue(raw, index);
}

/** readBuildSnapshot の parse の後（parse 済みの値を検査する） */
export function readBuildSnapshotValue(
  raw: unknown,
  index: readonly Pick<CharacterIndexEntry, 'resourceId' | 'rarity'>[],
): BuildSnapshotRead {
  if (!isBuildSnapshotShaped(raw))
    return { ok: false, errors: ['育成状況の JSON（formatVersion と characters を持つスナップショット）でない'] };
  const version = raw.formatVersion;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < OLDEST_READABLE_FORMAT_VERSION ||
    version > BUILD_SNAPSHOT_FORMAT_VERSION
  )
    return { ok: false, errors: [`この版の育成状況は読めない（formatVersion ${JSON.stringify(version)}）`] };

  const issues: string[] = [];
  if (typeof raw.fetchedAt !== 'string' || raw.fetchedAt === '') issues.push('fetchedAt: 文字列でない');
  // 版 2 から。無くてよい（取得のままのスナップショット）
  const editedAt = version >= 2 ? raw.editedAt : undefined;
  if (editedAt !== undefined && (typeof editedAt !== 'string' || editedAt === ''))
    issues.push('editedAt: 文字列でない');
  checkInt(raw.synchroLevel, 1, Infinity, 'synchroLevel', issues);
  const recycleRoom: Record<string, number> = {};
  if (!isRecord(raw.recycleRoom)) issues.push('recycleRoom: オブジェクトでない');
  else
    for (const [tid, lv] of Object.entries(raw.recycleRoom))
      if (checkInt(lv, 0, Infinity, `recycleRoom.${tid}`, issues)) recycleRoom[tid] = lv;
  let unmapped: string[] = [];
  if (raw.unmapped !== undefined) {
    if (!Array.isArray(raw.unmapped) || !raw.unmapped.every((u) => typeof u === 'string'))
      issues.push('unmapped: 文字列の配列でない');
    else unmapped = raw.unmapped as string[];
  }

  const byId = new Map(index.map((e) => [String(e.resourceId), e]));
  const characters: Record<string, SnapshotCharacter> = {};
  const skipped: string[] = [];
  for (const [id, v] of Object.entries(raw.characters as Record<string, unknown>)) {
    const entry = byId.get(id);
    // 中身は検査しない: レア度が分からず凸・コアの範囲を決められない（キャラのデータが追いついた版で読めば検査する）
    if (entry === undefined) {
      skipped.push(id);
      continue;
    }
    const c = parseCharacter(v, `characters.${id}`, entry, version, issues);
    if (c !== null) characters[id] = c;
  }

  if (issues.length > 0) {
    const errors = issues.slice(0, ERROR_LIMIT);
    if (issues.length > ERROR_LIMIT) errors.push(`ほか ${issues.length - ERROR_LIMIT} 件`);
    return { ok: false, errors };
  }
  const notices: string[] = [];
  if (skipped.length > 0)
    notices.push(
      `キャラのデータに無い ${skipped.length} 体（${skipped.join('・')}）は飛ばした（キャラのデータが古い）`,
    );
  if (unmapped.length > 0) notices.push(`取り込みで写せなかった値が ${unmapped.length} 件ある（unmapped）`);
  return {
    ok: true,
    snapshot: {
      formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
      fetchedAt: raw.fetchedAt as string,
      ...(editedAt === undefined ? {} : { editedAt: editedAt as string }),
      synchroLevel: raw.synchroLevel as number,
      recycleRoom,
      characters,
      unmapped,
    },
    notices,
  };
}

/** 宝物の段階が未確定（Lv 0。phase: null）のキャラの数 */
export function unknownTreasurePhaseCount(snapshot: BuildSnapshot): number {
  return Object.values(snapshot.characters).filter((c) => c.treasure !== null && c.treasure.phase === null).length;
}

/**
 * 読んだスナップショットについて CLI が出す知らせ: 読み込みの知らせ（notices）と、画面で編集した育成状況（editedAt を持つ）なら
 * その 1 行（取得のままのスナップショット（録画の台帳が名前で指す）と取り違えないため）。画面は notices だけを出す
 */
export function cliSnapshotNotices(read: Extract<BuildSnapshotRead, { ok: true }>): string[] {
  const { editedAt } = read.snapshot;
  if (editedAt === undefined) return read.notices;
  const t = Date.parse(editedAt);
  const when = Number.isNaN(t) ? editedAt : `日本時間 ${jstDateTime(t)}`;
  return [...read.notices, `画面で編集した育成状況（${when} に編集。取得のままのスナップショットではない）`];
}

/** 時刻（ミリ秒）を日本時間の日時（YYYY-MM-DD HH:mm）にする */
export function jstDateTime(ms: number): string {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
}

/** 取得の時刻（ISO）を日本時間の日付（YYYY-MM-DD。スナップショットの名前の日付）にする */
export function jstDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`fetchedAt が日時でない: ${iso}`);
  return jstDateTime(t).slice(0, 10);
}

/**
 * スナップショットの 1 体分の戦闘力（C-0981。宝物は解放しているかだけを見る）。宝物の無いキャラに treasure があれば RangeError
 * （computeCombatStat。読み込みの index は宝物の有無を持たないので、readBuildSnapshot はここを見ない）
 */
export function snapshotCombatPower(
  character: Parameters<typeof computeCombatPower>[0],
  entry: SnapshotCharacter,
  masters: BuildMasters,
): CombatPower {
  return computeCombatPower(
    character,
    { growth: entry.growth, build: entry, skillLevels: entry.skillLevels, treasure: entry.treasure !== null },
    masters,
  );
}

export type SnapshotCombatPowers = {
  /** resourceId → 戦闘力 */
  powers: Map<number, number>;
  /** 戦闘力を出せなかったキャラ（キャラの値が無い・育成の値がキャラに合わない）と理由 */
  failures: { id: number; message: string }[];
};

/** スナップショットの全キャラの戦闘力。characterOf はキャラの値を引く（無ければ undefined） */
export function snapshotCombatPowers(
  snapshot: BuildSnapshot,
  characterOf: (resourceId: number) => Parameters<typeof computeCombatPower>[0] | undefined,
  masters: BuildMasters,
): SnapshotCombatPowers {
  const powers = new Map<number, number>();
  const failures: SnapshotCombatPowers['failures'] = [];
  for (const [key, entry] of Object.entries(snapshot.characters)) {
    const id = Number(key);
    const character = characterOf(id);
    if (character === undefined) {
      failures.push({ id, message: 'キャラのデータに無い' });
      continue;
    }
    try {
      powers.set(id, snapshotCombatPower(character, entry, masters).value);
    } catch (e) {
      failures.push({ id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { powers, failures };
}
