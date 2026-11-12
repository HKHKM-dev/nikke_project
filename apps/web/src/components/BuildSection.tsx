// 育成入力（ステータス層）の入力欄。枠の「育成」の折りたたみの中の、装備・キューブ・コレクションの部分（好感度は枠の側）。
// スペック固定のときは fixedSpecBuild（T9 Lv5 × 4・好感度 rank30/40/10）を表示して入力を止める。OL 装備のオプション行は最大 3 行。
// その他攻撃加算は 0 で計算し、リサイクルルームは編成共通のコンソールから取る（calcView.ts）。
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
import { UNKNOWN_TREASURE_OPTION, collectionPatch, treasureOptionValue } from '../collectionChoice.ts';
import { GEAR_PART_LABEL, treasurePhaseLabel } from '../skillLabels.ts';
import { clampInt, type SlotBuild, type SlotGrowthFields } from '../team.ts';
import { IntInput } from './IntInput.tsx';
import { inertControlProps } from './inertControl.ts';

const GEAR_TYPE_LABEL: Record<GearType, string> = { T9: 'T9', T9Corp: 'T9 企業', OL: 'OL（T10）' };

/**
 * 位置 p の行を line にした OL の行（null は削除）。間の行を空けたまま後ろの行に
 * 入れられるように、行は詰めずに位置（position）を持たせる
 */
function withOverloadLine(lines: readonly OverloadLine[], p: number, line: OverloadLine | null): OverloadLine[] {
  const rest = lines.map((l, i) => ({ ...l, position: overloadLinePosition(l, i) })).filter((l) => l.position !== p);
  const next = line === null ? rest : [...rest, { ...line, position: p }];
  return next.sort((a, b) => a.position - b.position);
}

type Props = {
  character: CharacterData;
  /** 保存している入力（スペック固定でも残す） */
  build: SlotBuild;
  /** 実際に計算へ渡す入力（スペック固定なら fixedSpecBuild） */
  effectiveBuild: BuildInput;
  /** 実際に計算へ渡す育成値 */
  growth: GrowthInput;
  /** 宝物の段階（0 は宝物なし）。null は、宝物はあるが段階が未確定（育成状況の編集だけ。plan/design-roster-edit.md 6.4 節） */
  treasurePhase: TreasurePhase | null;
  masters: BuildMasters | null;
  mastersError: string | null;
  disabled: boolean;
  /** 変えた育成（装備・キューブ・コレクションは build、宝物の段階は treasurePhase） */
  onChange: (patch: Partial<Pick<SlotGrowthFields, 'build' | 'treasurePhase'>>) => void;
};

export function BuildSection({
  character,
  build,
  effectiveBuild,
  growth,
  treasurePhase,
  masters,
  mastersError,
  disabled,
  onChange,
}: Props) {
  const set = (patch: Partial<SlotBuild>) => onChange({ build: { ...build, ...patch } });
  const setGear = (part: GearPart, gear: SlotBuild['gear'][GearPart]) => set({ gear: { ...build.gear, [part]: gear } });
  // 攻撃力は出さないが、計算に使えない育成入力はここで知らせる
  const combatError = masters ? combatErrorOf(character, growth, effectiveBuild, masters, treasurePhase) : null;
  const shown = effectiveBuild;

  return (
    <div className="build">
      {mastersError && <p className="error">育成のマスタの読み込みに失敗しました: {mastersError}</p>}
      {!masters && !mastersError && <p className="hint">育成のマスタを読み込み中…</p>}
      <div className="build-grid">
        {GEAR_PARTS.map((part) => (
          <GearField
            key={part}
            part={part}
            gear={shown.gear[part]}
            masters={masters}
            disabled={disabled}
            onChange={(gear) => setGear(part, gear)}
          />
        ))}
        <CubeField cube={shown.cube} masters={masters} disabled={disabled} onChange={(cube) => set({ cube })} />
        <CollectionField
          character={character}
          build={build}
          collection={shown.collection}
          treasurePhase={treasurePhase}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
      {combatError && <p className="error">育成入力を計算に使えません: {combatError}</p>}
    </div>
  );
}

