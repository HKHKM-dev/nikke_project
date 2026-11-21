import type { BuildMasters, BuildSnapshot, CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { Dispatch } from 'react';
import type { CalcView, NotesSummarySlot, SlotResultView } from '../calcView.ts';
import type { Shown } from '../compute.ts';
import type { OtherParties, PartiesState, PartySlotRef } from '../parties.ts';
import type { PartyTotal } from '../partyTotals.ts';
import type { TeamAction, TeamState } from '../team.ts';
import type { ListOrderControls } from '../useListOrder.ts';

export type ViewProps = {
  team: TeamState;
  dispatch: Dispatch<TeamAction>;
  index: readonly CharacterIndexEntry[];
  characterCache: {
    characters: ReadonlyMap<number, CharacterData>;
    errors: ReadonlyMap<number, string>;
  };
  fullySupported: ReadonlySet<number> | null;
  masters: BuildMasters | null;
  mastersError: string | null;
  calc: CalcView;
  shown: Shown<CalcView> | null;
  slotResults: readonly (SlotResultView | null)[];
  parties: PartiesState;
  /** ほかの編成で選んでいるニケ（parties.ts の otherPartyResourceIds） */
  otherPartyIds: OtherParties;
  selectParty: (to: number) => void;
  /** 一覧のニケを、ほかの編成 party のスロット index に置く（選んでいる編成は変えない） */
  placeInParty: (resourceId: number, party: number, index: number) => void;
  /** ほかの編成 party のスロット index を空にする */
  clearPartySlot: (party: number, index: number) => void;
  /** 2 つのスロット（どの編成でも）の中身を入れ替える（選んでいる編成は変えない） */
  exchangeSlots: (a: PartySlotRef, b: PartySlotRef) => void;
  /** 編成 a と b の中身を入れ替える（選んでいる編成の番号は変えない） */
  swapPartyContents: (a: number, b: number) => void;
  totals: { parties: PartyTotal[]; total: number | null };
  totalsPending: boolean;
  summarySlots: readonly (NotesSummarySlot | null)[];
  /** 読み込んだ育成状況（roster.ts。無ければ null） */
  roster: BuildSnapshot | null;
  /** 一覧の並び（設定のメニューと同じ。useListOrder.ts） */
  listOrder: ListOrderControls;
};
