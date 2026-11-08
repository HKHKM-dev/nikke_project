// ニケ一覧（モダン UI のトレイ）の立ち絵の形: 四角（顔の絵）か縦長（スロットと同じ縦長の絵を一覧の幅に縮めたもの）。選んだ形はブラウザに覚える
export const TRAY_SHAPES = ['square', 'tall'] as const;
export type TrayShape = (typeof TRAY_SHAPES)[number];

export const TRAY_SHAPE_STORAGE_KEY = 'nikke-calc.trayShape';

export const TRAY_SHAPE_LABEL: Record<TrayShape, string> = { square: '四角', tall: '縦長' };

/** 覚えた形を読む（無い・読めないときは四角） */
export function parseTrayShape(v: string | null): TrayShape {
  return v === 'tall' ? 'tall' : 'square';
}
