// @vitest-environment happy-dom
// ボタンで開くポップアップ（Popover.tsx）の閉じ方と、画面の端での位置。幕は click で閉じ、押しただけ（pointerdown）では閉じない
// （押した瞬間に閉じると、タッチでは離した後のクリックが幕の下の部品に届く）
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('ボタンの押し直しで閉じる', () => {
    renderOpened();
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeNull();
  });

  it('中身を関数で渡すと、受けた関数で閉じる', () => {
    render(
      <Popover button="開く" buttonClassName="b" label="設定" align="left">
        {(close) => (
          <button type="button" onClick={close}>
            選ぶ
          </button>
        )}
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.click(screen.getByRole('button', { name: '選ぶ' }));
    expect(screen.queryByRole('dialog', { name: '設定' })).toBeNull();
  });

  it('画面の端からはみ出すと横にずらし、center ではずらさない', () => {
    // 枠の左端が画面の左の外にある
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: -50, y: 0, width: 150, height: 100 }),
    );
    const panelOf = (align: 'left' | 'center') => {
      cleanup();
      render(
        <Popover button="開く" buttonClassName="b" label="設定" align={align}>
          <p>中身</p>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', { name: '設定' }));
      return screen.getByRole('dialog', { name: '設定' });
    };
    expect(panelOf('left').style.translate).toBe('66px 0');
    expect(panelOf('center').style.translate).toBe('');
  });
});
