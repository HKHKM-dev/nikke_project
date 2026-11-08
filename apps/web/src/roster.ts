// 育成状況（アカウントの全キャラの育成。plan/design-combat-power-sort.md 5 節）。React に依存しない純関数だけを置く。
// 形は CLI の育成データのスナップショット（core の BuildSnapshot）そのもので、ブラウザの中（ROSTER_STORAGE_KEY）にだけ置く。
// 読み込んだ育成状況は書き換えない: 保存と書き出しは読み込んだファイルの JSON のまま（キャラのデータに無いキャラも残す）。
// 計算とスロットへの写しには、それをキャラのデータで検査した BuildSnapshot（無いキャラは飛ばす）を使う。
// 育成状況にいるキャラをスロットに入れたときと、読み込んだときに、スロットへ写す。
import {
  RECYCLE_CLASS_TID,
  RECYCLE_CORPORATION_TID,
  RECYCLE_PERSONAL_TID,
  readBuildSnapshot,
  jstDate,
  unknownTreasurePhaseCount,
  type BuildSnapshot,
  type BuildSnapshotRead,
  type CharacterIndexEntry,
  type SnapshotCharacter,
} from '@nikke/core';
import type { PartiesState } from './parties.ts';
import {
  CONSOLE_CLASSES,
  CONSOLE_CORPORATIONS,
  type ConsoleInput,
  type SlotGrowthFields,
  type SlotState,
  type TeamAction,
  type TeamState,
} from './team.ts';

export const ROSTER_STORAGE_KEY = 'nikke-calc.roster.v1';

/**
 * 保存した育成状況（読み込んだファイルの JSON）を、読み込みと同じ検査で読む。無いときは null。
 * 読めない（ok: false）のは、保存の後にキャラのデータ（前は飛ばしたキャラが入る）か検査が変わったとき
 */
export function restoreRoster(json: string | null, index: readonly CharacterIndexEntry[]): BuildSnapshotRead | null {
  return json === null ? null : readBuildSnapshot(json, index);
}

/** 書き出すファイルの中身: 保存した JSON をそのまま、読みやすいよう字下げして書く */
export function serializeRoster(saved: string): string {
  return `${JSON.stringify(JSON.parse(saved), null, 2)}\n`;
}

/**
 * スロットへ写す育成。Lv は編成共通のシンクロ LV で計算するので写さない。宝物の段階が未確定（phase: null）なら宝物なし（0）
 */
export function rosterFields(entry: SnapshotCharacter): SlotGrowthFields {
  return {
    growth: { grade: entry.growth.grade, core: entry.growth.core },
    build: {
      affectionRank: entry.affectionRank,
      gear: { ...entry.gear },
      cube: entry.cube,
      collection: entry.collection,
    },
    skillLevels: { ...entry.skillLevels },
    treasurePhase: entry.treasure?.phase ?? 0,
  };
}

function entryOf(roster: BuildSnapshot | null, resourceId: number | null): SnapshotCharacter | undefined {
  return resourceId === null ? undefined : roster?.characters[String(resourceId)];
}

/** キャラをスロットに入れる操作に、育成状況のそのキャラの育成を付ける（いなければそのまま） */
export function withRosterFields(action: TeamAction, roster: BuildSnapshot | null): TeamAction {
  if (action.type !== 'selectCharacter') return action;
  const entry = entryOf(roster, action.resourceId);
  return entry === undefined ? action : { ...action, fields: rosterFields(entry) };
}

/** 育成状況のリサイクルルームの研究（tid → Lv）をコンソールの形にする。無い研究は 0 */
export function consoleFromRoster(roster: BuildSnapshot): ConsoleInput {
  const lv = (tid: number | undefined) => (tid === undefined ? 0 : (roster.recycleRoom[String(tid)] ?? 0));
  return {
    personal: lv(RECYCLE_PERSONAL_TID),
    class: Object.fromEntries(CONSOLE_CLASSES.map((c) => [c, lv(RECYCLE_CLASS_TID[c])])) as ConsoleInput['class'],
    corporation: Object.fromEntries(
      CONSOLE_CORPORATIONS.map((c) => [c, lv(RECYCLE_CORPORATION_TID[c])]),
    ) as ConsoleInput['corporation'],
  };
}

function applyToSlots(slots: SlotState[], roster: BuildSnapshot): SlotState[] {
  return slots.map((s) => {
    const entry = entryOf(roster, s.resourceId);
    return entry === undefined ? s : { ...s, ...rosterFields(entry) };
  });
}

/** 読み込んだときに写す: シンクロ LV・コンソールと、全部の編成のスロットのうち育成状況にいるキャラの育成 */
export function applyRoster(
  team: TeamState,
  parties: PartiesState,
  roster: BuildSnapshot,
): { team: TeamState; parties: PartiesState } {
  return {
    team: {
      ...team,
      synchroLevel: roster.synchroLevel,
      console: consoleFromRoster(roster),
      slots: applyToSlots(team.slots, roster),
    },
    parties: {
      ...parties,
      parties: parties.parties.map((p) => (p === null ? null : { ...p, slots: applyToSlots(p.slots, roster) })),
    },
  };
}

/** 読み込むと育成が上書きされるスロットの数（全部の編成） */
export function rosterSlotCount(team: TeamState, parties: PartiesState, roster: BuildSnapshot): number {
  const slots = [...team.slots, ...parties.parties.flatMap((p) => p?.slots ?? [])];
  return slots.filter((s) => entryOf(roster, s.resourceId) !== undefined).length;
}

/** 取得の日（日本時間の YYYY-MM-DD。スナップショットの名前と同じ）。日時として読めなければそのまま */
export function rosterDate(roster: BuildSnapshot): string {
  try {
    return jstDate(roster.fetchedAt);
  } catch {
    return roster.fetchedAt;
  }
}

export function rosterLabel(roster: BuildSnapshot): string {
  return `${rosterDate(roster)} の育成・${Object.keys(roster.characters).length} 体`;
}

export function rosterFileName(roster: BuildSnapshot): string {
  return `nikke-builds-${rosterDate(roster)}.json`;
}

/** 読み込んだ後に出す文（1 行目が結果、あとは知らせ） */
export function importSummary(roster: BuildSnapshot, notices: readonly string[]): string[] {
  const unknown = unknownTreasurePhaseCount(roster);
  return [
    `${rosterLabel(roster)}を読み込んだ`,
    ...notices,
    ...(unknown > 0
      ? [`宝物の段階が未確定（Lv 0）の ${unknown} 体は、宝物なしでスロットへ写す（スロットで選ぶ）`]
      : []),
  ];
}

export function importConfirmText(slotCount: number): string {
  return (
    'シンクロ LV・リサイクルルーム' +
    (slotCount > 0 ? `と、育成状況にいるキャラの ${slotCount} スロット（全部の編成）の育成` : '') +
    'を、読み込む育成状況で上書きします。'
  );
}
