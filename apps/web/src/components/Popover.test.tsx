// @vitest-environment happy-dom
// ボタンで開くポップアップ（Popover.tsx）の閉じ方。幕は click で閉じ、押しただけ（pointerdown）では閉じない
// （押した瞬間に閉じると、タッチでは離した後のクリックが幕の下の部品に届く）
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Popover } from './Popover.tsx';

afterEach(cleanup);

function renderOpened() {
  const view = render(
    <Popover button="開く" buttonClassName="b" label="設定" align="left">
      <p>中身</p>
    </Popover>,
  );
  fireEvent.click(screen.getByRole('button', { name: '設定' }));
  expect(screen.getByRole('dialog', { name: '設定' })).toBeTruthy();
  return view.container.querySelector('.popover-backdrop')!;
}

describe('Popover', () => {
  it('幕を押しただけでは閉じず、幕のクリックで閉じる', () => {
    const backdrop = renderOpened();
    fireEvent.pointerDown(backdrop);
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeTruthy();
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeNull();
  });

  it('中身のクリックでは閉じない', () => {
    renderOpened();
    fireEvent.click(screen.getByText('中身'));
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeTruthy();
  });

  it('Esc で閉じる', () => {
    renderOpened();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeNull();
  });
});
