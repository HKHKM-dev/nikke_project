// data/skills/ の手書き定義がキャラデータと整合していることを固定する。
// Stage 9: 宝物版の定義（treasureSkills）は、宝物の全段階（3）で差し替えたキャラデータ・定義に同じ検査を掛ける。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../../burst/landing.ts';
import { stanceFrames } from '../../frame/firing.ts';
import type { CharacterData } from '../../types.ts';
import {
  resolveBurstDamage,
  resolveDamageEffects,
  resolveDotEffects,
  resolvePerShotDamage,
  resolveShotGauges,
  resolveShotPauses,
  resolveTimerGauges,
} from '../burstDamage.ts';
import {
  MAX_SKILL_LEVELS,
  resolveCoverHeals,
  resolveInstant,
  resolvePassives,
  resolveStackChanges,
  resolveStateContents,
  resolveTimed,
  skillValue,
} from '../resolve.ts';
import { counterMax } from '../counters.ts';
import { SKILL_LEVEL_MAX, targetPhraseOf } from '../resolve.ts';
import { ATTACK_SPEED_WEAPONS } from '../parse/timed.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from '../treasure.ts';
import {
  isMaxStacksUpContent,
  isSkillCooldownDownContent,
  parseSkillDefinition,
  parseSkillIndex,
  SKILL_SLOTS,
  type SkillSlot,
  type StateContentItem,
  statContentsOf,
} from '../types.ts';

const DATA_DIR = join(import.meta.dirname, '../../../data');
const SKILLS_DIR = join(DATA_DIR, 'skills');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const index = parseSkillIndex(readJson(join(SKILLS_DIR, 'index.json')));
const files = readdirSync(SKILLS_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => Number(f.replace('.json', '')))
  .sort((a, b) => a - b);

/**
 * 維持の秒が Lv で変わる付与（resourceId:スロット:durationRef）。説明文の値がそうなっているものだけ（D の S2 の気絶免疫、アスカの
 * バーストの貫通特化の 15・20・25 秒）
 */
const LEVEL_DEPENDENT_DURATIONS = new Set(['40:skill2:3', '830:burst:1']);

function isLevelDependentDuration(resourceId: number, slot: SkillSlot, durationRef: number | undefined): boolean {
  return LEVEL_DEPENDENT_DURATIONS.has(`${resourceId}:${slot}:${durationRef}`);
}

/**
 * 値の上限（%。既定 100）。上限の理由はキャラごとの注記（下の it の中）。レッドフード編: チャージ速度の超過分の変換の割合（240%）も
 * チャージダメージと同じ幅
 */
const VALUE_LIMITS: Partial<Record<string, number>> = {
  chargeDamage: 2000,
  chargeSpeedOverflow: 2000,
  maxAmmo: 1000,
  projectileStickDamage: 1000,
  projectileExplosionDamage: 1000,
  chargeSpeed: 1000,
  attack: 200,
  chargeDamageMultiplier: 200,
  sequentialAttackDamage: 200,
  attackDamage: 200,
  hitRate: 200,
  trueDamage: 200,
  sustainedDamage: 200,
  elementDamage: 200,
};

/**
 * 上の上限を超える値（resourceId:スロット:ref → 上限）。ディーゼル：ウィンタースイーツ: S1 のクライマックスの持続ダメージ▲は Lv10 で 235.03%、
 * S2 のフルチャージの持続ダメージ▲は 318.14%。ミルク：ブルーミングバニー: バーストの貫通ダメージ▲は Lv10 で 117.64%・攻撃力▲は 220%
 */
const VALUE_LIMIT_EXCEPTIONS: Partial<Record<string, number>> = {
  '75:skill1:5': 300,
  '75:skill2:2': 400,
  '143:burst:1': 200,
  '143:burst:3': 300,
};

/** 状態の中身の項目が説明文を指す ref（stat の ref・最大スタック数▲の amountRef・スキルのクールタイム▼の percentRef） */
function contentRefsOf(c: StateContentItem): number[] {
  if (isMaxStacksUpContent(c)) return [c.maxStacksUp.amountRef];
  if (isSkillCooldownDownContent(c)) return [c.skillCooldownDown.percentRef];
  return c.ref === undefined ? [] : [c.ref];
}

