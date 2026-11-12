// モーダルの外枠（幕・箱・見出しと ✕）。スロットの育成・設定（modern/SlotBuildModal.tsx）と育成状況の編集
// （RosterEditModal.tsx）が使う。幕（モーダルの外）・✕・Esc で閉じる。中身（本体と下部）は children
import { useEffect, type ReactNode } from 'react';

type Props = {
  /** 見出し */
  title: ReactNode;
  /** 読み上げの名前 */
  label: string;
  /** 箱に足すクラス（大きさなど） */
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, label, className, onClose, children }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={['modal-container', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close-button" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
