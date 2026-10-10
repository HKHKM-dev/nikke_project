# 予測ファイル

- 検証記録ごとに、予測を `V-NNNN.json` に置く（[plan/design-records-automation.md](../../plan/design-records-automation.md) 3.2 節）。予測は任意で、確定の条件ではない。撮影計画で、その録画で仮説を見分けられるかを確かめるのに使う（[plan/design-investigation-review.md](../../plan/design-investigation-review.md) 1 節）。手書きの部分は `verification`・`team`（枠順。`rid`・`controlled`・`treasurePhase`）・`fixedSpec`・`hypotheses`（`id`・`note`・`override`）・`targets`（`id`・`model`・`metric`・`args`・`setup`・`note`・`observations`）。`predicted` は `npm run records:predict -- V-NNNN` が書き込む（仮説 × 指標の値、日付、commit）。
- 比べる指標の語彙は観測値の `compare` と同じ（`packages/core/src/records/observations.ts` の `METRICS`・`CompareSetup`）。仮説の `override` は `setup` の項目を上書きする。モデルのコードや定義を仮説ごとに切り替える必要があるときは、このファイルの範囲外で、検証記録に手で書く。
- 撮る前の順番は問わない（2026-10-10 から。それまでは撮る前の commit を確定の条件にしていた）。検証記録の「予測」の節には仮説ごとの見え方と見分け方を書き、数値はこのファイルを指す。
- 読んだ後、同じ検証記録を `source` にする観測値（`metric`・`args`・`setup` が指標と同じもの。`observations` で明示もできる）と突き合わせ、仮説ごとに合うかを `npm run records:check` が [plan/verifications.md](../../plan/verifications.md) のその検証記録の項に出す。
- 2026-10-04〜10-10 の予測ファイルにある `predicted.seen`（予測の時点で既にあった観測値の控え。[plan/design-reread-prediction.md](../../plan/design-reread-prediction.md)）は、もう読まない。`records:predict` で出し直すと消える。
- 後から書いた予測（形の確かめなど）は `note` にそう書く。
