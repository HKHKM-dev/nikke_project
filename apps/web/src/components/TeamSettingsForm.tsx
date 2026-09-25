import {
  ELEMENTS,
  ELEMENT_LABEL,
  ENEMY_CONTENT_LABEL,
  TEAM_SIZE,
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
  durationSeconds: number;
  fixedSpec: boolean;
  burst: boolean;
  controlledSlot: number;
  dispatch: Dispatch<TeamAction>;
};

/** 編成共通の設定: 敵・戦闘時間・スペック固定・バースト */
export function TeamSettingsForm({
  enemy,
  enemyPresets,
  durationSeconds,
  fixedSpec,
  burst,
  controlledSlot,
  dispatch,
}: Props) {
  const setEnemy = (patch: Partial<EnemyInput>) => dispatch({ type: 'setEnemy', enemy: { ...enemy, ...patch } });
  const preset = matchingEnemyPreset(enemyPresets, enemy);
  return (
    <fieldset className="panel settings">
      <legend>敵・共通条件</legend>
      <div className="settings-grid">
        <label className="field">
          <span>敵のプリセット</span>
          <select
            value={preset?.id ?? ''}
            onChange={(e) => {
              const picked = enemyPresets.find((p) => p.id === e.target.value);
              if (picked) dispatch({ type: 'setEnemy', enemy: enemyInputOf(picked) });
            }}
          >
            <option value="">カスタム</option>
            {enemyPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {ENEMY_CONTENT_LABEL[p.content].ja}: {p.name.ja}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>防御力</span>
          <input
            type="number"
            min={0}
            step={1}
            value={enemy.defence}
            onChange={(e) => setEnemy({ defence: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>属性</span>
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
        <label className="field">
          <span>戦闘時間（秒）</span>
          <input
            type="number"
            min={0}
            step={1}
            value={durationSeconds}
            onChange={(e) => dispatch({ type: 'setDuration', durationSeconds: Number(e.target.value) })}
          />
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
          <span>射撃場スペック固定</span>
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={burst}
            onChange={(e) => dispatch({ type: 'setBurst', burst: e.target.checked })}
          />
          <span>バースト</span>
        </label>
        <label className="field">
          <span>操作キャラ</span>
          <select
            value={controlledSlot}
            disabled={!burst}
            onChange={(e) => dispatch({ type: 'setControlledSlot', controlledSlot: Number(e.target.value) })}
          >
            {Array.from({ length: TEAM_SIZE }, (_, i) => (
              <option key={i} value={i}>
                枠 {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
