import { ELEMENTS, ELEMENT_LABEL, type Element, type EnemyInput } from '@nikke/core';
import type { Dispatch } from 'react';
import type { TeamAction } from '../team.ts';

type Props = {
  enemy: EnemyInput;
  durationSeconds: number;
  fixedSpec: boolean;
  dispatch: Dispatch<TeamAction>;
};

/** 編成共通の設定: 敵・戦闘時間・スペック固定 */
export function TeamSettingsForm({ enemy, durationSeconds, fixedSpec, dispatch }: Props) {
  const setEnemy = (patch: Partial<EnemyInput>) => dispatch({ type: 'setEnemy', enemy: { ...enemy, ...patch } });
  return (
    <fieldset className="panel settings">
      <legend>敵・共通条件</legend>
      <div className="settings-grid">
        <label className="field">
          <span>防御力</span>
          <input
            type="number"
            min={0}
            step={1}
            value={enemy.defence}
            onChange={(e) => setEnemy({ defence: Number(e.target.value) })}
          />
          <small>射撃場の雑魚は 100、ボスは約 140</small>
        </label>
        <label className="field">
          <span>属性</span>
          <select
            value={enemy.element ?? ''}
            onChange={(e) => setEnemy({ element: e.target.value === '' ? null : (e.target.value as Element) })}
          >
            <option value="">なし（相性なし）</option>
            {ELEMENTS.map((el) => (
              <option key={el} value={el}>
                {ELEMENT_LABEL[el].ja}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>戦闘時間（秒）</span>
          <input
            type="number"
            min={0}
            step={1}
            value={durationSeconds}
            onChange={(e) => dispatch({ type: 'setDuration', durationSeconds: Number(e.target.value) })}
          />
          <small>規定は 180（レイド・射撃場とも）</small>
        </label>
        <label className="field checkbox">
          <input type="checkbox" checked={enemy.hasCore} onChange={(e) => setEnemy({ hasCore: e.target.checked })} />
          <span>コアあり</span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={fixedSpec}
            onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
          />
          <span>ユニオン射撃場スペック固定（全枠: Lv400・凸/コア上限・T9 装備・好感度込み、敵防御 100）</span>
        </label>
      </div>
    </fieldset>
  );
}
