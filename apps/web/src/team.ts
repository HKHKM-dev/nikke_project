// 編成の状態と reducer。React に依存しない純関数だけを置き、node 環境の vitest でテストする。
import {
  AFFECTION_RANK_MAX,
  AFFECTION_RANK_MIN,
  COLLECTION_LEVEL_MAX,
  CUBE_LEVEL_MAX,
  CUBE_LEVEL_MIN,
  ELEMENTS,
  FIXED_SPEC_ENEMY_DEFENCE,
  GEAR_LEVEL_MAX,
  GEAR_PARTS,
  GEAR_TYPES,
  MAX_SKILL_LEVELS,
  OVERLOAD_LEVEL_MAX,
  OVERLOAD_LEVEL_MIN,
  OVERLOAD_LINE_MAX,
  OVERLOAD_OPTIONS,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  TEAM_SIZE,
  TREASURE_PHASE_MAX,
  EMPTY_BUILD,
  affectionRankMax,
  emptyBuild,
  enemyEventsOf,
  enemyLandingsOf,
  fixedSpecBuild,
  presetForEnemy,
  targetProfileForEnemy,
  type BuildInput,
  type CharacterData,
  type CharacterIndexEntry,
  type ConditionMode,
  type Element,
  type EnemyInput,
  type EnemyPresetMaster,
  type GearInput,
  type GearType,
  type GrowthInput,
  type NikkeClass,
  type RecycleRoomInput,
  type OverloadLine,
  type OverloadOption,
  type SkillLevels,
  type SlotCondition,
  type TreasurePhase,
} from '@nikke/core';

export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: 100, element: null, hasCore: true };
export const DEFAULT_GROWTH: GrowthInput = { level: 200, grade: 3, core: 0 };
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
/** バーストの既定。ON */
export const DEFAULT_BURST = true;
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
  growth: GrowthInput;
  /** Stage 18-C2: 条件の決め方。自動でも手入力の値（condition）は残し、未測定の項目・的の表の無い敵で使う */
  conditionMode: ConditionMode;
  condition: SlotCondition;
  skillLevels: SkillLevels;
  /** Stage 9: 宝物の段階。キャラを選び直すと 0 に戻る。スペック固定でも上書きしない */
  treasurePhase: TreasurePhase;
  /** Stage 12: 育成入力（装備・キューブ・好感度・コレクション・リサイクルルーム・その他）。growth と同じくキャラを変えても残る */
  build: BuildInput;
  /**
   * 2 段目の段 6: HP の割合の想定（現在の HP ÷ 最終最大HP。0 より大きく 1 以下）。被弾の時刻は計算に入れず、戦闘中は一定とみなす。
   * 入力欄は HP の割合の条件を持つ効果のある枠にだけ出す（論点 5）。キャラを選び直すと既定（満タン）に戻る
   */
  hpRatio: number;
};

export type TeamState = {
  /** 長さ TEAM_SIZE 固定 */
  slots: SlotState[];
  enemy: EnemyInput;
  durationSeconds: number;
  /** ユニオン射撃場スペック固定（編成共通） */
  fixedSpec: boolean;
  /** バーストを回すか（Stage 5 で固定 20 秒サイクル、Stage 7 からゲージ・CT の動的サイクル） */
  burst: boolean;
  /** 操作キャラの枠（Stage 7）。チャージ武器のフルチャージ倍率がゲージに乗るのは操作キャラだけ */
  controlledSlot: number;
  /**
   * Stage 16-B: ON にした敵の出来事のセット（data/enemies.json の eventSets の id）。既定は空（OFF）。
   * 効くのは、敵の値がそのセットを持つプリセットと一致しているときだけ（App.tsx の enemyWithEvents）
   */
  enemyEventSets: string[];
  /** 2026-10-31: コンソール（前哨基地のリサイクルルームの研究 Lv）。編成共通で、枠ごとのリサイクルルームの代わりに使う */
  console: ConsoleInput;
  /** 2026-10-31: シンクロレベル。編成共通で、枠ごとの Lv の代わりに使う（キャラの上限で収める） */
  synchroLevel: number;
  /**
   * 2026-10-31: 射撃場 3 分モード（的のジャンプ）を入れるか。既定は ON。詳細設定の欄で切り替え、enemyEventSets の代わりに使う
   * （eventSetsForCalc）
   */
  rangeJump: boolean;
};

