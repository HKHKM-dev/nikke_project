import { ELEMENTS, ELEMENT_LABEL, type Element } from '@nikke/core';
import type { Dispatch } from 'react';
import { SHOOTING_RANGE_ENEMY, type TeamAction } from '../team.ts';

type Props = {
  element: Element | null;
  fixedSpec: boolean;
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 敵名・属性の枠と、その外の「射撃場スペック固定」。2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、
 * 残った射撃場スペック固定を敵の枠の外に出した。敵は射撃場の的だけで、選べるのは属性（防御力・コアありの欄は消した）
 */
export function TeamSettingsForm({ element, fixedSpec, dispatch }: Props) {
  return (
    <>
      <fieldset className="panel settings" aria-label="敵条件">
        <div className="settings-simple">
          <label className="field">
            <span>敵</span>
            <select defaultValue="range-bigarms">
              <option value="range-bigarms">射撃場BigArms</option>
            </select>
          </label>
          <label className="field">
            <span>属性</span>
            <select
              value={element ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'setEnemy',
                  enemy: {
                    ...SHOOTING_RANGE_ENEMY,
                    element: e.target.value === '' ? null : (e.target.value as Element),
                  },
                })
              }
            >
              <option value="">なし</option>
              {ELEMENTS.map((el) => (
                <option key={el} value={el}>
                  {ELEMENT_LABEL[el].ja}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <div className="settings-options">
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={fixedSpec}
            onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
          />
          <span>射撃場スペック固定</span>
        </label>
      </div>
    </>
  );
}
