// 一覧でクリックしたニケの置く先を待っている間（モダン UI）の入力の止め方
import { useEffect } from 'react';

/**
 * 待っている間（awaiting）に、スロットのほか（一覧のニケ・ボタン・アイコン・プルダウンメニュー・入力欄・何もないところ）をクリックしたら、
 * 待つのをやめるだけにする（cancel を呼ぶ。クリックした部品は反応させない。先に document の capture の段で受けて止める）。
 * プルダウンメニューが開く・入力欄にフォーカスが移るのは押した時（mousedown）なので、それも止める。編成の番号と選んでいない編成の行は、
 * マウスでは離した時（pointerup）に選ぶので、押した時（pointerdown）も止める。置けるのは待っている印（modern-slot-awaiting）の付いたスロットだけで、
 * そのクリックは止めない（置く処理は呼び手）。選んでいない編成の行のカードは、押すとその編成を選ぶので止める。
 * 待ち始めたクリック（一覧のニケ）は、document の capture の段を過ぎてから付けるので、ここには来ない
 */
export function useAwaitingPlacement(awaiting: boolean, cancel: () => void): void {
  useEffect(() => {
    if (!awaiting) return;
    const blockOutsideSlots = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.modern-slot-awaiting')) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'click') cancel();
    };
    const types = ['pointerdown', 'mousedown', 'click'] as const;
    for (const type of types) document.addEventListener(type, blockOutsideSlots, true);
    return () => {
      for (const type of types) document.removeEventListener(type, blockOutsideSlots, true);
    };
  }, [awaiting, cancel]);
}
