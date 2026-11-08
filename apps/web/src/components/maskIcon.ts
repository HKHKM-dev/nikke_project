// 絵（SVG）を型にして文字の色で塗るアイコン（styles.css の .mask-icon）。要素の style に渡す
import type { CSSProperties } from 'react';

export function maskIconStyle(src: string): CSSProperties {
  return { '--icon': `url("${src}")` } as CSSProperties;
}
