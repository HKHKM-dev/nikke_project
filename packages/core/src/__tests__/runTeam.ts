// 一本化の段 A-2（plan/design-unify-sim-calc.md 5.2 節）: テストで、編成を画面の形（TeamResult）まで計算する。
// 画面・CLI・records 層と同じ simTeamResult(input, runSimulation(input)) の 1 本（2026-10-27 までの calc/model.ts の computeTeamDamage）。
// テストは入力を式のまま渡すことが多いので、入力を 2 回書かずに済むようにここにまとめる
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import type { TeamInput, TeamResult } from '../team.ts';

export function runTeam(input: TeamInput): TeamResult {
  return simTeamResult(input, runSimulation(input));
}
