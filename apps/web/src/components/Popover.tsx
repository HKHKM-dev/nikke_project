// ボタンで開くポップアップ（右上の設定・チームとスロットの詳細設定）。開いている間は画面を暗くする幕を出し、幕を押すか Esc で閉じる
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** ポップアップと画面の端の間をあける幅（px。body の左右の余白と同じ） */
const VIEWPORT_MARGIN = 16;

/** ポップアップが画面の左右からはみ出すとき、はみ出さない位置へ横にずらす。両方はみ出すときは左端をそろえる */
function keepInViewport(panel: HTMLElement) {
  panel.style.translate = '';
  const rect = panel.getBoundingClientRect();
  const right = document.documentElement.clientWidth - VIEWPORT_MARGIN;
  let shift = 0;
  if (rect.right > right) shift = right - rect.right;
  if (rect.left + shift < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - rect.left;
  if (shift !== 0) panel.style.translate = `${shift}px 0`;
}

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
  const panelRef = useRef<HTMLDivElement>(null);

  // 幅が狭いと、ボタンが画面の端に寄ってポップアップがはみ出すので、開いたときと画面の幅が変わったときに位置を直す
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || panel === null) return;
    keepInViewport(panel);
    const onResize = () => keepInViewport(panel);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

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
          <div ref={panelRef} className={`popover-panel popover-panel-${align}`} role="dialog" aria-label={label}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
