// 育成状況の編集（plan/design-roster-edit.md 5 節）。React に依存しない純関数だけを置く。
// 読み込んだ育成状況の JSON（roster.ts。書き換えない）に重ねる「編集の重ね」の形・当て方・操作・比べ。
// 重ねは、編集した 1 体分（編集できる項目の全部）と、変えたアカウント全体の値だけを持ち、読み込んだ値と同じになったものは外す。
// 画面が使う育成状況と書き出す JSON は、どちらも読み込んだ JSON に重ねを当てたもの（editedRoster）。
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  GEAR_PARTS,
  overloadLinePosition,
  readBuildSnapshotValue,
  recycleRoomOfResearch,
  treasureLevelOfPhase,
  type BuildInput,
  type BuildSnapshot,
  type BuildSnapshotRead,
  type CharacterIndexEntry,
  type SkillLevels,
  type SnapshotCharacter,
  type SnapshotTreasure,
} from '@nikke/core';
import { isRecord, type SlotGrowth, type SlotGrowthFields } from './team.ts';

export const ROSTER_EDITS_STORAGE_KEY = 'nikke-calc.roster.edits.v1';
export const ROSTER_EDITS_FORMAT_VERSION = 1;

/**
 * 編集した 1 体分。編集できる項目の全部を持つ（変えた項目だけでなく丸ごと）。Lv・リサイクルルームの写し・その他攻撃加算は
 * 編集しないので持たない（applyRosterEdits がアカウント全体の値から決める）
 */
export type RosterCharacterEdit = Pick<
  SnapshotCharacter,
  'affectionRank' | 'gear' | 'cube' | 'collection' | 'skillLevels' | 'treasure'
> & { growth: SlotGrowth };

/** アカウント全体の値（シンクロ LV と、リサイクルルームの研究の tid → Lv） */
export type RosterAccount = Pick<BuildSnapshot, 'synchroLevel' | 'recycleRoom'>;

/** 編集の重ね。synchroLevel・recycleRoom は、読み込んだ値から変えたときだけ持つ */
export type RosterEdits = Partial<RosterAccount> & {
  formatVersion: typeof ROSTER_EDITS_FORMAT_VERSION;
  /** 最後に編集した日時（ISO）。書き出す JSON の editedAt になる */
  editedAt: string;
  /** resourceId → 編集した 1 体分 */
  characters: Record<string, RosterCharacterEdit>;
};

export type RosterEditsRead = { ok: true; edits: RosterEdits | null } | { ok: false; error: string };

/**
 * 保存した重ねを読む（無ければ null）。ここで見るのは形だけで、値の範囲は、当てた結果を育成状況の読み込みの検査に通して確かめる
 * （editedRoster）
 */
export function parseRosterEdits(json: string | null): RosterEditsRead {
  if (json === null) return { ok: true, edits: null };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めない' };
  }
  if (!isRecord(raw) || raw.formatVersion !== ROSTER_EDITS_FORMAT_VERSION) {
    const version = isRecord(raw) ? raw.formatVersion : undefined;
    return { ok: false, error: `この版の編集は読めない（formatVersion ${JSON.stringify(version) ?? 'なし'}）` };
  }
  const shaped =
    typeof raw.editedAt === 'string' &&
    raw.editedAt !== '' &&
    isRecord(raw.characters) &&
    Object.values(raw.characters).every(isRecord) &&
    (raw.synchroLevel === undefined || typeof raw.synchroLevel === 'number') &&
    (raw.recycleRoom === undefined || isRecord(raw.recycleRoom));
  return shaped ? { ok: true, edits: raw as RosterEdits } : { ok: false, error: '編集の形が合わない' };
}

/** 育成状況の 1 体分のうち、編集できる項目 */
export function characterEditOf(character: SnapshotCharacter): RosterCharacterEdit {
  const { growth, affectionRank, gear, cube, collection, skillLevels, treasure } = character;
  return {
    growth: { grade: growth.grade, core: growth.core },
    affectionRank,
    gear,
    cube,
    collection,
    skillLevels,
    treasure,
  };
}

