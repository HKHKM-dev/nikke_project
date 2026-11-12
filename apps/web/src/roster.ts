// 育成状況（アカウントの全キャラの育成。plan/design-combat-power-sort.md 5 節）。React に依存しない純関数だけを置く。
// 形は CLI の育成データのスナップショット（core の BuildSnapshot）そのもので、ブラウザの中（ROSTER_STORAGE_KEY）にだけ置く。
// 読み込んだ育成状況は書き換えない: 保存は読み込んだファイルの JSON のまま（キャラのデータに無いキャラも残す）。画面での編集は
// 別の保存（rosterEdits.ts の重ね）に持ち、計算・スロットへの写し・書き出しには、読み込んだ JSON に重ねを当てたものを
// キャラのデータで検査した BuildSnapshot（無いキャラは飛ばす）を使う（plan/design-roster-edit.md 5 節）。
// 育成状況にいるキャラをスロットに入れたとき・読み込んだとき・編集したときに、スロットへ写す。
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
  DEFAULT_SYNCHRO_LEVEL,
  emptyConsole,
  emptySlot,
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

/** 書き出すファイルの中身: 育成状況の JSON（生の値）を、読みやすいよう字下げして書く */
export function rosterFileText(raw: unknown): string {
  return `${JSON.stringify(raw, null, 2)}\n`;
}

