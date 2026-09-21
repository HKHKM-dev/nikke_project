import {
  computeDamage,
  growthLimits,
  loadCharacter,
  loadCharacterIndex,
  type CharacterData,
  type CharacterIndexEntry,
  type ConditionInput,
  type DamageResult,
  type EnemyInput,
  type GrowthInput,
} from '@nikke/core';
import { useEffect, useMemo, useState } from 'react';
import { CharacterForm } from './components/CharacterForm.tsx';
import { EnemyForm, SHOOTING_RANGE_ENEMY } from './components/EnemyForm.tsx';
import { ResultPanel } from './components/ResultPanel.tsx';

const BASE_URL = import.meta.env.BASE_URL;

function clampGrowth(character: CharacterData, growth: GrowthInput): GrowthInput {
  const limits = growthLimits(character);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
  return {
    level: clamp(growth.level, 1, limits.levelMax),
    grade: clamp(growth.grade, 0, limits.gradeMax),
    core: clamp(growth.core, 0, limits.coreMax),
  };
}

type Computed = { ok: true; result: DamageResult } | { ok: false; error: string };

export function App() {
  const [index, setIndex] = useState<CharacterIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [growth, setGrowth] = useState<GrowthInput>({ level: 200, grade: 3, core: 0 });
  const [enemy, setEnemy] = useState<EnemyInput>(SHOOTING_RANGE_ENEMY);
  const [condition, setCondition] = useState<ConditionInput>({
    coreHitRate: 1,
    distanceBonus: true,
    fullCharge: true,
    durationSeconds: 180,
  });

  useEffect(() => {
    loadCharacterIndex({ baseUrl: BASE_URL })
      .then((i) => setIndex(i.characters))
      .catch((e: unknown) => setLoadError(String(e)));
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setCharacter(null);
    loadCharacter(selectedId, { baseUrl: BASE_URL })
      .then((c) => {
        if (!cancelled) setCharacter(c);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const effectiveGrowth = useMemo(() => (character ? clampGrowth(character, growth) : growth), [character, growth]);

  const computed = useMemo<Computed | null>(() => {
    if (!character) return null;
    try {
      return { ok: true, result: computeDamage({ character, growth: effectiveGrowth, enemy, condition }) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [character, effectiveGrowth, enemy, condition]);

  return (
    <main className="app">
      <header>
        <h1>NIKKE calc v1</h1>
        <p>通常攻撃のみの静的 DPS（Stage 2）</p>
      </header>
      {loadError && <p className="error">データの読み込みに失敗しました: {loadError}</p>}
      {index === null && !loadError && <p>キャラ一覧を読み込み中…</p>}
      {index && (
        <div className="layout">
          <div className="forms">
            <CharacterForm
              index={index}
              selectedId={selectedId}
              onSelect={setSelectedId}
              character={character}
              growth={effectiveGrowth}
              onGrowthChange={setGrowth}
            />
            <EnemyForm character={character} enemy={enemy} onEnemyChange={setEnemy} condition={condition} onConditionChange={setCondition} />
          </div>
          <div className="output">
            {selectedId !== null && !character && !loadError && <p>キャラデータを読み込み中…</p>}
            {character && computed?.ok && <ResultPanel character={character} result={computed.result} />}
            {computed && !computed.ok && <p className="error">{computed.error}</p>}
            {selectedId === null && <p className="hint">左のリストからニケを選んでください。</p>}
          </div>
        </div>
      )}
    </main>
  );
}
