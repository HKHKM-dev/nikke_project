import {
  ELEMENTS,
  ELEMENT_LABEL,
  TEAM_SIZE,
  enemyInputOf,
  matchingEnemyPreset,
  type Element,
  type EnemyEventSet,
  type EnemyInput,
  type EnemyPreset,
} from '@nikke/core';
import type { Dispatch } from 'react';
import type { TeamAction } from '../team.ts';

type Props = {
  enemy: EnemyInput;
  /** Stage 15: 敵のプリセット（data/enemies.json）。読み込み前・失敗は空 */
  enemyPresets: readonly EnemyPreset[];
  /** Stage 16-B: 敵の出来事のセット（data/enemies.json）。出すのは選んでいるプリセットが持つものだけ */
  eventSets: readonly EnemyEventSet[];
  /** Stage 16-B: ON にした出来事のセットの id */
  enemyEventSets: readonly string[];
  durationSeconds: number;
  fixedSpec: boolean;
  burst: boolean;
  controlledSlot: number;
  dispatch: Dispatch<TeamAction>;
};

/** 編成共通の設定: 敵名・属性（最低限）と詳細設定（折りたたみ） */
export function TeamSettingsForm({
  enemy,
  enemyPresets,
  eventSets,
  enemyEventSets,
  durationSeconds,
  fixedSpec,
  burst,
  controlledSlot,
  dispatch,
}: Props) {
  const setEnemy = (patch: Partial<EnemyInput>) => dispatch({ type: 'setEnemy', enemy: { ...enemy, ...patch } });
  const preset = matchingEnemyPreset(enemyPresets, enemy);
  const isBigArms = preset?.targetProfile === 'range-bigarms' || (enemy.defence === 100 && enemy.hasCore === true);
  const activePreset = preset ?? (isBigArms ? enemyPresets.find((p) => p.content === 'range') : undefined);
  const availableSets = eventSets.filter((set) => activePreset?.eventSets.includes(set.id) ?? false);
  const toggleEventSet = (id: string, on: boolean) =>
    dispatch({
      type: 'setEnemyEventSets',
      enemyEventSets: on ? [...enemyEventSets.filter((x) => x !== id), id] : enemyEventSets.filter((x) => x !== id),
    });

  return (
    <fieldset className="panel settings">
      <legend>敵条件</legend>
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
            <option value="">カスタム</option>
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
      <details className="settings-advanced">
        <summary>詳細設定（戦闘時間・スペック固定・ステータス等）</summary>
        <div className="settings-advanced-body">
          <div className="settings-advanced-grid">
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
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={enemy.hasCore}
                onChange={(e) => setEnemy({ hasCore: e.target.checked })}
              />
              <span>コアあり</span>
            </label>
          </div>
          <div className="settings-options">
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={burst}
                onChange={(e) => dispatch({ type: 'setBurst', burst: e.target.checked })}
              />
              <span>バースト</span>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={fixedSpec}
                onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
              />
              <span>射撃場スペック固定</span>
            </label>
            {availableSets.map((set) => (
              <label key={set.id} className="field checkbox" title={set.source}>
                <input
                  type="checkbox"
                  checked={enemyEventSets.includes(set.id)}
                  onChange={(e) => toggleEventSet(set.id, e.target.checked)}
                />
                <span>{set.name.ja}</span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </fieldset>
  );
}
