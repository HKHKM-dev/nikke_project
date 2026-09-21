import { growthLimits, WEAPON_LABEL, ELEMENT_LABEL, type CharacterData, type CharacterIndexEntry, type GrowthInput } from '@nikke/core';
import { useMemo, useState } from 'react';

type Props = {
  index: CharacterIndexEntry[];
  selectedId: number | null;
  onSelect: (resourceId: number) => void;
  character: CharacterData | null;
  growth: GrowthInput;
  onGrowthChange: (growth: GrowthInput) => void;
};

function label(entry: CharacterIndexEntry): string {
  return `${entry.name.ja} (${entry.name.en}) — ${entry.rarity} ${entry.weaponType} ${ELEMENT_LABEL[entry.element].ja}`;
}

export function CharacterForm({ index, selectedId, onSelect, character, growth, onGrowthChange }: Props) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? index.filter((e) => e.name.ja.toLowerCase().includes(q) || e.name.en.toLowerCase().includes(q))
      : index;
    return [...list].sort((a, b) => a.name.ja.localeCompare(b.name.ja, 'ja'));
  }, [index, filter]);
  const limits = character ? growthLimits(character) : null;

  const numberField = (key: keyof GrowthInput, name: string, min: number, max: number) => (
    <label className="field">
      <span>{name}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={growth[key]}
        onChange={(e) => onGrowthChange({ ...growth, [key]: Number(e.target.value) })}
      />
      <small>
        {min}〜{max}
      </small>
    </label>
  );

  return (
    <fieldset className="panel">
      <legend>ニケ</legend>
      <label className="field">
        <span>検索</span>
        <input type="search" value={filter} placeholder="名前（日本語 / 英語）" onChange={(e) => setFilter(e.target.value)} />
      </label>
      <label className="field">
        <span>キャラ</span>
        <select value={selectedId ?? ''} onChange={(e) => onSelect(Number(e.target.value))} size={8}>
          {visible.map((entry) => (
            <option key={entry.resourceId} value={entry.resourceId}>
              {label(entry)}
            </option>
          ))}
        </select>
      </label>
      {character && limits && (
        <>
          <p className="meta">
            {WEAPON_LABEL[character.weaponType].ja} / {ELEMENT_LABEL[character.element].ja} / {character.class} / 装弾数{' '}
            {character.shot.maxAmmo} / リロード {character.shot.reloadTime}s / 武器倍率 {character.shot.damage / 100}%
          </p>
          {numberField('level', 'レベル', 1, limits.levelMax)}
          {numberField('grade', '限界突破', 0, limits.gradeMax)}
          {numberField('core', 'コア強化', 0, limits.coreMax)}
        </>
      )}
    </fieldset>
  );
}
