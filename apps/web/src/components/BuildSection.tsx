// Stage 12: 育成入力（ステータス層）の入力欄。スペック固定のときは fixedSpecBuild（T9 Lv5 × 4・好感度 rank30/40/10）を表示して
// 入力を止める。Stage 13: OL 装備のオプション行（最大 3 行）の入力。
// 2026-10-31: オーナーの指示で、リサイクルルーム・その他攻撃加算の欄と、攻撃力の表示（見出しの攻撃力・合成内訳・効果層の一覧・
// スペック固定の説明）を消した。リサイクルルームとその他攻撃加算は 0 で計算する（team.ts の teamStateForCalc）
import {
  AFFECTION_RANK_MAX,
  AFFECTION_RANK_MIN,
  COLLECTION_LEVEL_MAX,
  CUBE_LEVEL_MAX,
  CUBE_LEVEL_MIN,
  GEAR_LEVEL_MAX,
  GEAR_PARTS,
  GEAR_TYPES,
  OVERLOAD_LEVEL_MAX,
  OVERLOAD_LEVEL_MIN,
  OVERLOAD_LINE_MAX,
  computeCombatAttack,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type GearInput,
  type GearPart,
  type GearType,
  type GrowthInput,
  type OverloadLine,
  type OverloadOption,
  type TreasurePhase,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { GEAR_PART_LABEL } from '../skillLabels.ts';
import type { TeamAction } from '../team.ts';

const GEAR_TYPE_LABEL: Record<GearType, string> = { T9: 'T9', T9Corp: 'T9 企業', OL: 'OL（T10）' };

/** Stage 13: i 行目を line にした OL の行（null は削除。後ろの行は詰める） */
function withOverloadLine(lines: readonly OverloadLine[], i: number, line: OverloadLine | null): OverloadLine[] {
  const next: (OverloadLine | null)[] = [...lines];
  next[i] = line;
  return next.filter((l): l is OverloadLine => l !== null && l !== undefined);
}

type Props = {
  slotIndex: number;
  character: CharacterData;
  /** 保存している入力（スペック固定でも残す） */
  build: BuildInput;
  /** 実際に計算へ渡す入力（スペック固定なら fixedSpecBuild） */
  effectiveBuild: BuildInput;
  /** 実際に計算へ渡す育成値 */
  growth: GrowthInput;
  treasurePhase: TreasurePhase;
  masters: BuildMasters | null;
  mastersError: string | null;
  disabled: boolean;
  dispatch: Dispatch<TeamAction>;
};

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function BuildSection({
  slotIndex,
  character,
  build,
  effectiveBuild,
  growth,
  treasurePhase,
  masters,
  mastersError,
  disabled,
  dispatch,
}: Props) {
  const set = (patch: Partial<BuildInput>) =>
    dispatch({ type: 'setBuild', index: slotIndex, build: { ...build, ...patch } });
  const setGear = (part: GearPart, gear: BuildInput['gear'][GearPart]) =>
    set({ gear: { ...build.gear, [part]: gear } });

  const setOverload = (part: GearPart, gear: NonNullable<GearInput>, i: number, line: OverloadLine | null) => {
    const overload = withOverloadLine(gear.overload ?? [], i, line);
    setGear(part, overload.length === 0 ? { type: gear.type, level: gear.level } : { ...gear, overload });
  };

  // 攻撃力は出さないが、計算に使えない育成入力はここで知らせる
  let combatError: string | null = null;
  if (masters) {
    try {
      computeCombatAttack(character, growth, effectiveBuild, masters, { treasurePhase });
    } catch (e) {
      combatError = e instanceof Error ? e.message : String(e);
    }
  }
  const shown = effectiveBuild;
  const hasTreasure = character.treasure !== null && treasurePhase > 0;

  return (
    <details className="build">
      <summary>育成</summary>
      {mastersError && <p className="error">育成のマスタの読み込みに失敗しました: {mastersError}</p>}
      {!masters && !mastersError && <p className="hint">育成のマスタを読み込み中…</p>}
      <div className="build-grid">
        <label className="field">
          <span>好感度</span>
          <input
            type="number"
            min={AFFECTION_RANK_MIN}
            max={AFFECTION_RANK_MAX}
            step={1}
            value={shown.affectionRank}
            disabled={disabled}
            onChange={(e) =>
              set({ affectionRank: clampInt(Number(e.target.value), AFFECTION_RANK_MIN, AFFECTION_RANK_MAX) })
            }
          />
        </label>
        {GEAR_PARTS.map((part) => {
          const gear = shown.gear[part];
          return (
            <div className="field gear" key={part}>
              <span>装備 {GEAR_PART_LABEL[part]}</span>
              <span className="gear-inputs">
                <select
                  value={gear?.type ?? ''}
                  disabled={disabled}
                  onChange={(e) => {
                    const type = e.target.value as GearType | '';
                    const overload = type === 'OL' ? gear?.overload : undefined;
                    setGear(
                      part,
                      type === '' ? null : { type, level: gear?.level ?? 0, ...(overload?.length ? { overload } : {}) },
                    );
                  }}
                >
                  <option value="">なし</option>
                  {GEAR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {GEAR_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={GEAR_LEVEL_MAX}
                  step={1}
                  value={gear?.level ?? 0}
                  disabled={disabled || gear === null}
                  onChange={(e) =>
                    gear && setGear(part, { ...gear, level: clampInt(Number(e.target.value), 0, GEAR_LEVEL_MAX) })
                  }
                />
              </span>
              {gear?.type === 'OL' && (
                <span className="ol-lines">
                  {Array.from({ length: OVERLOAD_LINE_MAX }, (_, i) => {
                    const lines = gear.overload ?? [];
                    const line = lines[i];
                    if (i > lines.length) return null;
                    return (
                      <span className="gear-inputs" key={i}>
                        <select
                          value={line?.option ?? ''}
                          disabled={disabled || !masters}
                          onChange={(e) => {
                            const option = e.target.value as OverloadOption | '';
                            setOverload(
                              part,
                              gear,
                              i,
                              option === '' ? null : { option, level: line?.level ?? OVERLOAD_LEVEL_MIN },
                            );
                          }}
                        >
                          <option value="">オプション {i + 1}: なし</option>
                          {(masters?.overload.options ?? []).map((o) => (
                            <option key={o.option} value={o.option}>
                              {o.name.ja}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={OVERLOAD_LEVEL_MIN}
                          max={OVERLOAD_LEVEL_MAX}
                          step={1}
                          value={line?.level ?? OVERLOAD_LEVEL_MIN}
                          disabled={disabled || line === undefined}
                          onChange={(e) =>
                            line &&
                            setOverload(part, gear, i, {
                              ...line,
                              level: clampInt(Number(e.target.value), OVERLOAD_LEVEL_MIN, OVERLOAD_LEVEL_MAX),
                            })
                          }
                        />
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          );
        })}
        <div className="field gear">
          <span>キューブ</span>
          <span className="gear-inputs">
            <select
              value={shown.cube?.id ?? ''}
              disabled={disabled || !masters}
              onChange={(e) => {
                const id = e.target.value === '' ? null : Number(e.target.value);
                set({ cube: id === null ? null : { id, level: shown.cube?.level ?? CUBE_LEVEL_MIN } });
              }}
            >
              <option value="">なし</option>
              {(masters?.cubes.cubes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.ja}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={CUBE_LEVEL_MIN}
              max={CUBE_LEVEL_MAX}
              step={1}
              value={shown.cube?.level ?? CUBE_LEVEL_MIN}
              disabled={disabled || shown.cube === null}
              onChange={(e) =>
                shown.cube &&
                set({
                  cube: { ...shown.cube, level: clampInt(Number(e.target.value), CUBE_LEVEL_MIN, CUBE_LEVEL_MAX) },
                })
              }
            />
          </span>
        </div>
        <div className="field gear">
          <span>コレクション</span>
          <span className="gear-inputs">
            <select
              value={hasTreasure ? 'SSR' : (shown.collection?.rarity ?? '')}
              disabled={disabled || hasTreasure}
              onChange={(e) => {
                const rarity = e.target.value as 'R' | 'SR' | '';
                set({ collection: rarity === '' ? null : { rarity, level: shown.collection?.level ?? 0 } });
              }}
            >
              <option value="">なし</option>
              <option value="R">R</option>
              <option value="SR">SR</option>
              {hasTreasure && <option value="SSR">SSR（宝物）</option>}
            </select>
            <input
              type="number"
              min={0}
              max={COLLECTION_LEVEL_MAX}
              step={1}
              value={hasTreasure ? COLLECTION_LEVEL_MAX : (shown.collection?.level ?? 0)}
              disabled={disabled || hasTreasure || shown.collection === null}
              onChange={(e) =>
                shown.collection &&
                set({
                  collection: { ...shown.collection, level: clampInt(Number(e.target.value), 0, COLLECTION_LEVEL_MAX) },
                })
              }
            />
          </span>
        </div>
      </div>
      {combatError && <p className="error">育成入力を計算に使えません: {combatError}</p>}
    </details>
  );
}
