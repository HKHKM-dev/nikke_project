// styles.css の規則のうち、配置を決めて画面で測らないと崩れに気づかないものを押さえる。
// 最適編成計算のポップアップ（OptimalPartyPanel.tsx）は、計算の前後でスロットの選択欄と「計算」のボタンが動かない。
// 結果が出て中身の背と幅が伸びても枠の上端と幅が変わらないことは、下の 2 つの規則で決まる。
// 実際の配置は測らない（jsdom・happy-dom は配置を計算せず、CI にブラウザが無い）。規則が当たるクラスが枠と中身に付くことは
// OptimalPartyPanel.test.tsx が見る
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8');

/** 行頭から始まる、セレクタが selector だけの規則の宣言（同じ名前は後のものが勝つ）。@media の中の規則は見ない */
function declarations(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'gm'))];
  expect(blocks, `styles.css に「${selector}」の規則が無い`).not.toHaveLength(0);
  const result = new Map<string, string>();
  for (const [, body] of blocks) {
    for (const line of body!.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
      const at = line.indexOf(':');
      if (at >= 0) result.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  return result;
}

describe('最適編成計算のポップアップの配置（styles.css）', () => {
  it('枠は上端を決めて縦にずらさない（中央にそろえると、結果が出て背が伸びたときに上へずれる）', () => {
    const center = declarations('.popover-panel-center');
    const panel = declarations('.popover-panel-center.optimal-party-popover');
    const top = panel.get('top');
    expect(top).toBeDefined();
    expect(top).not.toContain('%');
    expect(top).not.toBe(center.get('top'));
    const translate = panel.get('translate');
    expect(translate).toBeDefined();
    const [x, y] = translate!.split(/\s+/);
    expect(x).toBe('-50%');
    expect(y).toBe('0');
  });

  it('中身の幅は画面の幅だけで決め、結果の一覧に押し広げられない', () => {
    const party = declarations('.optimal-party');
    const width = party.get('width');
    expect(width).toBeDefined();
    // 中身で決まる幅（auto・max-content など）と、中身で決まる親の幅への割合を使わない
    expect(width).not.toMatch(/auto|content|%/);
    expect(party.get('min-width')).toBe('0');
  });
});
