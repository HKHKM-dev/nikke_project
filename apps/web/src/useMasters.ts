// 起動時に 1 回読むマスタ: 育成のマスタ（装備・好感度・キューブ・コレクション・リサイクルルーム）と、敵のプリセット
// （出来事のセットも同じファイル）
import { loadBuildMasters, loadEnemyPresets, type BuildMasters, type EnemyPresetMaster } from '@nikke/core';
import { useEffect, useState } from 'react';

export function useMasters(baseUrl: string): {
  masters: BuildMasters | null;
  mastersError: string | null;
  /** 敵のプリセット。読めなければ null（手入力はできる） */
  enemyMaster: EnemyPresetMaster | null;
} {
  const [masters, setMasters] = useState<BuildMasters | null>(null);
  const [mastersError, setMastersError] = useState<string | null>(null);
  const [enemyMaster, setEnemyMaster] = useState<EnemyPresetMaster | null>(null);
  useEffect(() => {
    loadEnemyPresets({ baseUrl })
      .then(setEnemyMaster)
      .catch(() => setEnemyMaster(null));
  }, [baseUrl]);
  useEffect(() => {
    loadBuildMasters({ baseUrl })
      .then(setMasters)
      .catch((e: unknown) => setMastersError(e instanceof Error ? e.message : String(e)));
  }, [baseUrl]);
  return { masters, mastersError, enemyMaster };
}
