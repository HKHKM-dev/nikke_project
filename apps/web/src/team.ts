// 編成の状態と reducer。React に依存しない純関数だけを置き、node 環境の vitest でテストする。
import {
  ELEMENTS,
  MAX_SKILL_LEVELS,
  NIKKE_CLASSES,
  TEAM_SIZE,
  TREASURE_PHASE_MAX,
  emptyBuild,
  enemyEventsOf,
  enemyLandingsOf,
  parseBuildFieldsJson,
  parseSkillLevelsJson,
  presetForEnemy,
  targetProfileForEnemy,
  type BuildInput,
  type CharacterData,
  type CharacterIndexEntry,
  type ConditionMode,
  type Element,
  type EnemyInput,
  type EnemyPresetMaster,
  type GrowthInput,
  type NikkeClass,
  type RecycleRoomInput,
  type SkillLevels,
  type SlotCondition,
  type TreasurePhase,
} from '@nikke/core';

/**
 * 射撃場の敵（防御力 100・コアあり）。画面で選べる敵はこれだけで、属性だけを選ぶ。ボスのプリセットを足すまでは、保存データの
 * 防御力・コアの有無もこの値に戻す（plan/design-ui-rebuild.md 5.2 節）
 */
export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: 100, element: null, hasCore: true };
/** 敵の属性の既定。灼熱（plan/design-ui-rebuild.md 4 節の 1） */
export const DEFAULT_ENEMY_ELEMENT: Element = 'Fire';

/** スロットの育成値。LV は編成共通のシンクロレベル（TeamState.synchroLevel）を使うので持たない */
export type SlotGrowth = Omit<GrowthInput, 'level'>;
/**
 * スロットの育成入力。リサイクルルームは編成共通のコンソールから取り、その他攻撃加算は 0 で計算するので持たない
 * （calcView.ts）
 */
export type SlotBuild = Omit<BuildInput, 'recycleRoom' | 'extraAttack'>;

export const DEFAULT_SLOT_GROWTH: SlotGrowth = { grade: 3, core: 0 };
/** シンクロレベルの既定 */
export const DEFAULT_SYNCHRO_LEVEL = 200;

export function emptySlotBuild(): SlotBuild {
  const { recycleRoom: _recycleRoom, extraAttack: _extraAttack, ...build } = emptyBuild();
  return build;
}
/** Stage 15: hitRate（Stage 18 から「弾丸命中率」と表示。射撃場 = 1）を足した。18-C2 から、条件が手入力の枠でだけ使う */
export const DEFAULT_SLOT_CONDITION: SlotCondition = {
  coreHitRate: 1,
  distanceBonus: true,
  fullCharge: true,
  hitRate: 1,
};
/** スキル Lv の既定値。全部 10 */
export const DEFAULT_SKILL_LEVELS: SkillLevels = MAX_SKILL_LEVELS;
/** 戦闘時間の規定値。レイド・射撃場ともに 180 秒（スペック固定でも変えない） */
export const DEFAULT_DURATION_SECONDS = 180;
/**
 * Stage 18-C2: 条件の決め方の既定。自動 = 射撃場の的の表と着地点の時間割り（plan/design-stage18.md 12.9 節の 5）。
 * 操作キャラの枠も自動（AUTO で撃つ前提）。人が狙う操作は手入力にしてもらう
 */
export const DEFAULT_CONDITION_MODE: ConditionMode = 'auto';
/** Stage 9: 宝物の段階の既定。0 = 宝物なし（ユーザー指定） */
export const DEFAULT_TREASURE_PHASE: TreasurePhase = 0;
/**
 * 2 段目の段 6（plan/design-skill-stage6.md 1.4 節・論点 4）: HP の割合の想定の既定。全員満タン（1）。満タンかどうかで分かれる
 * 効果（「最大の時のみ」）を定義する時に、射撃場の撮影で決め直す
 */
export const DEFAULT_HP_RATIO = 1;

