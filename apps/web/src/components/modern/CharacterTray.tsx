import type { CharacterIndexEntry } from '@nikke/core';
import { useMemo, useState } from 'react';
import { CharacterVisual, ELEMENT_LABEL } from './CharacterVisual.tsx';

type Props = {
  index: readonly CharacterIndexEntry[];
  takenIds: ReadonlySet<number>;
  fullySupported: ReadonlySet<number> | null;
  onSelectCharacter: (resourceId: number) => void;
  activeSlotIndex: number;
};

const ELEMENTS: readonly (CharacterIndexEntry['element'] | 'All')[] = [
  'All',
  'Fire',
  'Water',
  'Wind',
  'Iron',
  'Electronic',
];
const WEAPONS: readonly (CharacterIndexEntry['weaponType'] | 'All')[] = ['All', 'AR', 'SMG', 'SG', 'SR', 'RL', 'MG'];

export function CharacterTray({ index, takenIds, fullySupported, onSelectCharacter, activeSlotIndex }: Props) {
  const [query, setQuery] = useState('');
  const [burstFilter, setBurstFilter] = useState<CharacterIndexEntry['burstStep'] | 'All'>('All');
  const [elementFilter, setElementFilter] = useState<CharacterIndexEntry['element'] | 'All'>('All');
  const [weaponFilter, setWeaponFilter] = useState<CharacterIndexEntry['weaponType'] | 'All'>('All');
  const [onlySupported, setOnlySupported] = useState(false);

  const filteredCharacters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return index
      .filter((char) => {
        if (burstFilter !== 'All' && char.burstStep !== burstFilter) return false;
        if (elementFilter !== 'All' && char.element !== elementFilter) return false;
        if (weaponFilter !== 'All' && char.weaponType !== weaponFilter) return false;
        if (onlySupported && fullySupported && !fullySupported.has(char.resourceId)) return false;
        if (q && !char.name.ja.toLowerCase().includes(q) && !char.name.en.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        // 編成中のキャラは後ろへ
        const aTaken = takenIds.has(a.resourceId);
        const bTaken = takenIds.has(b.resourceId);
        if (aTaken !== bTaken) return aTaken ? 1 : -1;
        return a.name.ja.localeCompare(b.name.ja, 'ja');
      });
  }, [index, burstFilter, elementFilter, weaponFilter, onlySupported, fullySupported, query, takenIds]);

  return (
    <section className="char-tray-panel" aria-label="ニケ一覧パレット">
      <div className="char-tray-header">
        <div className="char-tray-title">
          <h3>ニケ一覧</h3>
          <span className="char-tray-target-slot">
            配置先: <strong>スロット {activeSlotIndex + 1}</strong>
          </span>
        </div>
        <div className="char-tray-filters">
          <input
            type="search"
            className="char-tray-search"
            placeholder="名前で検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="char-tray-filter-group">
            <select
              value={burstFilter}
              aria-label="バースト段階で絞り込み"
              onChange={(e) => setBurstFilter(e.target.value as typeof burstFilter)}
            >
              <option value="All">バースト: 全て</option>
              <option value="Step1">バースト Ⅰ</option>
              <option value="Step2">バースト Ⅱ</option>
              <option value="Step3">バースト Ⅲ</option>
              <option value="AllStep">バースト ALL</option>
            </select>
            <select
              value={elementFilter}
              aria-label="属性で絞り込み"
              onChange={(e) => setElementFilter(e.target.value as typeof elementFilter)}
            >
              <option value="All">属性: 全て</option>
              {ELEMENTS.filter((e) => e !== 'All').map((elem) => (
                <option key={elem} value={elem}>
                  {ELEMENT_LABEL[elem as CharacterIndexEntry['element']]}
                </option>
              ))}
            </select>
            <select
              value={weaponFilter}
              aria-label="武器種で絞り込み"
              onChange={(e) => setWeaponFilter(e.target.value as typeof weaponFilter)}
            >
              <option value="All">武器: 全て</option>
              {WEAPONS.filter((w) => w !== 'All').map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <label className="char-tray-checkbox-label">
              <input type="checkbox" checked={onlySupported} onChange={(e) => setOnlySupported(e.target.checked)} />
              <span>完全対応のみ</span>
            </label>
          </div>
        </div>
      </div>

      <div className="char-tray-list">
        {filteredCharacters.length === 0 ? (
          <p className="char-tray-empty">該当するニケが見つかりませんでした。</p>
        ) : (
          filteredCharacters.map((char) => {
            const isTaken = takenIds.has(char.resourceId);
            const isUnsupported = fullySupported !== null && !fullySupported.has(char.resourceId);
            return (
              <button
                key={char.resourceId}
                type="button"
                className={`char-tray-item ${isTaken ? 'char-tray-item-taken' : ''}`}
                onClick={() => onSelectCharacter(char.resourceId)}
                title={`${char.name.ja}${isTaken ? ' (他スロットに配置中)' : ''}`}
              >
                <CharacterVisual character={char} isUnsupported={isUnsupported} size="compact" />
                <span className="char-tray-item-name">{char.name.ja}</span>
                {isTaken && <span className="char-tray-item-taken-badge">配置中</span>}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
