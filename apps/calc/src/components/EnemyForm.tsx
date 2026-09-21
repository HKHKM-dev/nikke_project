import { ELEMENTS, ELEMENT_LABEL, isChargeWeapon, type CharacterData, type ConditionInput, type Element, type EnemyInput } from '@nikke/core';

type Props = {
  character: CharacterData | null;
  enemy: EnemyInput;
  onEnemyChange: (enemy: EnemyInput) => void;
  condition: ConditionInput;
  onConditionChange: (condition: ConditionInput) => void;
};

export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: 100, element: null, hasCore: true };

export function EnemyForm({ character, enemy, onEnemyChange, condition, onConditionChange }: Props) {
  const distanceAvailable = character?.bonusRange !== null;
  const chargeWeapon = character ? isChargeWeapon(character.shot) : false;
  return (
    <fieldset className="panel">
      <legend>敵・条件</legend>
      <label className="field">
        <span>防御力</span>
        <input type="number" min={0} step={1} value={enemy.defence} onChange={(e) => onEnemyChange({ ...enemy, defence: Number(e.target.value) })} />
        <small>射撃場の雑魚は 100、ボスは約 140</small>
      </label>
      <label className="field">
        <span>属性</span>
        <select
          value={enemy.element ?? ''}
          onChange={(e) => onEnemyChange({ ...enemy, element: e.target.value === '' ? null : (e.target.value as Element) })}
        >
          <option value="">なし（相性なし）</option>
          {ELEMENTS.map((el) => (
            <option key={el} value={el}>
              {ELEMENT_LABEL[el].ja}
            </option>
          ))}
        </select>
      </label>
      <label className="field checkbox">
        <input type="checkbox" checked={enemy.hasCore} onChange={(e) => onEnemyChange({ ...enemy, hasCore: e.target.checked })} />
        <span>コアあり</span>
      </label>
      <label className="field">
        <span>コア命中率</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={condition.coreHitRate}
          disabled={!enemy.hasCore}
          onChange={(e) => onConditionChange({ ...condition, coreHitRate: Number(e.target.value) })}
        />
        <small>0〜1</small>
      </label>
      <label className="field checkbox">
        <input
          type="checkbox"
          checked={condition.distanceBonus && distanceAvailable}
          disabled={!distanceAvailable}
          onChange={(e) => onConditionChange({ ...condition, distanceBonus: e.target.checked })}
        />
        <span>距離ボーナス{distanceAvailable ? '' : '（この武器には無い）'}</span>
      </label>
      {chargeWeapon && (
        <label className="field checkbox">
          <input type="checkbox" checked={condition.fullCharge} onChange={(e) => onConditionChange({ ...condition, fullCharge: e.target.checked })} />
          <span>フルチャージで撃つ</span>
        </label>
      )}
      <label className="field">
        <span>戦闘時間（秒）</span>
        <input
          type="number"
          min={0}
          step={1}
          value={condition.durationSeconds}
          onChange={(e) => onConditionChange({ ...condition, durationSeconds: Number(e.target.value) })}
        />
        <small>レイドは 180、射撃場は 90</small>
      </label>
    </fieldset>
  );
}
