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
  emptyBuild,
  fixedSpecBuild,
  type BuildInput,
  type CharacterData,
  type CharacterIndexEntry,
  type Element,
  type EnemyInput,
  type GearInput,
  type GearType,
  type GrowthInput,
  type OverloadLine,
  type OverloadOption,
  type SkillLevels,
  type SlotCondition,
  type TreasurePhase,
} from '@nikke/core';

export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: 100, element: null, hasCore: true };
export const DEFAULT_GROWTH: GrowthInput = { level: 200, grade: 3, core: 0 };
export const DEFAULT_SLOT_CONDITION: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
/** スキル Lv の既定値。全部 10 */
export const DEFAULT_SKILL_LEVELS: SkillLevels = MAX_SKILL_LEVELS;
/** 戦闘時間の規定値。レイド・射撃場ともに 180 秒（スペック固定でも変えない） */
export const DEFAULT_DURATION_SECONDS = 180;
/** バーストの既定。ON */
export const DEFAULT_BURST = true;
/** Stage 9: 宝物の段階の既定。0 = 宝物なし（ユーザー指定） */
export const DEFAULT_TREASURE_PHASE: TreasurePhase = 0;

export type SlotState = {
  resourceId: number | null;
  growth: GrowthInput;
  condition: SlotCondition;
  skillLevels: SkillLevels;
  /** Stage 9: 宝物の段階。キャラを選び直すと 0 に戻る。スペック固定でも上書きしない */
  treasurePhase: TreasurePhase;
  /** Stage 12: 育成入力（装備・キューブ・好感度・コレクション・リサイクルルーム・その他）。growth と同じくキャラを変えても残る */
  build: BuildInput;
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
  /** 操作キャラの枠（Stage 7）。チャージ武器のフルチャージ倍率がゲージに乗るのは操作キャラだけ。null は全員 AI 扱い */
  controlledSlot: number | null;
};

export type TeamAction =
  | { type: 'selectCharacter'; index: number; resourceId: number }
  | { type: 'clearSlot'; index: number }
  | { type: 'setGrowth'; index: number; growth: GrowthInput }
  | { type: 'setSlotCondition'; index: number; condition: SlotCondition }
  | { type: 'setSkillLevels'; index: number; skillLevels: SkillLevels }
  | { type: 'setTreasurePhase'; index: number; treasurePhase: TreasurePhase }
  | { type: 'setBuild'; index: number; build: BuildInput }
  | { type: 'setEnemy'; enemy: EnemyInput }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setFixedSpec'; fixedSpec: boolean }
  | { type: 'setBurst'; burst: boolean }
  | { type: 'setControlledSlot'; controlledSlot: number | null }
  | { type: 'replace'; state: TeamState };

export function emptySlot(): SlotState {
  return {
    resourceId: null,
    growth: { ...DEFAULT_GROWTH },
    condition: { ...DEFAULT_SLOT_CONDITION },
    skillLevels: { ...DEFAULT_SKILL_LEVELS },
    treasurePhase: DEFAULT_TREASURE_PHASE,
    build: emptyBuild(),
  };
}

export function initialTeamState(): TeamState {
  return {
    slots: Array.from({ length: TEAM_SIZE }, emptySlot),
    enemy: { ...SHOOTING_RANGE_ENEMY },
    durationSeconds: DEFAULT_DURATION_SECONDS,
    fixedSpec: false,
    burst: DEFAULT_BURST,
    controlledSlot: null,
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
      // 宝物の段階はキャラごとのものなので、別のニケに変えたら 0 に戻す
      return updateSlot(state, action.index, (s) =>
        s.resourceId === action.resourceId
          ? s
          : { ...s, resourceId: action.resourceId, treasurePhase: DEFAULT_TREASURE_PHASE },
      );
    }
    case 'clearSlot':
      return updateSlot(state, action.index, (s) => ({
        ...s,
        resourceId: null,
        treasurePhase: DEFAULT_TREASURE_PHASE,
      }));
    case 'setGrowth':
      return updateSlot(state, action.index, (s) => ({ ...s, growth: action.growth }));
    case 'setSlotCondition':
      return updateSlot(state, action.index, (s) => ({ ...s, condition: action.condition }));
    case 'setSkillLevels':
      return updateSlot(state, action.index, (s) => ({ ...s, skillLevels: action.skillLevels }));
    case 'setTreasurePhase':
      return updateSlot(state, action.index, (s) => ({ ...s, treasurePhase: action.treasurePhase }));
    case 'setBuild':
      return updateSlot(state, action.index, (s) => ({ ...s, build: action.build }));
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
export function effectiveBuild(slot: SlotState, fixedSpec: boolean, character: CharacterData): BuildInput {
  return fixedSpec ? fixedSpecBuild(character) : slot.build;
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
export const TEAM_FORMAT_VERSION = 1;

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

function parseCondition(v: Json): SlotCondition | null {
  if (!isRecord(v)) return null;
  if (!isFinite_(v.coreHitRate) || v.coreHitRate < 0 || v.coreHitRate > 1) return null;
  if (!isBool(v.distanceBonus) || !isBool(v.fullCharge)) return null;
  return { coreHitRate: v.coreHitRate, distanceBonus: v.distanceBonus, fullCharge: v.fullCharge };
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

/** Stage 13: OL のオプション行。Stage 12 の保存データには無いので、欠落は空（オプションなし） */
function parseOverload(v: Json, type: GearType): OverloadLine[] | undefined {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > OVERLOAD_LINE_MAX || (v.length > 0 && type !== 'OL')) return undefined;
  const lines: OverloadLine[] = [];
  for (const line of v as Json[]) {
    if (!isRecord(line) || !(OVERLOAD_OPTIONS as readonly string[]).includes(String(line.option))) return undefined;
    if (!isInt(line.level, OVERLOAD_LEVEL_MIN) || line.level > OVERLOAD_LEVEL_MAX) return undefined;
    lines.push({ option: line.option as OverloadOption, level: line.level });
  }
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
    const skillLevels = parseSkillLevels(s.skillLevels);
    const treasurePhase = parseTreasurePhase(s.treasurePhase);
    const build = parseBuild(s.build);
    if (growth === null || condition === null || skillLevels === null || treasurePhase === null || build === null) {
      return null;
    }
    slots.push({ resourceId: id, growth, condition, skillLevels, treasurePhase, build });
  }

  const enemy = parseEnemy(raw.enemy);
  if (enemy === null) return null;
  if (!isFinite_(raw.durationSeconds) || raw.durationSeconds < 0) return null;
  if (!isBool(raw.fixedSpec)) return null;
  // Stage 4 までの保存データには無いので、欠落は既定値（ON）
  if (raw.burst !== undefined && !isBool(raw.burst)) return null;
  // Stage 6 までの保存データには無いので、欠落は null（全員 AI 扱い）
  const controlled = raw.controlledSlot;
  if (
    controlled !== undefined &&
    controlled !== null &&
    !(typeof controlled === 'number' && Number.isInteger(controlled) && controlled >= 0 && controlled < TEAM_SIZE)
  ) {
    return null;
  }

  return {
    slots,
    enemy,
    durationSeconds: raw.durationSeconds,
    fixedSpec: raw.fixedSpec,
    burst: raw.burst === undefined ? DEFAULT_BURST : raw.burst,
    controlledSlot: typeof controlled === 'number' ? controlled : null,
  };
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
