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
5. 直したい時は、同じ id を書き換えず、新しい id で足す（取り込み済みの id は二度と読まれない）

## 守ること
- `app.js` の `APP_VERSION` と `sw.js` の `CACHE` は対で上げる（アプリ本体を変えた時だけ。`inbox.json` だけの更新は不要）
- `priority_data.js` は旧・非公開の控え（git管理外）。新しい問題は入れない

## バックアップ兼きろく（2026-10-17〜）
- ホームの「きろくを ほぞん」で `kanji_drill_backup_YYYY-MM-DD.json`（`app`・`format`・`summary`＝読む用・`state`＝復元用）。処理は `backup.js`（都道府県と同一内容）、試験は `node tests/backup_test.js`
- `kanjiDrill_lastBackup`＝共有シート/ダウンロードを実行した日（Drive 保存の保証ではない）。旧 `store.meta.lastBackup` は読むだけ
- 復元前の退避は `kanjiDrill_v1_restore_<日付>[_n]`（新しい2本だけ残る）。戻したい時は、その値を `kanjiDrill_v1` に書き戻す
- 復元しても `inboxSeen` は合算しない（バックアップ後に足した inbox の問題は復元後に取り込み直される）
