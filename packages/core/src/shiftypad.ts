// ShiftyPad（Blablalink）から取ったオーナーの育成データを、--build の育成入力のスナップショットに写す
// （plan/design-build-snapshot.md 3・4・8 節。API とフィールドの写し方は plan/design-stage12.md 11.1 節）。
// 純関数だけを置く。ファイルの読み書きは tools/builds/import.ts。
//
// 写し方（3 回の取得（2026-09-24・10-06・10-24）の全所持キャラで CDN の ItemEquipTable と突き合わせて確かめた）:
//   - キャラ: name_code → CDN の nameCode（data/characters/index.json）。Lv はシンクロ Lv（GetUserCharacters の lv）
//   - 装備: <部位>_equip_tier が 9 なら T9（<部位>_equip_corporation_type が 0 でなければ企業装備）、10 なら OL。
//     部位は欄の名前（head・torso・arm・leg）。OL のオプション ID は 700GGLL（GG = 05〜13 が OVERLOAD_OPTIONS の順、LL = Lv）
//   - コレクション: favorite_item_tid が 1xxx01 = R・1xxx02 = SR、2xxxxx = 宝物。宝物の favorite_item_lv 1・2 は段階 2・3（C-0744）。
//     Lv 0 の段階は未確定
//   - リサイクルルーム: tid 1001 = 共通、1101〜1103 = クラス、1201〜1205 = 企業
import {
  emptyBuild,
  OVERLOAD_OPTIONS,
  type BuildInput,
  type GearInput,
  type OverloadLine,
  type RecycleRoomInput,
} from './build.ts';
import type { BuildSnapshot, SnapshotCharacter, SnapshotTreasure } from './buildSnapshot.ts';
import type { TreasurePhase } from './skills/treasure.ts';
import type { CharacterIndexEntry, GearPart, NikkeClass } from './types.ts';

/** GetUserCharacterDetails の character_details の 1 件（欄はどれも数） */
export type ShiftyPadDetail = Record<string, number>;

/** 取得の道具が書く生のデータ（アカウントを特定できる値は除いたもの） */
export type ShiftyPadRaw = {
  fetchedAt: string;
  outpost: { synchro_level: number; recycle_room_researches: { tid: number; lv: number }[] };
  characters: { name_code: number; lv: number; grade: number; core: number }[];
  details: ShiftyPadDetail[];
};

/** 宝物の favorite_item_lv → 段階。Lv 1 = 段階 2、Lv 2 = 段階 3（C-0744）。Lv 0 は画面で見ていないので未確定（null） */
export function treasurePhaseOfLevel(level: number): Exclude<TreasurePhase, 0> | null {
  if (level === 1) return 2;
  if (level === 2) return 3;
  return null;
}

/**
 * 宝物の段階 → スナップショットに書く Lv（育成状況を画面で編集したときに書く。plan/design-roster-edit.md 4 節）。段階 2・3 は
 * treasurePhaseOfLevel の逆（Lv 1・2）。段階 1 は Lv 0 と書く。API の Lv 0 が段階 1 かは確かめていないので、取得した Lv 0 は
 * 段階 1 に読み替えない（treasurePhaseOfLevel は null のまま）
 */
export function treasureLevelOfPhase(phase: Exclude<TreasurePhase, 0>): number {
  return phase - 1;
}

/** アカウントを特定できる欄（取得の道具と同じ規則。取り込みでもう一度除く） */
const ACCOUNT_KEY = /open_?id|^uid$|nickname|user_?name|avatar|role_?id|^area_?id$/i;

/** 生のデータからアカウントを特定できる欄を除く（入れ子の中も） */
export function stripAccountFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v: unknown) => stripAccountFields(v)) as T;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !ACCOUNT_KEY.test(k))
        .map(([k, v]) => [k, stripAccountFields(v)]),
    ) as T;
  return value;
}

export const RECYCLE_PERSONAL_TID = 1001;
export const RECYCLE_CLASS_TID: Readonly<Record<NikkeClass, number>> = {
  Attacker: 1101,
  Defender: 1102,
  Supporter: 1103,
};
export const RECYCLE_CORPORATION_TID: Readonly<Record<string, number>> = {
  ELYSION: 1201,
  MISSILIS: 1202,
  TETRA: 1203,
  PILGRIM: 1204,
  ABNORMAL: 1205,
};

/**
 * リサイクルルームの研究（tid → Lv。lvOf）のうち、そのキャラに効く 3 つ（共通・クラス・企業）。無い研究は 0。
 * 育成状況の 1 体分が持つ写し（SnapshotCharacter の recycleRoom）は、アカウント全体の研究からこれで作る
 */
