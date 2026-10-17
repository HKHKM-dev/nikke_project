// 2 段目の段 1（plan/design-skill-stage1.md 1.2・1.4 節）: スキルの欄の付与と解除の表示。定義は data/skills のもの（マナ・アニス：スター）
import { parseSkillDefinition, type AppliedEffect, type SkillDefinition } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatAppliedAmount, formatRemoveState, formatStateGrant, formatTrigger, noteBadgeLabel } from './skillLabels.ts';

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
    const delta = definitionOf(20);
    const [defense] = delta.skills.skill2.notes!;
    expect(noteBadgeLabel(defense!)).toBe('間接（防御力）');
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
