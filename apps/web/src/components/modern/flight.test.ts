// 立ち絵の写しを動かすキーフレーム（flight.ts の frameAt）: 位置・縮み・下の切り抜き
import { describe, expect, it } from 'vitest';
import { frameAt } from './flight.ts';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
/** 写し（スロットの立ち絵の枠）: 縦長 */
const base = box(0, 0, 100, 200);

describe('frameAt', () => {
  it('写しと同じ位置・大きさなら動かさず、切らない（枠の外は見せる）', () => {
    expect(frameAt(base, base)).toEqual({ transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(-40px)' });
  });

  it('写しより横長の rect（ニケ一覧の四角の絵）は、幅をそろえて縮め、下だけを切って上の部分を残す', () => {
    expect(frameAt(box(10, 20, 50, 50), base)).toEqual({
      transform: 'translate(10px, 20px) scale(0.5)',
      clipPath: 'inset(-40px -40px 100px -40px)',
    });
  });

  it('写しのほうが横長なら、切らずに上下の中央をそろえる', () => {
    expect(frameAt(box(0, 0, 50, 200), base)).toEqual({
      transform: 'translate(0px, 50px) scale(0.5)',
      clipPath: 'inset(-40px)',
    });
  });

  it('大きさの無い rect（配置されていない要素）では、写しのまま動かさない', () => {
    expect(frameAt(box(300, 300, 0, 0), base)).toEqual(frameAt(base, base));
  });
});
