// Stage 13: 育成入力の拡張 B — 効果層（plan/design-stage12.md 3・12 節）。OL 装備のオプション・キューブの固有効果・
// コレクション（R / SR）の武器種効果を、枠の常時バフ（BuffTotals の比率の加算）に写す。
// どれも「戦闘開始時」の無期限の効果なので、スキルの passive と同じく区間を割らない。計算側（calc・sim）はマスタを知らず、
// 呼び出し側（calc の App.tsx・CLI の --build）が resolveBuildEffects の結果を TeamSlotInput.buildEffects に入れる
// （Stage 12 の attackOverride と同じ流儀）。スキル側の分配は skills/timeline.ts の resolvePassiveStates。
//
// キューブとコレクションのスキルは説明文を読まず、スキル ID ごとの対応表（CUBE_SKILL_EFFECTS / COLLECTION_SKILL_EFFECTS）で
// stat と数値の番号（description_value_NN）を決める。表に無い ID はマスタが増えたということなので「未定義」として知らせる。
import { GEAR_PARTS, findCollection, findCube, findOverloadOption, validateBuild, type BuildInput } from './build.ts';
import type { BuffStat } from './skills/types.ts';
import type { BuildMasters, CharacterData, GearPart, LocalizedText, OverloadOption, SkillRaw } from './types.ts';

export type BuildEffectKind = 'overload' | 'cube' | 'collection';

export type BuildEffectSource = {
  kind: BuildEffectKind;
  /** OL はオプション名、キューブ・コレクションはスキル名 */
  name: LocalizedText;
  /** OL: 部位 */
  part?: GearPart;
  /** OL: 行（0 始まり） */
  line?: number;
  /** キューブ・コレクション: スキル ID */
  skillId?: number;
  /** OL はオプションの Lv（1..15）、キューブ・コレクションはスキルの段階（1..） */
  level: number;
};

/** 常時バフ 1 件。value は比率（0.1463 = +14.63%）。対象は常に装備した枠自身 */
export type BuildEffect = { source: BuildEffectSource; stat: BuffStat; value: number };

/**
 * 計算に入れない効果。ignored = ダメージに効かない（HP・防御力・回復・被ダメージ・遮蔽物）、
 * unsupported = ダメージに効くが未対応（パーツ・貫通・防御力無視・弾丸チャージ）
 */
export type BuildEffectNoteLevel = 'ignored' | 'unsupported';
export type BuildEffectNote = { source: BuildEffectSource; level: BuildEffectNoteLevel; message: LocalizedText };

export type BuildEffects = { effects: BuildEffect[]; notes: BuildEffectNote[] };

export const NO_BUILD_EFFECTS: Readonly<BuildEffects> = Object.freeze({ effects: [], notes: [] });

/** OL オプション → stat。null はダメージに効かない（防御力） */
export const OVERLOAD_OPTION_STAT: Record<OverloadOption, BuffStat | null> = {
  elementDamage: 'elementDamage',
  hitRate: 'hitRate',
  maxAmmo: 'maxAmmo',
  attack: 'attack',
  chargeDamage: 'chargeDamage',
  chargeSpeed: 'chargeSpeed',
  critRate: 'critRate',
  critDamage: 'critDamage',
  defence: null,
};

/** スキル 1 つの対応。effects の ref は description_value_NN の NN（値は % 表記） */
export type BuildSkillMapping = {
  effects: { stat: BuffStat; ref: number }[];
  notes?: { level: BuildEffectNoteLevel; message: LocalizedText }[];
};

const ignored = (ja: string, en: string) => ({ level: 'ignored' as const, message: { ja, en } });
const unsupported = (ja: string, en: string) => ({ level: 'unsupported' as const, message: { ja, en } });
const only = (stat: BuffStat): BuildSkillMapping => ({ effects: [{ stat, ref: 1 }] });
const none = (...notes: NonNullable<BuildSkillMapping['notes']>): BuildSkillMapping => ({ effects: [], notes });

