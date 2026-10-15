// 2 段目の段 1（plan/design-skill-stage1.md 1.2・1.4 節）: スキルの欄の付与と解除の表示。定義は data/skills のもの（マナ・アニス：スター）
import { parseSkillDefinition, type SkillDefinition } from '@nikke/core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatRemoveState, formatStateGrant } from './skillLabels.ts';

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
