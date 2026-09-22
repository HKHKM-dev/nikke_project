import { loadCharacter, type CharacterData } from '@nikke/core';
import { useEffect, useRef, useState } from 'react';

export type CharacterCache = {
  /** 読み込み済みのキャラデータ。一度読んだものは枠から外しても保持する */
  characters: ReadonlyMap<number, CharacterData>;
  /** 読み込みに失敗した resourceId とメッセージ */
  errors: ReadonlyMap<number, string>;
};

/** 枠が参照している resourceId をまとめて読み込み、キャッシュする。 */
export function useCharacterCache(resourceIds: readonly (number | null)[], baseUrl: string): CharacterCache {
  const [characters, setCharacters] = useState<ReadonlyMap<number, CharacterData>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  const inflight = useRef(new Set<number>());

  // 配列の同一性に依存しないよう、必要な id を文字列キーにして依存に使う
  const wantedKey = resourceIds.filter((id): id is number => id !== null).join(',');

  useEffect(() => {
    if (wantedKey === '') return;
    for (const text of wantedKey.split(',')) {
      const id = Number(text);
      if (characters.has(id) || errors.has(id) || inflight.current.has(id)) continue;
      inflight.current.add(id);
      loadCharacter(id, { baseUrl })
        .then(
          (character) => setCharacters((m) => new Map(m).set(id, character)),
          (e: unknown) => setErrors((m) => new Map(m).set(id, e instanceof Error ? e.message : String(e))),
        )
        .finally(() => inflight.current.delete(id));
    }
  }, [wantedKey, baseUrl, characters, errors]);

  return { characters, errors };
}
