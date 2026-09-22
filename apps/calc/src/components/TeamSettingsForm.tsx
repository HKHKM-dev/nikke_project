import { ELEMENTS, ELEMENT_LABEL, FIXED_BURST_CYCLE, FPS, type Element, type EnemyInput } from '@nikke/core';
import type { Dispatch } from 'react';
import type { TeamAction } from '../team.ts';

type Props = {
  enemy: EnemyInput;
  durationSeconds: number;
  fixedSpec: boolean;
  burst: boolean;
  dispatch: Dispatch<TeamAction>;
};

const CYCLE_SECONDS = FIXED_BURST_CYCLE.cycleFrames / FPS;
const NORMAL_SECONDS = FIXED_BURST_CYCLE.normalFrames / FPS;
const FULL_BURST_SECONDS = FIXED_BURST_CYCLE.fullBurstFrames / FPS;

/** 編成共通の設定: 敵・戦闘時間・スペック固定・バースト */
export function TeamSettingsForm({ enemy, durationSeconds, fixedSpec, burst, dispatch }: Props) {
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
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={burst}
            onChange={(e) => dispatch({ type: 'setBurst', burst: e.target.checked })}
          />
          <span>
            バースト: 固定 {CYCLE_SECONDS} 秒サイクル（通常 {NORMAL_SECONDS} 秒 + フルバースト {FULL_BURST_SECONDS}{' '}
            秒）で 毎サイクル I → II → III を発動。CT・ゲージは見ない（Stage 7）
          </span>
        </label>
      </div>
    </fieldset>
  );
}
