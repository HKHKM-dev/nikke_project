// 編成の状態と reducer。React に依存しない純関数だけを置き、node 環境の vitest でテストする。
import {
  ELEMENTS,
  FIXED_SPEC_ENEMY_DEFENCE,
  TEAM_SIZE,
  type CharacterIndexEntry,
  type Element,
  type EnemyInput,
  type GrowthInput,
  type SlotCondition,
} from '@nikke/core';

export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: 100, element: null, hasCore: true };
export const DEFAULT_GROWTH: GrowthInput = { level: 200, grade: 3, core: 0 };
export const DEFAULT_SLOT_CONDITION: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
export const DEFAULT_DURATION_SECONDS = 180;
/** スペック固定 ON にしたときの戦闘時間（射撃場） */
export const FIXED_SPEC_DURATION_SECONDS = 90;

export type SlotState = {
  resourceId: number | null;
  growth: GrowthInput;
  condition: SlotCondition;
};

export type TeamState = {
  /** 長さ TEAM_SIZE 固定 */
  slots: SlotState[];
  enemy: EnemyInput;
  durationSeconds: number;
  /** ユニオン射撃場スペック固定（編成共通） */
  fixedSpec: boolean;
};

export type TeamAction =
  | { type: 'selectCharacter'; index: number; resourceId: number }
  | { type: 'clearSlot'; index: number }
  | { type: 'setGrowth'; index: number; growth: GrowthInput }
  | { type: 'setSlotCondition'; index: number; condition: SlotCondition }
  | { type: 'setEnemy'; enemy: EnemyInput }
  | { type: 'setDuration'; durationSeconds: number }
  | { type: 'setFixedSpec'; fixedSpec: boolean }
  | { type: 'replace'; state: TeamState };

export function emptySlot(): SlotState {
  return { resourceId: null, growth: { ...DEFAULT_GROWTH }, condition: { ...DEFAULT_SLOT_CONDITION } };
}

export function initialTeamState(): TeamState {
  return {
    slots: Array.from({ length: TEAM_SIZE }, emptySlot),
    enemy: { ...SHOOTING_RANGE_ENEMY },
    durationSeconds: DEFAULT_DURATION_SECONDS,
    fixedSpec: false,
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
    case 'setEnemy':
      return { ...state, enemy: action.enemy };
    case 'setDuration':
      return { ...state, durationSeconds: action.durationSeconds };
    case 'setFixedSpec':
      // v1 と同じく ON で射撃場の条件に切り替え、OFF では戻さない
      return action.fixedSpec
        ? {
            ...state,
            fixedSpec: true,
            enemy: { ...state.enemy, defence: FIXED_SPEC_ENEMY_DEFENCE },
            durationSeconds: FIXED_SPEC_DURATION_SECONDS,
          }
        : { ...state, fixedSpec: false };
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
    if (growth === null || condition === null) return null;
    slots.push({ resourceId: id, growth, condition });
  }

  const enemy = parseEnemy(raw.enemy);
  if (enemy === null) return null;
  if (!isFinite_(raw.durationSeconds) || raw.durationSeconds < 0) return null;
  if (!isBool(raw.fixedSpec)) return null;

  return { slots, enemy, durationSeconds: raw.durationSeconds, fixedSpec: raw.fixedSpec };
}
