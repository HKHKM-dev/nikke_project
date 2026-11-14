// 比べる設定（CompareSetup）とその部品、設定が ID で指す観測値の値の読み（plan/design-stage19.md 2.3 節）
import type { BuildEffectKind } from '../../buildEffects.ts';
import type { ObservationValue } from './types.ts';
import type { BurstDelayOverride } from '../../burst/landing.ts';
import type { DefenceRounding, EnemyDebuffTiming } from '../../damage.ts';
import type { AttackRounding } from '../../skills/buffs.ts';
import type { SustainedDamagePlacement } from '../../skills/burstDamage.ts';
import { parseSkillDefinition, SKILL_SLOTS, type SkillDefinition, type SkillSlot } from '../../skills/types.ts';

/** 予測の条件（録画に書かれていない、モデルの側の設定）。省略は既定値 */
export type CompareSetup = {
  /** data/enemies.json のプリセットの id */
  enemy: string;
  /** 出来事のセット（例: range-3min-jump）。省略は無し */
  events?: string[];
  /** 省略 true */
  burst?: boolean;
  /** 省略 180 */
  durationSeconds?: number;
  /** 省略 1 */
  coreHitRate?: number;
  /** 省略 true */
  distanceBonus?: boolean;
  /** 省略 1 */
  hitRate?: number;
  /**
   * 条件の決め方。'auto' は的の条件の表と着地点の時間割り（frame/landing.ts）で決める（coreHitRate・distanceBonus・
   * hitRate は、表が未測定の項目にだけ使う）。**省略は 'manual'**
   */
  condition?: 'auto' | 'manual';
  /**
   * 中遠の着地点を 1 か所に固定する（録画で読んだ着地点。plan/verification.md「実距離への換算」）。省略は配分。
   * 条件が手入力でも書ける（飛ぶ時間・スキルのヒットのコアの割合は条件の決め方に依らず着地点で引く。plan/design-anis-star-unimplemented.md 2 節）
   */
  midFarLanding?: MidFarLanding;
  /** 近の着地点を、並びの 1 回目・2 回目の順に固定する（録画で読んだ着地点。C-0155）。省略は配分 */
  nearLanding?: NearLanding[];
  /** 遠の着地点を、並びの 1 回目・2 回目の順に固定する（録画で読んだ着地点。C-0477・V-0328）。省略は配分 */
  farLanding?: FarLanding[];
  /**
   * V-0086: 録画で読んだ的のジャンプの窓を持つ観測値の id（同じ録画。値は [始まり, 終わり, 始まり, 終わり, …] のゲーム内の秒）。
   * 出来事のセットの狙えない窓（代表値。C-0546・C-0553）と、着地点の区間の切れ目をこれで置き換える。省略は代表値
   */
  jumpWindows?: string;
  /**
   * 録画の画で数えた、発が壊した障害物（plan/design-anis-star-gauge-timing.md 2.2 節）。slot は枠（1 始まり）、shot はその枠の
   * モデルの発の番号（1 始まり）、count は個数を持つ観測値の id（同じ録画・use が input・値は正の整数）。省略は無し
   */
  obstacles?: { slot: number; shot: number; count: string }[];
  /**
   * 録画で数えた、発ごとに的に当たったペレットの数（TeamInput.pelletHits。plan/design-pellet-hit.md 3 節）。
   * slot は枠（1 始まり）、counts は 1 発目からの数の並びを持つ観測値の id（同じ録画・use が input・値は 0 以上の整数の配列）。
   * 回数トリガー pelletHit の回数にだけ効く。省略は無し
   */
  pelletHits?: { slot: number; counts: string }[];
  /**
   * V-0165: 持続の命中率▲（C-0170）をコア命中率に効かせるか（TeamInput.sustainedHitRateUp）。省略 true。
   * false は C-0170 の前の形で、予測の仮説（H0）の override に使う
   */
  sustainedHitRateUp?: boolean;
  /**
   * 持続ダメージ▲の式の中の置き場所（TeamInput.sustainedDamagePlacement。plan/design-sustained-damage-up.md 3.3 節）。
   * 省略はいまのモデル。予測の仮説（H1〜H3）の override に使う
   */
  sustainedDamagePlacement?: SustainedDamagePlacement;
  /**
   * 攻撃力▲の丸め（TeamInput.attackRounding。V-0265）。省略はいまのモデル（C-0027）。
   * 予測の仮説の override に使う
   */
  attackRounding?: AttackRounding;
  /** EnemyInput.defenceRounding の override（予測の仮説）。省略はいまのモデル（四捨五入。C-0790） */
  defenceRounding?: DefenceRounding;
  /** EnemyInput.burstHitEnemyDebuffs の override（予測の仮説。バーストのヒットだけを替える）。省略はいまのモデル（発動の時点。C-0795） */
  burstHitEnemyDebuffs?: EnemyDebuffTiming;
  /**
   * EnemyInput.burstEffectEnemyDebuffs の override（予測の仮説。バースト使用時の追加ダメージだけを替える）。省略はいまのモデル
   * （効果の発火の時点。C-0838）
   */
  burstEffectEnemyDebuffs?: EnemyDebuffTiming;
  /** V-0165: false なら、録画（予測の編成）の宝物の段階を使わず、どの枠も基礎版のスキルにする。省略 true */
  treasure?: boolean;
  /**
   * スペック固定 OFF の録画で、育成の効果層のうちこの種類（overload・cube・collection）を外す。
   * 「その効果は乗らない」という予測の仮説（H0）の override に使う。攻撃力（キャラ画面の値）は変えない。省略は外さない
   */
  buildEffectsOff?: BuildEffectKind[];
  /**
   * 定義に効果を足す（plan/design-target-vocab.md 4 節）。結論の無い効果を、定義のファイルを変えずに予測の仮説の
   * override でだけ入れる。rid のキャラの skill（treasure なら宝物版）の effects の末尾に、effect（定義の JSON の書き方）を足す。
   * replace（0 始まり）があれば、末尾に足さずにその位置の効果を置き換える（対象を絞るなど、定義の効果の読みを替える仮説）
   */
  addEffects?: AddedEffect[];
  /**
   * V-0231: これらの rid の定義（基礎版・宝物版）から回復（heal）を落とす。回復を定義する前のモデルの形で、予測の仮説（H0）の
   * override に使う（plan/design-heal-vocabulary.md 6 節の論点 2）。省略は無し
   */
  dropHeals?: number[];
  /**
   * 定義から効果を落とす（plan/design-elegg-s3.md の経過）。モデルには撃たない枠が無いので、録画で撃たなかった枠の、射撃の
   * 回数で起きる効果（実機では起きない）を外して比べる。rid のキャラの skill（treasure なら宝物版）の effects の index（0 始まり）。
   * addEffects より前に落とす
   */
  dropEffects?: DroppedEffect[];
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 2 節）: バーストの遅れの表（burst/landing.ts）を rid ごとに上書きする。
   * row が null なら表の行を外す（遅れ 0）。予測の仮説の override と、条件の違いを試す観測値に使う。省略は表のまま
   */
  burstDelays?: BurstDelayOverrideSetup[];
  /**
   * 同 3 節: 手で撃ったチェーンの始まり（I の本当の発動）のゲーム内のフレームの並びを持つ観測値の id（同じ録画・use が input・
   * 値は昇順の 0 以上の整数の配列。TeamInput.manualBursts）。省略はオートバースト
   */
  manualBursts?: string;
  /**
   * 語彙はあるのに撮っていない効果の撮影（plan/design-skill-unrecorded.md 5 節）: バーストを使わない枠（1 始まり。オートバースト OFF で
   * 手で撃たなかった枠。TeamInput.noBurstSlots）。burst が true のときだけ。省略は全員使う
   */
  noBurstSlots?: number[];
  /**
   * 録画で撃たなかった枠（1 始まり。台帳の fires: false の枠。V-0541）。モデルには撃たない枠が無いので、
   * 代わりに弾丸命中率を 0 にする（通常攻撃のダメージもゲージも出ない）。射撃の回数のきっかけは残るので、要れば dropEffects で外す
   * （撃たない枠をモデルに足せば要らなくなる。V-0605 の holdFire がその形で、戦闘の全体の区間にすれば置き換えられるが、移すのは後）。
   * 条件が auto（射撃場の表）のときは書かない。省略は全員撃つ
   */
  noFireSlots?: number[];
  /**
   * V-0605: 録画でオート射撃を手で OFF にしていた枠（1 始まり）と、その時間を持つ観測値の id（同じ録画・use が input・値は
   * [OFF, ON, OFF, ON, …] のゲーム内のフレーム（戦闘開始から）。昇順の 0 以上の整数で偶数個。TeamInput.holdFire）。その枠だけ
   * 撃たずにハイドする。省略は無し
   */
  holdFire?: { slot: number; frames: string }[];
};

