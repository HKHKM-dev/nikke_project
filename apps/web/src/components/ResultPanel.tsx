import { BURST_GAUGE_MAX, energyPerTrigger, type CharacterData, type TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';

type Props = {
  character: CharacterData;
  slot: TeamSlotResult;
};

// 2026-10-31: オーナーの指示で、受けているバフ・スキルの説明・ダメージ計算式の内訳と区間・近似と未対応の注記を画面から消した
// （未対応の注記は画面の「未対応・近似・仮定の一覧」に出る。内訳は CLI の npm run sim で見る）
export function ResultPanel({ character, slot }: Props) {
  const { burst, autoCondition } = slot;
  const perShotDamage = slot.segments.reduce((sum, g) => sum + g.trigger.perShot * g.triggers, 0);

  if (slot.segments.length === 0) return null;

  return (
    <section className="panel result">
      <p className="meta">
        装弾数 {character.shot.maxAmmo} / リロード {character.shot.reloadTime}s / 武器倍率 {character.shot.damage / 100}
        % / バースト CT {character.burstSkill.cooldownSeconds}s / ゲージ 1 トリガー{' '}
        {formatNumber((energyPerTrigger(character.shot, true) / BURST_GAUGE_MAX) * 100, 2)}%
        {character.shot.chargeTime > 0 &&
          `（AI ${formatNumber((energyPerTrigger(character.shot, false) / BURST_GAUGE_MAX) * 100, 2)}%）`}
        {autoCondition && (
          <>
            <br />
            自動条件: コア命中率 {formatPercent(autoCondition.coreHitRate, 1)}・距離ボーナス{' '}
            {character.bonusRange === null ? 'なし' : `${formatPercent(autoCondition.distanceBonus, 1)}`}・弾丸命中率{' '}
            {formatPercent(autoCondition.hitRate, 1)}
          </>
        )}
      </p>

      <dl className="summary">
        <dt>通常攻撃</dt>
        <dd>
          {formatNumber(slot.normalDamage)}
          {perShotDamage > 0 && `（うち毎発の追加ダメージ ${formatNumber(perShotDamage)}）`}
        </dd>
        <dt>バーストスキル</dt>
        <dd>
          {burst.hit
            ? `${formatNumber(burst.totalDamage)}（${burst.activations.length} 回 × ${formatNumber(burst.hit.perActivation)}）`
            : '—'}
        </dd>
        {slot.skillHits.activations.length > 0 && (
          <>
            <dt>スキルダメージ</dt>
            <dd>{`${formatNumber(slot.skillHits.totalDamage)}（${slot.skillHits.activations.length} 回）`}</dd>
          </>
        )}
        <dt>総ダメージ</dt>
        <dd className="total">{formatNumber(slot.totalDamage)}</dd>
      </dl>
    </section>
  );
}
