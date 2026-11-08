import type { CharacterIndexEntry } from '@nikke/core';
import { useState } from 'react';
import { BADGE_KINDS } from './badges.ts';

type Props = {
  character: CharacterIndexEntry;
  isUnsupported?: boolean;
  /** normal・compact は顔のアイコン（正方形）、portrait は縦長の絵（スロットのカード） */
  size?: 'normal' | 'compact' | 'portrait';
};

const BASE_URL = import.meta.env.BASE_URL;

export function CharacterVisual({ character, isUnsupported = false, size = 'normal' }: Props) {
  const imageSrc = `${BASE_URL}characters/${size === 'portrait' ? 'portraits' : 'images'}/${character.resourceId}.webp`;
  // 画像が読めなかったキャラ（画像の無い配信・CDN に無いキャラ）だけ、名前の札を出す。
  // 読めた画像の上には名前を重ねない（npm run fetch-images。plan/design-modern-ui.md）
  const [failedId, setFailedId] = useState<number | null>(null);
  const failed = failedId === character.resourceId;

  return (
    <div className={`char-visual ${size === 'normal' ? '' : `char-visual-${size}`}`}>
      {failed ? (
        <span className="char-visual-fallback" aria-hidden="true">
          {character.name.ja}
        </span>
      ) : (
        <img
          src={imageSrc}
          alt=""
          className="char-visual-img"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedId(character.resourceId)}
        />
      )}
      {/* 属性・バースト段階・クラス・武器種のバッジ（plan/design-modern-ui.md 2.5 節） */}
      <div className="char-visual-badges">
        {BADGE_KINDS.map(({ key, badges }) => {
          const badge = badges[character[key]];
          return (
            badge && (
              <img
                key={key}
                className="char-badge"
                src={badge.src}
                alt={badge.label}
                title={badge.label}
                draggable={false}
              />
            )
          );
        })}
      </div>
      {isUnsupported && <span className="char-unsupported-tag">未</span>}
    </div>
  );
}
