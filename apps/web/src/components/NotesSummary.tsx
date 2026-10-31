// Stage 14: 未対応・近似・仮定の一覧を 1 画面にまとめる（plan/design-stage12.md 4.2 節。「未対応は明示」の原則）。
// 2026-10-31: オーナーの指示で、モデル全体と敵の出来事の注記を消し、見出しの「枠 N」を消した。出すのは編成のニケごとの注記だけ
// （モデル全体の範囲と前提は README の「精度と未対応」と plan/requirements.md にある）。
import {
  SKILL_SLOTS,
  applyTreasure,
  type BuildEffectNote,
  type CharacterData,
  type ModelNote,
  type TreasurePhase,
} from '@nikke/core';
import { SKILL_SLOT_LABEL, formatBuildEffectSource } from '../skillLabels.ts';
import type { SlotSkillsStatus } from '../useSkillDefinitions.ts';

export type NotesSummarySlot = {
  index: number;
  character: CharacterData;
  skills: SlotSkillsStatus;
  treasurePhase: TreasurePhase;
  /** 計算のモデルの注記（複数銃口・射撃の刻みの較正など）。計算前なら空 */
  modelNotes: readonly ModelNote[];
  /** 育成の効果層で計算に入らないもの（未対応だけ。ダメージに無関係なものは出さない） */
  buildNotes: readonly BuildEffectNote[];
};

type Item = { level: 'unsupported' | 'outOfScope' | 'approx' | 'assumed'; text: string };

const LEVEL_LABEL: Record<Item['level'], string> = {
  unsupported: '未対応',
  outOfScope: '前提の外',
  approx: '近似',
  assumed: '仮定',
};
const LEVEL_CLASS: Record<Item['level'], string> = {
  unsupported: 'unsupported',
  outOfScope: 'out-of-scope',
  approx: 'approx',
  assumed: 'approx',
};

function slotItems(slot: NotesSummarySlot): Item[] {
  const items: Item[] = [];
  const { skills } = slot;
  if (skills.kind === 'undefined') {
    items.push({ level: 'unsupported', text: 'スキル定義なし（通常攻撃のみで計算。味方からのバフは受ける）' });
  } else if (skills.kind === 'error') {
    items.push({ level: 'unsupported', text: `スキル定義を読み込めませんでした: ${skills.message}` });
  } else if (skills.kind === 'ready') {
    // 計算と同じく宝物版に差し替えてから見る
    const { character, definition } = applyTreasure(slot.character, skills.definition, slot.treasurePhase);
    for (const s of SKILL_SLOTS) {
      const entry = definition?.skills[s];
      if (!entry) continue;
      const name = `${SKILL_SLOT_LABEL[s]}「${character.skills[s].name.ja}」`;
      // notes の種類で分ける（plan/design-skill-note-kinds.md 2.3 節）。計算に無関係・補足は画面に出さない（出していたスキル欄は 2026-10-31 に消した）
      const notes = entry.notes ?? [];
      if (entry.support === 'partial' || entry.support === 'unsupported') {
        const what = entry.support === 'partial' ? '一部対応' : '未対応';
        const text = notes
          .filter((n) => n.kind === 'unimplemented')
          .map((n) => n.ja)
          .join('、');
        items.push({ level: 'unsupported', text: `${name}は${what}: ${text}` });
      }
      for (const n of notes) if (n.kind === 'outOfScope') items.push({ level: 'outOfScope', text: `${name}: ${n.ja}` });
      for (const e of entry.effects) if (e.assumes) items.push({ level: 'assumed', text: `${name}: ${e.assumes.ja}` });
    }
  }
  for (const note of slot.modelNotes) items.push({ level: note.level, text: note.message.ja });
  for (const note of slot.buildNotes) {
    items.push({ level: 'unsupported', text: `育成 ${formatBuildEffectSource(note.source)}: ${note.message.ja}` });
  }
  return items;
}

function ItemList({ items }: { items: readonly Item[] }) {
  return (
    <ul className="notes">
      {items.map((item, i) => (
        <li key={i} className={`note ${LEVEL_CLASS[item.level]}`}>
          <span className="badge">{LEVEL_LABEL[item.level]}</span> {item.text}
        </li>
      ))}
    </ul>
  );
}

export function NotesSummary({ slots }: { slots: readonly (NotesSummarySlot | null)[] }) {
  const filled = slots.filter((s): s is NotesSummarySlot => s !== null);
  return (
    <details className="panel notes-summary">
      <summary>未対応・近似・仮定の一覧</summary>
      {filled.map((slot) => {
        const items = slotItems(slot);
        return (
          <section key={slot.index}>
            <h3>{slot.character.name.ja}</h3>
            {items.length === 0 ? <p className="hint">なし（すべて対応）</p> : <ItemList items={items} />}
          </section>
        );
      })}
    </details>
  );
}
