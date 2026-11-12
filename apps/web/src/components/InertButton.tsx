// 押せないことのあるボタン。押せないときも disabled にせず aria-disabled にし、押しても何もしない（inertControl.ts と同じ理由:
// disabled にするとマウスの操作を一切受けず、claude.ai のアーティファクトのコメントでそのボタンを選べない）
import type { ReactNode } from 'react';

type Props = {
  /** 押せるか */
  enabled: boolean;
  /** 押せるときに押した */
  onPress: () => void;
  className?: string;
  children: ReactNode;
};

export function InertButton({ enabled, onPress, className = 'advanced-settings-button', children }: Props) {
  return (
    <button type="button" className={className} aria-disabled={!enabled} onClick={() => enabled && onPress()}>
      {children}
    </button>
  );
}