export type SlotState = {
  resourceId: number | null;
  growth: SlotGrowth;
  /** Stage 18-C2: 条件の決め方。自動でも手入力の値（condition）は残し、未測定の項目・的の表の無い敵で使う */
  conditionMode: ConditionMode;
  condition: SlotCondition;
  skillLevels: SkillLevels;
  /** Stage 9: 宝物の段階。キャラを選び直すと 0 に戻る。スペック固定でも上書きしない */
  treasurePhase: TreasurePhase;
  /** Stage 12: 育成入力（装備・キューブ・好感度・コレクション）。growth と同じくキャラを変えても残る */
  build: SlotBuild;
  /**
   * 2 段目の段 6: HP の割合の想定（現在の HP ÷ 最終最大HP。0 より大きく 1 以下）。被弾の時刻は計算に入れず、戦闘中は一定とみなす。
   * 入力欄は HP の割合の条件を持つ効果のある枠にだけ出す（論点 5）。キャラを選び直すと既定（満タン）に戻る
   */
  hpRatio: number;
  /**
   * 2026-10-31: バーストしない（スロットの詳細設定）。バーストのチェーンの候補から外す（core の TeamInput.noBurstSlots。
   * calcView.ts）。既定は使う
   */
  noBurst: boolean;
};

export type TeamState = {
  /** 長さ TEAM_SIZE 固定 */
  slots: SlotState[];
  enemy: EnemyInput;
  durationSeconds: number;
  /** ユニオン射撃場スペック固定（編成共通） */
  fixedSpec: boolean;
  /**
   * Stage 16-B: ON にした敵の出来事のセット（data/enemies.json の eventSets の id）。既定は空（OFF）。
   * 画面は使わず、rangeJump から出来事のセットを決める（calcView.ts）
   */
  enemyEventSets: string[];
  /** 2026-10-31: コンソール（前哨基地のリサイクルルームの研究 Lv）。編成共通で、枠ごとのリサイクルルームの代わりに使う */
  console: ConsoleInput;
  /** 2026-10-31: シンクロレベル。編成共通で、枠ごとの Lv の代わりに使う（キャラの上限で収める） */
  synchroLevel: number;
  /**
   * 2026-10-31: 射撃場 3 分モード（的のジャンプ）を入れるか。既定は ON。詳細設定の欄で切り替え、enemyEventSets の代わりに使う
   * （calcView.ts）
   */
  rangeJump: boolean;
  /**
   * 操作キャラのスロット（0 から。編成ごと）。チャージ武器のフルチャージ倍率がゲージに乗るのは操作キャラだけ（core の TeamInput.controlledSlot）。
   * モダン UI のカードの操作の印をドラッグして別のスロットへ移す。スロットどうしの入れ替えでは動かない（位置に残る）
   */
  controlledSlot: number;
};

/** コンソールの企業研究の企業（data/masters/recycleRoom.json の corporation と同じ） */
export const CONSOLE_CORPORATIONS = ['ELYSION', 'MISSILIS', 'TETRA', 'PILGRIM', 'ABNORMAL'] as const;
export type ConsoleCorporation = (typeof CONSOLE_CORPORATIONS)[number];
/** 企業の名前（コンソールの企業研究・ニケ一覧の企業の絞り込み） */
export const CORPORATION_LABEL: Record<ConsoleCorporation, string> = {
  ELYSION: 'エリシオン',
  MISSILIS: 'ミシリス',
  TETRA: 'テトラ',
  PILGRIM: 'ピルグリム',
  ABNORMAL: 'アブノーマル',
};
export const CONSOLE_CLASSES: readonly NikkeClass[] = NIKKE_CLASSES;

/** コンソール: 共通研究・クラス研究・企業研究の Lv */
export type ConsoleInput = {
  personal: number;
  class: Record<NikkeClass, number>;
  corporation: Record<ConsoleCorporation, number>;
};

export function emptyConsole(): ConsoleInput {
  return {
    personal: 0,
    class: Object.fromEntries(CONSOLE_CLASSES.map((c) => [c, 0])) as Record<NikkeClass, number>,
    corporation: Object.fromEntries(CONSOLE_CORPORATIONS.map((c) => [c, 0])) as Record<ConsoleCorporation, number>,
  };
}

/** キャラのクラスと企業から、コンソールのうちそのキャラに効く研究 Lv を枠のリサイクルルームの形にする */
export function recycleRoomFromConsole(
  input: ConsoleInput,
  character: Pick<CharacterData, 'class' | 'corporation'>,
): RecycleRoomInput {
  return {
    personal: input.personal,
    class: input.class[character.class],
    corporation: (input.corporation as Record<string, number>)[character.corporation] ?? 0,
  };
}

