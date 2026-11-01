import { useState } from 'react';
import { parseIntDraft, settleIntDraft } from '../intDraft.ts';

type Props = {
  value: number;
  min: number;
  /** 省略は上限なし */
  max?: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
};

/**
 * 整数の入力欄。打ちかけの空欄や範囲外はそのまま表示しておき、min..max の整数になった時点で反映、フォーカスが外れたら
 * 丸めて確定する（空欄は元の値に戻す）。外から value が変わったら表示を合わせる
 */
export function IntInput({ value, min, max, disabled = false, onCommit }: Props) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setText(String(value));
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={1}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseIntDraft(e.target.value, min, max ?? Infinity);
        if (n !== null && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        const n = settleIntDraft(e.target.value, value, min, max ?? Infinity);
        setText(String(n));
        if (n !== value) onCommit(n);
      }}
    />
  );
}