/** 編集が無いときに書き出すファイルの中身: 保存した JSON をそのまま */
export function serializeRoster(saved: string): string {
  return rosterFileText(JSON.parse(saved));
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

/** 育成状況のそのニケの育成（スロットの形）。育成状況が無い・いないニケは null（スロットの「育成状況の値に戻す」） */
export function rosterGrowthOf(roster: BuildSnapshot | null, resourceId: number | null): SlotGrowthFields | null {
  const entry = entryOf(roster, resourceId);
  return entry === undefined ? null : rosterFields(entry);
}

/** キャラをスロットに入れる操作に、育成状況のそのキャラの育成を付ける（いなければそのまま） */
export function withRosterFields(action: TeamAction, roster: BuildSnapshot | null): TeamAction {
  if (action.type !== 'selectCharacter') return action;
  const fields = rosterGrowthOf(roster, action.resourceId);
  return fields === null ? action : { ...action, fields };
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

/** コンソールの研究の Lv を、育成状況の研究（tid → Lv）に書いたもの（consoleFromRoster の逆。コンソールに無い tid はそのまま） */
export function recycleRoomWithConsole(
  recycleRoom: Readonly<Record<string, number>>,
  input: ConsoleInput,
): Record<string, number> {
  const next: Record<string, number> = { ...recycleRoom, [RECYCLE_PERSONAL_TID]: input.personal };
  for (const c of CONSOLE_CLASSES) next[RECYCLE_CLASS_TID[c]] = input.class[c];
  for (const c of CONSOLE_CORPORATIONS) {
    const tid = RECYCLE_CORPORATION_TID[c];
    if (tid !== undefined) next[tid] = input.corporation[c];
  }
  return next;
}

/**
 * スロットのうち、育成状況にいるキャラ（only があればそのキャラだけ）に、育成状況の育成を写す。写すスロットが無ければ
 * 元の配列をそのまま返す
 */
function applyToSlots(slots: SlotState[], roster: BuildSnapshot, only?: number): SlotState[] {
  let copied = false;
  const next = slots.map((s) => {
    const entry = only === undefined || s.resourceId === only ? entryOf(roster, s.resourceId) : undefined;
    if (entry === undefined) return s;
    copied = true;
    return { ...s, ...rosterFields(entry) };
  });
  return copied ? next : slots;
}

/**
 * 全部の編成のスロットのうち、育成状況にいるキャラ（only があればそのニケだけ。ニケの育成を編集した・戻したとき）に、
 * 育成状況の育成を写す（スロットで変えた値は上書きする）。写すスロットの無い編成・一覧は、元のものをそのまま返す
 * （どのスロットにもいないニケを編集するたびに、編成を保存し直し、計算の入力を作り直さないため）
 */
export function applyRosterSlots(
  team: TeamState,
  parties: PartiesState,
  roster: BuildSnapshot,
  only?: number,
): { team: TeamState; parties: PartiesState } {
  const slots = applyToSlots(team.slots, roster, only);
  const others = parties.parties.map((p) => {
    if (p === null) return p;
    const copied = applyToSlots(p.slots, roster, only);
    return copied === p.slots ? p : { ...p, slots: copied };
  });
  return {
    team: slots === team.slots ? team : { ...team, slots },
    parties: others.every((p, i) => p === parties.parties[i]) ? parties : { ...parties, parties: others },
  };
}

/** 共通育成の、育成状況から写す値（シンクロ LV・コンソール） */
export type RosterCommonGrowth = Pick<TeamState, 'synchroLevel' | 'console'>;

export function commonGrowthOf(roster: BuildSnapshot): RosterCommonGrowth {
  return { synchroLevel: roster.synchroLevel, console: consoleFromRoster(roster) };
}

/** アカウント全体の値を編集した・戻したときに写す: 共通育成のシンクロ LV とコンソール（片方だけを変えたときも両方） */
export function applyRosterAccount(team: TeamState, roster: BuildSnapshot): TeamState {
  return { ...team, ...commonGrowthOf(roster) };
}

/** 読み込んだときに写す: シンクロ LV・コンソールと、全部の編成のスロットのうち育成状況にいるキャラの育成 */
export function applyRoster(
  team: TeamState,
  parties: PartiesState,
  roster: BuildSnapshot,
): { team: TeamState; parties: PartiesState } {
  return applyRosterSlots(applyRosterAccount(team, roster), parties, roster);
}

/** 写した育成を消したスロットの育成（スロットの既定。キャラはそのまま） */
function defaultFields(): SlotGrowthFields {
  const { growth, build, skillLevels, treasurePhase } = emptySlot();
  return { growth, build, skillLevels, treasurePhase };
}

/**
 * 育成状況を消したときに戻す（読み込んだとき・置いたときに写したものを残さない）: シンクロ LV・コンソールと、
 * 全部の編成のスロットのうち育成状況にいるキャラの育成を既定にする（スロットで変えた値も戻る）。
 * 保存が読めない（roster が null）ときは、写したキャラが分からないのでスロットはそのまま
 */
export function clearRosterFromTeam(
  team: TeamState,
  parties: PartiesState,
  roster: BuildSnapshot | null,
): { team: TeamState; parties: PartiesState } {
  const reset = (slots: SlotState[]) =>
    slots.map((s) => (entryOf(roster, s.resourceId) === undefined ? s : { ...s, ...defaultFields() }));
  return {
    team: { ...team, synchroLevel: DEFAULT_SYNCHRO_LEVEL, console: emptyConsole(), slots: reset(team.slots) },
    parties: {
      ...parties,
      parties: parties.parties.map((p) => (p === null ? null : { ...p, slots: reset(p.slots) })),
    },
  };
}

/** 消すときの確かめの文。edited は、画面で編集した値がある（一緒に消える） */
export function clearConfirmText(slotCount: number, edited = false): string {
  return (
    `育成状況${edited ? '（編集した値も）' : ''}を消し、シンクロ LV・リサイクルルーム` +
    (slotCount > 0 ? `と、育成状況にいるキャラの ${slotCount} スロット（全部の編成）の育成` : '') +
    'を既定に戻します。'
  );
}

/** 「全部を読み込んだ値に戻す」のボタンの名前（アカウントのメニューと編集画面で同じ） */
export const REVERT_ALL_LABEL = '全部を読み込んだ値に戻す';

/**
 * 「全部を読み込んだ値に戻す」の確かめの文。edited は編集したもの（count は編集したニケの数、account はアカウント全体の値を
 * 編集しているか）。編集が読めないとき（何を編集したか分からない）は null
 */
export function revertAllConfirmText(edited: { count: number; account: boolean } | null): string {
  const what =
    edited === null
      ? '保存してある編集'
      : [edited.count > 0 ? `編集した ${edited.count} 体` : null, edited.account ? 'アカウント全体' : null]
          .filter((s) => s !== null)
          .join('と') + 'の値';
  return `${what}を捨てて、読み込んだ値に戻します。スロットの育成と共通育成も、育成状況の値になります。`;
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

/** 書き出すファイルの名前。画面で編集した育成状況（editedAt を持つ）は、取得のままのスナップショットと見分けられるよう -edited を付ける */
export function rosterFileName(roster: BuildSnapshot): string {
  return `nikke-builds-${rosterDate(roster)}${roster.editedAt === undefined ? '' : '-edited'}.json`;
}

/** 読み込んだ後に出す知らせ（無ければ空。読み込んだこと自体は出さない） */
export function importSummary(roster: BuildSnapshot, notices: readonly string[]): string[] {
  const unknown = unknownTreasurePhaseCount(roster);
  return [
    ...notices,
    ...(unknown > 0
      ? [`宝物の段階が未確定（Lv 0）の ${unknown} 体は、宝物なしでスロットへ写す（スロットで選ぶ）`]
      : []),
  ];
}