/**
 * 育成の欄の変更（patch。スロットの育成と同じ形）を、育成状況の 1 体分（current）に重ねた編集。
 * 宝物は段階を変えたときだけ書き直す: 段階 0 は宝物なし、ほかはその段階の Lv（treasureLevelOfPhase）。tid はいまの宝物のものか、
 * 無ければキャラのデータの宝物の ID（favoriteId。宝物の無いキャラは null で、宝物なしのまま）。段階が未確定の宝物は、
 * 段階を変えない限りそのまま残る。宝物があるときは、R・SR のコレクションを持たない（育成状況の検査は両方あると止める）
 */
export function patchedCharacterEdit(
  current: SnapshotCharacter,
  patch: Partial<SlotGrowthFields>,
  favoriteId: number | null,
): RosterCharacterEdit {
  const { treasurePhase: phase } = patch;
  const tid = current.treasure?.tid ?? favoriteId;
  const treasure: SnapshotTreasure | null =
    phase === undefined
      ? current.treasure
      : phase === 0 || tid === null
        ? null
        : { tid, level: treasureLevelOfPhase(phase), phase };
  return {
    ...characterEditOf(current),
    ...(patch.growth && { growth: patch.growth }),
    ...patch.build,
    ...(patch.skillLevels && { skillLevels: patch.skillLevels }),
    ...(treasure !== null && { collection: null }),
    treasure,
  };
}

type BuildFields = Pick<BuildInput, 'affectionRank' | 'gear' | 'cube' | 'collection'>;

/** 育成の値を比べるための並び。キーの順と、OL の行の位置の欄の有無（position の無い行は配列の並び）で違うと判定しない */
function growthKey(growth: SlotGrowth, build: BuildFields, skillLevels: SkillLevels): unknown[] {
  return [
    growth.grade,
    growth.core,
    build.affectionRank,
    GEAR_PARTS.map((part) => {
      const gear = build.gear[part];
      const lines = (gear?.overload ?? []).map((l, i) => ({
        at: overloadLinePosition(l, i),
        o: l.option,
        lv: l.level,
      }));
      return gear && [gear.type, gear.level, lines.sort((a, b) => a.at - b.at)];
    }),
    build.cube && [build.cube.id, build.cube.level],
    build.collection && [build.collection.rarity, build.collection.level],
    skillLevels.skill1,
    skillLevels.skill2,
    skillLevels.burst,
  ];
}

/** スロットの育成どうしが同じか（スロットの「育成状況の値に戻す」を押せるか） */
export function sameGrowthFields(a: SlotGrowthFields, b: SlotGrowthFields): boolean {
  const key = (f: SlotGrowthFields) => JSON.stringify([growthKey(f.growth, f.build, f.skillLevels), f.treasurePhase]);
  return key(a) === key(b);
}

/** 編集した 1 体分どうしが同じか（読み込んだ値と同じなら重ねから外す） */
export function sameCharacterEdit(a: RosterCharacterEdit, b: RosterCharacterEdit): boolean {
  const key = (e: RosterCharacterEdit) =>
    JSON.stringify([
      growthKey(e.growth, e, e.skillLevels),
      e.treasure && [e.treasure.tid, e.treasure.level, e.treasure.phase],
    ]);
  return key(a) === key(b);
}

/** 研究の Lv（tid → Lv）どうしが同じか。無い研究は 0 */
export function sameRecycleRoom(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every((tid) => (a[tid] ?? 0) === (b[tid] ?? 0));
}

/** 何も持たない重ねは null（保存のキーごと消す） */
function emptyToNull(edits: RosterEdits): RosterEdits | null {
  const empty =
    Object.keys(edits.characters).length === 0 && edits.synchroLevel === undefined && edits.recycleRoom === undefined;
  return empty ? null : edits;
}

/** 操作の元にする重ね（無ければ空）。編集の日時を now にする */
function touched(edits: RosterEdits | null, now: string): RosterEdits {
  return { formatVersion: ROSTER_EDITS_FORMAT_VERSION, characters: {}, ...edits, editedAt: now };
}

/**
 * ニケ id の育成を edit にした重ね（null は読み込んだ値に戻す）。読み込んだ値（baseline）と同じなら、重ねから外す。
 * now は編集の日時（ISO）
 */
export function withCharacterEdit(
  edits: RosterEdits | null,
  baseline: BuildSnapshot,
  id: number,
  edit: RosterCharacterEdit | null,
  now: string,
): RosterEdits | null {
  const next = touched(edits, now);
  const { [String(id)]: _previous, ...rest } = next.characters;
  const original = baseline.characters[String(id)];
  const changed = edit !== null && original !== undefined && !sameCharacterEdit(edit, characterEditOf(original));
  return emptyToNull({ ...next, characters: changed ? { ...rest, [String(id)]: edit } : rest });
}