/** コンソールどうしが同じか（共通育成の「育成状況の値に戻す」を押せるか） */
export function sameConsole(a: ConsoleInput, b: ConsoleInput): boolean {
  return (
    a.personal === b.personal &&
    CONSOLE_CLASSES.every((c) => a.class[c] === b.class[c]) &&
    CONSOLE_CORPORATIONS.every((c) => a.corporation[c] === b.corporation[c])
  );
}

/** スロットの育成（育成の欄が出す値。育成状況（roster.ts）からスロットへ写す育成もこの形） */
export type SlotGrowthFields = Pick<SlotState, 'growth' | 'build' | 'skillLevels' | 'treasurePhase'>;

export type TeamAction =
  /** fields: 育成状況（roster.ts）にいるキャラの育成。別のニケに変えたときだけ写す */
  | { type: 'selectCharacter'; index: number; resourceId: number; fields?: SlotGrowthFields }
  | { type: 'swapSlots'; fromIndex: number; toIndex: number }
  | { type: 'setControlledSlot'; index: number }
  | { type: 'clearSlot'; index: number }
  | { type: 'setGrowth'; index: number; growth: SlotGrowth }
  | { type: 'setSlotCondition'; index: number; condition: SlotCondition }
  | { type: 'setConditionMode'; index: number; conditionMode: ConditionMode }
  | { type: 'setSkillLevels'; index: number; skillLevels: SkillLevels }
  | { type: 'setTreasurePhase'; index: number; treasurePhase: TreasurePhase }
  | { type: 'setBuild'; index: number; build: SlotBuild }
  | { type: 'setHpRatio'; index: number; hpRatio: number }
  | { type: 'setNoBurst'; index: number; noBurst: boolean }
  | { type: 'setEnemy'; enemy: EnemyInput }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setFixedSpec'; fixedSpec: boolean }
  | { type: 'setEnemyEventSets'; enemyEventSets: string[] }
  | { type: 'setConsole'; console: ConsoleInput }
  | { type: 'setSynchroLevel'; synchroLevel: number }
  | { type: 'setRangeJump'; rangeJump: boolean }
  | { type: 'replace'; state: TeamState };

/**
 * 育成の欄の変更（スロットの育成の一部。components/GrowthEditor.tsx）を、スロット index の操作にする。全部の項目を渡せば、
 * スロットの育成をまとめて置き換える（「育成状況の値に戻す」）
 */
export function growthFieldsActions(index: number, fields: Partial<SlotGrowthFields>): TeamAction[] {
  const { treasurePhase, growth, build, skillLevels } = fields;
  return [
    ...(treasurePhase === undefined ? [] : [{ type: 'setTreasurePhase' as const, index, treasurePhase }]),
    ...(growth === undefined ? [] : [{ type: 'setGrowth' as const, index, growth }]),
    ...(build === undefined ? [] : [{ type: 'setBuild' as const, index, build }]),
    ...(skillLevels === undefined ? [] : [{ type: 'setSkillLevels' as const, index, skillLevels }]),
  ];
}

export function emptySlot(): SlotState {
  return {
    resourceId: null,
    growth: { ...DEFAULT_SLOT_GROWTH },
    conditionMode: DEFAULT_CONDITION_MODE,
    condition: { ...DEFAULT_SLOT_CONDITION },
    skillLevels: { ...DEFAULT_SKILL_LEVELS },
    treasurePhase: DEFAULT_TREASURE_PHASE,
    build: emptySlotBuild(),
    hpRatio: DEFAULT_HP_RATIO,
    noBurst: false,
  };
}

/** 操作キャラのスロットの既定（スロット 3） */
export const DEFAULT_CONTROLLED_SLOT = 2;

export function initialTeamState(): TeamState {
  return {
    slots: Array.from({ length: TEAM_SIZE }, emptySlot),
    enemy: { ...SHOOTING_RANGE_ENEMY, element: DEFAULT_ENEMY_ELEMENT },
    durationSeconds: DEFAULT_DURATION_SECONDS,
    fixedSpec: false,
    enemyEventSets: [],
    console: emptyConsole(),
    synchroLevel: DEFAULT_SYNCHRO_LEVEL,
    rangeJump: true,
    controlledSlot: DEFAULT_CONTROLLED_SLOT,
  };
}

export const INITIAL_TEAM_STATE: TeamState = initialTeamState();

