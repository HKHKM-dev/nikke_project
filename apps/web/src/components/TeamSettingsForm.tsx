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

const CORPORATION_LABEL: Record<ConsoleCorporation, string> = {
  ELYSION: 'エリシオン',
  MISSILIS: 'ミシリス',
  TETRA: 'テトラ',
  PILGRIM: 'ピルグリム',
  ABNORMAL: 'アブノーマル',
};

type Props = {
  element: Element | null;
  fixedSpec: boolean;
  /** 2026-10-31: コンソール（リサイクルルームの研究 Lv）。スペック固定の間は使わない */
  consoleInput: ConsoleInput;
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 敵名・属性の枠と、その外の「射撃場スペック固定」。2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、
 * 残った射撃場スペック固定を敵の枠の外に出した。敵は射撃場の的だけで、選べるのは属性（防御力・コアありの欄は消した）
 */
export function TeamSettingsForm({ element, fixedSpec, consoleInput, dispatch }: Props) {
  const setConsole = (next: ConsoleInput) => dispatch({ type: 'setConsole', console: next });
  const level = (raw: string) => Math.max(0, Math.floor(Number(raw) || 0));
  const levelField = (key: string, label: string, value: number, onLevel: (lv: number) => void) => (
    <label key={key} className="field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        disabled={fixedSpec}
        onChange={(e) => onLevel(level(e.target.value))}
      />
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
      <div className="panel settings-options">
        <label className="field checkbox">
          <input
            type="checkbox"
            checked={fixedSpec}
            onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
          />
          <span>射撃場スペック固定</span>
        </label>
        <details className="console">
          <summary>コンソール</summary>
          <div className="console-grid">
            {levelField('personal', '共通研究', consoleInput.personal, (lv) =>
              setConsole({ ...consoleInput, personal: lv }),
            )}
            {CONSOLE_CLASSES.map((c) =>
              levelField(`class-${c}`, `${CLASS_LABEL[c]}研究`, consoleInput.class[c], (lv) =>
                setConsole({ ...consoleInput, class: { ...consoleInput.class, [c]: lv } }),
              ),
            )}
            {CONSOLE_CORPORATIONS.map((c) =>
              levelField(`corp-${c}`, `${CORPORATION_LABEL[c]}研究`, consoleInput.corporation[c], (lv) =>
                setConsole({ ...consoleInput, corporation: { ...consoleInput.corporation, [c]: lv } }),
              ),
            )}
          </div>
        </details>
      </div>
    </>
  );
}
