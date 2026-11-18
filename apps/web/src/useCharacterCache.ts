import { loadCharacter, type CharacterData } from '@nikke/core';
import { useEffect, useRef, useState } from 'react';

export type CharacterCache = {
  /** 読み込み済みのキャラデータ。一度読んだものは枠から外しても保持する */
  characters: ReadonlyMap<number, CharacterData>;
  /** 読み込みに失敗した resourceId とメッセージ */
  errors: ReadonlyMap<number, string>;
};

// 読んだキャラデータと読んでいる途中のものは、画面全体で 1 つに持つ（スロット・育成状況の編集の窓のどちらで読んだものも、
// 開き直した窓でもすぐ出す）。失敗したものは持たず、次に要るときに読み直す
const loaded = new Map<string, CharacterData>();
const pending = new Map<string, Promise<CharacterData>>();
const keyOf = (baseUrl: string, id: number) => `${baseUrl}\n${id}`;

function loadShared(id: number, baseUrl: string): Promise<CharacterData> {
  const key = keyOf(baseUrl, id);
  const done = loaded.get(key);
  if (done) return Promise.resolve(done);
  let p = pending.get(key);
  if (!p) {
    p = loadCharacter(id, { baseUrl }).then((character) => {
      loaded.set(key, character);
      return character;
    });
    p.finally(() => pending.delete(key)).catch(() => {});
    pending.set(key, p);
  }
  return p;
}

/** 次に要りそうなキャラ（育成状況の編集の窓の前後のニケ）を先に読んでおく。失敗は、要るときに読み直して知らせる */
export function prefetchCharacters(resourceIds: readonly (number | null)[], baseUrl: string): void {
  for (const id of resourceIds) if (id !== null) loadShared(id, baseUrl).catch(() => {});
}

/** 枠が参照している resourceId をまとめて読み込み、キャッシュする。 */
export function useCharacterCache(resourceIds: readonly (number | null)[], baseUrl: string): CharacterCache {
  // 配列の同一性に依存しないよう、必要な id を文字列キーにして依存に使う
  const wantedKey = resourceIds.filter((id): id is number => id !== null).join(',');
  const [characters, setCharacters] = useState<ReadonlyMap<number, CharacterData>>(() => new Map());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(() => new Map());
  const inflight = useRef(new Set<number>());

  useEffect(() => {
    if (wantedKey === '') return;
    for (const text of wantedKey.split(',')) {
      const id = Number(text);
      // 読めなかったものは、ほかの所で読み終えたときだけ取り直す（共有のキャッシュから。fetch はしない）
      if (characters.has(id) || inflight.current.has(id)) continue;
      if (errors.has(id) && !loaded.has(keyOf(baseUrl, id))) continue;
      inflight.current.add(id);
      loadShared(id, baseUrl)
        .then(
          (character) => {
            setCharacters((m) => new Map(m).set(id, character));
            setErrors((m) => {
              if (!m.has(id)) return m;
              const next = new Map(m);
              next.delete(id);
              return next;
            });
          },
          (e: unknown) => setErrors((m) => new Map(m).set(id, e instanceof Error ? e.message : String(e))),
        )
        .finally(() => inflight.current.delete(id));
    }
  }, [wantedKey, baseUrl, characters, errors]);

  // 画面全体で読み終えているもの（ほかの所で読んだ・先に読んだ）は、表に入る前のこの描画から出す（上の読み込みはすぐ済み、次の描画で表に入る）。
  // ここで読めなかったものも、ほかの所で読み終えていれば、データを出してエラーは出さない（上の読み込みは依存が変わるまで回らない）。
  // 足すものが無ければ、持っている表をそのまま返す
  const extra =
    wantedKey === ''
      ? []
      : wantedKey
          .split(',')
          .map(Number)
          .filter((id) => !characters.has(id) && loaded.has(keyOf(baseUrl, id)));
  if (extra.length === 0) return { characters, errors };
  const merged = new Map(characters);
  for (const id of extra) merged.set(id, loaded.get(keyOf(baseUrl, id))!);
  if (!extra.some((id) => errors.has(id))) return { characters: merged, errors };
  // エラーの表は持っている状態から消す（描画のたびに新しい表を返さない。React はすぐ描き直し、次の描画ではここに来ない）
  const remaining = new Map(errors);
  for (const id of extra) remaining.delete(id);
  setErrors(remaining);
  return { characters: merged, errors: remaining };
}
