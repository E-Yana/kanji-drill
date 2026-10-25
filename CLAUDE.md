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

## 写真から取り込む（2026-10-25〜・v22・コピペ不要）
- claude.ai アプリに写真を貼る → スキル `kanji-photo-to-json` が JSON 配列にして、Drive の「漢字Apps」に `kanji_drill_import_<日時>.json` を置く（Drive コネクタの create_file・変換なし）
- アプリは起動時・画面に戻った時・開いている間3分おき（v23〜。30秒以内の連続は間引く）と、管理画面の「📥 ドライブから とりこむ」で、受け口の `import_list` で取り込み待ちを読み、貼り付けと同じ `importFromText` に通す（検査に掛かった行は編集カードへ）→ `import_done` でゴミ箱へ。ドライブの設定（`kanjiDrill_driveSync`）が無い端末では何もしない
- 読んだファイルの Drive id は `store.meta.driveImportSeen`（直近50件）。解釈できた時点で足し、取り込みと同じ保存に乗せる＝ゴミ箱移動が失敗しても二重に入らない。JSON として読めないファイルは消さず、名前を出す
- 通信の形は `drive_import.js`（`window.DriveImport`・試験 `tests/drive_import_test.js`）。ファイル名の約束 `kanji_drill_import_*.json` は受け口・スキルと同じ文字列
- Drive のフォルダ id はこのリポジトリ（公開）に書かない

## 取り込み済みの問題を直す（2026-10-24〜・v20）
- iPadの中の問題（取り込み分）は、`inbox.json` の `fixes` に足すと次の起動で直る。id・学習記録・要復習の印は残る
  `{ "match": { "prompt": "車に{__}。", "answer": "乗" }, "set": { "prompt": "車に{__}る。" } }`
- `match` は端末にある例文＋答えの完全一致（端末の中身は Drive の `kanji_drill_latest.json` の `state.imported` で見る）。`set` で変えられるのは prompt・answer・reading・word だけ
- 直した後は一致しなくなるので、残しておいても二重には直らない。直した結果が別の問題と重なる時・`{__}` が無い時は飛ばす
- 同梱の `kanji_data.js`・`grade3_data.js` は id が固定なので、そのファイルを直接直す（版上げが要る）
- 直したら `node tools/check_problems.js inbox.json` で「止める」0件を確かめる

## 問題の検査（2026-10-24〜・v21）
- 検査は `problem_fix.js` の `checkProblem`（1か所）。段階は「止める」（空欄・答え・読みの形の崩れ、送りがな抜け、答えの漢字が語に無い）と「確認」（答えを入れた文に語が無い・「〜す」で終わる・手がかりが薄い・語が空）
- 使う場所：①管理画面の貼り付け／1問追加＝検査に掛かった行は取り込まず「たしかめて とりこむ」の編集カードへ（別キー `kanjiDrill_pendingImport`・バックアップ対象外・再読み込みでも残る）②取り込み済みの一覧＝⚠印と「なおす」（id・学習記録は残る）③GitHub Actions（`.github/workflows/test.yml`）＝push・PRで全試験＋inbox の検査④`node tools/check_problems.js <inbox.json｜バックアップJSON｜配列>`＝「止める」があれば終了コード1
- ルールを変えたら `tests/fixtures/problem_cases.json`（10/24の実例11件＋正しい問題）に見本を足し、`for f in tests/*_test.js; do node "$f" || exit 1; done`
- ⚠️ 検査は配当学年の外の漢字を見ない。かな交じり（衣ふく）は「確認」に出るが正しい

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
- 結果画面の自動送信（v24〜）：漢字・ことばクイズの結果画面に入ったら、ドライブ設定済みの時だけ裏で送る（`autoBackupToDrive`・入口は `enterResultScreen`）。仕様は `.claude/rules/home-apps.md` の自動送信の行と同じ。写真の取り込み（`driveImportBusy`）とは旗が別
