# 設計書: モダンUIとUIモード切り替えの段階的導入

- 状態: **進行中（Step 4: @dnd-kit/core によるドラッグ＆ドロップ）**
- 関連: [design-unify-sim-calc.md](design-unify-sim-calc.md)
- 作成日: 2026-11-03

## 1. 目的と方針

従来の最低限・実用本位のクラシカルなUI（軽量・高密度・安定）を今後も完全に維持したまま、モダンな見た目（ゲームライクな編成画面、キャラクターカード表示）およびドラッグ＆ドロップによる直感的な編成操作ができる機能を提供する。

### 決定事項（対話による承認）

1. **UI切り替え方式（方式A: View層の完全分離）**:
   - `App.tsx` の状態管理（`team`, `parties`, `calc`, `shown`, `batch`, `totals` 等）を維持し、表示層を `<ClassicView />` と `<ModernView />` に分離する。
   - クラシックUIの既存コード・動作・テストには影響を与えず、独立性を保証する。
2. **段階的な導入ステップ**:
   - **Step 1**: UIモード切り替え基盤（`classic` / `modern`）と `ClassicView` への切り出し、`ModernView` の受け皿作成（PR #945 完了）。
   - **Step 2**: 画像アセット配置構造とフォールバック表示（属性・バースト・武器・キャラ名）。
   - **Step 3**: モダン編成カード ＆ キャラトレイ（クリック配置＋育成詳細モーダル、PR #946 完了）。
   - **Step 4**: `@dnd-kit/core` によるドラッグ＆ドロップ（トレイ→スロット、スロット間スワップ）。
   - **Step 5**: スタイリングとデザインのブラッシュアップ。
3. **画像アセット**:
   - 自前静的アセット配信。現時点では画像が未取得のため、画像がない状態でもフォールバック表示によりすべての機能が完全に動作する設計とする。
   - 2026-11-04（オーナーの指示）: 画像を取得して同梱した。Blablalink の公開 CDN の顔のアイコン（`/character/si/si_c{resourceId 3 桁}_00_s.webp`、128×128。`.char-visual` の正方形の枠に合う）を、`npm run fetch-images`（`packages/core/scripts/fetch-images.ts`）が `packages/core/data/characters/images/{resourceId}.webp` に置く。新しいキャラを取り込んだ（`fetch-data`）後に回す。画像の権利は README の「ライセンス」のとおり本リポジトリのライセンスの対象外。
   - 画像が読めたキャラにはフォールバックの札（属性・名前）を重ねず、読めなかったキャラだけ札を出す（`CharacterVisual.tsx`）。
   - アーティファクト（`npm run artifact:build`）からは `characters/images` を除く（1 版 511 ファイルまでで、データだけで 300 近い）。アーティファクトでは札で出る。
4. **ドラッグ＆ドロップ**:
   - `@dnd-kit/core` を採用（モバイル/タッチ対応、React 19親和性）。

---

## 2. 実装詳細

### 2.1 Step 1: UIモードの状態管理とView層の分離

- `uiMode.ts`: `classic` / `modern` の状態管理と localStorage 保存。
- `SettingsMenu.tsx`: 表示モード切り替えラジオを追加。
- `ClassicView.tsx` / `ModernView.tsx`: 表示層を分離。

### 2.2 Step 2 & 3: モダン編成カードとキャラトレイ

- `CharacterVisual.tsx`: キャラクター画像（将来のアセット）および画像不在時のフォールバックCSSカード表示（属性グラデーション、バースト段階、武器種、キャラ名）。
- `ModernSlotCard.tsx`: 5枠並びの編成カード。ダメージ量、ダメージ寄与度バー、フォーカス表示、空きスロット表示、育成・詳細設定ボタン。
- `CharacterTray.tsx`: 属性・バースト段階・武器種・完全対応・検索キーワードによる絞り込みが可能なキャラクター選択パレット。クリックで対象スロットに配置。
- `SlotBuildModal.tsx`: モーダルダイアログによる育成設定（好感度、限界突破、コア強化、スキルLv、装備、キューブ、コレクション、宝物）およびスロット詳細設定（フォーカス、撃たない、バーストしない）の編集。

### 2.3 Step 4: @dnd-kit/core によるドラッグ＆ドロップ

- `apps/web/package.json`: `@dnd-kit/core` を導入。
- `CharacterTrayItem.tsx`: 各キャラアイテムを `useDraggable` でドラッグ可能に。
- `ModernSlotCard.tsx`: `useDroppable` によるドロップ受け入れ（`isOver` 時のハイライト）と、配置済みキャラの `useDraggable`（スロット間スワップ用）。
- `team.ts`: `swapSlots` アクション（スロット間の入れ替え、操作キャラの追従）を追加。
- `ModernView.tsx`: `DndContext`、PointerSensor（8pxのしきい値でクリック操作と共存）、`DragOverlay`（カーソル追従プレビュー）を統合。
- 2026-11-04: PointerSensor はタッチでもスワイプした瞬間に持ち上げるので、スマホでトレイの上をスワイプしてもページがスクロールしなかった（Playwright のタッチで確認）。MouseSensor（8px）と TouchSensor（250ms の長押しで持ち上げ、それまでに 8px より動いたらスクロール）に分けた。

---

## 経過

- 2026-11-03: オーナーとの対話により設計方針を承認。ブランチ `antigrav/modern-ui-foundation` にて Step 1 着手。PR #945 にて main にマージ完了。
- 2026-11-03: ブランチ `antigrav/modern-ui-cards` にて Step 2 & 3（モダン編成カード・キャラトレイ・クリック配置）を着手。PR #946 にて main にマージ完了。
- 2026-11-04: ブランチ `antigrav/modern-ui-dnd` にて Step 4（@dnd-kit/core によるドラッグ＆ドロップ）を着手。
- 2026-11-04: キャラ画像の同梱（1 節 3）と、タッチの長押しでのドラッグ（2.3 節）を実装した。
