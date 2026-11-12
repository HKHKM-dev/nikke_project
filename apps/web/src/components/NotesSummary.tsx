// 未対応・近似・仮定の一覧を 1 画面にまとめる（plan/design-stage12.md 4.2 節。「未対応は明示」の原則）。
// スキル・育成・計算の注記を出すのはここだけ。画面に欄の無い入力の既定もここに出す（plan/design-ui-rebuild.md 5.2 節）。
import { SKILL_SLOTS, applyTreasure, type ModelNote } from '@nikke/core';
import { useContext } from 'react';
import { SKILL_SLOT_LABEL, formatBuildEffectSource } from '../skillLabels.ts';
import { ListOrderContext } from '../useListOrder.ts';
import type { NotesSummarySlot } from '../calcView.ts';

type Item = {
  level: 'unsupported' | 'outOfScope' | 'approx' | 'assumed' | 'noDamage' | 'modeling' | 'default';
  text: string;
};

const LEVEL_LABEL: Record<Item['level'], string> = {
  unsupported: '未対応',
  outOfScope: '前提の外',
  approx: '近似',
  assumed: '仮定',
  noDamage: '計算に無関係',
  modeling: '補足',
  default: '既定',
};
const LEVEL_CLASS: Record<Item['level'], string> = {
  unsupported: 'unsupported',
  outOfScope: 'out-of-scope',
  approx: 'approx',
  assumed: 'approx',
  noDamage: 'out-of-scope',
  modeling: 'out-of-scope',
  default: 'out-of-scope',
};

/** 一覧の戦闘力順で、戦闘力が同じキャラの順（C-0989。plan/design-combat-power-sort.md 7 節） */
const COMBAT_POWER_TIES: Item = {
  level: 'assumed',
  text: '一覧の戦闘力順で、戦闘力が同じキャラは名前順に並べる。実機の一覧での順は、育成データに出ない値で決まるので再現できず、実機と違うことがある',
};

/** 画面に欄の無い入力の既定（calcView.ts の冒頭）。欄が無いので変えられないことを知らせる */
const INPUT_DEFAULTS: Item[] = [
  {
    level: 'default',
    text: '操作キャラは既定でスロット 3。クラシックではスロットの見出しの「操作」、モダン UI ではカードの操作の印のドラッグで変えられる（チャージ武器のフルチャージ倍率がバーストゲージに乗るのは操作キャラだけ）',
  },
  { level: 'default', text: '射撃条件（コア命中率・弾丸命中率・距離ボーナス）は、射撃場の敵の表から自動で決める' },
  { level: 'default', text: '想定 HP は、欄の無いスロットでは満タン（被弾は計算に入れない）' },
  { level: 'default', text: 'バーストはオートで回す（使わないスロットはスロットの詳細設定の「バーストしない」）' },
  { level: 'default', text: 'その他攻撃加算（企業タワー・アウトポストなどの固定加算）は 0' },
];

