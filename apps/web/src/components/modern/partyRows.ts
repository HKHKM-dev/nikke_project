// モダン UI の編成の行（ModernView。編成の番号の順に並ぶ）と、その中のスロット・左の番号の DOM を引く
const ROW = '.modern-party-row';

/** 編成の行（編成の番号の順） */
export const partyRows = () => [...document.querySelectorAll<HTMLElement>(ROW)];

const partyRowAt = (party: number) => partyRows()[party] ?? null;

/** 行の左の、編成の番号の枠（持ち上げた番号の DragOverlay は含まない） */
export const rowLabelOf = (row: Element | null) => row?.querySelector<HTMLElement>('.modern-party-row-label') ?? null;

/** 編成 party（0 から）の行の、左の番号の枠（無ければ null） */
export const partyLabelAt = (party: number) => rowLabelOf(partyRowAt(party));

/** 編成 party（0 から）の行のスロットの並び（無ければ null） */
export const slotsGridAt = (party: number) =>
  partyRowAt(party)?.querySelector<HTMLElement>('.modern-slots-grid') ?? null;

/** 編成 party（0 から。選んでいる編成も）の行の、スロット index のカード（無ければ null） */
export const partyCardAt = (party: number, index: number) =>
  partyRowAt(party)?.querySelectorAll<HTMLElement>('.modern-slot-card')[index] ?? null;

/** 選んでいる編成のスロット index のカード（無ければ null） */
export const slotCardAt = (index: number | null) =>
  index === null
    ? null
    : (document.querySelector(`${ROW}-active`)?.querySelectorAll<HTMLElement>('.modern-slot-card')[index] ?? null);

/** 編成 party（0 から。選んでいる編成も）の行の、スロット index の立ち絵の枠（無ければ null） */
export const partyContentAt = (party: number, index: number) =>
  partyCardAt(party, index)?.querySelector('.modern-slot-char-area') ?? null;

/** 選んでいる編成のスロット index の立ち絵の枠（無ければ null） */
export const slotContentAt = (index: number) => slotCardAt(index)?.querySelector('.modern-slot-char-area') ?? null;
