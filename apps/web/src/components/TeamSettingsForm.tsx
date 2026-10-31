import {
  ELEMENTS,
  ELEMENT_LABEL,
  enemyInputOf,
  matchingEnemyPreset,
  type Element,
  type EnemyInput,
  type EnemyPreset,
} from '@nikke/core';
import type { Dispatch } from 'react';
import type { TeamAction } from '../team.ts';

type Props = {
  enemy: EnemyInput;
  /** Stage 15: 敵のプリセット（data/enemies.json）。読み込み前・失敗は空 */
  enemyPresets: readonly EnemyPreset[];
  fixedSpec: boolean;
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 敵名・属性の枠と、その外の「射撃場スペック固定」。2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、
 * 残った射撃場スペック固定を敵の枠の外に出した
 */
export function TeamSettingsForm({ enemy, enemyPresets, fixedSpec, dispatch }: Props) {
  const setEnemy = (patch: Partial<EnemyInput>) => dispatch({ type: 'setEnemy', enemy: { ...enemy, ...patch } });
  const preset = matchingEnemyPreset(enemyPresets, enemy);
  const isBigArms = preset?.targetProfile === 'range-bigarms' || (enemy.defence === 100 && enemy.hasCore === true);

  return (
    <>
      <fieldset className="panel settings" aria-label="敵条件">
        <div className="settings-simple">
          <label className="field">
            <span>敵名</span>
            <select
              value={isBigArms ? 'range-bigarms' : (preset?.id ?? '')}
              onChange={(e) => {
                if (e.target.value === 'range-bigarms') {
                  const defaultRange = enemyPresets.find((p) => p.content === 'range') ?? enemyPresets[0];
                  if (defaultRange) {
                    setEnemy({ defence: defaultRange.defence, hasCore: defaultRange.hasCore });
                  }
                } else if (e.target.value === '') {
                  // カスタム
                } else {
                  const picked = enemyPresets.find((p) => p.id === e.target.value);
                  if (picked) dispatch({ type: 'setEnemy', enemy: enemyInputOf(picked) });
                }
              }}
            >
              <option value="range-bigarms">射撃場BigArms</option>
              {enemyPresets
                .filter((p) => p.content !== 'range')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.ja}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>敵属性</span>
            <select
              value={enemy.element ?? ''}
              onChange={(e) => setEnemy({ element: e.target.value === '' ? null : (e.target.value as Element) })}
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
