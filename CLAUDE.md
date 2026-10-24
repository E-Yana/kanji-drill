# かんじドリル（小4）— このアプリの説明（Claude向け）

小学4年生の漢字「書き取り」アプリ。iPadで使う。公開サイト: https://e-yana.github.io/kanji-drill/
子どもの学習記録はiPadの中にしか無く、外から書き込めない。**問題を足したい時は `inbox.json` に書き足す**。
アプリは開くたびにこのファイルを読み、新しい問題を「間違えた漢字」（最優先）として自動で入れる。

## 間違えた漢字を足す手順（Macが無くてもできる）
1. `inbox.json` の `problems` の末尾に、次の形で足す。**id は既存の最大番号の次**（例: 最後が `m-0035` なら `m-0036`）。一度使った id は使い回さない
   `{ "id": "m-0036", "prompt": "目を{__}ます", "answer": "覚", "reading": "さ", "word": "覚ます" }`
2. 例文の「書く場所」は `{__}` にする（`(__)` や `＿` は不可）。`answer` は空欄に入る漢字（送りがなも含める）、`reading` は読み、`word` は答え合わせで見せる語
3. 公開リポジトリなので、名前・学校名・住所などは書かない。例文は教材の語句だけにする
4. コミットして公開する。web版Claude Codeは別の枝にpushするため、**GitHubで「マージ」を押すと公開される**。公開後、iPadでアプリを開くと自動で入る
5. 取り込み済みの問題を直したい時は、同じ id を書き換えず（取り込み済みの id は二度と読まれない）、下の `fixes` に足す

## 取り込み済みの問題を直す（2026-10-24〜・v20）
- iPadの中の問題（取り込み分）は、`inbox.json` の `fixes` に足すと次の起動で直る。id・学習記録・要復習の印は残る
  `{ "match": { "prompt": "車に{__}。", "answer": "乗" }, "set": { "prompt": "車に{__}る。" } }`
- `match` は端末にある例文＋答えの完全一致（端末の中身は Drive の `kanji_drill_latest.json` の `state.imported` で見る）。`set` で変えられるのは prompt・answer・reading・word だけ
- 直した後は一致しなくなるので、残しておいても二重には直らない。直した結果が別の問題と重なる時・`{__}` が無い時は飛ばす
- 同梱の `kanji_data.js`・`grade3_data.js` は id が固定なので、そのファイルを直接直す（版上げが要る）
- 検査：`node tests/problem_check_test.js`（送りがな抜け・語の崩れ＝答えを入れた文に word が含まれるか）。⚠️「持参す」のように語の後ろに余計なかなが付く形・「{__}する」のように手がかりが薄い形は拾えないので目でも見る。処理は `problem_fix.js`

## 守ること
- `app.js` の `APP_VERSION` と `sw.js` の `CACHE` は対で上げる（アプリ本体を変えた時だけ。`inbox.json` だけの更新は不要）
- `priority_data.js` は旧・非公開の控え（git管理外）。新しい問題は入れない

## バックアップ兼きろく（2026-10-17〜）
- ホームの「きろくを ほぞん」で `kanji_drill_backup_YYYY-MM-DD.json`（`app`・`format`・`summary`＝読む用・`state`＝復元用）。処理は `backup.js`（都道府県と同一内容）、試験は `node tests/backup_test.js`
- `kanjiDrill_lastBackup`＝受け口が ok を返した日、または共有/ダウンロードを**実行した日**。Driveに入った保証は受け口 ok の時のみ。旧 `store.meta.lastBackup` は読むだけ
- `kanjiDrill_driveSync`＝`{url, token}` のJSON（ドライブ設定欄で入れる）。記録 `kanjiDrill_v1` とは別キー。値をコード・ログ・コミットに書かない。ドライブ送信が失敗した時は保存日を記録せず共有も自動で開かず、次のタップで従来の共有/ダウンロード
- 受け口は Apps Script「学習アプリ受け口」（3アプリ共用・`tani_drill/CLAUDE.md` 参照）
- 復元前の退避は `kanjiDrill_v1_restore_<日付>[_n]`（新しい2本だけ残る）。戻したい時は、その値を `kanjiDrill_v1` に書き戻す
- 復元しても `inboxSeen` は合算しない（バックアップ後に足した inbox の問題は復元後に取り込み直される）
