// キャラのデータを、スキルを定義するときに読む分だけ詰めて出す（npm run char。plan/design-workflow-simplification-14.md 6 節）。
// levelCurve などの大きな表は出さない。スキルの説明文は値を差し込み、効果の分類（catalogDoc.ts の effectKind）が重なる定義済みのキャラを
// 手本の候補に並べる。
import { skillDefinitionPath } from '../load.ts';
import type { CharacterData, SkillRaw } from '../types.ts';
import type { CatalogEffect } from './catalog.ts';
import { effectKind } from './catalogDoc.ts';
import { fillSkillDescription } from './resolve.ts';
import { SKILL_SLOTS } from './types.ts';

export type SimilarChar = { rid: number; name: string; shared: readonly string[] };

/** 説明文の値の差し込み。Lv ごとの値が違えば「最大（Lv1 は最小）」 */
export function fillDescription(skill: SkillRaw): string {
  return fillSkillDescription(skill, 'ja', (levels) => {
    if (levels === null || levels === undefined || levels.length === 0) return '?';
    const first = levels[0]!;
    const last = levels[levels.length - 1]!;
    return first === last ? last : `${last}（Lv1 は ${first}）`;
  }).trim();
}

/** 効果の分類が重なる定義済みのキャラ。重なりの多い順に limit 人 */
export function similarDefined(rid: number, effects: readonly CatalogEffect[], limit = 5): SimilarChar[] {
  const own = new Set(effects.filter((e) => e.rid === rid).map(effectKind));
  const byChar = new Map<number, { name: string; shared: Set<string> }>();
  for (const e of effects) {
    if (e.rid === rid || !e.defined) continue;
    const kind = effectKind(e);
    if (!own.has(kind)) continue;
    const entry = byChar.get(e.rid) ?? { name: e.name, shared: new Set<string>() };
    entry.shared.add(kind);
    byChar.set(e.rid, entry);
  }
  return [...byChar.entries()]
    .map(([r, v]) => ({ rid: r, name: v.name, shared: [...v.shared].sort() }))
    .sort((a, b) => b.shared.length - a.shared.length || a.rid - b.rid)
    .slice(0, limit);
}

function skillLines(label: string, skill: SkillRaw): string[] {
  return [
    `${label} ${skill.name.ja}（${skill.id}）`,
    ...fillDescription(skill)
      .split('\n')
      .map((l) => `  ${l}`),
  ];
}

/** 1 キャラ分の詰めた文 */
export function renderCharSummary(
  c: CharacterData,
  opts: { defined: boolean; similar: readonly SimilarChar[] },
): string {
  const s = c.shot;
  const out = [
    `# ${c.resourceId} ${c.name.ja}（${c.name.en}） ${c.rarity} ${c.class} ${c.element} ${c.weaponType} バースト ${c.burstStep}`,
    `定義: ${opts.defined ? `data/${skillDefinitionPath(c.resourceId)} あり` : '無し'}・宝物: ${c.treasure === null ? '無し' : 'あり'}`,
    `通常攻撃: 弾 ${s.maxAmmo}・リロード ${s.reloadTime} 秒（${s.reloadBullet} 発ずつ）・射撃 ${s.rateOfFire}→${s.endRateOfFire}/分` +
      `・1 発 ${s.shotCount} 弾 × 銃口 ${s.muzzleCount}・ダメージ ${s.damage}・コア ×${s.coreDamageRate}・入力 ${s.inputType}・${s.fireType}`,
    `  チャージ ${s.chargeTime} 秒（×${s.fullChargeDamage}）・ゲージ 1 発 ${s.burstEnergyPerShot}（的 ${s.targetBurstEnergyPerShot}）・距離ボーナス ${c.bonusRange === null ? '無し' : `${c.bonusRange.min}〜${c.bonusRange.max}`}`,
    `バースト: CT ${c.burstSkill.cooldownSeconds} 秒・持続 ${c.burstSkill.durationSeconds} 秒・次 ${c.burstSkill.nextStep}`,
    ...SKILL_SLOTS.flatMap((slot) => skillLines(slot, c.skills[slot])),
  ];
  if (c.treasure !== null)
    for (const slot of SKILL_SLOTS) out.push(...skillLines(`treasure.${slot}`, c.treasure.skills[slot]));
  out.push(
    opts.similar.length === 0
      ? '効果の分類が重なる定義済みのキャラ: 無し'
      : `効果の分類が重なる定義済みのキャラ: ${opts.similar.map((x) => `${x.name}（${x.rid}。${x.shared.join('・')}）`).join('、')}`,
  );
  return out.join('\n');
}
