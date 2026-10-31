import { ELEMENTS, ELEMENT_LABEL, TEAM_SIZE, type Element } from '@nikke/core';
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
  fixedSpec: boolean;
  /** 2026-10-31: コンソール（リサイクルルームの研究 Lv）。スペック固定の間は使わない */
  consoleInput: ConsoleInput;
  /** 2026-10-31: シンクロレベル（編成共通）。スペック固定の間は使わない */
  synchroLevel: number;
  /** 2026-10-31: 詳細設定（ポップアップ）の欄 */
  durationSeconds: number;
  burst: boolean;
  controlledSlot: number;
  rangeJump: boolean;
  /** 枠ごとのキャラ名（操作キャラの選択肢に出す）。空の枠は null */
  slotNames: readonly (string | null)[];
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 敵名・属性の枠と、「共通育成」の折りたたみ（射撃場スペック固定・シンクロレベル・リサイクルルーム（コンソール））。
 * 2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、編成共通の育成を「共通育成」にまとめた。
 * 敵は射撃場の的だけで、選べるのは属性（防御力・コアありの欄は消した）。
 * 属性の右の「詳細設定」のポップアップで、3 分モード（的のジャンプ）・戦闘時間・バースト・操作キャラを設定する
 */
export function TeamSettingsForm({
  element,
  fixedSpec,
  consoleInput,
  synchroLevel,
  durationSeconds,
  burst,
  controlledSlot,
  rangeJump,
  slotNames,
  dispatch,
}: Props) {
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
          <Popover button="詳細設定" buttonClassName="advanced-settings-button" label="詳細設定" align="left">
            <div className="advanced-settings">
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={rangeJump}
                  onChange={(e) => dispatch({ type: 'setRangeJump', rangeJump: e.target.checked })}
                />
                <span>3 分モード（的のジャンプ）</span>
              </label>
              <label className="field">
                <span>戦闘時間（秒）</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={durationSeconds}
                  onChange={(e) =>
                    dispatch({ type: 'setDuration', durationSeconds: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
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
                      {i + 1}: {slotNames[i] ?? 'なし'}
                    </option>
                  ))}
                </select>
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
          <span>射撃場スペック固定</span>
        </label>
        <div className="console-grid">
          {levelField('synchro', 'シンクロ LV', synchroLevel, (lv) =>
            dispatch({ type: 'setSynchroLevel', synchroLevel: Math.max(1, lv) }),
          )}
        </div>
        <div className="console">
          <span className="console-title">リサイクルルーム</span>
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
        </div>
      </details>
    </>
  );
}
