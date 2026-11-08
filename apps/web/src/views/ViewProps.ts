import type { BuildMasters, BuildSnapshot, CharacterData, CharacterIndexEntry } from '@nikke/core';
import type { Dispatch } from 'react';
import type { CalcView, SlotResultView } from '../calcView.ts';
import type { Shown } from '../compute.ts';
import type { NotesSummarySlot } from '../components/NotesSummary.tsx';
import type { PartiesState } from '../parties.ts';
import type { PartyTotal } from '../partyTotals.ts';
import type { TeamAction, TeamState } from '../team.ts';

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
  otherPartyIds: ReadonlySet<number>;
  selectParty: (to: number) => void;
  totals: { parties: PartyTotal[]; total: number | null };
  totalsPending: boolean;
  summarySlots: readonly (NotesSummarySlot | null)[];
  /** 読み込んだ育成状況（roster.ts。無ければ null） */
  roster: BuildSnapshot | null;
};
