import { ELEMENTS, ELEMENT_LABEL, type Element } from '@nikke/core';
import type { Dispatch } from 'react';
import { CLASS_LABEL } from '../skillLabels.ts';
import {
  CONSOLE_CLASSES,
  CONSOLE_CORPORATIONS,
  SHOOTING_RANGE_ENEMY,
  type ConsoleCorporation,
  type ConsoleInput,
  type TeamAction,
} from '../team.ts';
import { IntInput } from './IntInput.tsx';
import { Popover } from './Popover.tsx';

const CORPORATION_LABEL: Record<ConsoleCorporation, string> = {
  ELYSION: 'エリシオン',
  MISSILIS: 'ミシリス',
  TETRA: 'テトラ',
  PILGRIM: 'ピルグリム',
  ABNORMAL: 'アブノーマル',
};

type Props = {
  element: Element | null;
  /** 敵の防御力（詳細設定）。的の動き（ジャンプ・的の条件の表）は射撃場の的のまま */
  defence: number;
  fixedSpec: boolean;
  /** 2026-10-31: コンソール（リサイクルルームの研究 Lv）。スペック固定の間は使わない */
  consoleInput: ConsoleInput;
  /** 2026-10-31: シンクロレベル（編成共通）。スペック固定の間は使わない */
  synchroLevel: number;
  /** 2026-10-31: 詳細設定（ポップアップ）の欄 */
  durationSeconds: number;
  rangeJump: boolean;
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 敵名・属性の枠と、「共通育成」の折りたたみ（スペック固定（ユニオン射撃場の固定値）・シンクロレベル・リサイクルルーム（コンソール））。
 * 2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、編成共通の育成を「共通育成」にまとめた。
 * 敵は射撃場の的だけで、選べるのは属性（コアありの欄は消した）。
 * 属性の右の「詳細設定」のポップアップで、敵防御力・ジャンプ移動（3 分モードの的のジャンプ）・戦闘時間を設定する（操作キャラ・バーストを使うかはスロットの詳細設定）
 */
export function TeamSettingsForm({
  element,
  defence,
  fixedSpec,
  consoleInput,
  synchroLevel,
  durationSeconds,
  rangeJump,
  dispatch,
}: Props) {
  const setConsole = (next: ConsoleInput) => dispatch({ type: 'setConsole', console: next });
  const levelField = (key: string, label: string, value: number, onLevel: (lv: number) => void) => (
    <label key={key} className="field">
      <span>{label}</span>
      <IntInput value={value} min={0} disabled={fixedSpec} onCommit={onLevel} />
    </label>
  );
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
                    defence,
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
          <Popover button="詳細設定" buttonClassName="advanced-settings-button" label="詳細設定" align="left">
            <div className="advanced-settings">
              <label className="field">
                <span>敵防御力</span>
                <IntInput
                  value={defence}
                  min={0}
                  onCommit={(d) =>
                    dispatch({ type: 'setEnemy', enemy: { ...SHOOTING_RANGE_ENEMY, element, defence: d } })
                  }
                />
              </label>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={rangeJump}
                  onChange={(e) => dispatch({ type: 'setRangeJump', rangeJump: e.target.checked })}
                />
                <span>ジャンプ移動</span>
              </label>
              <label className="field">
                <span>戦闘時間（秒）</span>
                <IntInput
                  value={durationSeconds}
                  min={1}
                  onCommit={(seconds) => dispatch({ type: 'setDuration', durationSeconds: seconds })}
                />
              </label>
            </div>
          </Popover>
        </div>
      </fieldset>
      <details className="panel common-growth">
        <summary>共通育成</summary>
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={fixedSpec}
            onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
          />
          <span>スペック固定</span>
        </label>
        <div className="console-grid">
          <label className="field">
            <span>シンクロ LV</span>
            <IntInput
              value={synchroLevel}
              min={1}
              disabled={fixedSpec}
              onCommit={(lv) => dispatch({ type: 'setSynchroLevel', synchroLevel: lv })}
            />
          </label>
        </div>
        <div className="console">
          <span className="console-title">リサイクルルーム</span>
          <div className="console-grid">
            {levelField('personal', '共通', consoleInput.personal, (lv) =>
              setConsole({ ...consoleInput, personal: lv }),
            )}
            {CONSOLE_CLASSES.map((c) =>
              levelField(`class-${c}`, CLASS_LABEL[c], consoleInput.class[c], (lv) =>
                setConsole({ ...consoleInput, class: { ...consoleInput.class, [c]: lv } }),
              ),
            )}
            {CONSOLE_CORPORATIONS.map((c) =>
              levelField(`corp-${c}`, CORPORATION_LABEL[c], consoleInput.corporation[c], (lv) =>
                setConsole({ ...consoleInput, corporation: { ...consoleInput.corporation, [c]: lv } }),
              ),
            )}
          </div>
        </div>
      </details>
    </>
  );
}
