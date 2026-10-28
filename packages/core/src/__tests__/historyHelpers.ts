// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 D の 6・7）: テストで、結果の履歴から件・値の小片・記録を読む。
// 並びと形は、段 D の 6 までの BuffTimeline の窓と記録（windows・stateWindows・namedStateWindows・cycleWindows・heals・applications）と
// 同じにして、テストの期待する値を変えずに読めるようにする。
import { valuePiecesOf, type HolderHistory, type ValuePiece } from '../skills/holders.ts';
import type { AppliedRecord } from '../skills/timeline.ts';
import type { HealRecord } from '../skills/triggers.ts';
import { SKILL_SLOTS, isStateStat, type SkillSlot } from '../skills/types.ts';
import type { NamedStateId } from '../skills/states.ts';

type WithHistory = { history: HolderHistory };
/** 値の小片から段を除いた形（件と同じ形） */
export type StagelessPiece = Omit<ValuePiece, 'stage'>;

const withoutStage = ({ stage: _stage, ...w }: ValuePiece): StagelessPiece => w;

/** 区間に足す値の小片（状態だけの stat を除く。時刻の順） */
export function piecesOf(result: WithHistory): StagelessPiece[] {
  return valuePiecesOf(result.history)
    .filter((p) => !isStateStat(p.effect.stat))
    .map(withoutStage);
}

/** 状態だけの stat（命中率）の値の小片（時刻の順） */
export function statePiecesOf(result: WithHistory): StagelessPiece[] {
  return valuePiecesOf(result.history)
    .filter((p) => isStateStat(p.effect.stat))
    .map(withoutStage);
}

/** 枠の、区間に足す値の小片 */
export function slotPieces(result: WithHistory, slotIndex: number): StagelessPiece[] {
  return piecesOf(result).filter((p) => p.slotIndex === slotIndex);
}

export type StateItem = {
  state: NamedStateId;
  slotIndex: number;
  sourceSlotIndex: number;
  start: number;
  end: number;
  stack?: number;
};

const STAGE_RANK: Record<number, number> = { 1: 0, 1.5: 1, 2: 2, 2.5: 3 };

/** 名前の付いた状態の件（始まり → 段 → 出どころの枠 → 定義の順 → 持ち主 → スタックの段の順） */
export function stateItemsOf(result: WithHistory): StateItem[] {
  const keyed: { item: StateItem; key: number[] }[] = [];
  for (const track of result.history.tracks) {
    const o = track.origin;
    if (o.kind !== 'state') continue;
    for (const it of track.items) {
      const item: StateItem = {
        state: o.state,
        slotIndex: track.holder,
        sourceSlotIndex: track.sourceSlotIndex,
        start: it.start,
        end: it.end,
      };
      if (it.stack !== undefined) item.stack = it.stack;
      const key = [
        it.start,
        STAGE_RANK[track.stage] ?? 0,
        track.sourceSlotIndex,
        SKILL_SLOTS.indexOf(o.grant.source.skill),
        o.grant.effectIndex,
        track.holder,
        it.stack ?? 0,
      ];
      keyed.push({ item, key });
    }
  }
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
    return 0;
  };
  return keyed.sort((a, b) => cmp(a.key, b.key)).map((x) => x.item);
}

export type CycleItem = {
  slotIndex: number;
  source: { skill: SkillSlot };
  effectIndex: number;
  targetSkill: SkillSlot;
  every: number;
  start: number;
  end: number;
};

/** 循環の間隔の変更の件（始まり → 持ち主の順） */
export function cycleItemsOf(result: WithHistory): CycleItem[] {
  const out: CycleItem[] = [];
  for (const track of result.history.tracks) {
    const o = track.origin;
    if (o.kind !== 'cycleEvery') continue;
    for (const it of track.items) {
      out.push({
        slotIndex: track.holder,
        source: { skill: o.effect.source.skill },
        effectIndex: o.effect.effectIndex,
        targetSkill: o.effect.targetSkill,
        every: o.effect.every,
        start: it.start,
        end: it.end,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.slotIndex - b.slotIndex);
}

/** 回復の記録（フレーム → 出どころの枠 → 受けた枠の順） */
export function healsOf(result: WithHistory): HealRecord[] {
  return [...result.history.heals].sort(
    (a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex,
  );
}

/** 状態が付いた記録（フレーム → 出どころの枠 → 受けた枠の順） */
export function applicationsOf(result: WithHistory): AppliedRecord[] {
  return [...result.history.applications].sort(
    (a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex,
  );
}