function updateSlot(state: TeamState, index: number, patch: (slot: SlotState) => SlotState): TeamState {
  const slot = state.slots[index];
  if (slot === undefined) return state;
  const slots = state.slots.slice();
  slots[index] = patch(slot);
  return { ...state, slots };
}

export function teamReducer(state: TeamState, action: TeamAction): TeamState {
  switch (action.type) {
    case 'selectCharacter': {
      // 同じニケは 1 枠まで。他の枠にいれば何もしない（UI 側でも選択肢から除外している）
      if (state.slots.some((s, i) => i !== action.index && s.resourceId === action.resourceId)) return state;
      // 宝物の段階と HP の割合の想定はキャラごとのものなので、別のニケに変えたら既定に戻す
      return updateSlot(state, action.index, (s) =>
        s.resourceId === action.resourceId
          ? s
          : {
              ...s,
              resourceId: action.resourceId,
              treasurePhase: DEFAULT_TREASURE_PHASE,
              hpRatio: DEFAULT_HP_RATIO,
              ...action.fields,
            },
      );
    }
    case 'clearSlot':
      return updateSlot(state, action.index, (s) => ({
        ...s,
        resourceId: null,
        treasurePhase: DEFAULT_TREASURE_PHASE,
        hpRatio: DEFAULT_HP_RATIO,
      }));
    case 'swapSlots': {
      if (action.fromIndex === action.toIndex) return state;
      if (
        action.fromIndex < 0 ||
        action.fromIndex >= state.slots.length ||
        action.toIndex < 0 ||
        action.toIndex >= state.slots.length
      )
        return state;
      const slots = [...state.slots];
      const tmp = slots[action.fromIndex]!;
      slots[action.fromIndex] = slots[action.toIndex]!;
      slots[action.toIndex] = tmp;
      return { ...state, slots };
    }
    case 'setControlledSlot':
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.slots.length) return state;
      return action.index === state.controlledSlot ? state : { ...state, controlledSlot: action.index };
    case 'setGrowth':
      return updateSlot(state, action.index, (s) => ({ ...s, growth: action.growth }));
    case 'setSlotCondition':
      return updateSlot(state, action.index, (s) => ({ ...s, condition: action.condition }));
    case 'setConditionMode':
      return updateSlot(state, action.index, (s) => ({ ...s, conditionMode: action.conditionMode }));
    case 'setSkillLevels':
      return updateSlot(state, action.index, (s) => ({ ...s, skillLevels: action.skillLevels }));
    case 'setTreasurePhase':
      return updateSlot(state, action.index, (s) => ({ ...s, treasurePhase: action.treasurePhase }));
    case 'setBuild':
      return updateSlot(state, action.index, (s) => ({ ...s, build: action.build }));
    case 'setHpRatio':
      return updateSlot(state, action.index, (s) => ({ ...s, hpRatio: action.hpRatio }));
    case 'setNoBurst':
      return updateSlot(state, action.index, (s) => ({ ...s, noBurst: action.noBurst }));
    case 'setEnemy':
      return { ...state, enemy: action.enemy };
    case 'setDuration':
      return { ...state, durationSeconds: action.durationSeconds };
    case 'setFixedSpec':
      return { ...state, fixedSpec: action.fixedSpec };
    case 'setEnemyEventSets':
      return { ...state, enemyEventSets: action.enemyEventSets };
    case 'setConsole':
      return { ...state, console: action.console };
    case 'setSynchroLevel':
      return { ...state, synchroLevel: action.synchroLevel };
    case 'setRangeJump':
      return { ...state, rangeJump: action.rangeJump };
    case 'replace':
      return action.state;
  }
}

/**
 * ニケを枠に置く操作（モダン UI のトレイからのドラッグ・クリック。plan/design-modern-ui.md）。同じニケは 1 枠までなので、
 * どこかの枠にいれば何もしない（null）。スロットどうしの入れ替えは、スロットのドラッグ（swapSlots）でする
 * （plan/design-ui-rebuild.md 5.2 節）
 */
export function placeCharacterAction(state: TeamState, resourceId: number, index: number): TeamAction | null {
  if (state.slots.some((s) => s.resourceId === resourceId)) return null;
  return { type: 'selectCharacter', index, resourceId };
}

/** 他の枠で選択中のニケ（index の枠自身は除く） */
export function takenResourceIds(state: TeamState, index: number): Set<number> {
  const ids = new Set<number>();
  state.slots.forEach((s, i) => {
    if (i !== index && s.resourceId !== null) ids.add(s.resourceId);
  });
  return ids;
}

