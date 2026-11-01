// Stage 12: 育成入力（ステータス層）の入力欄。スペック固定のときは fixedSpecBuild（T9 Lv5 × 4・好感度 rank30/40/10）を表示して
// 入力を止める。Stage 13: OL 装備のオプション行（最大 3 行）の入力。
// 2026-10-31: オーナーの指示で、枠の「育成」の折りたたみの中の装備・キューブ・コレクションの部分にした（好感度は枠の側）。
// また、リサイクルルーム・その他攻撃加算の欄と、攻撃力の表示（見出しの攻撃力・合成内訳・効果層の一覧・
// スペック固定の説明）を消した。その他攻撃加算は 0 で計算し、リサイクルルームは編成共通の
// コンソールから取る（calcView.ts）
import {
  COLLECTION_LEVEL_MAX,
  CUBE_LEVEL_MAX,
  CUBE_LEVEL_MIN,
  GEAR_LEVEL_MAX,
  GEAR_PARTS,
  GEAR_TYPES,
  OVERLOAD_LEVEL_MAX,
  OVERLOAD_LEVEL_MIN,
  OVERLOAD_LINE_MAX,
  TREASURE_PHASE_MAX,
  computeCombatAttack,
  overloadLinePosition,
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
import { collectionActions, treasureOptionValue } from '../collectionChoice.ts';
import { GEAR_PART_LABEL, treasurePhaseLabel } from '../skillLabels.ts';
import { clampInt, type TeamAction } from '../team.ts';
import { IntInput } from './IntInput.tsx';

const GEAR_TYPE_LABEL: Record<GearType, string> = { T9: 'T9', T9Corp: 'T9 企業', OL: 'OL（T10）' };

/**
 * Stage 13: 位置 p の行を line にした OL の行（null は削除）。2026-10-31: オーナーの指示で、間の行を空けたまま後ろの行に
 * 入れられるように、行は詰めずに位置（position）を持たせる
 */
function withOverloadLine(lines: readonly OverloadLine[], p: number, line: OverloadLine | null): OverloadLine[] {
  const rest = lines.map((l, i) => ({ ...l, position: overloadLinePosition(l, i) })).filter((l) => l.position !== p);
  const next = line === null ? rest : [...rest, { ...line, position: p }];
  return next.sort((a, b) => a.position - b.position);
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
    <div className="build">
      {mastersError && <p className="error">育成のマスタの読み込みに失敗しました: {mastersError}</p>}
      {!masters && !mastersError && <p className="hint">育成のマスタを読み込み中…</p>}
      <div className="build-grid">
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
                <IntInput
                  value={gear?.level ?? 0}
                  min={0}
                  max={GEAR_LEVEL_MAX}
                  disabled={disabled || gear === null}
                  onCommit={(level) => gear && setGear(part, { ...gear, level })}
                />
              </span>
              {/* OL のオプションは、装備が OL でないときも欄だけ出す（選べない。欄の並びを変えない） */}
              <span className="ol-lines">
                {Array.from({ length: OVERLOAD_LINE_MAX }, (_, i) => {
                  const isOverload = gear?.type === 'OL';
                  const lines = (isOverload && gear.overload) || [];
                  const line = lines.find((l, j) => overloadLinePosition(l, j) === i);
                  return (
                    <span className="gear-inputs" key={i}>
                      <select
                        value={line?.option ?? ''}
                        disabled={disabled || !masters || !isOverload}
                        onChange={(e) => {
                          if (!isOverload) return;
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
                      {/* 2026-10-31: オーナーの指示で、OL の行は Lv ではなく上昇する % で選ぶ（値は overload.json の values。保存は Lv のまま） */}
                      <select
                        aria-label={`オプション ${i + 1} の上昇値`}
                        value={line?.level ?? OVERLOAD_LEVEL_MIN}
                        disabled={disabled || line === undefined}
                        onChange={(e) =>
                          isOverload &&
                          line &&
                          setOverload(part, gear, i, {
                            ...line,
                            level: clampInt(Number(e.target.value), OVERLOAD_LEVEL_MIN, OVERLOAD_LEVEL_MAX),
                          })
                        }
                      >
                        {(() => {
                          const values =
                            line && masters?.overload.options.find((o) => o.option === line.option)?.values;
                          if (!values) return <option value={OVERLOAD_LEVEL_MIN}>—</option>;
                          return values.map((v, lv) => (
                            <option key={lv} value={lv + OVERLOAD_LEVEL_MIN}>
                              {v.toFixed(2)}%
                            </option>
                          ));
                        })()}
                      </select>
                    </span>
                  );
                })}
              </span>
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
            <IntInput
              value={shown.cube?.level ?? CUBE_LEVEL_MIN}
              min={CUBE_LEVEL_MIN}
              max={CUBE_LEVEL_MAX}
              disabled={disabled || shown.cube === null}
              onCommit={(level) => shown.cube && set({ cube: { ...shown.cube, level } })}
            />
          </span>
        </div>
        <div className="field gear">
          <span>コレクション</span>
          <span className="gear-inputs">
            {/* 2026-10-31: オーナーの指示で、スキル Lv の横にあった宝物の段階の選択をここに統合した（宝物はコレクションの枠に付ける）。
                宝物はスペック固定でも選べる */}
            <select
              value={hasTreasure ? treasureOptionValue(treasurePhase) : (shown.collection?.rarity ?? '')}
              disabled={disabled && character.treasure === null}
              onChange={(e) => {
                // スペック固定の間（disabled）は宝物の段階だけを変え、保存している育成には触れない
                const actions = collectionActions(slotIndex, e.target.value, {
                  fixedSpec: disabled,
                  hasTreasure,
                  build,
                  level: shown.collection?.level ?? 0,
                });
                for (const action of actions) dispatch(action);
              }}
            >
              <option value="">なし</option>
              <option value="R" disabled={disabled}>
                R
              </option>
              <option value="SR" disabled={disabled}>
                SR
              </option>
              {character.treasure &&
                Array.from({ length: TREASURE_PHASE_MAX }, (_, i) => i + 1).map((phase) => (
                  <option key={phase} value={treasureOptionValue(phase)}>
                    宝物 {treasurePhaseLabel(character.treasure!.unlockOrder, phase)}
                  </option>
                ))}
            </select>
            <IntInput
              value={hasTreasure ? COLLECTION_LEVEL_MAX : (shown.collection?.level ?? 0)}
              min={0}
              max={COLLECTION_LEVEL_MAX}
              disabled={disabled || hasTreasure || shown.collection === null}
              onCommit={(level) => shown.collection && set({ collection: { ...shown.collection, level } })}
            />
          </span>
        </div>
      </div>
      {combatError && <p className="error">育成入力を計算に使えません: {combatError}</p>}
    </div>
  );
}
