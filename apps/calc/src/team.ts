// 編成の状態と reducer。React に依存しない純関数だけを置き、node 環境の vitest でテストする。
import {
  ELEMENTS,
  FIXED_SPEC_ENEMY_DEFENCE,
  MAX_SKILL_LEVELS,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_SLOTS,
  TEAM_SIZE,
  type CharacterIndexEntry,
  type Element,
  type EnemyInput,
  type GrowthInput,
  type SkillLevels,
  type SlotCondition,
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

export type SlotState = {
  resourceId: number | null;
  growth: GrowthInput;
  condition: SlotCondition;
  skillLevels: SkillLevels;
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
      return updateSlot(state, action.index, (s) => ({ ...s, resourceId: action.resourceId }));
    }
    case 'clearSlot':
      return updateSlot(state, action.index, (s) => ({ ...s, resourceId: null }));
    case 'setGrowth':
      return updateSlot(state, action.index, (s) => ({ ...s, growth: action.growth }));
    case 'setSlotCondition':
      return updateSlot(state, action.index, (s) => ({ ...s, condition: action.condition }));
    case 'setSkillLevels':
      return updateSlot(state, action.index, (s) => ({ ...s, skillLevels: action.skillLevels }));
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

/** 1..10 の整数に clamp する（入力欄の途中状態を吸収する） */
export function clampSkillLevel(level: number): number {
  if (!Number.isFinite(level)) return SKILL_LEVEL_MIN;
  return Math.min(SKILL_LEVEL_MAX, Math.max(SKILL_LEVEL_MIN, Math.round(level)));
}

// ---- 永続化 ----

export const STORAGE_KEY = 'nikke-calc.team.v1';

export function serializeTeamState(state: TeamState): string {
  return JSON.stringify(state);
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

function parseEnemy(v: Json): EnemyInput | null {
  if (!isRecord(v)) return null;
  if (!isFinite_(v.defence) || v.defence < 0) return null;
  if (!isBool(v.hasCore)) return null;
  const element = v.element;
  if (element !== null && !(ELEMENTS as readonly string[]).includes(String(element))) return null;
  return { defence: v.defence, element: element === null ? null : (element as Element), hasCore: v.hasCore };
}

/**
 * localStorage に保存した JSON を検証して復元する。
 * 形が合わない・index に存在しないニケを指す・同じニケが 2 枠にある場合は null（呼び出し側で初期値に落とす）。
 */
export function parseTeamState(json: string | null, index: readonly CharacterIndexEntry[]): TeamState | null {
  if (json === null) return null;
  let raw: Json;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw) || !Array.isArray(raw.slots) || raw.slots.length !== TEAM_SIZE) return null;

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
    if (growth === null || condition === null || skillLevels === null) return null;
    slots.push({ resourceId: id, growth, condition, skillLevels });
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