export function recycleRoomOfResearch(
  lvOf: (tid: number) => number | undefined,
  character: Pick<CharacterIndexEntry, 'class' | 'corporation'>,
): RecycleRoomInput {
  const corporationTid = RECYCLE_CORPORATION_TID[character.corporation];
  return {
    personal: lvOf(RECYCLE_PERSONAL_TID) ?? 0,
    class: lvOf(RECYCLE_CLASS_TID[character.class]) ?? 0,
    corporation: (corporationTid === undefined ? undefined : lvOf(corporationTid)) ?? 0,
  };
}

const GEAR_FIELDS: readonly (readonly [string, GearPart])[] = [
  ['head', 'head'],
  ['torso', 'body'],
  ['arm', 'arm'],
  ['leg', 'leg'],
];
/** OL のオプション ID 700GGLL の GG の始まり（05 = 有利コードダメージ） */
const OVERLOAD_GROUP_FIRST = 5;

function gearOf(d: ShiftyPadDetail, field: string, part: GearPart, where: string, unmapped: string[]): GearInput {
  const tid = d[`${field}_equip_tid`] ?? 0;
  if (tid === 0) return null;
  const level = d[`${field}_equip_lv`] ?? 0;
  const tier = d[`${field}_equip_tier`];
  if (tier === 9) return { type: (d[`${field}_equip_corporation_type`] ?? 0) !== 0 ? 'T9Corp' : 'T9', level };
  if (tier !== 10) {
    unmapped.push(`${where} ${part}: 装備 ${tid} の tier ${String(tier)}（T9・OL のほかは扱わない。未装備にした）`);
    return null;
  }
  const overload: OverloadLine[] = [];
  for (const i of [1, 2, 3]) {
    const id = d[`${field}_equip_option${i}_id`] ?? 0;
    if (id === 0) continue;
    const option = OVERLOAD_OPTIONS[(Math.floor(id / 100) % 100) - OVERLOAD_GROUP_FIRST];
    if (Math.floor(id / 10000) !== 700 || option === undefined) {
      unmapped.push(`${where} ${part}: OL のオプション ID ${id}（行を捨てた）`);
      continue;
    }
    overload.push({ option, level: id % 100 });
  }
  return overload.length > 0 ? { type: 'OL', level, overload } : { type: 'OL', level };
}

/** 生のデータを写す。index は nameCode を持つキャラの一覧（data/characters/index.json） */
export function toBuildSnapshot(raw: ShiftyPadRaw, index: readonly CharacterIndexEntry[]): BuildSnapshot {
  const unmapped: string[] = [];
  const byCode = new Map(index.map((c) => [c.nameCode, c]));
  const listByCode = new Map(raw.characters.map((c) => [c.name_code, c]));
  const research = new Map(raw.outpost.recycle_room_researches.map((r) => [r.tid, r.lv]));
  const characters: [number, SnapshotCharacter][] = [];
  for (const d of raw.details) {
    const code = d['name_code'] ?? 0;
    const entry = byCode.get(code);
    const list = listByCode.get(code);
    if (entry === undefined) {
      unmapped.push(`name_code ${code}: data/characters に無いキャラ（CDN の取り直しが要る。飛ばした）`);
      continue;
    }
    const where = `${entry.resourceId} ${entry.name.ja}`;
    if (list === undefined) {
      unmapped.push(`${where}: GetUserCharacters に無い（シンクロ Lv が分からないので飛ばした）`);
      continue;
    }
    const empty = emptyBuild();
    const gear = { ...empty.gear };
    for (const [field, part] of GEAR_FIELDS) gear[part] = gearOf(d, field, part, where, unmapped);
    const cubeTid = d['harmony_cube_tid'] ?? 0;
    const fav = d['favorite_item_tid'] ?? 0;
    const favLevel = d['favorite_item_lv'] ?? 0;
    let collection: BuildInput['collection'] = null;
    let treasure: SnapshotTreasure | null = null;
    if (fav >= 200000) treasure = { tid: fav, level: favLevel, phase: treasurePhaseOfLevel(favLevel) };
    else if (fav % 100 === 1) collection = { rarity: 'R', level: favLevel };
    else if (fav % 100 === 2) collection = { rarity: 'SR', level: favLevel };
    else if (fav !== 0) unmapped.push(`${where}: コレクション ${fav}（R・SR・宝物のどれでもない。無しにした）`);
    characters.push([
      entry.resourceId,
      {
        growth: { level: list.lv, grade: list.grade, core: list.core },
        affectionRank: Math.max(1, d['attractive_lv'] ?? 0),
        gear,
        cube: cubeTid === 0 ? null : { id: cubeTid, level: d['harmony_cube_lv'] ?? 0 },
        collection,
        recycleRoom: recycleRoomOfResearch((tid) => research.get(tid), entry),
        extraAttack: 0,
        skillLevels: {
          skill1: d['skill1_lv'] ?? 0,
          skill2: d['skill2_lv'] ?? 0,
          burst: d['ulti_skill_lv'] ?? 0,
        },
        treasure,
      },
    ]);
  }
  for (const c of raw.characters)
    if (!raw.details.some((d) => d['name_code'] === c.name_code))
      unmapped.push(`name_code ${c.name_code}: GetUserCharacterDetails に無い（飛ばした）`);
  characters.sort((a, b) => a[0] - b[0]);
  return {
    formatVersion: 2,
    fetchedAt: raw.fetchedAt,
    synchroLevel: raw.outpost.synchro_level,
    recycleRoom: Object.fromEntries(
      [...raw.outpost.recycle_room_researches].sort((a, b) => a.tid - b.tid).map((r) => [String(r.tid), r.lv]),
    ),
    characters: Object.fromEntries(characters.map(([id, c]) => [String(id), c])),
    unmapped,
  };
}

