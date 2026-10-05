// 最小構成の警告（plan/design-records-automation.md 3.5 節。AGENTS.md「事実と記録」の規則を検査に落としたもの）。
// 多人数の録画は、観測したい事象のほかは「機構が確定したキャラ」だけで組めば結論の根拠にしてよい。未確定の要素が 2 つ以上
// 混ざる録画では結論を作らない。「機構が確定したキャラ」は、スキル定義の効果と notes の根拠がすべて確定（か範囲外）の結論に
// 結び付き、通常攻撃の条件（コア命中率・弾丸命中率）がその的の表で測られているキャラ。
// 編成の条件（同じ部隊の味方・バースト段階の構成）で、その録画の編成では外れる効果は、録画の中で働かないので見ない
// （ラムの S1 の CT▼。外れること自体は C-0080 で確かめてある）。
import { applyComposition } from '../skills/composition.ts';
import { targetProfileOf } from '../enemies.ts';
import { rateRowOf, targetRateOf } from '../frame/landing.ts';
import type { SkillDefinition, SkillEntry } from '../skills/types.ts';
import type { CharacterData, EnemyPresetMaster } from '../types.ts';
import type { Claim, ClaimState } from './claims.ts';
import type { RecordingEntry } from './recordings.ts';
import { entriesOf } from './skills.ts';
import type { Verification } from './verifications.ts';

const CONFIRMED_STATES: readonly ClaimState[] = ['確定', '範囲外'];

/** 定義の効果と notes の根拠が、すべて確定（か範囲外）の結論に結び付いているか */
export function mechanismConfirmed(def: SkillDefinition | undefined, states: ReadonlyMap<string, ClaimState>): boolean {
  if (def === undefined) return false;
  const cited = (ids: readonly string[] | undefined) =>
    ids !== undefined && ids.length > 0 && ids.every((id) => CONFIRMED_STATES.includes(states.get(id) ?? '仮説'));
  const entryConfirmed = (entry: SkillEntry) =>
    entry.effects.every((e) => cited(e.claims)) && (entry.notes ?? []).every((n) => cited(n.claims));
  return entriesOf(def).every(({ entry }) => entryConfirmed(entry));
}

/** 録画の的の表（射撃場の的で、属性のプリセットがあるもの）。無ければ undefined */
export function targetProfileOfRecording(recording: RecordingEntry, enemies: EnemyPresetMaster) {
  if (recording.target.element === null) return undefined;
  const preset = enemies.enemies.find(
    (p) => p.content === 'range' && p.element === recording.target.element && p.targetProfile !== undefined,
  );
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

export type MinimalWarning = {
  verification: string;
  recording: string;
  /** 機構が確定していない枠（名前） */
  unconfirmed: string[];
};

export type MinimalContext = {
  recordings: ReadonlyMap<string, RecordingEntry>;
  characters: ReadonlyMap<number, CharacterData>;
  skills: ReadonlyMap<number, SkillDefinition>;
  enemies: EnemyPresetMaster;
  claims: readonly Claim[];
};

/** 検証記録の録画のうち、2 体以上の編成で機構が確定していない枠が 2 つ以上あるもの */
export function minimalWarnings(verifications: readonly Verification[], ctx: MinimalContext): MinimalWarning[] {
  const states = new Map(ctx.claims.map((c) => [c.id, c.state]));
  const out: MinimalWarning[] = [];
  for (const v of verifications) {
    for (const id of v.recordings) {
      const recording = ctx.recordings.get(id);
      if (recording === undefined || recording.team.length < 2) continue;
      const teamCharacters = recording.team.map((m) => ctx.characters.get(m.rid) ?? null);
      const unconfirmed = recording.team
        .filter((m, i) => {
          const character = ctx.characters.get(m.rid);
          if (character === undefined) return true;
          const def = ctx.skills.get(m.rid);
          const inTeam =
            def === undefined ? undefined : applyComposition(def, teamCharacters, i, recording.target.element);
          return !(mechanismConfirmed(inTeam, states) && normalConditionMeasured(character, recording, ctx.enemies));
        })
        .map((m) => m.name);
      if (unconfirmed.length >= 2) out.push({ verification: v.id, recording: id, unconfirmed });
    }
  }
  return out;
}

/** plan/verifications.md の検証記録の項に足す行 */
export function renderMinimalLines(warnings: readonly MinimalWarning[]): string[] {
  if (warnings.length === 0) return [];
  const parts = warnings.slice(0, 5).map((w) => `録画 ${w.recording}（${w.unconfirmed.join('・')} が未確定）`);
  if (warnings.length > 5) parts.push(`ほか ${warnings.length - 5} 本`);
  return [
    `  - **最小構成の警告**: ${parts.join('、')}。未確定の要素が 2 つ以上混ざる録画では結論を作らない（AGENTS.md「事実と記録」）`,
  ];
}
