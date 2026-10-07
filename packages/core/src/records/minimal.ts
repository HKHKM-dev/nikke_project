// キャラ単位の「機構が確定したキャラ」の判定（AGENTS.md「事実と記録」）と、通常攻撃の条件が的の表で測られているかの判定。
// 撮る前に編成を選ぶ材料（plan/design-skill-claims-5-2.md 6.1 節）に使う。結論の警告は、効果・notes 単位の最小構成の検査
// （records/relevance.ts。plan/design-minimal-relevance.md）に置き換えた（検証記録 × 録画の旧の警告は PR 5 で消した）。
// 「機構が確定したキャラ」は、スキル定義の効果と notes（計算に無関係を除く）の根拠がすべて確定（か範囲外）の結論に結び付き、
// 通常攻撃の条件（コア命中率・弾丸命中率）がその的の表で測られているキャラ。
import { targetProfileOf } from '../enemies.ts';
import { rateRowOf, targetRateOf } from '../frame/landing.ts';
import type { SkillDefinition, SkillEntry } from '../skills/types.ts';
import type { CharacterData, EnemyPresetMaster } from '../types.ts';
import type { ClaimState } from './claims.ts';
import type { RecordingEntry } from './recordings.ts';
import { entriesOf } from './skills.ts';

const CONFIRMED_STATES: readonly ClaimState[] = ['確定', '範囲外'];

/** 定義の効果と notes（計算に無関係の notes は除く。plan/design-minimal-relevance.md 9 節の 4）の根拠が、すべて確定（か範囲外）の結論に結び付いているか */
export function mechanismConfirmed(def: SkillDefinition | undefined, states: ReadonlyMap<string, ClaimState>): boolean {
  if (def === undefined) return false;
  const cited = (ids: readonly string[] | undefined) =>
    ids !== undefined && ids.length > 0 && ids.every((id) => CONFIRMED_STATES.includes(states.get(id) ?? '仮説'));
  const entryConfirmed = (entry: SkillEntry) =>
    entry.effects.every((e) => cited(e.claims)) &&
    (entry.notes ?? []).every((n) => n.kind === 'noDamage' || cited(n.claims));
  return entriesOf(def).every(({ entry }) => entryConfirmed(entry));
}

/**
 * 録画の的の表（射撃場の的で、属性のプリセットがあるもの）。無ければ undefined。
 * 台帳の属性が空でも、射撃場 3 分モードの録画で、射撃場のプリセットがどれも同じ表を指すなら、その表を引く
 * （plan/design-minimal-check.md 5 節の D1。モデルの targetProfileForEnemy が属性の空の射撃場の的に射撃場の表を引くのと揃える）
 */
export function targetProfileOfRecording(recording: RecordingEntry, enemies: EnemyPresetMaster) {
  const range = enemies.enemies.filter((p) => p.content === 'range' && p.targetProfile !== undefined);
  if (recording.target.element === null) {
    if (recording.mode !== 'range-3min' || new Set(range.map((p) => p.targetProfile)).size !== 1) return undefined;
    return targetProfileOf(enemies, range[0]!);
  }
  const preset = range.find((p) => p.element === recording.target.element);
  return preset === undefined ? undefined : targetProfileOf(enemies, preset);
}

/**
 * 通常攻撃の条件（コア命中率・弾丸命中率）が、その的の表で測られているか。的のどの着地点でも表の値があるときだけ測られているとみる
 * （誘導弾 100 の RL の中遠のように、行の一部の距離帯だけが未測定のものは測られていない。C-0174）
 */
export function normalConditionMeasured(
  character: CharacterData,
  recording: RecordingEntry,
  enemies: EnemyPresetMaster,
): boolean {
  const profile = targetProfileOfRecording(recording, enemies);
  if (profile === undefined) return false;
  if (rateRowOf(profile.coreHitRate, character) === null || rateRowOf(profile.bulletHitRate, character) === null)
    return false;
  return profile.landings.every(
    (l) =>
      targetRateOf(profile.coreHitRate, character, l) !== null &&
      targetRateOf(profile.bulletHitRate, character, l) !== null,
  );
}