/** CompareSetup.burstDelays の 1 件 */
export type BurstDelayOverrideSetup = {
  rid: number;
  treasure?: boolean;
  row: null | {
    hitFrames: number;
    effectFrames: number;
    hitOffsets?: number[];
    windowFromActivation?: true;
    sameActivationBuffsOnHit?: true;
    origin?: 'mark' | 'activation';
  };
};

/** 比べる設定の遅れの上書きを、キャラの burstDelayOverride にする（結論の ID は無いので、表の行の claim は空） */
export function burstDelayOverrideOf(o: BurstDelayOverrideSetup): BurstDelayOverride {
  const r = o.row;
  return {
    ...(o.treasure === true ? { treasure: true } : {}),
    row:
      r === null
        ? null
        : {
            resourceIds: [o.rid],
            ...(r.windowFromActivation === true ? { windowFromActivation: true as const } : {}),
            ...(r.sameActivationBuffsOnHit === true ? { sameActivationBuffsOnHit: true as const } : {}),
            delays: {
              hitFrames: r.hitFrames,
              effectFrames: r.effectFrames,
              ...(r.hitOffsets === undefined ? {} : { hitOffsets: r.hitOffsets }),
              ...(r.origin === undefined ? {} : { origin: r.origin }),
            },
            claim: '',
          },
  };
}

