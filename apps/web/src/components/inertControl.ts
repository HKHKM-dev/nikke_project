// 使えない入力欄・選択欄・ラジオボタンに付ける属性。disabled の代わりに aria-disabled を付け、マウスとキーボードで
// 開く・変えることを止める。disabled にするとマウスの操作を一切受けず、claude.ai のアーティファクトのコメントで
// その欄を選べない。見た目は styles.css の [aria-disabled='true'] の規則
import type { KeyboardEvent, SyntheticEvent } from 'react';

const stop = (e: SyntheticEvent) => e.preventDefault();
// Tab でのフォーカスの移動だけは通す
const stopKeys = (e: KeyboardEvent) => {
  if (e.key !== 'Tab') e.preventDefault();
};

export function inertControlProps(inert: boolean) {
  return inert
    ? { 'aria-disabled': true as const, onMouseDown: stop, onClick: stop, onKeyDown: stopKeys }
    : { 'aria-disabled': undefined };
}