/**
 * Stage 16-B: 計算に渡す敵。ON にした出来事のセットのうち、敵にあたるプリセット（core の presetForEnemy。2026-10-31 から属性なしの
 * 射撃場の的も射撃場のプリセット）が持つものだけを戦闘時間ぶん展開して足す。ほかの敵・プリセットの読み込み前は出来事なし
 */
export function enemyWithEvents(
  enemy: EnemyInput,
  master: EnemyPresetMaster | null,
  setIds: readonly string[],
  durationSeconds: number,
): EnemyInput {
  if (master === null || setIds.length === 0) return enemy;
  const preset = presetForEnemy(master.enemies, enemy);
  const ids = setIds.filter((id) => preset?.eventSets.includes(id) ?? false);
  if (ids.length === 0) return enemy;
  return { ...enemy, events: enemyEventsOf(master, ids, durationSeconds) };
}

/**
 * Stage 18-C2: 計算に渡す敵。出来事（enemyWithEvents）に、的の条件の表と着地点の時間割りを足す。表があるのは射撃場のプリセットと
 * 一致する敵と、属性なしの射撃場の的（既定の敵）。3 分モードが OFF なら全体を初期位置（中近）にする。表が無い敵はそのまま
 * （自動の枠も手入力の値で計算し、注記が出る）。条件が手入力の枠には、表を付けても何も変わらない
 */
export function enemyForCalc(
  enemy: EnemyInput,
  master: EnemyPresetMaster | null,
  setIds: readonly string[],
  durationSeconds: number,
): EnemyInput {
  const withEvents = enemyWithEvents(enemy, master, setIds, durationSeconds);
  if (master === null) return withEvents;
  const target = targetProfileForEnemy(master, enemy);
  if (target === undefined) return withEvents;
  const preset = presetForEnemy(master.enemies, enemy);
  const active = setIds.filter((id) => preset?.eventSets.includes(id) ?? false);
  return { ...withEvents, target, landings: enemyLandingsOf(master, active, durationSeconds, target) };
}

/** min..max の整数に丸める（数でなければ min）。入力欄の打ちかけの値は intDraft.ts が持つ */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ---- 永続化 ----

/** localStorage のキー */
export const STORAGE_KEY = 'nikke-calc.team.v1';

/**
 * 編成の保存形式の版。版 3 で、画面から消した項目（バースト・操作キャラ・撃たない・スロットごとの LV・リサイクルルーム・
 * その他攻撃加算）を書かなくした。版 1・2 の保存データのそれらは読み捨てる。版 4 で操作キャラ（controlledSlot）を戻した
 * （版 3 までの保存データは既定のスロット 3）。版のない旧形式（Stage 3〜13）は読まない
 */
export const TEAM_FORMAT_VERSION = 4;

export function serializeTeamState(state: TeamState): string {
  return JSON.stringify({ formatVersion: TEAM_FORMAT_VERSION, ...state });
}

/** 読めた版。版のないもの・未知の版・形が合わないものは null。保存した編成の一覧（parties.ts）も同じ版を使う */
function formatVersionOf(raw: Record<string, unknown>): number | null {
  const v = raw.formatVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= TEAM_FORMAT_VERSION ? v : null;
}

type Json = unknown;

export function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isFinite_(v: Json): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isInt(v: Json, min: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min;
}
function isBool(v: Json): v is boolean {
  return typeof v === 'boolean';
}

/** 版 2 までの保存データの level は読み捨てる */
function parseGrowth(v: Json): SlotGrowth | null {
  if (!isRecord(v) || !isInt(v.grade, 0) || !isInt(v.core, 0)) return null;
  return { grade: v.grade, core: v.core };
}

/**
 * Stage 18-C2: 条件の決め方。版 2 から保存する。欠落（版 1）は、条件が既定のまま（コア命中率 1・距離ボーナスあり・弾丸命中率 1 か欠落）
 * なら自動に読み替え、それ以外は手入力として残す（Stage 17 の 8 節の 5・plan/design-stage18.md 12.9 節の 5）
 */
function parseConditionMode(v: Json, condition: SlotCondition): ConditionMode | null {
  if (v === 'auto' || v === 'manual') return v;
  if (v !== undefined) return null;
  const untouched =
    condition.coreHitRate === 1 &&
    condition.distanceBonus &&
    (condition.hitRate === undefined || condition.hitRate === 1);
  return untouched ? 'auto' : 'manual';
}