/** アカウント全体の値を account にした重ね（null は読み込んだ値に戻す）。読み込んだ値と同じものは持たない */
export function withAccountEdit(
  edits: RosterEdits | null,
  baseline: BuildSnapshot,
  account: RosterAccount | null,
  now: string,
): RosterEdits | null {
  const { synchroLevel: _synchroLevel, recycleRoom: _recycleRoom, ...rest } = touched(edits, now);
  if (account === null) return emptyToNull(rest);
  return emptyToNull({
    ...rest,
    ...(account.synchroLevel === baseline.synchroLevel ? {} : { synchroLevel: account.synchroLevel }),
    ...(sameRecycleRoom(account.recycleRoom, baseline.recycleRoom) ? {} : { recycleRoom: account.recycleRoom }),
  });
}

/** 編集したニケ */
export function editedCharacterIds(edits: RosterEdits | null): ReadonlySet<number> {
  return new Set(Object.keys(edits?.characters ?? {}).map(Number));
}

/** アカウント全体の値（シンクロ LV・リサイクルルーム）を編集しているか */
export function accountEdited(edits: RosterEdits | null): boolean {
  return edits !== null && (edits.synchroLevel !== undefined || edits.recycleRoom !== undefined);
}

/**
 * 読み込んだ育成状況の JSON（生の値）に重ねを当てた JSON（生の値。版 2・editedAt つき。5.2 節）。
 * - 重ねのあるニケは、編集できる項目を重ねの値にする（キャラのデータに無いニケの分は当てない）
 * - シンクロ LV を変えていれば、Lv が読み込んだシンクロ LV と同じキャラの Lv も新しい値にする（違う Lv のキャラはそのまま）
 * - リサイクルルームを変えていれば、キャラごとの写し（共通・クラス・企業）を引き直す。キャラのデータに無いキャラは、
 *   クラスと企業が分からないので写しを直せない
 * 読み込んだ JSON のほかの欄（キャラのデータに無いキャラ・unmapped など）はそのまま残す
 */
export function applyRosterEdits(
  raw: Readonly<Record<string, unknown>>,
  edits: RosterEdits,
  index: readonly Pick<CharacterIndexEntry, 'resourceId' | 'class' | 'corporation'>[],
): Record<string, unknown> {
  const byId = new Map(index.map((e) => [String(e.resourceId), e]));
  const { synchroLevel, recycleRoom } = edits;
  const characters = Object.entries(isRecord(raw.characters) ? raw.characters : {}).map(([id, c]) => {
    if (!isRecord(c) || !isRecord(c.growth)) return [id, c];
    const entry = byId.get(id);
    const edit = entry === undefined ? undefined : edits.characters[id];
    const follows = synchroLevel !== undefined && c.growth.level === raw.synchroLevel;
    const next = {
      ...c,
      ...edit,
      growth: { ...c.growth, ...edit?.growth, ...(follows ? { level: synchroLevel } : {}) },
      ...(recycleRoom !== undefined && entry !== undefined
        ? { recycleRoom: recycleRoomOfResearch((tid) => recycleRoom[String(tid)], entry) }
        : {}),
    };
    return [id, next];
  });
  return {
    ...raw,
    formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
    editedAt: edits.editedAt,
    ...(synchroLevel === undefined ? {} : { synchroLevel }),
    ...(recycleRoom === undefined ? {} : { recycleRoom }),
    characters: Object.fromEntries(characters),
  };
}

/** 重ねを当てた育成状況: 書き出す JSON（raw）と、それを読み込みと同じ検査に通した結果（read。画面が使う） */
export type EditedRoster = { raw: Record<string, unknown>; read: BuildSnapshotRead };

/** saved は読み込んだ育成状況の JSON の文（検査を通ったもの） */
export function editedRoster(
  saved: string,
  edits: RosterEdits,
  index: readonly Pick<CharacterIndexEntry, 'resourceId' | 'rarity' | 'class' | 'corporation'>[],
): EditedRoster {
  const raw = applyRosterEdits(JSON.parse(saved) as Record<string, unknown>, edits, index);
  return { raw, read: readBuildSnapshotValue(raw, index) };
}
