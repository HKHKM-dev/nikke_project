// 押せないことのあるボタン。押せないときも disabled にせず aria-disabled にし、押しても何もしない（inertControl.ts と同じ理由:
// disabled にするとマウスの操作を一切受けず、claude.ai のアーティファクトのコメントでそのボタンを選べない）
import type { ReactNode } from 'react';

type Props = {
  /** 押せるか */
  enabled: boolean;
  /** 押せるときに押した */
  onPress: () => void;
  className?: string;
  /** ボタンの名前（中身が絵だけのとき。読み上げにだけ渡す。マウスを重ねたときの文字（title）は出さない: オーナーの指示） */
  label?: string;
  children: ReactNode;
};

export function InertButton({ enabled, onPress, className = 'advanced-settings-button', label, children }: Props) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-disabled={!enabled}
      onClick={() => enabled && onPress()}
    >
      {children}
    </button>
  );
}
