// Stage 14: 未対応・近似・仮定の一覧を 1 画面にまとめる（plan/design-stage12.md 4.2 節。「未対応は明示」の原則）。
// 枠ごとの内容は枠カード（スキル・育成・計算の内訳）に出しているものと同じで、ここでは編成全体を 1 か所で見渡せるようにする。
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

type Item = { level: 'unsupported' | 'approx' | 'assumed'; text: string };

const LEVEL_LABEL: Record<Item['level'], string> = { unsupported: '未対応', approx: '近似', assumed: '仮定' };

/** 編成によらずモデル全体で扱わないもの・確かめていないもの（README の「未対応」と同じ） */
const MODEL_WIDE: Item[] = [
  {
    level: 'assumed',
    text: '実戦（迎撃戦・ソロレイド・ユニオンレイド）とは未照合。確かめたのはユニオン射撃場（スペック固定）の録画だけ',
  },
  {
    level: 'unsupported',
    text: 'コア命中率・弾丸命中率・距離ボーナスは、枠の条件が「自動」なら射撃場の的の表（単騎 AUTO の実測と、3 分モードの着地点）から、「手入力」なら入力の値。ボスなど表の無い敵では、自動でも手入力の値を使う。敵の移動・攻撃・カバーによる中断は、射撃場 3 分モードの的のジャンプ（敵の欄のチェック）だけ扱う。命中を数えるトリガーは全弾命中で数える',
  },
  {
    level: 'unsupported',
    text: 'フルバースト中などに配られる持続の命中率▲は、コア命中率に効かせていない（効くのは常時の命中率▲だけ）。SG のコア命中率と、SR・RL・SG の弾丸命中率は射撃場でも未測定（手入力の値）',
  },
  { level: 'unsupported', text: 'ボスの行動パターン・パーツ破壊・貫通・範囲攻撃の複数ヒット' },
  {
    level: 'unsupported',
    text: '被弾・HP の変動・回復量・シールド（生存の計算）。回復は「回復を受けた時」のトリガーにだけ使う',
  },
  {
    level: 'assumed',
    text: '育成（スペック固定 OFF）: OL・キューブ・コレクションの効果の掛かり方は射撃場の実測待ち（攻撃力の合成順と OL の上昇値は実データで確認済み）',
  },
];

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
      if (entry.support !== 'supported') {
        const what = entry.support === 'partial' ? '一部対応' : '未対応';
        const notes = (entry.notes ?? []).map((n) => n.ja).join('、');
        items.push({ level: 'unsupported', text: `${name}は${what}${notes ? `: ${notes}` : ''}` });
      }
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
        <li key={i} className={`note ${item.level === 'unsupported' ? 'unsupported' : 'approx'}`}>
          <span className="badge">{LEVEL_LABEL[item.level]}</span> {item.text}
        </li>
      ))}
    </ul>
  );
}

export function NotesSummary({
  slots,
  enemyNotes,
}: {
  slots: readonly (NotesSummarySlot | null)[];
  /** Stage 16-B: 敵の出来事の注記（未実装の種類・近似）。出来事が無ければ空 */
  enemyNotes: readonly ModelNote[];
}) {
  const filled = slots.filter((s): s is NotesSummarySlot => s !== null);
  return (
    <details className="panel notes-summary">
      <summary>未対応・近似・仮定の一覧</summary>
      <h3>モデル全体</h3>
      <ItemList items={MODEL_WIDE} />
      {enemyNotes.length > 0 && (
        <>
          <h3>敵の出来事</h3>
          <ItemList items={enemyNotes.map((n) => ({ level: n.level, text: n.message.ja }))} />
        </>
      )}
      {filled.map((slot) => {
        const items = slotItems(slot);
        return (
          <section key={slot.index}>
            <h3>
              枠 {slot.index + 1} {slot.character.name.ja}
            </h3>
            {items.length === 0 ? <p className="hint">なし（すべて対応）</p> : <ItemList items={items} />}
          </section>
        );
      })}
    </details>
  );
}