/** 編成によらずモデル全体で扱わないもの・確かめていないもの（README の「精度と未対応」はここを指す） */
const MODEL_WIDE: Item[] = [
  {
    level: 'assumed',
    text: '実戦（ソロレイド・ユニオンレイド）とは未照合。照合した録画は、ほとんどが射撃場の敵（スペック固定と育成あり）で、ほかは迎撃戦の特殊個体の一部だけ',
  },
  {
    level: 'unsupported',
    text: 'コア命中率・弾丸命中率・距離ボーナスは、射撃場の的の表（単騎 AUTO の実測と、3 分モードの着地点）から取る。敵の移動・攻撃・カバーによる中断は、射撃場 3 分モードの的のジャンプ（敵の詳細設定の「ジャンプ移動」）だけ扱う。命中を数えるトリガーは全弾命中で数える',
  },
  {
    level: 'assumed',
    text: 'フルバースト中などに配られる持続の命中率▲は、効いている間だけ常時の命中率▲と足してコア命中率に効かせる（仮説。確かめたのは 1 つの編成だけ）。命中率▲は AR・SMG・MG の弾丸命中率も上げる（外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にする。確かめたのは SMG の遠と中遠 B・C だけで、ほかの帯と AR・MG には同じ式を当てる。SG は近（近 A・近 B）だけ同じ式で上げ、中近・中遠・遠には効かせていない（未実装）。持続の▲による上がりもバーストゲージと命中の回数に入れる（仮説））',
  },
  { level: 'unsupported', text: 'ボスの行動パターン・パーツ破壊・貫通・範囲攻撃の複数ヒット' },
  {
    level: 'approx',
    text: '射撃場 3 分モードの的のジャンプの時刻は 1 組の代表値（1 回目 32.35 秒・間隔 36.34・39.66・36.34・33.17 秒）。実際は 1 回目と 2→3・3→4 回目のジャンプが録画ごとに約 3.6〜4.6 秒の段で早まることがあり（撃たない間にも起きる。何で決まるかは未解明）、この早まりは未実装（C-0552・C-0553・C-0548）',
  },
  {
    // plan/design-landing-aim.md 10 節: 効きが小さいので、枠ごとに出さずここに 1 行だけ出す
    level: 'approx',
    text: '的のジャンプの着地の後の照準の動きは入れていない。AR・SMG・SG は照準が的に掛かるまで撃たない（C-0291・C-0948。弾の種類 InstantBox の AR は待たない。C-0973）が、モデルは構えの 12f で撃ち始めるので、通常攻撃の発の数がわずかに多い（単騎 180 秒で約 0.5〜0.7%）。チャージの短い RL（紅蓮：ブラックシャドウ）の着地の後の 1 発目のコアの外れ（C-0194。与ダメージの約 0.1〜0.3%）と、弾速 100・誘導弾・曲射の RL のコア命中率が着地の後の 1 発目を除いた値であること（C-0174・C-0175・C-0242）も同じ',
  },
  {
    level: 'unsupported',
    text: '被弾・HP の変動・回復量・シールド（生存の計算）。回復は「回復を受けた時」のトリガーにだけ使う',
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
      // notes の種類で分ける（plan/design-skill-note-kinds.md 2.3 節）。計算に無関係・補足も、スキル欄が無いのでここに出す
      // （間接は、読む側のいる編成で最小構成の検査が見るもので、ここには出さない）
      const notes = entry.notes ?? [];
      if (entry.support === 'partial' || entry.support === 'unsupported') {
        const what = entry.support === 'partial' ? '一部対応' : '未対応';
        const text = notes
          .filter((n) => n.kind === 'unimplemented')
          .map((n) => n.ja)
          .join('、');
        items.push({ level: 'unsupported', text: `${name}は${what}: ${text}` });
      }
      for (const n of notes) {
        if (n.kind === 'outOfScope' || n.kind === 'noDamage' || n.kind === 'modeling')
          items.push({ level: n.kind, text: `${name}: ${n.ja}` });
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

/** 画面のレベルの表記は「LV」にそろえる（スキル定義などの文の「Lv10」も出すときに直す） */
function levelNotation(text: string): string {
  return text.replace(/\bLv(?=\.?\s?\d)/g, 'LV');
}

function ItemList({ items }: { items: readonly Item[] }) {
  return (
    <ul className="notes">
      {items.map((item, i) => (
        <li key={i} className={`note ${LEVEL_CLASS[item.level]}`}>
          <span className="badge">{LEVEL_LABEL[item.level]}</span> {levelNotation(item.text)}
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
  /** 敵の出来事の注記（未実装の種類・近似）。出来事が無ければ空 */
  enemyNotes: readonly ModelNote[];
}) {
  const filled = slots.filter((s): s is NotesSummarySlot => s !== null);
  const { order } = useContext(ListOrderContext);
  return (
    <details className="panel notes-summary">
      <summary>未対応・近似・仮定の一覧</summary>
      <h3>モデル全体</h3>
      <ItemList items={MODEL_WIDE} />
      <h3>画面に無い入力の既定</h3>
      <ItemList items={INPUT_DEFAULTS} />
      {order === 'combatPower' && (
        <>
          <h3>一覧の並び</h3>
          <ItemList items={[COMBAT_POWER_TIES]} />
        </>
      )}
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
              スロット {slot.index + 1} {slot.character.name.ja}
            </h3>
            {items.length === 0 ? <p className="hint">なし（すべて対応）</p> : <ItemList items={items} />}
          </section>
        );
      })}
    </details>
  );
}
