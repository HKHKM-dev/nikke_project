// ボタンで開くポップアップ（右上の設定・敵の詳細設定）。開いている間は画面を暗くする幕を出し、幕を押すか Esc で閉じる
import { useEffect, useState, type ReactNode } from 'react';

type Props = {
  /** ボタンの中身 */
  button: ReactNode;
  buttonClassName: string;
  /** ボタンとポップアップの読み上げの名前 */
  label: string;
  /** ポップアップをボタンのどちらの端にそろえるか */
  align: 'left' | 'right';
  children: ReactNode;
};

export function Popover({ button, buttonClassName, label, align, children }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="popover">
      <button
        type="button"
        className={`popover-button ${buttonClassName}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {button}
      </button>
      {open && (
        <>
          <div className="popover-backdrop" aria-hidden="true" onPointerDown={() => setOpen(false)} />
          <div className={`popover-panel popover-panel-${align}`} role="dialog" aria-label={label}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