/**
 * ゲームの戦闘力（GetUserCharacterDetails の combat。キャラ一覧などに出る値と同じ。V-0685）。resourceId → 戦闘力。
 * キャラの対応は toBuildSnapshot と同じ（name_code → CDN の nameCode）。data/characters に無いキャラは入れない
 */
export function gameCombatPowers(raw: ShiftyPadRaw, index: readonly CharacterIndexEntry[]): Map<number, number> {
  const byCode = new Map(index.map((c) => [c.nameCode, c.resourceId]));
  const out = new Map<number, number>();
  for (const d of raw.details) {
    const resourceId = byCode.get(d['name_code'] ?? 0);
    const combat = d['combat'];
    if (resourceId !== undefined && combat !== undefined) out.set(resourceId, combat);
  }
  return out;
}

// ---- 表示（前回との差・所持の一覧） ----

const RECYCLE_LABEL: Readonly<Record<number, string>> = {
  1001: '共通',
  1101: '火力型',
  1102: '防御型',
  1103: '支援型',
  1201: 'エリシオン',
  1202: 'ミシリス',
  1203: 'テトラ',
  1204: 'ピルグリム',
  1205: 'アブノーマル',
};

export function gearLabel(g: GearInput): string {
  if (g === null) return '-';
  const lines = g.overload?.map((l) => `${l.option}${l.level}`).join(',');
  return `${g.type}+${g.level}${lines === undefined ? '' : `[${lines}]`}`;
}

export type SnapshotLabels = {
  /** resourceId → 表示名 */
  nameOf: (resourceId: number) => string;
  /** キューブの ID → 名前（無ければ ID を出す） */
  cubeName?: (id: number) => string | undefined;
};

function cubeLabel(c: SnapshotCharacter, labels: SnapshotLabels): string {
  return c.cube === null ? '-' : `${labels.cubeName?.(c.cube.id) ?? c.cube.id} Lv${c.cube.level}`;
}
function favoriteLabel(c: SnapshotCharacter): string {
  if (c.treasure !== null)
    return `宝物 Lv${c.treasure.level}（${c.treasure.phase === null ? '段階は未確定' : `段階 ${c.treasure.phase}`}）`;
  return c.collection === null ? '-' : `${c.collection.rarity} Lv${c.collection.level}`;
}
function skillLabel(c: SnapshotCharacter): string {
  return `${c.skillLevels.skill1}/${c.skillLevels.skill2}/${c.skillLevels.burst}`;
}

/** キャラ 1 体の、項目ごとの差（[項目, 前, 後]） */
function characterChanges(a: SnapshotCharacter, b: SnapshotCharacter, labels: SnapshotLabels): string[][] {
  // シンクロ Lv はアカウント全体の値なので、キャラごとには出さない
  const rows: [string, string, string][] = [
    ['凸', String(a.growth.grade), String(b.growth.grade)],
    ['コア', String(a.growth.core), String(b.growth.core)],
    ['好感度', String(a.affectionRank), String(b.affectionRank)],
    ...(['head', 'body', 'arm', 'leg'] as const).map((p): [string, string, string] => [
      `装備 ${p}`,
      gearLabel(a.gear[p]),
      gearLabel(b.gear[p]),
    ]),
    ['キューブ', cubeLabel(a, labels), cubeLabel(b, labels)],
    ['コレクション', favoriteLabel(a), favoriteLabel(b)],
    ['スキル', skillLabel(a), skillLabel(b)],
  ];
  return rows.filter(([, x, y]) => x !== y);
}