/** CompareSetup.addEffects の 1 件 */
export type AddedEffect = {
  rid: number;
  skill: SkillSlot;
  treasure?: boolean;
  effect: Record<string, unknown>;
  replace?: number;
};

/**
 * 定義に効果を足して読み直す（読み込みの検査をそのまま通す）。support・burstStepMode は読み込みで決まる欄なので、JSON に戻すときに外す。
 * 敵に付く状態の付与は、読み込みで target を "allies" に読み替えて enemy の印を付けるので、JSON の形
 * （target: "enemy"）に戻す
 */
export function withAddedEffects(definition: SkillDefinition, adds: readonly AddedEffect[]): SkillDefinition {
  if (adds.length === 0) return definition;
  const json = JSON.parse(JSON.stringify(definition)) as {
    skills: Record<string, { support?: unknown; effects: unknown[] }>;
    treasureSkills?: Record<string, { support?: unknown; effects: unknown[] }>;
  };
  for (const group of [json.skills, json.treasureSkills ?? {}]) {
    for (const slot of SKILL_SLOTS) {
      const entry = group[slot];
      if (entry === undefined) continue;
      delete entry.support;
      // 使用武器の変更の state から読み込みが足した付与は、読み直しでもう一度足されるので外す
      entry.effects = entry.effects.filter((e) => (e as { weaponChangeOf?: true }).weaponChangeOf !== true);
      for (const effect of entry.effects as Record<string, unknown>[]) {
        // バースト段階の変更の側（burstStepMode）も読み込みで書く欄
        delete effect.burstStepMode;
        if (effect.kind !== 'state' || effect.enemy !== true) continue;
        delete effect.enemy;
        effect.target = 'enemy';
      }
    }
  }
  for (const add of adds) {
    const group = add.treasure === true ? json.treasureSkills : json.skills;
    const entry = group?.[add.skill];
    if (entry === undefined)
      throw new Error(`rid ${add.rid} の ${add.treasure === true ? '宝物版の ' : ''}${add.skill} が無い`);
    if (add.replace === undefined) entry.effects.push(add.effect);
    else if (add.replace in entry.effects) entry.effects[add.replace] = add.effect;
    else throw new Error(`rid ${add.rid} の ${add.skill} に ${add.replace} 番目の効果が無い`);
  }
  return parseSkillDefinition(json);
}

/** 中遠の 3 か所（足元 584・571・561。C-0044） */
export const MID_FAR_LANDINGS = ['A', 'B', 'C'] as const;

export type MidFarLanding = (typeof MID_FAR_LANDINGS)[number];

/** 近の 2 か所（的の見かけの大きさで分かれる。C-0155） */
export const NEAR_LANDINGS = ['A', 'B'] as const;

export type NearLanding = (typeof NEAR_LANDINGS)[number];

/** 遠の 2 か所（足元 542・534 前後。C-0477） */
export const FAR_LANDINGS = ['A', 'B'] as const;

export type FarLanding = (typeof FAR_LANDINGS)[number];

/** 中遠の着地点を固定する enemyLandingsOf の fixed */
export function midFarFixed(landing: MidFarLanding | undefined): Record<string, string> {
  return landing === undefined ? {} : { midFar: `midFar${landing}` };
}

/** 中遠・近・遠の着地点を固定する enemyLandingsOf の fixed（近と遠は 1 回目・2 回目の順） */
export function landingFixed(
  midFar: MidFarLanding | undefined,
  near: readonly NearLanding[] | undefined,
  far?: readonly FarLanding[],
): Record<string, string | string[]> {
  return {
    ...midFarFixed(midFar),
    ...(near === undefined ? {} : { near: near.map((n) => `near${n}`) }),
    ...(far === undefined ? {} : { far: far.map((n) => `far${n}`) }),
  };
}

/** 手で撃ったチェーンの始まりの並び（昇順の 0 以上の整数）。形が違えば undefined */
export function manualBurstsOf(value: ObservationValue | undefined): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ok = value.every((f, i) => Number.isInteger(f) && f >= 0 && (i === 0 || f > value[i - 1]!));
  return ok ? value : undefined;
}

/** V-0605: オート射撃を OFF にしていた時間（[OFF, ON, …] の昇順の 0 以上の整数で偶数個）を [start, end) の並びにする。形が違えば undefined */
export function holdFireRangesOf(value: ObservationValue | undefined): { start: number; end: number }[] | undefined {
  return manualBurstsOf(value) === undefined ? undefined : jumpWindowsOf(value);
}

/** setup.jumpWindows の観測値の値（[始まり, 終わり, …] の秒）を窓の列にする */
export function jumpWindowsOf(value: ObservationValue | undefined): { start: number; end: number }[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0) return undefined;
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < value.length; i += 2) {
    const start = value[i]!;
    const end = value[i + 1]!;
    if (!(start < end) || (out.length > 0 && start < out.at(-1)!.end)) return undefined;
    out.push({ start, end });
  }
  return out;
}

/** CompareSetup.dropEffects の 1 件 */
export type DroppedEffect = { rid: number; skill: SkillSlot; index: number; treasure?: boolean };
