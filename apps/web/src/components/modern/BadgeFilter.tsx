// バッジの絞り込みのボタン（ニケ一覧の CharacterTray.tsx と、育成状況の編集の RosterEditModal.tsx）
import {
  BADGE_KINDS,
  filterButtonValues,
  toggleBadgeFilter,
  type BadgeFilters as BadgeFilterValues,
  type BadgeKind,
} from './badges.ts';
import { BadgeIcon } from './BadgeIcon.tsx';

/** 1 種類のバッジを並べた絞り込み（同じ種類でも複数選べる。押したときの切り替えは toggleBadgeFilter） */
function BadgeFilter({
  kind,
  values,
  onToggle,
}: {
  kind: BadgeKind;
  values: readonly string[] | undefined;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="char-tray-badge-filter" role="group" aria-label={`${kind.name}で絞り込み`}>
      {filterButtonValues(kind).map((v) => {
        const { name, label } = kind.badges[v]!;
        return (
          <button
            key={v}
            type="button"
            className="char-tray-badge-button"
            aria-pressed={values?.includes(v) ?? false}
            onClick={() => onToggle(v)}
          >
            <BadgeIcon className="char-badge" name={name} label={label} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * バッジの絞り込み（kinds の種類を並べる。既定は全部の種類: 属性・バースト段階・クラス・武器種・企業）。
 * 同じ種類は OR、種類どうしは AND（matchesBadgeFilters）
 */
export function BadgeFilters({
  filters,
  onChange,
  kinds = BADGE_KINDS,
}: {
  filters: BadgeFilterValues;
  onChange: (next: BadgeFilterValues) => void;
  kinds?: readonly BadgeKind[];
}) {
  return (
    <>
      {kinds.map((kind) => (
        <BadgeFilter
          key={kind.key}
          kind={kind}
          values={filters[kind.key]}
          onToggle={(value) => onChange(toggleBadgeFilter(filters, kind.key, value))}
        />
      ))}
    </>
  );
}
