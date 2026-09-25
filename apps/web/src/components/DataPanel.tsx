// Stage 14: 編成の JSON の書き出し / 取り込み（plan/design-stage12.md 4.2 節）。保存形式は localStorage と同じ（formatVersion 付き）。
import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState, type Dispatch } from 'react';
import { readTeamJson, serializeTeamState, type TeamAction, type TeamState } from '../team.ts';

type Props = {
  team: TeamState;
  index: readonly CharacterIndexEntry[];
  dispatch: Dispatch<TeamAction>;
};

type Message = { kind: 'ok' | 'error'; text: string };

export function DataPanel({ team, index, dispatch }: Props) {
  const exported = useMemo(() => JSON.stringify(JSON.parse(serializeTeamState(team)), null, 2), [team]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<Message | null>(null);

  const importJson = (json: string) => {
    const result = readTeamJson(json, index);
    if (!result.ok) {
      setMessage({ kind: 'error', text: `取り込めませんでした: ${result.error}` });
      return;
    }
    dispatch({ type: 'replace', state: result.value });
    setMessage({ kind: 'ok', text: '編成を取り込みました' });
    setText('');
  };

  const copy = () => {
    navigator.clipboard
      .writeText(exported)
      .then(() => setMessage({ kind: 'ok', text: 'コピーしました' }))
      .catch(() => setMessage({ kind: 'error', text: 'コピーできませんでした。欄から選択してコピーしてください' }));
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exported], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nikke-team.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <details className="panel data-panel">
      <summary>編成の JSON</summary>
      <div className="data-grid">
        <label className="field">
          <span>書き出し</span>
          <textarea readOnly rows={8} value={exported} onFocus={(e) => e.currentTarget.select()} />
          <span className="data-buttons">
            <button type="button" onClick={copy}>
              コピー
            </button>
            <button type="button" onClick={download}>
              ファイルに保存
            </button>
          </span>
        </label>
        <label className="field">
          <span>取り込み（置き換え）</span>
          <textarea
            rows={8}
            value={text}
            placeholder="書き出した JSON を貼り付け"
            onChange={(e) => setText(e.target.value)}
          />
          <span className="data-buttons">
            <button type="button" disabled={text.trim() === ''} onClick={() => importJson(text)}>
              取り込む
            </button>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) file.text().then(importJson, () => setMessage({ kind: 'error', text: '読めませんでした' }));
              }}
            />
          </span>
        </label>
      </div>
      {message && <p className={message.kind === 'error' ? 'error' : 'hint'}>{message.text}</p>}
    </details>
  );
}