/** コンソールの企業研究の企業（data/masters/recycleRoom.json の corporation と同じ） */
export const CONSOLE_CORPORATIONS = ['ELYSION', 'MISSILIS', 'TETRA', 'PILGRIM', 'ABNORMAL'] as const;
export type ConsoleCorporation = (typeof CONSOLE_CORPORATIONS)[number];
export const CONSOLE_CLASSES: readonly NikkeClass[] = ['Attacker', 'Defender', 'Supporter'];

/** コンソール: 共通研究・クラス研究・企業研究の Lv */
export type ConsoleInput = {
  personal: number;
  class: Record<NikkeClass, number>;
  corporation: Record<ConsoleCorporation, number>;
};

export function emptyConsole(): ConsoleInput {
  return {
    personal: 0,
    class: { Attacker: 0, Defender: 0, Supporter: 0 },
    corporation: { ELYSION: 0, MISSILIS: 0, TETRA: 0, PILGRIM: 0, ABNORMAL: 0 },
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

export type TeamAction =
  | { type: 'selectCharacter'; index: number; resourceId: number }
  | { type: 'clearSlot'; index: number }
  | { type: 'setGrowth'; index: number; growth: GrowthInput }
  | { type: 'setSlotCondition'; index: number; condition: SlotCondition }
  | { type: 'setConditionMode'; index: number; conditionMode: ConditionMode }
  | { type: 'setSkillLevels'; index: number; skillLevels: SkillLevels }
  | { type: 'setTreasurePhase'; index: number; treasurePhase: TreasurePhase }
  | { type: 'setBuild'; index: number; build: BuildInput }
  | { type: 'setHpRatio'; index: number; hpRatio: number }
  | { type: 'setEnemy'; enemy: EnemyInput }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setFixedSpec'; fixedSpec: boolean }
  | { type: 'setBurst'; burst: boolean }
  | { type: 'setControlledSlot'; controlledSlot: number }
  | { type: 'setEnemyEventSets'; enemyEventSets: string[] }
  | { type: 'setConsole'; console: ConsoleInput }
  | { type: 'setSynchroLevel'; synchroLevel: number }
  | { type: 'setRangeJump'; rangeJump: boolean }
  | { type: 'replace'; state: TeamState };

export function emptySlot(): SlotState {
  return {
    resourceId: null,
    growth: { ...DEFAULT_GROWTH },
    conditionMode: DEFAULT_CONDITION_MODE,
    condition: { ...DEFAULT_SLOT_CONDITION },
    skillLevels: { ...DEFAULT_SKILL_LEVELS },
    treasurePhase: DEFAULT_TREASURE_PHASE,
    build: emptyBuild(),
    hpRatio: DEFAULT_HP_RATIO,
  };
}

/** 操作キャラの既定の枠（枠 3） */
export const DEFAULT_CONTROLLED_SLOT = 2;

export function initialTeamState(): TeamState {
  return {
    slots: Array.from({ length: TEAM_SIZE }, emptySlot),
    enemy: { ...SHOOTING_RANGE_ENEMY },
    durationSeconds: DEFAULT_DURATION_SECONDS,
    fixedSpec: false,
    burst: DEFAULT_BURST,
    controlledSlot: DEFAULT_CONTROLLED_SLOT,
    enemyEventSets: [],
    console: emptyConsole(),
    synchroLevel: DEFAULT_GROWTH.level,
    rangeJump: true,
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
    case 'setEnemy':
      return { ...state, enemy: action.enemy };
    case 'setDuration':
      return { ...state, durationSeconds: action.durationSeconds };
    case 'setFixedSpec':
      // ON で敵防御を射撃場の値に切り替える（戦闘時間は変えない）。OFF では戻さない
      return action.fixedSpec
        ? { ...state, fixedSpec: true, enemy: { ...state.enemy, defence: FIXED_SPEC_ENEMY_DEFENCE } }
        : { ...state, fixedSpec: false };
    case 'setBurst':
      return { ...state, burst: action.burst };
    case 'setControlledSlot':
      return { ...state, controlledSlot: action.controlledSlot };
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

/** 計算に渡すスキル Lv。スペック固定は全スキル Lv10 */
export function effectiveSkillLevels(slot: SlotState, fixedSpec: boolean): SkillLevels {
  return fixedSpec ? MAX_SKILL_LEVELS : slot.skillLevels;
}

/**
 * Stage 9: 計算に渡す宝物の段階。宝物のないキャラは 0（保存データが古い・データ更新で宝物が消えた場合に備える）。
 * スペック固定でも上書きしない（所持状況がそのまま反映される）
 */
export function effectiveTreasurePhase(slot: SlotState, character: CharacterData): TreasurePhase {
  return character.treasure === null ? 0 : slot.treasurePhase;
}

/** Stage 12: 計算に渡す育成入力。スペック固定は T9 Lv5 × 4 と好感度 rank30/40/10 のプリセット（保存している入力は残す） */
export function effectiveBuild(
  slot: SlotState,
  fixedSpec: boolean,
  character: CharacterData,
  consoleInput: ConsoleInput,
): BuildInput {
  if (fixedSpec) return fixedSpecBuild(character);
  // 好感度はキャラごとの上限（affectionRankMax）に収める。上限より上の保存データも上限で計算する。
  // リサイクルルームは枠ごとの保存データを使わず、編成共通のコンソールから取る
  return {
    ...slot.build,
    affectionRank: Math.min(slot.build.affectionRank, affectionRankMax(character)),
    recycleRoom: recycleRoomFromConsole(consoleInput, character),
  };
}

/**
 * 2026-10-31: オーナーの指示で画面から消した入力を既定値にした編成。保存データの値は消さずに残すが、計算と画面の値には使わない
 * （欄が無いので直せないため）。計算と画面はこの編成を読む
 * - 枠: 射撃条件・想定 HP・リサイクルルーム・その他攻撃加算。Lv は編成共通のシンクロレベル
 * - 編成: 敵（射撃場の的にし、属性だけ残す）。戦闘時間・バースト・操作キャラは詳細設定の欄で戻したので、保存データの値を使う。
 *   3 分モードの出来事のセットは eventSetsForCalc
 */
export function teamStateForCalc(state: TeamState): TeamState {
  return {
    ...state,
    slots: state.slots.map((slot) => ({
      ...slot,
      growth: { ...slot.growth, level: state.synchroLevel },
      conditionMode: DEFAULT_CONDITION_MODE,
      condition: { ...DEFAULT_SLOT_CONDITION },
      hpRatio: DEFAULT_HP_RATIO,
      build: { ...slot.build, recycleRoom: { ...EMPTY_BUILD.recycleRoom }, extraAttack: EMPTY_BUILD.extraAttack },
    })),
    enemy: { ...SHOOTING_RANGE_ENEMY, element: state.enemy.element },
  };
}

/**
 * 2026-10-31: 3 分モード（的のジャンプ）は、詳細設定の欄（rangeJump）が ON なら射撃場の的の出来事のセットを入れる
 * （保存データの enemyEventSets は使わない）
 */
export function eventSetsForCalc(master: EnemyPresetMaster | null, rangeJump: boolean): string[] {
  if (master === null || !rangeJump) return [];
  return [...new Set(master.enemies.filter((p) => p.content === 'range').flatMap((p) => p.eventSets))];
}

/** 1..10 の整数に clamp する（入力欄の途中状態を吸収する） */
export function clampSkillLevel(level: number): number {
  if (!Number.isFinite(level)) return SKILL_LEVEL_MIN;
  return Math.min(SKILL_LEVEL_MAX, Math.max(SKILL_LEVEL_MIN, Math.round(level)));
}

// ---- 永続化 ----

/** localStorage のキー。Stage 14 で formatVersion を付けたが、版のない旧形式もこのキーのまま読む */
export const STORAGE_KEY = 'nikke-calc.team.v1';

/**
 * Stage 14: 編成の保存形式の版。localStorage と「編成の JSON」の書き出しで共通。
 * 版のない JSON（Stage 3〜13 の保存データ）は版 0 として読み、欠落した項目を既定値で埋める（各 parse* の欠落互換）
 */
export const TEAM_FORMAT_VERSION = 2;

export function serializeTeamState(state: TeamState): string {
  return JSON.stringify({ formatVersion: TEAM_FORMAT_VERSION, ...state });
}

/** 読めた版（版のない旧形式は 0）。未知の版・形が合わないものは null */
function formatVersionOf(raw: Record<string, unknown>): number | null {
  const v = raw.formatVersion;
  if (v === undefined) return 0;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= TEAM_FORMAT_VERSION ? v : null;
}

type Json = unknown;

function isRecord(v: Json): v is Record<string, Json> {
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

function parseGrowth(v: Json): GrowthInput | null {
  if (!isRecord(v) || !isInt(v.level, 1) || !isInt(v.grade, 0) || !isInt(v.core, 0)) return null;
  return { level: v.level, grade: v.grade, core: v.core };
}

/**
 * Stage 18-C2: 条件の決め方。版 2 から保存する。欠落（版 0・1）は、条件が既定のまま（コア命中率 1・距離ボーナスあり・弾丸命中率 1 か欠落）
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

/** Stage 3 の保存データには無いので、欠落は既定値（全部 10）。あれば 1..10 の整数だけ許す */
function parseSkillLevels(v: Json): SkillLevels | null {
  if (v === undefined) return { ...DEFAULT_SKILL_LEVELS };
  if (!isRecord(v)) return null;
  const levels = {} as SkillLevels;
  for (const slot of SKILL_SLOTS) {
    const level = v[slot];
    if (!isInt(level, SKILL_LEVEL_MIN) || level > SKILL_LEVEL_MAX) return null;
    levels[slot] = level;
  }
  return levels;
}

/** Stage 8 までの保存データには無いので、欠落は 0。あれば 0..3 の整数だけ許す */
function parseTreasurePhase(v: Json): TreasurePhase | null {
  if (v === undefined) return DEFAULT_TREASURE_PHASE;
  if (!isInt(v, 0) || v > TREASURE_PHASE_MAX) return null;
  return v as TreasurePhase;
}

/** 2 段目の段 6: HP の割合の想定。段 6 までの保存データには無いので、欠落は既定（満タン）。0 より大きく 1 以下 */
function parseHpRatio(v: Json): number | null {
  if (v === undefined) return DEFAULT_HP_RATIO;
  if (!isFinite_(v) || v <= 0 || v > 1) return null;
  return v;
}

/** Stage 13: OL のオプション行。Stage 12 の保存データには無いので、欠落は空（オプションなし） */
function parseOverload(v: Json, type: GearType): OverloadLine[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > OVERLOAD_LINE_MAX || (v.length > 0 && type !== 'OL')) return undefined;
  const lines: OverloadLine[] = [];
  for (const line of v as Json[]) {
    if (!isRecord(line) || !(OVERLOAD_OPTIONS as readonly string[]).includes(String(line.option))) return undefined;
    if (!isInt(line.level, OVERLOAD_LEVEL_MIN) || line.level > OVERLOAD_LEVEL_MAX) return undefined;
    // 2026-10-31 までの保存データには無いので、欠落は配列の並び
    if (line.position !== undefined && !(isInt(line.position, 0) && line.position < OVERLOAD_LINE_MAX))
      return undefined;
    lines.push({
      option: line.option as OverloadOption,
      level: line.level,
      ...(line.position === undefined ? {} : { position: line.position }),
    });
  }
  const positions = lines.map((line, i) => line.position ?? i);
  if (new Set(positions).size !== positions.length) return undefined;
  return lines;
}

function parseGear(v: Json): GearInput | undefined {
  if (v === null) return null;
  if (!isRecord(v)) return undefined;
  if (!(GEAR_TYPES as readonly string[]).includes(String(v.type))) return undefined;
  if (!isInt(v.level, 0) || v.level > GEAR_LEVEL_MAX) return undefined;
  const type = v.type as GearType;
  const overload = parseOverload(v.overload, type);
  if (overload === undefined) return undefined;
  return overload.length === 0 ? { type, level: v.level } : { type, level: v.level, overload };
}

/** Stage 11 までの保存データには無いので、欠落は空（素のステータス）。あれば各項目の範囲だけ見る（マスタとの照合は計算時） */
function parseBuild(v: Json): BuildInput | null {
  if (v === undefined) return emptyBuild();
  if (!isRecord(v)) return null;
  if (!isInt(v.affectionRank, AFFECTION_RANK_MIN) || v.affectionRank > AFFECTION_RANK_MAX) return null;
  if (!isRecord(v.gear)) return null;
  const gear = {} as BuildInput['gear'];
  for (const part of GEAR_PARTS) {
    const g = parseGear(v.gear[part]);
    if (g === undefined) return null;
    gear[part] = g;
  }
  let cube: BuildInput['cube'] = null;
  if (v.cube !== null) {
    if (
      !isRecord(v.cube) ||
      !isInt(v.cube.id, 1) ||
      !isInt(v.cube.level, CUBE_LEVEL_MIN) ||
      v.cube.level > CUBE_LEVEL_MAX
    )
      return null;
    cube = { id: v.cube.id, level: v.cube.level };
  }
  let collection: BuildInput['collection'] = null;
  if (v.collection !== null) {
    if (!isRecord(v.collection) || (v.collection.rarity !== 'R' && v.collection.rarity !== 'SR')) return null;
    if (!isInt(v.collection.level, 0) || v.collection.level > COLLECTION_LEVEL_MAX) return null;
    collection = { rarity: v.collection.rarity, level: v.collection.level };
  }
  const rr = v.recycleRoom;
  if (!isRecord(rr) || !isInt(rr.personal, 0) || !isInt(rr.class, 0) || !isInt(rr.corporation, 0)) return null;
  if (!isFinite_(v.extraAttack) || v.extraAttack < 0) return null;
  return {
    affectionRank: v.affectionRank,
    gear,
    cube,
    collection,
    recycleRoom: { personal: rr.personal, class: rr.class, corporation: rr.corporation },
    extraAttack: v.extraAttack,
  };
}

function parseEnemy(v: Json): EnemyInput | null {
  if (!isRecord(v)) return null;
  if (!isFinite_(v.defence) || v.defence < 0) return null;
  if (!isBool(v.hasCore)) return null;
  const element = v.element;
  if (element !== null && !(ELEMENTS as readonly string[]).includes(String(element))) return null;
  return { defence: v.defence, element: element === null ? null : (element as Element), hasCore: v.hasCore };
}

export type ReadResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Stage 14: 編成の JSON（localStorage・書き出したファイル・貼り付け）を検証して復元する。失敗の理由を返す（取り込み欄に出す）。
 * 未知の formatVersion（新しい版で書き出したもの）・形が合わない・index に存在しないニケ・同じニケが 2 枠は失敗
 */
export function readTeamJson(json: string, index: readonly CharacterIndexEntry[]): ReadResult<TeamState> {
  let raw: Json;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (!isRecord(raw)) return { ok: false, error: '編成の JSON ではありません' };
  if (formatVersionOf(raw) === null) {
    return { ok: false, error: `この版の編成は読めません（formatVersion ${String(raw.formatVersion)}）` };
  }
  const state = parseTeamFields(raw, index);
  return state === null
    ? { ok: false, error: '編成の JSON の形が合いません（範囲外の値・未知のニケ・同じニケが 2 枠など）' }
    : { ok: true, value: state };
}

/**
 * localStorage に保存した JSON を検証して復元する。
 * 形が合わない・index に存在しないニケを指す・同じニケが 2 枠にある場合は null（呼び出し側で初期値に落とす）。
 */
export function parseTeamState(json: string | null, index: readonly CharacterIndexEntry[]): TeamState | null {
  if (json === null) return null;
  const result = readTeamJson(json, index);
  return result.ok ? result.value : null;
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
    const skillLevels = parseSkillLevels(s.skillLevels);
    const treasurePhase = parseTreasurePhase(s.treasurePhase);
    const build = parseBuild(s.build);
    const hpRatio = parseHpRatio(s.hpRatio);
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
    slots.push({ resourceId: id, growth, conditionMode, condition, skillLevels, treasurePhase, build, hpRatio });
  }

  const enemy = parseEnemy(raw.enemy);
  if (enemy === null) return null;
  if (!isFinite_(raw.durationSeconds) || raw.durationSeconds < 0) return null;
  if (!isBool(raw.fixedSpec)) return null;
  // Stage 4 までの保存データには無いので、欠落は既定値（ON）
  if (raw.burst !== undefined && !isBool(raw.burst)) return null;
  // Stage 6 までの保存データには無い。欠落と旧仕様の null（全員 AI）は既定の枠にする
  const controlled = raw.controlledSlot;
  if (
    controlled !== undefined &&
    controlled !== null &&
    !(typeof controlled === 'number' && Number.isInteger(controlled) && controlled >= 0 && controlled < TEAM_SIZE)
  ) {
    return null;
  }
  // Stage 16-B までの保存データには無いので、欠落は空（OFF）
  const eventSets = raw.enemyEventSets;
  if (eventSets !== undefined && !(Array.isArray(eventSets) && eventSets.every((id) => typeof id === 'string'))) {
    return null;
  }

  // 2026-10-31 までの保存データには無いので、欠落は全部 0
  const consoleInput = raw.console === undefined ? emptyConsole() : parseConsole(raw.console);
  if (consoleInput === null) return null;
  // 2026-10-31 までの保存データには無いので、欠落は既定（Lv200）
  if (raw.synchroLevel !== undefined && !isInt(raw.synchroLevel, 1)) return null;
  // 2026-10-31 までの保存データには無いので、欠落は既定（ON）
  if (raw.rangeJump !== undefined && !isBool(raw.rangeJump)) return null;

  return {
    slots,
    enemy,
    durationSeconds: raw.durationSeconds,
    fixedSpec: raw.fixedSpec,
    burst: raw.burst === undefined ? DEFAULT_BURST : raw.burst,
    controlledSlot: typeof controlled === 'number' ? controlled : DEFAULT_CONTROLLED_SLOT,
    enemyEventSets: eventSets === undefined ? [] : (eventSets as string[]),
    console: consoleInput,
    synchroLevel: raw.synchroLevel === undefined ? DEFAULT_GROWTH.level : raw.synchroLevel,
    rangeJump: raw.rangeJump === undefined ? true : raw.rangeJump,
  };
}

function parseConsole(v: Json): ConsoleInput | null {
  if (!isRecord(v) || !isInt(v.personal, 0) || !isRecord(v.class) || !isRecord(v.corporation)) return null;
  const result = emptyConsole();
  result.personal = v.personal;
  for (const c of CONSOLE_CLASSES) {
    const lv = v.class[c];
    if (!isInt(lv, 0)) return null;
    result.class[c] = lv;
  }
  for (const c of CONSOLE_CORPORATIONS) {
    const lv = v.corporation[c];
    if (!isInt(lv, 0)) return null;
    result.corporation[c] = lv;
  }
  return result;
}

// ---- Stage 14: 枠ごとの育成の JSON（書き出し / 取り込み） ----

/** 枠ごとの育成の JSON の版 */
export const BUILD_FORMAT_VERSION = 1;

export type SlotBuildJson = { growth: GrowthInput; build: BuildInput };

/** 枠の育成値と育成入力を JSON にする（{ formatVersion, growth, build }） */
export function serializeSlotBuild(slot: Pick<SlotState, 'growth' | 'build'>): string {
  return JSON.stringify({ formatVersion: BUILD_FORMAT_VERSION, growth: slot.growth, build: slot.build }, null, 2);
}

/**
 * 枠ごとの育成の JSON を読む。書き出した形（{ formatVersion, growth, build }）のほか、CLI の --build の 1 枠分
 * （BuildInput の一部と任意の growth。欠けた項目は空の育成で埋める）も読む。growth が無ければ null（枠の育成値を変えない）
 */
export function readSlotBuildJson(json: string): ReadResult<{ growth: GrowthInput | null; build: BuildInput }> {
  let raw: Json;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }
  if (!isRecord(raw)) return { ok: false, error: '育成の JSON ではありません' };
  const version = raw.formatVersion;
  if (version !== undefined && version !== BUILD_FORMAT_VERSION) {
    return { ok: false, error: `この版の育成は読めません（formatVersion ${String(version)}）` };
  }
  const wrapped = version !== undefined || isRecord(raw.build);
  const { growth: rawGrowth, formatVersion: _v, ...rest } = raw;
  const buildRaw = wrapped ? raw.build : rest;
  if (!isRecord(buildRaw)) return { ok: false, error: '育成（build）がありません' };
  // 書かれていない項目・部位は空の育成で埋める（CLI の --build と同じ）
  const empty = emptyBuild();
  const gear = isRecord(buildRaw.gear) ? { ...empty.gear, ...buildRaw.gear } : buildRaw.gear;
  const build = parseBuild({ ...empty, ...buildRaw, ...(gear === undefined ? {} : { gear }) });
  if (build === null) return { ok: false, error: '育成の値が範囲外か、形が合いません' };
  if (rawGrowth === undefined) return { ok: true, value: { growth: null, build } };
  const growth = parseGrowth(rawGrowth);
  if (growth === null) return { ok: false, error: '育成値（growth）の形が合いません' };
  return { ok: true, value: { growth, build } };
}