describe('data/skills', () => {
  it('index lists exactly the definition files, sorted and without duplicates', () => {
    expect([...index.resourceIds].sort((a, b) => a - b)).toEqual(files);
    expect(index.resourceIds).toEqual([...index.resourceIds].sort((a, b) => a - b));
    expect(new Set(index.resourceIds).size).toBe(index.resourceIds.length);
  });

  // 基礎版と、treasureSkills があれば宝物版（全段階で差し替えたもの）
  const variants = files.flatMap((resourceId) => {
    const def = parseSkillDefinition(readJson(join(SKILLS_DIR, `${resourceId}.json`)));
    const character = readJson(join(DATA_DIR, 'characters', `${resourceId}.json`)) as CharacterData;
    const base = { label: `${resourceId}`, resourceId, def, character };
    if (def.treasureSkills === undefined || character.treasure === null) return [base];
    const applied = applyTreasure(character, def, TREASURE_PHASE_MAX);
    return [
      base,
      { label: `${resourceId} (treasure)`, resourceId, def: applied.definition!, character: applied.character },
    ];
  });

  describe.each(files)('treasure definition %i (Stage 9)', (resourceId) => {
    const def = parseSkillDefinition(readJson(join(SKILLS_DIR, `${resourceId}.json`)));
    const character = readJson(join(DATA_DIR, 'characters', `${resourceId}.json`)) as CharacterData;

    // 宝物版の定義が無いスロットは unsupported になる（設計書 2.2 節）ので、スロットが揃っていることまでは求めない
    it('exists only for characters with a treasure', () => {
      if (def.treasureSkills === undefined) return;
      expect(character.treasure, 'treasureSkills without a treasure').not.toBeNull();
    });
  });

  describe.each(variants)('definition $label', ({ resourceId, def, character }) => {
    // レッドフード編（plan/design-red-hood.md 2.1 節）: 使った段階の条件は、段階が 1 つでないキャラ（AllStep）にだけ意味がある
    it('writes burstStep conditions only for an AllStep character', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          const condition = 'condition' in effect ? effect.condition : undefined;
          if (condition?.burstStep === undefined) continue;
          expect(character.burstStep, `${slot}: burstStep needs an AllStep character`).toBe('AllStep');
        }
      }
    });

    // シュガー編（plan/design-sugar.md 2.1 節）: 自分への攻撃速度▲は、自分の武器が AR・SMG・SG のときだけ（読み込みは武器を知らない）
    it('writes attackSpeed on self only for an AR, SMG or SG character', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          if (!('target' in effect) || effect.target !== 'self') continue;
          // 自分に付く状態の中身も、付与の target で読み込みを通る（parse/state.ts）
          const speed =
            ('stat' in effect && effect.stat === 'attackSpeed') ||
            (effect.kind === 'state' && statContentsOf(effect.contents).some((c) => c.stat === 'attackSpeed'));
          if (!speed) continue;
          expect(ATTACK_SPEED_WEAPONS as readonly string[], `${slot}: attackSpeed on self`).toContain(
            character.weaponType,
          );
        }
      }
    });

    // A2 の B モード編（plan/design-a2-bmode-stance.md 3.1 節）: 射撃の姿勢の長さの倍率は、射撃姿勢維持型の武器のキャラにだけ効く
    it('writes fireStanceScale only for a fire-stance character', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          const scale =
            ('stat' in effect && effect.stat === 'fireStanceScale') ||
            (effect.kind === 'state' && statContentsOf(effect.contents).some((c) => c.stat === 'fireStanceScale'));
          if (!scale) continue;
          expect(stanceFrames(character.shot), `${slot}: fireStanceScale needs a fire-stance weapon`).not.toBeNull();
        }
      }
    });

    it('names the character of its file and a checked date', () => {
      expect(def.resourceId).toBe(resourceId);
      expect(character.resourceId).toBe(resourceId);
      // 記録の日付は日本時間（CI は UTC で動くので、タイムゾーンを明示する）
      expect(def.checkedAt <= new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })).toBe(true);
    });

    it('references values that exist for every level (buffs ≤ 100%, burst damage ≥ 100% at Lv10)', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          // Stage 11 モダニア: 使用武器の変更は damageRef、フラグの stat（装弾数無限）は ref を持たない
          // Stage 11 紅蓮BS: 循環は段ごとの ref、間隔の変更は ref を持たない（維持時間は下のテスト）
          // フラワー編: 周期のゲージ（burstGaugeHit）は ref を持たない。アニス：スター編: バースト再突入（burstReentry）も
          // 名前の付いた状態の語彙編: 付与は値を持たず、中身の項目が ref を持つ（上限は中身の stat で見る）
          // 2 段目の段 1: 解除（removeState）も値を持たない。V-0534: 射撃の止まり（shotPause）も
          const refs =
            effect.kind === 'weaponChange'
              ? [effect.damageRef, ...(effect.maxAmmoRef === undefined ? [] : [effect.maxAmmoRef])]
              : effect.kind === 'cycle'
                ? effect.steps.map((s) => s.ref)
                : effect.kind === 'state'
                  ? // 2 段目の段 14 の PR 3: 最大スタック数▲の項目の amountRef と、1 回に付けるスタックの数の stacksPerFireRef も
                    [
                      ...(effect.contents ?? []).flatMap(contentRefsOf),
                      ...(effect.stacksPerFireRef === undefined ? [] : [effect.stacksPerFireRef]),
                    ]
                  : // 2 段目の段 3: スタック量の増加は、足す数の amountRef
                    effect.kind === 'skillCooldownReduction'
                    ? [effect.percentRef]
                    : effect.kind === 'stackChange' || effect.kind === 'counterChange'
                      ? effect.amountRef === undefined
                        ? []
                        : [effect.amountRef]
                      : effect.kind === 'cycleEvery' ||
                          effect.kind === 'burstGaugeHit' ||
                          effect.kind === 'shotPause' ||
                          effect.kind === 'burstReentry' ||
                          effect.kind === 'burstStepChange' ||
                          effect.kind === 'removeState' ||
                          effect.kind === 'removeDebuff' ||
                          effect.kind === 'cancelState' ||
                          effect.kind === 'stateExtend' ||
                          effect.kind === 'summon' ||
                          effect.ref === undefined
                        ? []
                        : [effect.ref];
          for (const ref of refs) {
            const entry = character.skills[slot].values[ref - 1];
            expect(entry, `${slot} ref ${ref}`).toHaveLength(SKILL_LEVEL_MAX);
            for (let lv = 1; lv <= SKILL_LEVEL_MAX; lv++) {
              const v = skillValue(character.skills[slot], ref, lv);
              expect(v).toBeGreaterThan(0);
              // イサベルのバーストは Lv1 で 93.65%（Lv10 で 149.85%）なので、下限は Lv10 だけで見る
              if (effect.kind === 'burstDamage') {
                if (lv === SKILL_LEVEL_MAX) expect(v).toBeGreaterThanOrEqual(100);
              }
              // Stage 8 の倍率ダメージは 100% 未満もある（ドレイク S2 98.55%）ので上限を見ない。持続ダメージの 1 tick も倍率
              // ダメージなので上限を見ない（マナのバーストは Lv10 で 396%）。使用武器の変更の 1 発・装弾数も上限を見ない
              // （ウンファ：TU の徹甲炸裂弾は Lv10 で 105.6%）
              else if (
                effect.kind !== 'damage' &&
                effect.kind !== 'cycle' &&
                effect.kind !== 'dot' &&
                effect.kind !== 'weaponChange'
              ) {
                // Stage 11 紅蓮BS: バーストの攻撃力 115.12%・チャージダメージ 169.63% は 100% を超える（上限は 200% で見る）
                // アスカ: バーストの攻撃ダメージ 150.04%・命中率 101.37% も同じ。ヘルム: チャージダメージ倍率 158.4% も同じ
                // I-DOLL・サン: バーストの最大装弾数▲は Lv10 で 787.5%（C-0364。上限は 1000% で見る）
                // たきな: S2 の防御力無視ダメージ▲は Lv10 で 140.49%（上限は 200% で見る）
                // ラピ：レッドフード: S2 の発射体付着ダメージ▲は Lv10 で 150.72%・爆発▲は 100.6%、バースト III の付着▲は 421.2%（上限は 1000% で見る）
                // スノーホワイト：ヘビーアームズ: S2 のフルアクティブのチャージダメージ▲は Lv10 で 528%（上限は 1000% で見る）・順番攻撃ダメージ▲は
                // 158.4%（上限は 200% で見る）
                // エイダ: バーストの特殊改造のチャージダメージ▲は Lv10 で 1500%（上限は 2000% で見る）・チャージ速度▼は 300%（上限は 1000% で見る）
                // アークレンジャー・ブラック: バーストの持続ダメージ▲は Lv10 で 135.83%（上限は 200% で見る）
                // プリバティ: 宝物版バーストの有利コードの攻撃ダメージ▲は Lv10 で 130%（上限は 200% で見る）
                const stat =
                  effect.kind === 'timed' || effect.kind === 'passive'
                    ? effect.stat
                    : effect.kind === 'state'
                      ? statContentsOf(effect.contents).find((c) => c.ref === ref)?.stat
                      : undefined;
                // カウンタの増減の量は割合でなく、カウンタの上限で見る（ベルベットの弾丸ポーチは 6000 発）
                const limit =
                  VALUE_LIMIT_EXCEPTIONS[`${resourceId}:${slot}:${ref}`] ??
                  (effect.kind === 'counterChange' ? counterMax(effect.counter) : undefined) ??
                  (stat === undefined ? undefined : VALUE_LIMITS[stat]) ??
                  100;
                expect(v).toBeLessThanOrEqual(limit);
              }
            }
          }
        }
      }
    });

    it('count triggers resolve to the same positive integer at every level (Stage 8)', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          // 名前の付いた状態の語彙編: 付与（state）も timed と同じトリガー
          if (effect.kind !== 'timed' && effect.kind !== 'damage' && effect.kind !== 'state') continue;
          const t = effect.trigger;
          if (typeof t !== 'object' || !('everyRef' in t) || t.everyRef === undefined) continue;
          const counts = Array.from({ length: SKILL_LEVEL_MAX }, (_, i) =>
            skillValue(character.skills[slot], t.everyRef!, i + 1),
          );
          expect(
            counts.every((n) => Number.isInteger(n) && n >= 1),
            `${slot} everyRef ${t.everyRef}`,
          ).toBe(true);
          // 2 段目の段 3: クラウンの S2（リラックスの付与）の回数は Lv で変わる（Lv1 で 65 回 → Lv10 で 43 回。Lv ごとに読む）。
          // それまで回復（この検査の外）に書いていたので見えていなかった。付与のほかは、どの Lv も同じ回数
          if (effect.kind !== 'state') expect(new Set(counts).size, `${slot} everyRef ${t.everyRef}`).toBe(1);
        }
      }
    });

    // 2 段目の段 10（plan/design-skill-stage10.md 2.2 節）: バーストの「N 回順番に攻撃」は倍率を回数倍にし、遅れの表の分かれたヒットで
    // 等分する。回数とヒットの数がずれると、総量は合ったまま各ヒットが説明文の値から外れる
    it('burst hitsRef matches the split hits of the burst delay table at every level', () => {
      for (const effect of def.skills.burst.effects) {
        if (effect.kind !== 'burstDamage' || effect.hitsRef === undefined) continue;
        const splits = burstDelaysOf(character).hitOffsets?.length ?? 1;
        for (let lv = 1; lv <= SKILL_LEVEL_MAX; lv++) {
          expect(
            skillValue(character.skills.burst, effect.hitsRef, lv),
            `burst hitsRef ${effect.hitsRef} Lv${lv}`,
          ).toBe(splits);
        }
      }
    });

    // plan/design-jackal.md 2.2 節: 「〜敵1機に」で終わるバーストスキルダメージ▲は、burstDamage の値の載った ■ の行の対象の句で
    // 当てはまるかを決める。行が見つからないと印が付かないので、データの定義は全部見つかることを確かめる
    it('finds the description line of every burstDamage ref (its target phrase)', () => {
      for (const effect of def.skills.burst.effects) {
        if (effect.kind !== 'burstDamage') continue;
        expect(
          targetPhraseOf(character.skills.burst, effect.ref, SKILL_LEVEL_MAX),
          `burst ref ${effect.ref}`,
        ).toBeDefined();
        // 値が 2 つの行に載っていると、最初の行の対象の句で決まってしまう
        const lines = character.skills.burst.description.ja
          .split('■')
          .filter((l) => l.includes(`{description_value_${String(effect.ref).padStart(2, '0')}}`));
        expect(lines, `burst ref ${effect.ref}`).toHaveLength(1);
      }
    });

    it('timed effects reference a positive duration that does not change with the skill level', () => {
      for (const slot of SKILL_SLOTS) {
        for (const effect of def.skills[slot].effects) {
          // 名前の付いた状態の語彙編: 付与（state）の維持も同じ
          if (
            (effect.kind !== 'timed' && effect.kind !== 'cycleEvery' && effect.kind !== 'state') ||
            effect.durationRef === undefined
          )
            continue;
          const seconds = Array.from({ length: SKILL_LEVEL_MAX }, (_, i) =>
            skillValue(character.skills[slot], effect.durationRef!, i + 1),
          );
          expect(seconds[0], `${slot} durationRef ${effect.durationRef}`).toBeGreaterThan(0);
          // NIKKE の維持時間は Lv に依らないはず。崩れたらここで気づきたい。説明文の値が Lv で変わるものは除く（LEVEL_DEPENDENT_DURATIONS）
          if (isLevelDependentDuration(def.resourceId, slot, effect.durationRef)) continue;
          expect(new Set(seconds).size, `${slot} durationRef ${effect.durationRef}`).toBe(1);
        }
      }
    });

    it('resolves at Lv10 and values are non-decreasing with level', () => {
      const lv10 = resolvePassives(def, character, MAX_SKILL_LEVELS);
      const lv1 = resolvePassives(def, character, { skill1: 1, skill2: 1, burst: 1 });
      const burst10 = resolveBurstDamage(def, character, MAX_SKILL_LEVELS);
      const burst1 = resolveBurstDamage(def, character, { skill1: 1, skill2: 1, burst: 1 });
      const timed10 = resolveTimed(def, character, MAX_SKILL_LEVELS);
      const timed1 = resolveTimed(def, character, { skill1: 1, skill2: 1, burst: 1 });
      const damage10 = resolveDamageEffects(def, character, MAX_SKILL_LEVELS);
      const damage1 = resolveDamageEffects(def, character, { skill1: 1, skill2: 1, burst: 1 });
      // クルミ編: 持続ダメージ（dot）だけの定義もある
      const dot10 = resolveDotEffects(def, character, MAX_SKILL_LEVELS);
      const dot1 = resolveDotEffects(def, character, { skill1: 1, skill2: 1, burst: 1 });
      // ラム編: 即時効果（CT▼）だけの定義もある
      const instant10 = resolveInstant(def, character, MAX_SKILL_LEVELS);
      // モラン編: ゲージだけを溜める効果（burstGaugeHit）だけの定義もある
      const gauges10 = resolveShotGauges(def, character, MAX_SKILL_LEVELS).length + resolveTimerGauges(def).length;
      // V-0534: 射撃の止まり（shotPause）だけの定義もある（ラピ：レッドフード）
      const pauses10 = resolveShotPauses(def, character, MAX_SKILL_LEVELS).length;
      // 2 段目の段 3: 時間で変わる状態の中身（ソーダ：トゥインクルバニーのゴールデンチップ）とスタック量の増加だけの定義もある
      const states10 =
        resolveStateContents(def, character, MAX_SKILL_LEVELS).length +
        resolveStackChanges(def, character, MAX_SKILL_LEVELS).length;
      // シンデレラ編（V-0445）: 射撃ごとの倍率ダメージ（damage の every = 1。発に畳み込む）だけの定義もある
      const perShot10 = resolvePerShotDamage(def, character, MAX_SKILL_LEVELS).length;
      // 2 段目の段 17 の PR 3: 遮蔽物 HP 回復（coverHeal）だけの定義もある（ココアの S1）
      const coverHeals10 = resolveCoverHeals(def, character, MAX_SKILL_LEVELS).length;
      // ダメージに効く効果が 1 つも無いキャラ（デルタなど）は、全スロットが効果なしで notes だけ（noEffect・unsupported）
      const modeled = SKILL_SLOTS.some((slot) => def.skills[slot].effects.length > 0);
      if (modeled) {
        const count =
          lv10.length +
          burst10.length +
          timed10.length +
          damage10.length +
          dot10.length +
          instant10.length +
          gauges10 +
          pauses10 +
          states10 +
          perShot10 +
          coverHeals10;
        expect(count).toBeGreaterThan(0);
      }
      damage10.forEach((e, i) => {
        expect(e.multiplier).toBeGreaterThanOrEqual(damage1[i]!.multiplier);
        expect(e.trigger).toEqual(damage1[i]!.trigger);
      });
      dot10.forEach((e, i) => {
        expect(e.multiplier).toBeGreaterThanOrEqual(dot1[i]!.multiplier);
        expect(e.dot).toEqual(dot1[i]!.dot);
      });
      // ▼（decrease）は負の値で、Lv とともに大きさが増える。符号は Lv で変わらない
      const growsWithLevel = (v10: number, v1: number) => {
        expect(Math.sign(v10)).toBe(Math.sign(v1));
        expect(Math.abs(v10)).toBeGreaterThanOrEqual(Math.abs(v1));
      };
      lv10.forEach((e, i) => growsWithLevel(e.value, lv1[i]!.value));
      burst10.forEach((e, i) => expect(e.multiplier).toBeGreaterThanOrEqual(burst1[i]!.multiplier));
      timed10.forEach((e, i) => {
        // アニス：スパークリングサマーのバーストの最大装弾数▼は、Lv とともに負に大きくなる
        growsWithLevel(e.value, timed1[i]!.value);
        const source = def.skills[e.source.skill].effects[e.effectIndex];
        const durationRef = source !== undefined && 'durationRef' in source ? source.durationRef : undefined;
        if (isLevelDependentDuration(def.resourceId, e.source.skill, durationRef)) return;
        expect(e.durationFrames).toBe(timed1[i]!.durationFrames);
      });
    });

    it('explains what is not modeled', () => {
      for (const slot of SKILL_SLOTS) {
        const entry = def.skills[slot];
        if (entry.support !== 'supported') expect(entry.notes?.length ?? 0, `${slot} notes`).toBeGreaterThan(0);
      }
    });

    // 2 段目の段 6 の論点 8（plan/design-skill-stage6.md 2.4 節）: 「最大HP のみ▲」は効いている間 HP の割合を下げる読みなので、maxHp では
    // 書かない。2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.4 節）で stat maxHpOnly を足した: スロットの説明文に「最大HPのみ」が
    // あればそのスロットに maxHp の効果を書かず、maxHpOnly の効果はその説明文のスロットにだけ書く（同じスロットに最大HP▲ と最大HP のみ▲ の
    // 両方がある定義を書く時は、この検査を行ごとに直す）
    it('writes a max HP only up as maxHpOnly, not maxHp', () => {
      for (const slot of SKILL_SLOTS) {
        const writes = (stat: string) =>
          def.skills[slot].effects.some(
            (e) =>
              ('stat' in e && e.stat === stat) ||
              (e.kind === 'state' && statContentsOf(e.contents).some((c) => c.stat === stat)),
          );
        if (writes('maxHp')) expect(character.skills[slot].description.ja, slot).not.toMatch(/最大HPのみ/);
        if (writes('maxHpOnly')) expect(character.skills[slot].description.ja, slot).toMatch(/最大HPのみ/);
      }
    });
  });
});
