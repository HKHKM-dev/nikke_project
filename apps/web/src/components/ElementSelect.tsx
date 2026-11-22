// 敵情報の「属性」のプルダウン。選択肢と、いま選んでいる属性の両方に、属性のバッジを出す（属性なしは空の六角形）。
// 標準の select の選択肢には絵を入れられないので、Popover に選択肢のボタンを並べる
import { ELEMENTS, ELEMENT_LABEL, type Element } from '@nikke/core';
import { Popover } from './Popover.tsx';
import { BadgeIcon } from './modern/BadgeIcon.tsx';
import { ELEMENT_BADGE_KIND, EMPTY_ELEMENT_BADGE } from './modern/badges.ts';

type Item = { value: Element | null; badge: string; label: string };

const ITEMS: readonly Item[] = [
  { value: null, badge: EMPTY_ELEMENT_BADGE, label: 'なし' },
  ...ELEMENTS.map((el) => ({ value: el, badge: ELEMENT_BADGE_KIND.badges[el]!.name, label: ELEMENT_LABEL[el].ja })),
];

export function ElementSelect({
  element,
  onChange,
}: {
  element: Element | null;
  onChange: (element: Element | null) => void;
}) {
  const current = ITEMS.find((item) => item.value === element) ?? ITEMS[0]!;
  return (
    <Popover
      button={
        <>
          <BadgeIcon name={current.badge} className="element-select-badge" />
          <span>{current.label}</span>
          <span className="element-select-caret" aria-hidden="true">
            ▾
          </span>
        </>
      }
      buttonClassName="element-select-button"
      label="属性"
      align="left"
    >
      {(close) => (
        <div className="element-select-options">
          {ITEMS.map((item) => (
            <button
              key={item.value ?? 'none'}
              type="button"
              className="element-select-option"
              aria-pressed={item.value === element}
              onClick={() => {
                onChange(item.value);
                close();
              }}
            >
              <BadgeIcon name={item.badge} className="element-select-badge" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
