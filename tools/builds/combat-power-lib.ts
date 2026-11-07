// 戦闘力の突き合わせ（combat-power.ts）の純関数

/** 1 体分。model はモデルの戦闘力（出せなければ null）、actual はゲームの戦闘力 */
export type CombatPowerRow = { id: number; model: number | null; actual: number };

export type CombatPowerComparison = {
  /** model が actual と同じ体 */
  matched: number;
  /** model が actual と違う（か出せない）体 */
  mismatched: CombatPowerRow[];
  /** actual で高低が付く 2 体の組のうち、model の高低が逆か同じになる組の数（並びの食い違い） */
  inversions: number;
  /** actual が同じ値の 2 体の組の数（ゲームの並びの順が式では決まらない組） */
  actualTies: number;
};

/** 戦闘力の降順（同じ値は id の昇順）。model の無い体は末尾 */
export function sortByCombatPower<T extends { id: number }>(rows: readonly T[], value: (row: T) => number | null): T[] {
  return [...rows].sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity) || a.id - b.id);
}

export function compareCombatPower(rows: readonly CombatPowerRow[]): CombatPowerComparison {
  const mismatched = rows.filter((r) => r.model !== r.actual);
  let inversions = 0;
  let actualTies = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!;
      const b = rows[j]!;
      if (a.actual === b.actual) {
        actualTies++;
        continue;
      }
      const [hi, lo] = a.actual > b.actual ? [a, b] : [b, a];
      if (hi.model === null || lo.model === null || hi.model <= lo.model) inversions++;
    }
  }
  return { matched: rows.length - mismatched.length, mismatched, inversions, actualTies };
}
