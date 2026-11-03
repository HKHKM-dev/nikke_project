import { ClassicView } from './ClassicView.tsx';
import type { ViewProps } from './ViewProps.ts';

export function ModernView(props: ViewProps) {
  return (
    <div className="modern-view-container">
      <div className="modern-badge-banner" role="status">
        <strong>モダン表示モード</strong>（開発中: Step 1 表示基盤）
      </div>
      <ClassicView {...props} />
    </div>
  );
}
