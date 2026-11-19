// sim-run.ts の表に出す短いラベル: 効果の値・件の出どころ・きっかけ・状態の id と、同じ効果の段のまとめ
import {
  isCounterWhileEffect,
  isHpWhileEffect,
  isStateContent,
  type ItemEffect,
  type ResolvedTrigger,
} from '../../src/skills/resolve.ts';
import type { SkillEffect } from '../../src/skills/types.ts';

/** 効果の値（比は %、固定値はそのまま。発動者の防御力の比は、分かれば掛けた後の量も） */
export function effectValueText(e: ItemEffect, appliedAmount?: number): string {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const value =
    e.scaling === 'flat'
      ? `${e.value}${e.stat === 'chargeSpeed' ? 's' : ''}`
      : e.scaling === 'casterDefence'
        ? `${appliedAmount === undefined ? '' : `${Math.round(appliedAmount)} `}(caster ${pct(e.value)})`
        : e.scaling === 'perFinalMaxAmmo'
          ? `${pct(e.value)} × max ammo`
          : pct(e.value);
  return `${e.stat}${e.value < 0 ? '' : '+'}${value}`;
}

/** 件を持つ効果の出どころの欄（状態・カウンタ・HP の割合の while は条件、持続バフはきっかけ） */
export function itemLabel(e: ItemEffect): string {
  if (isStateContent(e)) return `while:${e.whileState}`;
  if (isCounterWhileEffect(e)) return `while:${e.whileCounter.counter}>=${e.whileCounter.atLeast}`;
  if (isHpWhileEffect(e)) return `while:hp>=${e.whileSelfHp.atLeast}`;
  return triggerLabel(e.trigger);
}

/** 回数トリガーも 1 語で出す（normalShot/10、burstUse≥2） */
export function triggerLabel(t: ResolvedTrigger): string {
  if (typeof t === 'string') return t;
  // カウンタが上限に届いた時（counterFull:restraintChains）
  if ('counterFull' in t) return `counterFull:${t.counterFull}`;
  // 時間の周期のトリガー（every10s）
  // 状態の付いた時から数える周期（every0.2s:since:transformation）
  if ('everySeconds' in t) return `every${t.everySeconds}s${t.since === undefined ? '' : `:since:${t.since.applied}`}`;
  // 状態が付いた時のトリガー（applied:followUp。id は名前の付いた状態の目録の id）
  if ('applied' in t) return `applied:${t.applied}`;
  // その stat の▲が付いた時（buffApplied:sustainedDamage）
  if ('buffApplied' in t) return `buffApplied:${t.buffApplied}`;
  // フルスタックの消費のきっかけ（fullStack:relax）
  if ('fullStack' in t) return `fullStack:${t.fullStack}`;
  // 使用武器の変更の終わり
  if ('weaponChangeEnd' in t) return 'weaponChangeEnd';
  // リロードの込め終わり
  if ('reloadEnd' in t) return 'reloadEnd';
  // 遮蔽物 HP 回復を受けた時
  if ('coverHealed' in t) return 'coverHealed';
  // 自分の〈スロット〉を発動した時（skillFired:skill2）
  if ('skillFired' in t) return `skillFired:${t.skillFired}`;
  // 溜めの周期（chargeTick0.2s）と、溜めが満ちた時
  if ('chargeTick' in t) return `chargeTick${t.chargeTick.everySeconds}s`;
  if ('chargeFull' in t) return 'chargeFull';
  // 自分の HP の割合が閾値以下の間（hp<=70%）
  if ('selfHpAtMost' in t) return `hp<=${+(t.selfHpAtMost * 100).toFixed(2)}%`;
  // 両隣の味方の HP の割合（adjacentHp<=90%・adjacentHpFull）
  if ('adjacentHpAtMost' in t) return `adjacentHp<=${+(t.adjacentHpAtMost * 100).toFixed(2)}%`;
  if ('adjacentHpFull' in t) return 'adjacentHpFull';
  // 召喚の攻撃（summon:nearFeather）
  if ('summon' in t) return `summon:${t.summon}`;
  // 自分の状態が終わった時（ended:prediction）
  if ('ended' in t) return `ended:${t.ended}`;
  // フルバースト中だけ数える回数トリガー（normalHit/36@fullBurst、数え直しなら @fullBurst!）
  // 確率のきっかけ（normalHit@5%。窓は期待値の小片）
  if ('every' in t && t.chance !== undefined) return `${t.count}@${+(t.chance * 100).toFixed(4)}%`;
  if ('every' in t)
    return `${t.count}/${t.every}${t.during ? `@${typeof t.during === 'object' ? t.during.state : t.during}${t.reset === 'fullBurstStart' ? '!' : ''}` : ''}`;
  return `${t.count}≥${t.atLeast}${t.atMost !== undefined ? `≤${t.atMost}` : ''}`;
}

/** 効果の行に添える状態の id（付与・解除・スタック量の増減。味方の全部のスタック可能バフへの▲は allStackable） */
export function stateLabelOf(e: SkillEffect): string {
  if (e.kind === 'stackChange') return e.target === 'allies' ? ' allStackable' : ` ${e.state}`;
  return e.kind === 'state' || e.kind === 'removeState' ? ` ${e.state}` : '';
}

/** 同じ効果のスタックの段をまとめる（「critDamage+14.25% ×5」） */
export function compactTimed<
  T extends { sourceSlotIndex: number; effectIndex: number; subIndex?: number; source: { skill: string } },
>(effects: readonly T[]): { e: T; n: number }[] {
  const out: { e: T; n: number }[] = [];
  for (const e of effects) {
    // 状態の中身は付与の中身の何番目か（subIndex）でも分ける
    const found = out.find(
      (x) =>
        x.e.sourceSlotIndex === e.sourceSlotIndex &&
        x.e.source.skill === e.source.skill &&
        x.e.effectIndex === e.effectIndex &&
        x.e.subIndex === e.subIndex,
    );
    if (found) found.n += 1;
    else out.push({ e, n: 1 });
  }
  return out;
}
