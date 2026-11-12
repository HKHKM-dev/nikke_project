// 育成状況の編集画面（plan/design-roster-edit.md 6 節）。アカウントのメニューの「編集」から開くモーダルで、クラシックと
// モダン UI で同じもの。左の一覧でニケか「アカウント全体」を選び、右の欄で直す。欄を確定するたびに保存され（useRoster.ts の
// RosterEditor）、そのニケのいるスロット・共通育成にも写る。スペック固定の間も、育成状況の値を出して編集できる
import {
  growthLimits,
  type BuildMasters,
  type CharacterData,
  type CharacterIndexEntry,
  type SnapshotCharacter,
} from '@nikke/core';
import { useEffect, useRef, useState } from 'react';
import { consoleFromRoster, recycleRoomWithConsole, rosterFields } from '../roster.ts';
import { patchedCharacterEdit } from '../rosterEdits.ts';
import { clampInt } from '../team.ts';
import { useCharacterCache } from '../useCharacterCache.ts';
import type { ConfirmedAction, RosterEditor } from '../useRoster.ts';
import { ConsoleFields } from './ConsoleFields.tsx';
import { GrowthEditor } from './GrowthEditor.tsx';
import { InlineConfirm } from './InlineConfirm.tsx';
import { IntInput } from './IntInput.tsx';
import { REVERT_ALL_LABEL } from './RosterSettings.tsx';
import { BadgeFilters } from './modern/BadgeFilter.tsx';
import { CharacterVisual } from './modern/CharacterVisual.tsx';
import { GrowthMarksView, growthMarksOf } from './modern/GrowthMarks.tsx';
import { matchesBadgeFilters, type BadgeFilters as BadgeFilterValues } from './modern/badges.ts';
import { useEscapeKey } from './useEscapeKey.ts';

/** 一覧で選んでいるもの: アカウント全体か、ニケ（resourceId） */
type Selection = 'account' | number;

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

function RevertButton({ edited, onRevert }: { edited: boolean; onRevert: () => void }) {
  return (
    <button
      type="button"
      className="advanced-settings-button"
      aria-disabled={!edited}
      onClick={() => edited && onRevert()}
    >
      読み込んだ値に戻す
    </button>
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
  const fields = rosterFields(rosterEntry);
  return (
    <>
      <div className="roster-edit-form-header">
        <h3>{entry.name.ja}</h3>
        <div className="button-row">
          <RevertButton edited={editor.editedIds.has(id)} onRevert={() => editor.revertCharacter(id)} />
          <button
            type="button"
            className="advanced-settings-button"
            aria-disabled={onPrevious === null}
            onClick={() => onPrevious?.()}
          >
            前のニケ
          </button>
          <button
            type="button"
            className="advanced-settings-button"
            aria-disabled={onNext === null}
            onClick={() => onNext?.()}
          >
            次のニケ
          </button>
        </div>
      </div>
      {error !== undefined && <p className="error">読み込みに失敗しました: {error}</p>}
      {character === undefined && error === undefined && <p className="hint">読み込み中…</p>}
      {character !== undefined && (
        <GrowthEditor
          // ニケを替えたら欄を作り直す（打ちかけの値を次のニケに持ち越さない）
          key={id}
          character={character}
          fields={fields}
          shown={{
            // キャラごとの Lv は欄に出さない。計算に使えるかの確かめには、スロットと同じくキャラの上限に収めた値を使う
            growth: {
              ...rosterEntry.growth,
              level: clampInt(rosterEntry.growth.level, 1, growthLimits(character).levelMax),
            },
            build: rosterEntry,
            skillLevels: rosterEntry.skillLevels,
            treasurePhase: fields.treasurePhase,
          }}
          masters={masters}
          mastersError={mastersError}
          disabled={false}
          unknownTreasure={rosterEntry.treasure !== null && rosterEntry.treasure.phase === null}
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
  const { roster } = editor;
  // 一覧に出すのは育成状況にいるニケだけ。並びは開いた時点のもので固定する
  const [ordered] = useState(() => index.filter((c) => roster.characters[String(c.resourceId)] !== undefined));
  const [selected, setSelected] = useState<Selection>('account');
  const [filters, setFilters] = useState<BadgeFilterValues>({});
  const [editedOnly, setEditedOnly] = useState(false);
  // 狭い画面では一覧と編集欄を切り替える（styles.css が、いま出す方だけを見せる）
  const [pane, setPane] = useState<'list' | 'form'>('list');
  useEscapeKey(onClose);

  const visible = ordered.filter(
    (c) => roster.characters[String(c.resourceId)] !== undefined && matchesBadgeFilters(c, filters),
  );
  const listed = editedOnly ? visible.filter((c) => editor.editedIds.has(c.resourceId)) : visible;
  const select = (next: Selection) => {
    setSelected(next);
    setPane('form');
  };

  // 選んだニケの行を、見える位置へ（前後のボタンで動いたとき）
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  // 欄の上限と、計算に使えるかの確かめには、選んだニケのキャラのデータが要る
  const cache = useCharacterCache([selected === 'account' ? null : selected], baseUrl);
  const selectedEntry = selected === 'account' ? undefined : ordered.find((c) => c.resourceId === selected);
  const selectedRoster = selected === 'account' ? undefined : roster.characters[String(selected)];
  // 前後は、絞り込んだ後の一覧の順でニケの間だけを動く。選んでいるニケが一覧から外れていれば動けない
  const at = listed.findIndex((c) => c.resourceId === selected);
  const neighbor = (offset: number) => {
    const next = at === -1 ? undefined : listed[at + offset];
    return next === undefined ? null : () => select(next.resourceId);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container roster-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="育成状況の編集"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>育成状況の編集</h2>
          <button type="button" className="modal-close-button" aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="roster-edit-body" data-pane={pane}>
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
                aria-current={selected === 'account'}
                onClick={() => select('account')}
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
                  <span className="roster-edit-row-visual">
                    <CharacterVisual character={c} size="compact" />
                  </span>
                  <span className="roster-edit-row-name">{c.name.ja}</span>
                  {/* 限界突破・コア強化は、スペック固定でも育成状況の値を出す */}
                  <GrowthMarksView
                    {...growthMarksOf(c.rarity, roster.characters[String(c.resourceId)]!.growth)}
                    className="roster-edit-row-growth"
                  />
                  {editor.editedIds.has(c.resourceId) && <EditedMark />}
                </button>
              ))}
              {listed.length === 0 && <p className="hint">該当するニケがいません。</p>}
            </div>
          </div>

          <div className="roster-edit-form-pane">
            <button type="button" className="advanced-settings-button roster-edit-back" onClick={() => setPane('list')}>
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
                onPrevious={neighbor(-1)}
                onNext={neighbor(1)}
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

        <div className="modal-footer roster-edit-footer">
          {revertAll.prompt !== null ? (
            <InlineConfirm
              prompt={revertAll.prompt}
              confirmLabel="戻す"
              onConfirm={revertAll.confirm}
              onCancel={revertAll.cancel}
            />
          ) : (
            <button
              type="button"
              className="advanced-settings-button"
              aria-disabled={!hasEdits}
              onClick={() => hasEdits && revertAll.request()}
            >
              {REVERT_ALL_LABEL}
            </button>
          )}
          <button type="button" className="roster-edit-close" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
