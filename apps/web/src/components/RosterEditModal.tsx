// 育成状況の編集画面（plan/design-roster-edit.md 6 節）。アカウントのメニューの「編集」から開くモーダルで、クラシックと
// モダン UI で同じもの。左の一覧でニケか「アカウント全体」を選び、右の欄で直す。欄を確定するたびに保存され（useRoster.ts の
// RosterEditor）、そのニケのいるスロット・共通育成にも写る。スペック固定の間も、育成状況の値を出して編集できる
import type { BuildMasters, CharacterData, CharacterIndexEntry, SnapshotCharacter } from '@nikke/core';
import { useEffect, useRef, useState } from 'react';
import { clampGrowth } from '../calcView.ts';
import { REVERT_ALL_LABEL, consoleFromRoster, recycleRoomWithConsole, rosterFields } from '../roster.ts';
import { patchedCharacterEdit } from '../rosterEdits.ts';
import { useCharacterCache } from '../useCharacterCache.ts';
import type { ConfirmedAction, RosterEditor } from '../useRoster.ts';
import { ConsoleFields } from './ConsoleFields.tsx';
import { GrowthEditor } from './GrowthEditor.tsx';
import { InertButton } from './InertButton.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { IntInput } from './IntInput.tsx';
import { Modal } from './Modal.tsx';
import { BadgeFilters } from './modern/BadgeFilter.tsx';
import { CharacterVisual } from './modern/CharacterVisual.tsx';
import { matchesBadgeFilters, type BadgeFilters as BadgeFilterValues } from './modern/badges.ts';

type Props = {
  editor: RosterEditor;
  /** 編集がある（「全部を読み込んだ値に戻す」を押せる） */
  hasEdits: boolean;
  revertAll: ConfirmedAction;
  /** ニケ一覧と同じ並びのキャラの一覧。開いた時点の並びで固定する（編集で戦闘力や OP が変わっても行を動かさない） */
  index: readonly CharacterIndexEntry[];
  masters: BuildMasters | null;
  mastersError: string | null;
  baseUrl: string;
  onClose: () => void;
};

/** 編集済みの印 */
function EditedMark() {
  return (
    <span className="roster-edit-mark" role="img" aria-label="編集済み" title="編集済み">
      ✎
    </span>
  );
}

/** 読み込んだ値に戻す（ニケ・アカウント全体）。編集していなければ押せない。確かめずに戻す */
function RevertButton({ edited, onRevert }: { edited: boolean; onRevert: () => void }) {
  return (
    <InertButton enabled={edited} onPress={onRevert}>
      読み込んだ値に戻す
    </InertButton>
  );
}

/** アカウント全体の欄: シンクロ LV とリサイクルルームの研究の Lv */
function AccountForm({ editor }: { editor: RosterEditor }) {
  const { roster } = editor;
  return (
    <>
      <div className="roster-edit-form-header">
        <h3>アカウント全体</h3>
        <RevertButton edited={editor.accountEdited} onRevert={editor.revertAccount} />
      </div>
      <label className="field roster-edit-synchro">
        <span>シンクロ LV</span>
        <IntInput
          value={roster.synchroLevel}
          min={1}
          onCommit={(synchroLevel) => editor.editAccount({ synchroLevel, recycleRoom: roster.recycleRoom })}
        />
      </label>
      <fieldset className="popover-group">
        <legend>リサイクルルーム</legend>
        <ConsoleFields
          value={consoleFromRoster(roster)}
          onChange={(next) =>
            editor.editAccount({
              synchroLevel: roster.synchroLevel,
              recycleRoom: recycleRoomWithConsole(roster.recycleRoom, next),
            })
          }
        />
      </fieldset>
    </>
  );
}