/** 全キューブ共通の 2 つ目のスキル「アンチコード」（有利コードの攻撃ダメージ▲）のスキル ID */
const ANTI_CODE_SKILL_IDS = [
  4007012, 4008012, 4009012, 4010012, 4011012, 4012012, 4013012, 40140102, 4015012, 4016012, 4017012, 4018012, 4019012,
  4020012, 4021012, 4022012, 4023012,
];

/** キューブのスキル ID → 効果（data/masters/cubes.json の説明文から起こした） */
export const CUBE_SKILL_EFFECTS: Readonly<Record<number, BuildSkillMapping>> = {
  4007011: only('hitRate'), // アサルト: 命中率▲
  4008011: only('chargeDamage'), // タクティカルアサルト: チャージダメージ▲
  4009011: only('reloadSpeed'), // ベアー: リロード速度▲
  4010011: none(unsupported('弾丸チャージ（10 発射撃ごと）は未対応', 'Ammo refill every 10 shots is not modeled')), // タクティカルベアー
  4011011: only('chargeSpeed'), // ブースト: チャージ速度▲
  4012011: only('maxAmmo'), // タクティカルブースト: 最大装弾数▲
  4013011: only('burstGaugeSpeed'), // クオンタム: バーストゲージのチャージ速度▲
  40140101: none(ignored('最大 HP▲（ダメージに無関係）', 'Max HP (no effect on damage)')), // ビガー
  4015011: none(ignored('防御力▲（ダメージに無関係）', 'DEF (no effect on damage)')), // エンデュアー
  4016011: none(ignored('与える HP 回復量▲（ダメージに無関係）', 'Healing dealt (no effect on damage)')), // ヒーリング
  4017011: none(ignored('受けるダメージ▼（ダメージに無関係）', 'Damage taken (no effect on damage)')), // テンパリング
  4018011: none(ignored('HP 条件の最大 HP▲（ダメージに無関係）', 'Emergency max HP (no effect on damage)')), // アシスト
  4019011: none(unsupported('パーツダメージ▲は未対応（パーツを扱わない）', 'Parts damage is not modeled')), // デストロイ
  4020011: none(unsupported('貫通ダメージ▲は未対応（貫通を扱わない）', 'Pierce damage is not modeled')), // ピアシング
  4021011: none(unsupported('防御力無視ダメージ▲は未対応', 'True damage is not modeled')), // クラッシュ
  4022011: none(ignored('遮蔽物最大 HP▲（ダメージに無関係）', 'Cover max HP (no effect on damage)')), // カバー
  4023011: only('distributedDamage'), // ディバイド: 分配ダメージ▲
  ...Object.fromEntries(ANTI_CODE_SKILL_IDS.map((id) => [id, only('elementDamage')])),
};

const COLLECTION_DEFENCE = ignored('防御力▲（ダメージに無関係）', 'DEF (no effect on damage)');
const withDefence = (stat: BuffStat): BuildSkillMapping => ({
  effects: [{ stat, ref: 1 }],
  notes: [COLLECTION_DEFENCE],
});

/** コレクション（R / SR）のスキル ID → 効果（data/masters/collections.json の説明文から起こした） */
export const COLLECTION_SKILL_EFFECTS: Readonly<Record<number, BuildSkillMapping>> = {
  71110101: withDefence('coreDamage'), // AR R: コアダメージ▲
  71210101: withDefence('coreDamage'), // AR SR
  71140101: withDefence('maxAmmo'), // MG R: 最大装弾数▲
  71240101: withDefence('maxAmmo'), // MG SR
  71130101: withDefence('chargeDamage'), // RL・SR R: チャージダメージ倍率▲
  71230101: withDefence('chargeDamage'), // RL・SR SR
  71150101: withDefence('normalAttackDamage'), // SG R: 通常攻撃ダメージ倍率▲
  71250101: withDefence('normalAttackDamage'), // SG SR
  71190101: withDefence('normalAttackDamage'), // SMG R
  71290101: withDefence('normalAttackDamage'), // SMG SR
  71200201: none(
    ignored('受けるダメージ▼・遮蔽物最大 HP▲（ダメージに無関係）', 'Damage taken / cover max HP (no effect on damage)'),
  ), // SR 共通の 2 つ目
};

