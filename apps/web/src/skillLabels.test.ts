// 2 段目の段 1（plan/design-skill-stage1.md 1.2・1.4 節）: スキルの欄の付与と解除の表示。定義は data/skills のもの（マナ・アニス：スター）
import {
  parseSkillDefinition,
  type AppliedEffect,
  type ResolvedInstantEffect,
  type SkillDefinition,
} from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatAppliedAmount,
  formatEffectSource,
  formatInstantTarget,
  formatRemoveState,
  formatStateGrant,
  formatTrigger,
  hasLowestHpRatioHeal,
  noteBadgeLabel,
} from './skillLabels.ts';

const definitionOf = (id: number): SkillDefinition =>
  parseSkillDefinition(
    JSON.parse(readFileSync(new URL(`../../../packages/core/data/skills/${id}.json`, import.meta.url), 'utf8')),
  );

describe('付与と解除の表示', () => {
  it('writes a static state from the start to the end, and a removed state as a grant with its condition', () => {
    const mana = definitionOf(290);
    const [gamma] = mana.skills.skill1.effects;
    const sigma = mana.skills.skill2.effects;
    if (gamma?.kind !== 'state' || sigma[0]?.kind !== 'state' || sigma[5]?.kind !== 'state') {
      throw new Error('unexpected definition');
    }
    expect(formatStateGrant(gamma, mana)).toBe('マターガンマ状態（戦闘の始めから終わりまで）。中身: 攻撃力');
    expect(formatStateGrant(sigma[0], mana)).toBe('マターシグマを付与。中身: バーストゲージのチャージ速度');
    expect(formatStateGrant(sigma[5], mana)).toBe(
      'マターシグマを付与（直前に自分がバーストを使用していれば）。中身（同じ状態のほかの付与）: バーストゲージのチャージ速度',
    );
    const removal = sigma[4];
    if (removal?.kind !== 'removeState') throw new Error('unexpected definition');
    expect(formatRemoveState(removal)).toBe('マターシグマを解除（自分がマターシグマ状態なら）');
  });

  // 2 段目の段 4（plan/design-skill-stage4.md 1.2 節）: 維持 0 秒の付与と、{ applied } の付与
  it('writes a grant lasting 0 seconds as an instant record, and a grant on an applied trigger as usual', () => {
    const torb = definitionOf(192);
    const [, bullets, modification] = torb.treasureSkills!.skill1!.effects;
    if (bullets?.kind !== 'state' || modification?.kind !== 'state') throw new Error('unexpected definition');
    expect(formatStateGrant(bullets, torb)).toBe(
      '代用弾丸を付与。即時（維持なし。付いた記録だけを作り、「〜が適用された時」の効果がきっかけにする）',
    );
    expect(formatStateGrant(modification, torb)).toBe('応急改造を付与。中身: 最大装弾数');
    expect(formatTrigger({ applied: 'emergencyCraftedBullets' })).toBe('代用弾丸が適用された時');
  });

  it('marks an undispellable grant', () => {
    const anis = definitionOf(17);
    const star = anis.skills.skill1.effects[1];
    if (star?.kind !== 'state') throw new Error('unexpected definition');
    expect(formatStateGrant(star, anis)).toBe('私だけの星状態（戦闘の始めから終わりまで）。中身: 攻撃力。解除不可');
  });
});

// 分類の設計書の論点 7（plan/design-indirect-notes.md 5 節）: 間接の notes は経路を添える
describe('notes の印', () => {
  it('adds the path to an indirect note', () => {
    // デルタ S2 の防御力▲ は効果にした（C-0589）ので、防御力の間接の notes が残るユニ S2 で見る
    const [defense] = definitionOf(160).skills.skill2.notes!;
    expect(noteBadgeLabel(defense!)).toBe('間接（防御力）');
    const [hp] = definitionOf(20).skills.skill1.notes!;
    expect(noteBadgeLabel(hp!)).toBe('間接（HP）');
    expect(noteBadgeLabel({ kind: 'noDamage' })).toBe('計算に無関係');
  });
});