function parseCondition(v: Json): SlotCondition | null {
  if (!isRecord(v)) return null;
  if (!isFinite_(v.coreHitRate) || v.coreHitRate < 0 || v.coreHitRate > 1) return null;
  if (!isBool(v.distanceBonus) || !isBool(v.fullCharge)) return null;
  const condition: SlotCondition = {
    coreHitRate: v.coreHitRate,
    distanceBonus: v.distanceBonus,
    fullCharge: v.fullCharge,
  };
  // Stage 15: 弾丸命中率。Stage 14 までの保存データには無い。欠落は欠落のまま読む（計算では 1 = 射撃場）
  if (v.hitRate !== undefined) {
    if (!isFinite_(v.hitRate) || v.hitRate < 0 || v.hitRate > 1) return null;
    condition.hitRate = v.hitRate;
  }
  return condition;
}

/** 0..3 の整数だけ許す */
function parseTreasurePhase(v: Json): TreasurePhase | null {
  if (!isInt(v, 0) || v > TREASURE_PHASE_MAX) return null;
  return v as TreasurePhase;
}

/** 2 段目の段 6: HP の割合の想定。段 6 までの保存データには無いので、欠落は既定（満タン）。0 より大きく 1 以下 */
function parseHpRatio(v: Json): number | null {
  if (v === undefined) return DEFAULT_HP_RATIO;
  if (!isFinite_(v) || v <= 0 || v > 1) return null;
  return v;
}