/** 計算に使えない育成入力の知らせ（戦闘力の攻撃力を出してみて、投げた文。使えれば null） */
function combatErrorOf(
  character: CharacterData,
  growth: GrowthInput,
  build: BuildInput,
  masters: BuildMasters,
  treasurePhase: TreasurePhase | null,
): string | null {
  try {
    computeCombatAttack(character, growth, build, masters, { treasurePhase: treasurePhase ?? 0 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 装備 1 部位: 種類・Lv と、OL のオプションの行 */
function GearField({
  part,
  gear,
  masters,
  disabled,
  onChange,
}: {
  part: GearPart;
  gear: GearInput;
  masters: BuildMasters | null;
  disabled: boolean;
  onChange: (gear: GearInput) => void;
}) {
  const setOverload = (gear: NonNullable<GearInput>, i: number, line: OverloadLine | null) => {
    const overload = withOverloadLine(gear.overload ?? [], i, line);
    onChange(overload.length === 0 ? { type: gear.type, level: gear.level } : { ...gear, overload });
  };
  return (
    <div className="field gear">
      <span>装備 {GEAR_PART_LABEL[part]}</span>
      <span className="gear-inputs">
        <select
          value={gear?.type ?? ''}
          {...inertControlProps(disabled)}
          onChange={(e) => {
            // aria-disabled の欄も、タッチの端末では選択肢が開くことがある（inertControl.ts）
            if (disabled) return;
            const type = e.target.value as GearType | '';
            const overload = type === 'OL' ? gear?.overload : undefined;
            onChange(type === '' ? null : { type, level: gear?.level ?? 0, ...(overload?.length ? { overload } : {}) });
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
          onCommit={(level) => gear && onChange({ ...gear, level })}
        />
      </span>
      {/* OL のオプションは、装備が OL でないときも欄だけ出す（選べない。欄の並びを変えない） */}
      <span className="ol-lines">
        {Array.from({ length: OVERLOAD_LINE_MAX }, (_, i) => {
          const isOverload = gear?.type === 'OL';
          const lines = (isOverload && gear.overload) || [];
          const line = lines.find((l, j) => overloadLinePosition(l, j) === i);
          return (
            <OverloadLineField
              key={i}
              position={i}
              line={line}
              masters={masters}
              selectable={!disabled && masters !== null && isOverload}
              disabled={disabled}
              onChange={(next) => isOverload && setOverload(gear, i, next)}
            />
          );
        })}
      </span>
    </div>
  );
}

/** OL のオプションの 1 行: オプションと、上昇する % */
function OverloadLineField({
  position,
  line,
  masters,
  selectable,
  disabled,
  onChange,
}: {
  position: number;
  line: OverloadLine | undefined;
  masters: BuildMasters | null;
  /** オプションを選べる（装備が OL で、マスタを読めていて、入力を止めていない） */
  selectable: boolean;
  disabled: boolean;
  onChange: (line: OverloadLine | null) => void;
}) {
  const values = line && masters?.overload.options.find((o) => o.option === line.option)?.values;
  return (
    <span className="gear-inputs">
      <select
        value={line?.option ?? ''}
        {...inertControlProps(!selectable)}
        onChange={(e) => {
          if (!selectable) return;
          const option = e.target.value as OverloadOption | '';
          onChange(option === '' ? null : { option, level: line?.level ?? OVERLOAD_LEVEL_MIN });
        }}
      >
        <option value="">オプション {position + 1}: なし</option>
        {(masters?.overload.options ?? []).map((o) => (
          <option key={o.option} value={o.option}>
            {o.name.ja}
          </option>
        ))}
      </select>
      {/* OL の行は Lv ではなく上昇する % で選ぶ（値は overload.json の values。保存は Lv のまま） */}
      <select
        aria-label={`オプション ${position + 1} の上昇値`}
        value={line?.level ?? OVERLOAD_LEVEL_MIN}
        {...inertControlProps(disabled || line === undefined)}
        onChange={(e) =>
          !disabled &&
          line &&
          onChange({ ...line, level: clampInt(Number(e.target.value), OVERLOAD_LEVEL_MIN, OVERLOAD_LEVEL_MAX) })
        }
      >
        {!values ? (
          <option value={OVERLOAD_LEVEL_MIN}>—</option>
        ) : (
          values.map((v, lv) => (
            <option key={lv} value={lv + OVERLOAD_LEVEL_MIN}>
              {v.toFixed(2)}%
            </option>
          ))
        )}
      </select>
    </span>
  );
}

/** キューブ: 種類と Lv */
function CubeField({
  cube,
  masters,
  disabled,
  onChange,
}: {
  cube: BuildInput['cube'];
  masters: BuildMasters | null;
  disabled: boolean;
  onChange: (cube: BuildInput['cube']) => void;
}) {
  return (
    <div className="field gear">
      <span>キューブ</span>
      <span className="gear-inputs">
        <select
          value={cube?.id ?? ''}
          {...inertControlProps(disabled || !masters)}
          onChange={(e) => {
            if (disabled || !masters) return;
            const id = e.target.value === '' ? null : Number(e.target.value);
            onChange(id === null ? null : { id, level: cube?.level ?? CUBE_LEVEL_MIN });
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
          value={cube?.level ?? CUBE_LEVEL_MIN}
          min={CUBE_LEVEL_MIN}
          max={CUBE_LEVEL_MAX}
          disabled={disabled || cube === null}
          onCommit={(level) => cube && onChange({ ...cube, level })}
        />
      </span>
    </div>
  );
}

/** コレクション: R・SR の Lv と、宝物の段階（宝物はコレクションの枠に付ける） */
function CollectionField({
  character,
  build,
  collection,
  treasurePhase,
  disabled,
  onChange,
}: {
  character: CharacterData;
  /** 保存している入力（宝物の選択で、保存している育成のコレクションを変える） */
  build: SlotBuild;
  /** 出す値（スペック固定なら fixedSpecBuild のもの） */
  collection: BuildInput['collection'];
  treasurePhase: TreasurePhase | null;
  disabled: boolean;
  onChange: Props['onChange'];
}) {
  const hasTreasure = character.treasure !== null && treasurePhase !== 0;
  return (
    <div className="field gear">
      <span>コレクション</span>
      <span className="gear-inputs">
        {/* 宝物の段階はここで選ぶ（宝物はコレクションの枠に付ける）。
            宝物はスペック固定でも選べる */}
        <select
          value={
            !hasTreasure
              ? (collection?.rarity ?? '')
              : treasurePhase === null
                ? UNKNOWN_TREASURE_OPTION
                : treasureOptionValue(treasurePhase)
          }
          {...inertControlProps(disabled && character.treasure === null)}
          onChange={(e) => {
            if (disabled && character.treasure === null) return;
            // スペック固定の間（disabled）は宝物の段階だけを変え、保存している育成には触れない
            onChange(
              collectionPatch(e.target.value, {
                fixedSpec: disabled,
                hasTreasure,
                build,
                level: collection?.level ?? 0,
              }),
            );
          }}
        >
          {/* いまの値として出すだけ（ほかの値から選び直すことはできない） */}
          {hasTreasure && treasurePhase === null && (
            <option value={UNKNOWN_TREASURE_OPTION} disabled>
              宝物（段階は未確定）
            </option>
          )}
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
          value={hasTreasure ? COLLECTION_LEVEL_MAX : (collection?.level ?? 0)}
          min={0}
          max={COLLECTION_LEVEL_MAX}
          disabled={disabled || hasTreasure || collection === null}
          onCommit={(level) => collection && onChange({ build: { ...build, collection: { ...collection, level } } })}
        />
      </span>
    </div>
  );
}