// 2 段目の段 6（plan/design-skill-stage6.md 1.3 節）: 発動者の最終最大HP 基準の攻撃力▲は、足した実数と最終最大HP の割合を出す
describe('効果の値の表示', () => {
  it('writes the attack up from the caster final max HP with its ratio', () => {
    const effect: AppliedEffect = {
      source: { resourceId: 103, skill: 'skill1', name: { ja: 'S1', en: 'S1' } },
      target: 'self',
      stat: 'attack',
      scaling: 'casterFinalMaxHp',
      value: 0.0405,
      sourceSlotIndex: 0,
      appliedAmount: 109605.5145,
    };
    expect(formatAppliedAmount(effect)).toBe('攻撃力 +109,606（発動者の最終最大HP の 4.05%）');
  });
});

// 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 対象の絞り込み「自分と自分より最終防御力が低い味方」
describe('効果の出どころの表示', () => {
  it('writes the narrowing by final DEF', () => {
    const effect: AppliedEffect = {
      source: { resourceId: 17, skill: 'skill2', name: { ja: 'S2', en: 'S2' } },
      target: 'allies',
      stat: 'projectileExplosionDamage',
      scaling: 'ratio',
      value: 0.9203,
      targetDefense: 'lowerThanSelf',
      sourceSlotIndex: 1,
      appliedAmount: 0.9203,
    };
    expect(formatEffectSource(effect, 'アニス：スター')).toBe(
      '枠 2 アニス：スター スキル 2（自分と自分より最終防御力が低い味方）',
    );
  });
});

// 2 段目の段 8（plan/design-skill-stage8.md 1.2・1.3 節）: 「残りの HP の割合が最も低い味方 N 機」への回復
describe('HP の割合で選ぶ回復の表示', () => {
  it('finds the heal in a definition, and writes its target', () => {
    expect(hasLowestHpRatioHeal(definitionOf(833))).toBe(true);
    expect(hasLowestHpRatioHeal(definitionOf(830))).toBe(false);
    const heal: ResolvedInstantEffect = {
      source: { resourceId: 833, skill: 'skill1', name: { ja: 'S1', en: 'S1' } },
      kind: 'heal',
      trigger: 'burstUse',
      target: 'lowestHpRatio',
      targetCount: 1,
      value: 0.0804,
      effectIndex: 1,
    };
    expect(formatInstantTarget(heal)).toBe('（残りの HP の割合が最も低い味方 1 機）');
    expect(formatInstantTarget({ ...heal, target: 'allies' })).toBe('');
  });
});

// 2 段目の段 9（plan/design-skill-stage9.md 1.1 節）: 対象の絞り込み「〈クラス〉型の味方」
describe('クラスで絞る効果の表示', () => {
  it('writes the class filter on a timed effect and on a heal', () => {
    const effect: AppliedEffect = {
      source: { resourceId: 121, skill: 'burst', name: { ja: 'B', en: 'B' } },
      target: 'allies',
      targetClass: 'Attacker',
      stat: 'attack',
      scaling: 'ratio',
      value: 0.7722,
      sourceSlotIndex: 1,
      appliedAmount: 0.7722,
    };
    expect(formatEffectSource(effect, 'エヌ : ミラクルフェアリー')).toBe(
      '枠 2 エヌ : ミラクルフェアリー バースト（火力型の味方）',
    );
    const heal: ResolvedInstantEffect = {
      source: { resourceId: 121, skill: 'skill1', name: { ja: 'S1', en: 'S1' } },
      kind: 'heal',
      trigger: 'burstUse',
      target: 'allies',
      targetClass: 'Supporter',
      value: 0.0607,
      effectIndex: 0,
    };
    expect(formatInstantTarget(heal)).toBe('（支援型の味方）');
  });
});
