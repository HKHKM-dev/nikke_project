# 予測ファイル

- 検証記録ごとに、撮る前の予測を `V-NNNN.json` に置く（[plan/design-records-automation.md](../../plan/design-records-automation.md) 3.2 節）。手書きの部分は `verification`・`team`（枠順。`rid`・`controlled`・`treasurePhase`）・`fixedSpec`・`hypotheses`（`id`・`note`・`override`）・`targets`（`id`・`model`・`metric`・`args`・`setup`・`note`・`observations`）。`predicted` は `npm run records:predict -- V-NNNN` が書き込む（仮説 × 指標の値、日付、commit、控え `seen`）。
- 比べる指標の語彙は観測値の `compare` と同じ（`packages/core/src/records/observations.ts` の `METRICS`・`CompareSetup`）。仮説の `override` は `setup` の項目を上書きする。モデルのコードや定義を仮説ごとに切り替える必要があるときは、このファイルの範囲外で、検証記録に手で書く。
- 撮る前に `predicted` を入れた状態で commit する（「予測は撮る前に書く」を履歴で示す）。検証記録の「予測」の節には仮説ごとの見え方と見分け方を書き、数値はこのファイルを指す。
- 読んだ後、同じ検証記録を `source` にする観測値（`metric`・`args`・`setup` が指標と同じもの。`observations` で明示もできる）と突き合わせ、仮説ごとに合うかを `npm run records:check` が [plan/verifications.md](../../plan/verifications.md) のその検証記録の項に出す。
- **既存の録画の読み直し**では、検証記録の冒頭の「録画」に録画を挙げてから `records:predict` を回し、読む前に commit する。`predicted.seen` に、そのとき既にあった観測値の ID が録画ごとに控えられる。控えの観測値に結び付いた指標は「後付け」と出し、合う仮説の数に入れない。控えの観測値は、この検証記録の根拠にできない（`records:close` が落とす。[plan/design-reread-prediction.md](../../plan/design-reread-prediction.md)）。
- 後から書いた予測（形の確かめなど）は `note` にそう書く。