/** 属性だけを読み、防御力とコアの有無は射撃場の敵に戻す（SHOOTING_RANGE_ENEMY） */
function parseEnemy(v: Json): EnemyInput | null {
  if (!isRecord(v)) return null;
  const element = v.element;
  if (element !== null && !(ELEMENTS as readonly string[]).includes(String(element))) return null;
  return { ...SHOOTING_RANGE_ENEMY, element: element === null ? null : (element as Element) };
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * 版つきの JSON（編成・保存した編成の一覧）の前置き: JSON として読め、オブジェクトで、読める版か。what は理由の文の名前
 * （「編成」「編成の一覧」）
 */
export function readVersionedJson(json: string, what: string): ReadResult<Record<string, Json>> {
  let raw: Json;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (!isRecord(raw)) return { ok: false, error: `${what}の JSON ではありません` };
  if (formatVersionOf(raw) === null) {
    return { ok: false, error: `この版の${what}は読めません（formatVersion ${String(raw.formatVersion)}）` };
  }
  return { ok: true, value: raw };
}

/** 編成の中身の形が合わないときの理由（保存した編成の一覧の 1 つの編成にも使う。parties.ts） */
export const TEAM_SHAPE_ERROR = '編成の JSON の形が合いません（範囲外の値・未知のニケ・同じニケが 2 スロットなど）';

/**
 * Stage 14: 編成の JSON（localStorage・書き出したファイル・貼り付け）を検証して復元する。失敗の理由を返す（取り込み欄に出す）。
 * 未知の formatVersion（新しい版で書き出したもの）・形が合わない・index に存在しないニケ・同じニケが 2 枠は失敗
 */
export function readTeamJson(json: string, index: readonly CharacterIndexEntry[]): ReadResult<TeamState> {
  const raw = readVersionedJson(json, '編成');
  if (!raw.ok) return raw;
  const state = parseTeamFields(raw.value, index);
  return state === null ? { ok: false, error: TEAM_SHAPE_ERROR } : { ok: true, value: state };
}

/** JSON.parse した値を編成として検証する（readTeamJson の中身。版は見ない）。形が合わなければ null */
export function parseTeamObject(raw: Json, index: readonly CharacterIndexEntry[]): TeamState | null {
  return isRecord(raw) ? parseTeamFields(raw, index) : null;
}

function parseTeamFields(raw: Record<string, Json>, index: readonly CharacterIndexEntry[]): TeamState | null {
  if (!Array.isArray(raw.slots) || raw.slots.length !== TEAM_SIZE) return null;

  const known = new Set(index.map((e) => e.resourceId));
  const seen = new Set<number>();
  const slots: SlotState[] = [];
  for (const s of raw.slots) {
    if (!isRecord(s)) return null;
    const id = s.resourceId;
    if (id !== null) {
      if (!isInt(id, 0) || !known.has(id) || seen.has(id)) return null;
      seen.add(id);
    }
    const growth = parseGrowth(s.growth);
    const condition = parseCondition(s.condition);
    const conditionMode = condition === null ? null : parseConditionMode(s.conditionMode, condition);
    // スキル Lv と育成は範囲だけ見る（マスタとの照合は計算時。core の buildJson.ts）。版 2 までの保存データのリサイクルルームと
    // その他攻撃加算は読み捨てる
    const skillLevels = parseSkillLevelsJson(s.skillLevels, 'skillLevels', []);
    const treasurePhase = parseTreasurePhase(s.treasurePhase);
    const build = parseBuildFieldsJson(s.build, 'build', []);
    const hpRatio = parseHpRatio(s.hpRatio);
    // 2026-10-31 までの保存データには無いので、欠落は使う
    if (s.noBurst !== undefined && !isBool(s.noBurst)) return null;
    if (
      growth === null ||
      condition === null ||
      conditionMode === null ||
      skillLevels === null ||
      treasurePhase === null ||
      build === null ||
      hpRatio === null
    ) {
      return null;
    }
    slots.push({
      resourceId: id,
      growth,
      conditionMode,
      condition,
      skillLevels,
      treasurePhase,
      build,
      hpRatio,
      noBurst: s.noBurst === true,
    });
  }

  const enemy = parseEnemy(raw.enemy);
  if (enemy === null) return null;
  if (!isFinite_(raw.durationSeconds) || raw.durationSeconds < 0) return null;
  if (!isBool(raw.fixedSpec)) return null;
  // Stage 16-B までの保存データには無いので、欠落は空（OFF）
  const eventSets = raw.enemyEventSets;
  if (eventSets !== undefined && !(Array.isArray(eventSets) && eventSets.every((id) => typeof id === 'string'))) {
    return null;
  }

  // 2026-10-31 までの保存データには無いので、欠落は全部 0
  const consoleInput = raw.console === undefined ? emptyConsole() : parseConsole(raw.console);
  if (consoleInput === null) return null;
  // 2026-10-31 までの保存データには無いので、欠落は既定（LV200）
  if (raw.synchroLevel !== undefined && !isInt(raw.synchroLevel, 1)) return null;
  // 2026-10-31 までの保存データには無いので、欠落は既定（ON）
  if (raw.rangeJump !== undefined && !isBool(raw.rangeJump)) return null;
  // 操作キャラは版 4 から読む（版 1・2 の値は、画面で選べなかった頃のものなので読み捨てる）。欠落は既定
  const readsControlled = typeof raw.formatVersion === 'number' && raw.formatVersion >= 4;
  const controlled = readsControlled ? raw.controlledSlot : undefined;
  if (controlled !== undefined && !(isInt(controlled, 0) && controlled < TEAM_SIZE)) return null;

  return {
    slots,
    enemy,
    durationSeconds: raw.durationSeconds,
    fixedSpec: raw.fixedSpec,
    enemyEventSets: eventSets === undefined ? [] : (eventSets as string[]),
    console: consoleInput,
    synchroLevel: raw.synchroLevel === undefined ? DEFAULT_SYNCHRO_LEVEL : raw.synchroLevel,
    rangeJump: raw.rangeJump === undefined ? true : raw.rangeJump,
    controlledSlot: controlled === undefined ? DEFAULT_CONTROLLED_SLOT : controlled,
  };
}

/**
 * コンソールの保存データ。クラス・企業の欠けたキーは 0（クラスや企業を足したときに、前の保存データを読めなくして初期値で
 * 上書きしない）。ある値が 0 以上の整数でなければ読まない
 */
function parseConsole(v: Json): ConsoleInput | null {
  if (!isRecord(v) || !isInt(v.personal, 0) || !isRecord(v.class) || !isRecord(v.corporation)) return null;
  const result = emptyConsole();
  result.personal = v.personal;
  for (const c of CONSOLE_CLASSES) {
    const lv = v.class[c];
    if (lv === undefined) continue;
    if (!isInt(lv, 0)) return null;
    result.class[c] = lv;
  }
  for (const c of CONSOLE_CORPORATIONS) {
    const lv = v.corporation[c];
    if (lv === undefined) continue;
    if (!isInt(lv, 0)) return null;
    result.corporation[c] = lv;
  }
  return result;
}
