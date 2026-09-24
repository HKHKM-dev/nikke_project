// Stage 12: 育成入力（ステータス層）の入力欄と、戦闘中の攻撃力（バフ前）の内訳。
// スペック固定のときは fixedSpecBuild（T9 Lv5 × 4・好感度 rank30/40/10）を表示して入力を止める。
import {
  AFFECTION_RANK_MAX,
  AFFECTION_RANK_MIN,
  COLLECTION_LEVEL_MAX,
  CUBE_LEVEL_MAX,
  CUBE_LEVEL_MIN,
  GEAR_LEVEL_MAX,
  GEAR_PARTS,
  GEAR_TYPES,
  computeCombatAttack,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type CombatAttack,
  type GearPart,
  type GearType,
  type GrowthInput,
  type TreasurePhase,
} from '@nikke/core';
import type { Dispatch } from 'react';
import { formatNumber } from '../format.ts';
import type { TeamAction } from '../team.ts';

const GEAR_TYPE_LABEL: Record<GearType, string> = { T9: 'T9', T9Corp: 'T9 企業', OL: 'OL（T10）' };
const GEAR_PART_LABEL: Record<GearPart, string> = { head: '頭', body: '胴', arm: '腕', leg: '足' };

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

  let combat: CombatAttack | null = null;
  let combatError: string | null = null;
  if (masters) {
    try {
      combat = computeCombatAttack(character, growth, effectiveBuild, masters, { treasurePhase });
    } catch (e) {
      combatError = e instanceof Error ? e.message : String(e);
    }
  }
  const shown = effectiveBuild;
  const hasTreasure = character.treasure !== null && treasurePhase > 0;

  return (
    <details className="build">
      <summary>
        育成（装備・キューブ・好感度・コレクション・その他）
        {combat && (
          <span className="build-attack">
            {' '}
            戦闘中の攻撃力 <strong>{formatNumber(combat.attack)}</strong>
          </span>
        )}
      </summary>
      {mastersError && <p className="error">育成のマスタの読み込みに失敗しました: {mastersError}</p>}
      {!masters && !mastersError && <p className="hint">育成のマスタを読み込み中…</p>}
      {disabled && (
        <p className="hint">スペック固定: 好感度 rank{shown.affectionRank}・装備 T9 Lv5 × 4・キューブ等なし</p>
      )}
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
          <small>
            rank {AFFECTION_RANK_MIN}〜{AFFECTION_RANK_MAX}
          </small>
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
                    setGear(part, type === '' ? null : { type, level: gear?.level ?? 0 });
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
              <small>Lv 0〜{GEAR_LEVEL_MAX}。OL の効果は Stage 13（未対応）</small>
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
          <small>
            Lv {CUBE_LEVEL_MIN}〜{CUBE_LEVEL_MAX}。固有効果は Stage 13（未対応）
          </small>
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
          <small>
            {hasTreasure
              ? '宝物を解放しているので宝物のステータス（SR Lv15 と同値）が乗る'
              : `Lv 0〜${COLLECTION_LEVEL_MAX}。武器種の効果は Stage 13（未対応）`}
          </small>
        </div>
        <div className="field gear">
          <span>リサイクルルーム</span>
          <span className="gear-inputs three">
            {(['personal', 'class', 'corporation'] as const).map((key) => (
              <input
                key={key}
                type="number"
                min={0}
                step={1}
                value={shown.recycleRoom[key]}
                disabled={disabled}
                title={{ personal: '共通研究', class: 'クラス研究', corporation: '企業研究' }[key]}
                onChange={(e) =>
                  set({
                    recycleRoom: { ...shown.recycleRoom, [key]: clampInt(Number(e.target.value), 0, 999) },
                  })
                }
              />
            ))}
          </span>
          <small>共通 / クラス / 企業の研究 Lv。攻撃力に効くのは企業研究（1 Lv +25）</small>
        </div>
        <label className="field">
          <span>その他の加算</span>
          <input
            type="number"
            min={0}
            step={1}
            value={shown.extraAttack}
            disabled={disabled}
            onChange={(e) => set({ extraAttack: Math.max(0, Number(e.target.value) || 0) })}
          />
          <small>企業タワー・アウトポスト等の攻撃力の固定加算（CDN に無いもの）</small>
        </label>
      </div>
      {combatError && <p className="error">育成入力を計算に使えません: {combatError}</p>}
      {combat && (
        <p className="hint build-breakdown">
          {formatNumber(combat.attack)} = round(({formatNumber(combat.gradeBase)} 素 + {formatNumber(combat.affection)}{' '}
          好感度
          {combat.cube > 0 && ` + ${formatNumber(combat.cube)} キューブ`}
          {combat.collection > 0 && ` + ${formatNumber(combat.collection)} コレクション`}
          {combat.recycleRoom > 0 && ` + ${formatNumber(combat.recycleRoom)} リサイクル`}) × (1 + コア {growth.core}{' '}
          段)) = {formatNumber(combat.withCore)} + {formatNumber(combat.gear)} 装備
          {combat.extra > 0 && ` + ${formatNumber(combat.extra)} その他`}
          。キューブ・コレクション・リサイクルルームがコアの内側に入るのは仮定（実測待ち）
        </p>
      )}
    </details>
  );
}