function skillValuePercent(skill: SkillRaw, ref: number, stage: number): number {
  const text = skill.values[ref - 1]?.[stage - 1];
  if (text === undefined) throw new RangeError(`skill ${skill.id}: description_value_${ref} has no stage ${stage}`);
  const value = Number(text);
  if (!Number.isFinite(value))
    throw new RangeError(`skill ${skill.id}: description_value_${ref} is not numeric: ${text}`);
  return value;
}

function mapSkill(
  out: BuildEffects,
  kind: 'cube' | 'collection',
  table: Readonly<Record<number, BuildSkillMapping>>,
  skill: SkillRaw,
  stage: number,
): void {
  if (stage <= 0) return; // 未解放
  const source: BuildEffectSource = { kind, name: skill.name, skillId: skill.id, level: stage };
  const mapping = table[skill.id];
  if (mapping === undefined) {
    out.notes.push({
      source,
      level: 'unsupported',
      message: { ja: `未定義のスキル（ID ${skill.id}）`, en: `Undefined skill (id ${skill.id})` },
    });
    return;
  }
  for (const { stat, ref } of mapping.effects) {
    out.effects.push({ source, stat, value: skillValuePercent(skill, ref, stage) / 100 });
  }
  for (const note of mapping.notes ?? []) out.notes.push({ source, ...note });
}

export type BuildEffectsOptions = {
  /** Stage 9 の宝物の段階。1 以上なら R / SR のコレクションは付けていない（宝物のスキルは skills/treasure.ts が差し替える） */
  treasurePhase?: number;
};

/**
 * 育成入力の効果層。OL（部位順・行順）→ キューブ（スキル順）→ コレクション（スキル順）の順に並べる。
 * 範囲外・マスタに無いものは validateBuild と同じく RangeError。スペック固定（fixedSpecBuild）は空になる
 */
export function resolveBuildEffects(
  character: Pick<CharacterData, 'weaponType' | 'corporation'>,
  build: BuildInput,
  masters: BuildMasters,
  options: BuildEffectsOptions = {},
): BuildEffects {
  validateBuild(character, build, masters);
  const out: BuildEffects = { effects: [], notes: [] };
  for (const part of GEAR_PARTS) {
    (build.gear[part]?.overload ?? []).forEach((line, index) => {
      const data = findOverloadOption(masters, line.option)!;
      const source: BuildEffectSource = { kind: 'overload', name: data.name, part, line: index, level: line.level };
      const stat = OVERLOAD_OPTION_STAT[line.option];
      if (stat === null) {
        out.notes.push({ source, ...ignored('防御力▲（ダメージに無関係）', 'DEF (no effect on damage)') });
        return;
      }
      const percent = data.values[line.level - 1];
      if (percent === undefined) throw new RangeError(`overload ${line.option}: no value at Lv${line.level}`);
      out.effects.push({ source, stat, value: percent / 100 });
    });
  }
  if (build.cube !== null) {
    const cube = findCube(masters, build.cube.id)!;
    cube.skills.forEach((skill, i) => {
      mapSkill(out, 'cube', CUBE_SKILL_EFFECTS, skill, cube.skillStages[i]?.[build.cube!.level - 1] ?? 0);
    });
  }
  if (build.collection !== null && (options.treasurePhase ?? 0) === 0) {
    const collection = findCollection(masters, build.collection.rarity, character.weaponType)!;
    collection.skills.forEach((skill, i) => {
      mapSkill(
        out,
        'collection',
        COLLECTION_SKILL_EFFECTS,
        skill,
        collection.skillStages[i]?.[build.collection!.level] ?? 0,
      );
    });
  }
  return out;
}