/**
 * 前回のスナップショットとの差を Markdown の行で出す（4 節）。attackOf があれば戦闘中の攻撃力の差も出す。
 * シンクロ Lv と研究の Lv はアカウント全体の値なので、キャラごとの行には出さず、それだけで攻撃力が変わったキャラはまとめて 1 行にする。
 */
export function diffSnapshots(
  prev: BuildSnapshot,
  next: BuildSnapshot,
  labels: SnapshotLabels,
  attackOf?: (resourceId: number, character: SnapshotCharacter) => number | null,
): string[] {
  const out: string[] = [];
  const account: string[] = [];
  if (prev.synchroLevel !== next.synchroLevel)
    account.push(`- シンクロ Lv: ${prev.synchroLevel} → ${next.synchroLevel}`);
  const tids = [...new Set([...Object.keys(prev.recycleRoom), ...Object.keys(next.recycleRoom)])].sort();
  for (const tid of tids) {
    const a = prev.recycleRoom[tid] ?? 0;
    const b = next.recycleRoom[tid] ?? 0;
    if (a !== b) account.push(`- リサイクルルームの研究（${RECYCLE_LABEL[Number(tid)] ?? tid}）: Lv ${a} → ${b}`);
  }
  out.push('## アカウント全体', '', ...(account.length > 0 ? account : ['- 変化なし']), '');

  const ids = (s: BuildSnapshot) => new Set(Object.keys(s.characters));
  const prevIds = ids(prev);
  const nextIds = ids(next);
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  out.push('## 所持の増減', '');
  if (added.length + removed.length === 0) out.push('- 変化なし');
  for (const id of added) out.push(`- 増えた: ${id} ${labels.nameOf(Number(id))}`);
  for (const id of removed) out.push(`- 減った: ${id} ${labels.nameOf(Number(id))}`);
  out.push('');

  out.push('## キャラごとの変化', '');
  const attackOnly: string[] = [];
  let any = false;
  for (const id of [...nextIds].filter((i) => prevIds.has(i)).sort((x, y) => Number(x) - Number(y))) {
    const a = prev.characters[id]!;
    const b = next.characters[id]!;
    const changes = characterChanges(a, b, labels);
    const atkA = attackOf?.(Number(id), a) ?? null;
    const atkB = attackOf?.(Number(id), b) ?? null;
    const atk = atkA !== null && atkB !== null && atkA !== atkB ? `${atkA} → ${atkB}（${signed(atkB - atkA)}）` : null;
    if (changes.length === 0) {
      if (atk !== null) attackOnly.push(`${id} ${labels.nameOf(Number(id))} ${signed(atkB! - atkA!)}`);
      continue;
    }
    any = true;
    out.push(`- ${id} ${labels.nameOf(Number(id))}`);
    for (const [what, x, y] of changes) out.push(`  - ${what}: ${x} → ${y}`);
    if (atk !== null) out.push(`  - 攻撃力（戦闘中・バフ前）: ${atk}`);
  }
  if (!any) out.push('- 変化なし');
  if (attackOnly.length > 0)
    out.push(
      '',
      `アカウント全体の値（シンクロ Lv・研究）の変化だけで攻撃力が変わったキャラ: ${attackOnly.length} 体`,
      '',
      ...attackOnly.map((l) => `- ${l}`),
    );
  return out;
}

function signed(v: number): string {
  return v >= 0 ? `+${v}` : String(v);
}

/** 所持の一覧（8 節。private/roster.md）。resourceId の順 */
export function rosterMarkdown(snapshot: BuildSnapshot, labels: SnapshotLabels): string[] {
  const out = [
    '| resourceId | 名前 | 凸 | コア | スキル | キューブ | コレクション |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const [id, c] of Object.entries(snapshot.characters))
    out.push(
      `| ${id} | ${labels.nameOf(Number(id))} | ${c.growth.grade} | ${c.growth.core} | ${skillLabel(c)} | ${cubeLabel(c, labels)} | ${favoriteLabel(c)} |`,
    );
  return out;
}