/** ニケ 1 体の欄。欄はスロットの育成と同じ部品（GrowthEditor） */
function CharacterForm({
  editor,
  entry,
  rosterEntry,
  character,
  error,
  masters,
  mastersError,
  onPrevious,
  onNext,
}: {
  editor: RosterEditor;
  entry: CharacterIndexEntry;
  rosterEntry: SnapshotCharacter;
  /** キャラのデータ（読み込み中は undefined） */
  character: CharacterData | undefined;
  error: string | undefined;
  masters: BuildMasters | null;
  mastersError: string | null;
  /** 前後のニケへ移る（端・一覧から外れているときは null で、押せない） */
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const id = entry.resourceId;
  return (
    <>
      <div className="roster-edit-form-header">
        <h3>{entry.name.ja}</h3>
        <div className="button-row">
          <RevertButton edited={editor.editedIds.has(id)} onRevert={() => editor.revertCharacter(id)} />
          <InertButton enabled={onPrevious !== null} onPress={() => onPrevious?.()}>
            前のニケ
          </InertButton>
          <InertButton enabled={onNext !== null} onPress={() => onNext?.()}>
            次のニケ
          </InertButton>
        </div>
      </div>
      {error !== undefined && <p className="error">読み込みに失敗しました: {error}</p>}
      {character === undefined && error === undefined && <p className="hint">読み込み中…</p>}
      {character !== undefined && (
        <GrowthEditor
          // ニケを替えたら欄を作り直す（打ちかけの値を次のニケに持ち越さない）
          key={id}
          character={character}
          fields={rosterFields(rosterEntry)}
          shown={{
            // キャラごとの Lv は欄に出さない。計算に使えるかの確かめには、スロットと同じくキャラの上限に収めた値を使う
            growth: clampGrowth(character, rosterEntry.growth),
            build: rosterEntry,
            skillLevels: rosterEntry.skillLevels,
            // 宝物の段階が未確定（null）なら、そう出す
            treasurePhase: rosterEntry.treasure === null ? 0 : rosterEntry.treasure.phase,
          }}
          masters={masters}
          mastersError={mastersError}
          disabled={false}
          onChange={(patch) =>
            editor.editCharacter(id, patchedCharacterEdit(rosterEntry, patch, character.treasure?.favoriteId ?? null))
          }
        />
      )}
    </>
  );
}

export function RosterEditModal({
  editor,
  hasEdits,
  revertAll,
  index,
  masters,
  mastersError,
  baseUrl,
  onClose,
}: Props) {
  const view = useRosterEditSelection(editor, index);
  // 閉じるときは、待っている「全部を読み込んだ値に戻す」の確かめもやめる（閉じた後に、メニューや開き直した画面に残さない）
  const close = () => {
    revertAll.cancel();
    onClose();
  };

  // 欄の上限と、計算に使えるかの確かめには、選んだニケのキャラのデータが要る
  const cache = useCharacterCache([view.selected], baseUrl);
  const { selectedEntry, selectedRoster } = view;

  return (
    <Modal title="育成状況の編集" label="育成状況の編集" className="roster-edit-modal" onClose={close}>
      <div className="roster-edit-body" data-pane={view.pane}>
        <RosterEditList editor={editor} view={view} />

        <div className="roster-edit-form-pane">
          <button
            type="button"
            className="advanced-settings-button roster-edit-back"
            onClick={() => view.setPane('list')}
          >
            一覧へ
          </button>
          {selectedEntry !== undefined && selectedRoster !== undefined ? (
            <CharacterForm
              editor={editor}
              entry={selectedEntry}
              rosterEntry={selectedRoster}
              character={cache.characters.get(selectedEntry.resourceId)}
              error={cache.errors.get(selectedEntry.resourceId)}
              masters={masters}
              mastersError={mastersError}
              onPrevious={view.neighbor(-1)}
              onNext={view.neighbor(1)}
            />
          ) : (
            <AccountForm editor={editor} />
          )}
          {editor.problem !== null && (
            <ul className="notes" aria-live="polite">
              {editor.problem.map((line) => (
                <li key={line} className="note">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <RosterEditFooter hasEdits={hasEdits} revertAll={revertAll} onClose={close} />
    </Modal>
  );
}

/**
 * 一覧の固定・選んでいるニケ・絞り込み・狭い画面の切り替え・前後のニケ。一覧に出すのは育成状況にいるニケだけで、並びは開いた時点の
 * もので固定する（編集で戦闘力や OP が変わっても行を動かさない）
 */
function useRosterEditSelection(editor: RosterEditor, index: readonly CharacterIndexEntry[]) {
  const { roster } = editor;
  const [ordered] = useState(() => index.filter((c) => roster.characters[String(c.resourceId)] !== undefined));
  // 選んでいるニケ（resourceId）。null はアカウント全体
  const [selected, setSelected] = useState<number | null>(null);
  const [filters, setFilters] = useState<BadgeFilterValues>({});
  const [editedOnly, setEditedOnly] = useState(false);
  // 狭い画面では一覧と編集欄を切り替える（styles.css が、いま出す方だけを見せる）
  const [pane, setPane] = useState<'list' | 'form'>('list');

  const listed = ordered.filter(
    (c) => matchesBadgeFilters(c, filters) && (!editedOnly || editor.editedIds.has(c.resourceId)),
  );
  const select = (next: number | null) => {
    setSelected(next);
    setPane('form');
  };
  // 前後は、絞り込んだ後の一覧の順でニケの間だけを動く。選んでいるニケが一覧から外れていれば動けない
  const at = listed.findIndex((c) => c.resourceId === selected);
  const neighbor = (offset: number) => {
    const next = at === -1 ? undefined : listed[at + offset];
    return next === undefined ? null : () => select(next.resourceId);
  };
  // 選んでいるニケの一覧の行と、育成状況の値（アカウント全体なら undefined）
  const selectedEntry = ordered.find((c) => c.resourceId === selected);
  const selectedRoster = selected === null ? undefined : roster.characters[String(selected)];
  return {
    listed,
    selected,
    selectedEntry,
    selectedRoster,
    select,
    neighbor,
    filters,
    setFilters,
    editedOnly,
    setEditedOnly,
    pane,
    setPane,
  };
}

type RosterEditView = ReturnType<typeof useRosterEditSelection>;

/** 左の一覧: 絞り込みと、アカウント全体・ニケの行 */
function RosterEditList({ editor, view }: { editor: RosterEditor; view: RosterEditView }) {
  const { listed, selected, select, filters, setFilters, editedOnly, setEditedOnly } = view;
  // 選んだニケの行を、見える位置へ（前後のボタンで動いたとき）
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  return (
    <div className="roster-edit-list-pane">
      <div className="char-tray-filter-group roster-edit-filters">
        <BadgeFilters filters={filters} onChange={setFilters} />
        <button
          type="button"
          className="advanced-settings-button"
          aria-pressed={editedOnly}
          onClick={() => setEditedOnly((v) => !v)}
        >
          編集済みのみ
        </button>
      </div>
      <div ref={listRef} className="roster-edit-list">
        {/* アカウント全体は先頭に固定する（絞り込みで消えない） */}
        <button
          type="button"
          className="roster-edit-row roster-edit-row-account"
          aria-current={selected === null}
          onClick={() => select(null)}
        >
          <span className="roster-edit-row-name">アカウント全体</span>
          {editor.accountEdited && <EditedMark />}
        </button>
        {listed.map((c) => (
          <button
            key={c.resourceId}
            type="button"
            className="roster-edit-row"
            aria-current={selected === c.resourceId}
            onClick={() => select(c.resourceId)}
          >
            {/* 行の絵は小さいので、絵の上のバッジは出さない（絞り込みで探す） */}
            <span className="roster-edit-row-visual">
              <CharacterVisual character={c} size="compact" badges={false} />
            </span>
            <span className="roster-edit-row-name">{c.name.ja}</span>
            {editor.editedIds.has(c.resourceId) && <EditedMark />}
          </button>
        ))}
        {listed.length === 0 && <p className="hint">該当するニケがいません。</p>}
      </div>
    </div>
  );
}

/** 足元: 全部を読み込んだ値に戻す（確かめてから）と、閉じる */
function RosterEditFooter({
  hasEdits,
  revertAll,
  onClose,
}: {
  hasEdits: boolean;
  revertAll: ConfirmedAction;
  onClose: () => void;
}) {
  return (
    <div className="modal-footer roster-edit-footer">
      {revertAll.prompt !== null ? (
        <InlineConfirm
          prompt={revertAll.prompt}
          confirmLabel="戻す"
          onConfirm={revertAll.confirm}
          onCancel={revertAll.cancel}
        />
      ) : (
        <InertButton enabled={hasEdits} onPress={revertAll.request}>
          {REVERT_ALL_LABEL}
        </InertButton>
      )}
      <button type="button" className="roster-edit-close" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
