// 2 段目の段 1（plan/design-skill-stage1.md 1.2・1.4 節）: スキルの欄の付与と解除の表示。定義は data/skills のもの（マナ・アニス：スター）
import { parseSkillDefinition, type SkillDefinition } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatRemoveState, formatStateGrant, noteBadgeLabel } from './skillLabels.ts';

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
