import type { BuildMasters, BuildSnapshot, CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { Dispatch } from 'react';
import type { CalcView, SlotResultView } from '../calcView.ts';
import type { Shown } from '../compute.ts';
import type { NotesSummarySlot } from '../components/NotesSummary.tsx';
import type { OtherParties, PartiesState } from '../parties.ts';
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
  /** 未対応の印（モダン UI）にマウスを載せたときの知らせ（useSkillDefinitions の unsupportedNoteOf。完全対応なら null） */
  unsupportedNote: (resourceId: number) => string | null;
  masters: BuildMasters | null;
  mastersError: string | null;
  calc: CalcView;
  shown: Shown<CalcView> | null;
  slotResults: readonly (SlotResultView | null)[];
  parties: PartiesState;
  /** ほかの編成で選んでいるニケ（parties.ts の otherPartyResourceIds） */
  otherPartyIds: OtherParties;
  selectParty: (to: number) => void;
  totals: { parties: PartyTotal[]; total: number | null };
  totalsPending: boolean;
  summarySlots: readonly (NotesSummarySlot | null)[];
  /** 読み込んだ育成状況（roster.ts。無ければ null） */
  roster: BuildSnapshot | null;
  /** 一覧の並び（設定のメニューと同じ。useListOrder.ts） */
  listOrder: ListOrderControls;
};
