// 持ち主ごとの一覧編（plan/design-holder-effects.md 論点 6）: テストで新旧の比べを入れる（vitest.config.ts の setupFiles）。段 B で消す
import { enableLegacyCrossCheck } from './crossCheck.ts';

enableLegacyCrossCheck();
