import { ELEMENTS, ELEMENT_LABEL, FIXED_SPEC_LEVEL, type Element } from '@nikke/core';
import type { Dispatch } from 'react';
import type { RosterCommonGrowth } from '../roster.ts';
import { SHOOTING_RANGE_ENEMY, emptyConsole, sameConsole, type ConsoleInput, type TeamAction } from '../team.ts';
import { ConsoleFields } from './ConsoleFields.tsx';
import { InertButton } from './InertButton.tsx';
import { IntInput } from './IntInput.tsx';
import { Popover } from './Popover.tsx';
import { ROSTER_REVERT_LABEL } from './RosterRevertButton.tsx';

/** スペック固定の間にリサイクルルームの欄に出す値（計算は研究なし） */
const NO_CONSOLE = emptyConsole();

type Props = {
  element: Element | null;
  fixedSpec: boolean;
  /** 2026-10-31: コンソール（リサイクルルームの研究 Lv）。スペック固定の間は使わない */
  consoleInput: ConsoleInput;
  /** 2026-10-31: シンクロレベル（編成共通）。スペック固定の間は使わない */
  synchroLevel: number;
  /** 2026-10-31: 詳細設定（ポップアップ）の欄 */
  durationSeconds: number;
  rangeJump: boolean;
  /**
   * 育成状況のシンクロ LV・リサイクルルーム（育成状況が無ければ null）。あれば「育成状況の値に戻す」を出す
   * （plan/design-roster-edit.md 7 節）
   */
  rosterCommon: RosterCommonGrowth | null;
  dispatch: Dispatch<TeamAction>;
};

/**
 * 編成共通の設定: 「敵情報」の枠（敵名・属性）と、「共通育成」の枠（スペック固定（ユニオン射撃場の固定値）・シンクロレベルと、折りたたみのリサイクルルーム（コンソール））。
 * 2026-10-31: オーナーの指示で詳細設定（折りたたみ）を消し、編成共通の育成を「共通育成」にまとめた。
 * 敵は射撃場の敵だけで、選べるのは属性（防御力 100・コアあり。team.ts の SHOOTING_RANGE_ENEMY）。
 * 属性の右の「詳細設定」のポップアップで、ジャンプ移動（3 分モードの敵のジャンプ）・戦闘時間を設定する（バーストを使うかはスロットの詳細設定）
 */
export function TeamSettingsForm({
  element,
  fixedSpec,
  consoleInput,
  synchroLevel,
  durationSeconds,
  rangeJump,
  rosterCommon,
  dispatch,
}: Props) {
  // 育成状況の値に戻せるか: スペック固定の間と、いまの値が育成状況と同じときは押せない
  const canRevert =
    rosterCommon !== null &&
    !fixedSpec &&
    !(synchroLevel === rosterCommon.synchroLevel && sameConsole(consoleInput, rosterCommon.console));
  return (
    // 敵情報と共通育成は横に並べる（狭い画面では縦）
    <div className="settings-row">
      <fieldset className="panel settings">
        <legend>敵情報</legend>
        <div className="settings-simple">
          {/* 見出し（敵情報）で分かるので、敵の欄の名前は出さない */}
          <label className="field">
            <select defaultValue="range-bigarms" aria-label="敵">
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
              <label className="field">
                <span>戦闘時間（秒）</span>
                <IntInput
                  value={durationSeconds}
                  min={1}
                  onCommit={(seconds) => dispatch({ type: 'setDuration', durationSeconds: seconds })}
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
            </div>
          </Popover>
        </div>
      </fieldset>
      <fieldset className="panel common-growth">
        <legend>共通育成</legend>
        {/* シンクロ LV とスペック固定はいつも 1 行で出し、リサイクルルームは詳細設定のポップアップに置く */}
        <div className="common-growth-row">
          <label className="field">
            <span>シンクロ LV</span>
            <IntInput
              value={fixedSpec ? FIXED_SPEC_LEVEL : synchroLevel}
              min={1}
              disabled={fixedSpec}
              onCommit={(lv) => dispatch({ type: 'setSynchroLevel', synchroLevel: lv })}
            />
          </label>
          <label className="field checkbox">
            <input
              type="checkbox"
              checked={fixedSpec}
              onChange={(e) => dispatch({ type: 'setFixedSpec', fixedSpec: e.target.checked })}
            />
            <span>スペック固定</span>
          </label>
          <Popover button="詳細設定" buttonClassName="advanced-settings-button" label="共通育成の詳細設定" align="left">
            <fieldset className="popover-group console-settings">
              <legend>リサイクルルーム</legend>
              {/* スペック固定の間は、計算に使う値（研究なし）を暗くして出す。保存している値は残す */}
              <ConsoleFields
                value={fixedSpec ? NO_CONSOLE : consoleInput}
                disabled={fixedSpec}
                onChange={(next: ConsoleInput) => dispatch({ type: 'setConsole', console: next })}
              />
            </fieldset>
          </Popover>
          {rosterCommon !== null && (
            <InertButton
              enabled={canRevert}
              onPress={() => {
                dispatch({ type: 'setSynchroLevel', synchroLevel: rosterCommon.synchroLevel });
                dispatch({ type: 'setConsole', console: rosterCommon.console });
              }}
            >
              {ROSTER_REVERT_LABEL}
            </InertButton>
          )}
        </div>
      </fieldset>
    </div>
  );
}
