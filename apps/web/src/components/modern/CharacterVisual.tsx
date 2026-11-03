import type { CharacterIndexEntry } from '@nikke/core';

export const BURST_STEP_LABEL: Record<CharacterIndexEntry['burstStep'], string> = {
  Step1: 'Ⅰ',
  Step2: 'Ⅱ',
  Step3: 'Ⅲ',
  AllStep: 'ALL',
};

export const ELEMENT_LABEL: Record<CharacterIndexEntry['element'], string> = {
  Fire: '灼熱',
  Water: '水冷',
  Wind: '風圧',
  Iron: '鉄甲',
  Electronic: '電撃',
};

export const ELEMENT_COLOR: Record<CharacterIndexEntry['element'], string> = {
  Fire: '#e53935',
  Water: '#1e88e5',
  Wind: '#43a047',
  Iron: '#fb8c00',
  Electronic: '#8e24aa',
};

type Props = {
  character: CharacterIndexEntry;
  isUnsupported?: boolean;
  size?: 'normal' | 'compact';
};

const BASE_URL = import.meta.env.BASE_URL;

export function CharacterVisual({ character, isUnsupported = false, size = 'normal' }: Props) {
  const elementColor = ELEMENT_COLOR[character.element] ?? '#757575';
  const burstLabel = BURST_STEP_LABEL[character.burstStep] ?? character.burstStep;
  const imageSrc = `${BASE_URL}characters/images/${character.resourceId}.webp`;

  return (
    <div
      className={`char-visual ${size === 'compact' ? 'char-visual-compact' : ''}`}
      style={{ '--char-elem-color': elementColor } as React.CSSProperties}
    >
      <img
        src={imageSrc}
        alt=""
        className="char-visual-img"
        onError={(e) => {
          // 画像が無い場合はフォールバックのCSS表示にする
          (e.currentTarget as HTMLElement).style.display = 'none';
        }}
      />
      <div className="char-visual-fallback" aria-hidden="true">
        <span className="char-fallback-elem">{ELEMENT_LABEL[character.element]}</span>
        <span className="char-fallback-name">{character.name.ja}</span>
      </div>
      <div className="char-visual-badges">
        <span className="char-badge char-badge-burst" title={`バースト ${burstLabel}`}>
          {burstLabel}
        </span>
        <span className="char-badge char-badge-weapon" title={`武器種 ${character.weaponType}`}>
          {character.weaponType}
        </span>
      </div>
      {isUnsupported && <span className="char-unsupported-tag">未</span>}
    </div>
  );
}
