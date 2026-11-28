// テストの編成を作る道具
import { initialTeamState, teamReducer, type TeamState } from '../team.ts';

/** スロットの順にニケを入れた編成（null の枠は空のまま） */
export function withCharacters(ids: readonly (number | null)[]): TeamState {
  return ids.reduce(
    (state, id, i) => (id === null ? state : teamReducer(state, { type: 'selectCharacter', index: i, resourceId: id })),
    initialTeamState(),
  );
}
