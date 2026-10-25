// ============================================================
// 漢字ドリル（書き取り・自己採点）アプリ本体
//   - 間隔反復（Leitner 5箱）で「間違えた字」を翌日に重点出題
//   - Gemini で書き起こした JSON をまとめて取り込み
//   - 状態は localStorage に保存（サーバー不要）
// ============================================================

"use strict";

// --- 定数 -----------------------------------------------------
const STORE_KEY = "kanjiDrill_v1"; // localStorage のキー
const DEFAULT_DAILY = 10; // 1日の出題数
const DEFAULT_NEW_PER_DAY = 3; // 1日に増やす新出漢字の数（復習/4年バンク）
const BACKUP_REMIND_DAYS = 14; // 最終バックアップからこの日数が経ったら書き出しを促す
const AWAY_REMIND_DAYS = 5; // 最終学習からこの日数以上空いたら「〇日ぶりだね」を表示（旅行等の数日の間は責めない）
const VOCAB_DAILY = 5; // ことばクイズの1日の出題数
const NEW_MIN = 2; // 漢字：1日に最低これだけ新出を入れる（在庫がある時）
const MASTERED_CAP = 3; // 漢字：定着済み（箱4以上）の復習の1日の目安上限
const VOCAB_NEW_MIN = 1; // ことば：新出の最低数
const VOCAB_NEW_TARGET = 2; // ことば：新出の目標数
const VOCAB_MASTERED_CAP = 2; // ことば：定着済みの1日の上限（新出が残っている時）
// Leitner の箱ごとの「次に出すまでの日数」（箱が上がるほど間隔が伸びる）
const INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 30 };
const MAX_BOX = 5;
// 漢字：初めて出た日に○だった問題（もう書ける字）は、箱3に置いて次はこの日数後に出す
// （箱1→2→3の短い間隔の復習を飛ばし、空いた枠を新出へ回す。「おぼえた」には数えない）
const FIRST_CORRECT_BOX = 3;
const FIRST_CORRECT_DAYS = 7;
const BLANK_TOKEN = "{__}"; // 例文中の「書く場所」を表す印
// アプリの表示用バージョン。中身を更新したら sw.js の CACHE と対で必ずインクリメントする
// （ホーム画面に表示することで、iPad側で更新が反映されたか目視確認できるようにする）
const APP_VERSION = "v22";
const INBOX_URL = "inbox.json"; // 公開サイトに置く追加問題ファイル
const BACKUP_APP_ID = "kanji-drill"; // バックアップJSONの app 値
// 受け口が ok を返した日、または共有/ダウンロードを実行した日。Drive に入った保証は受け口 ok の時のみ
const LAST_BACKUP_KEY = "kanjiDrill_lastBackup";
const DRIVE_SYNC_KEY = "kanjiDrill_driveSync"; // ドライブ受け口の設定 {url, token}（記録とは別キー）
const DRIVE_TIMEOUT_MS = 15000; // 受け口への送信の時間切れ
const MSG_DRIVE_OK = "ドライブに ほぞんしました";
const MSG_DRIVE_FAILED = "ドライブに ほぞんできませんでした。もう一度 おすと ファイルで ほぞん";
const RESTORE_KEY_PREFIX = "kanjiDrill_v1_restore_"; // 復元前の退避キー（+日付）
const PENDING_KEY = "kanjiDrill_pendingImport"; // 検査に掛かって未取り込みの行（記録と別キー・バックアップ対象外）
const WEAK_TOP_N = 10; // バックアップ要約に載せる苦手の件数
const MSG_BACKUP_SHARED = "ほぞんの がめんを ひらきました。「ファイルに ほぞん」→「ドライブ」";
const MSG_BACKUP_DOWNLOADED = "ファイルを ダウンロードしました";
const MSG_BACKUP_FAILED = "ほぞんできませんでした";
const MSG_RESTORE_BAD_FILE = "このファイルは つかえません。いまの きろくは そのままです";
const MSG_RESTORE_CONFIRM = "いまの きろくを ファイルの きろくに おきかえます。いいですか？";
const MSG_RESTORE_ARCHIVE_FAILED = "いまの きろくを のこせなかったので、やめました。いまの きろくは そのままです";
const MSG_RESTORE_DONE = "もとに もどしました";
const MSG_RESTORE_READ_FAILED = "ファイルを よめませんでした";

// --- 日付ユーティリティ --------------------------------------
/** 今日の日付を YYYY-MM-DD（ローカル時刻）で返す */
function todayStr() {
  return toDateStr(new Date());
}
/** Date を YYYY-MM-DD に変換 */
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** 日付文字列に days 日を足した YYYY-MM-DD を返す */
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}
/** 2つの日付文字列(YYYY-MM-DD)の間の日数を返す */
function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// --- ストア（永続化） ----------------------------------------
let store = loadStore();

/** localStorage から状態を読み込む（無ければ初期値） */
function loadStore() {
  const init = {
    imported: [], // 取り込んだ問題
    progress: {}, // 問題ID -> 習熟度カード（漢字・語彙とも同居。idの接頭辞で区別）
    meta: {
      streak: 0,
      lastStudyDate: null,
      lastBackup: null, // 最後に「きろくを書き出した」日（YYYY-MM-DD）
      settings: { dailyCount: DEFAULT_DAILY, newPerDay: DEFAULT_NEW_PER_DAY },
    },
    session: null, // 当日セッション（漢字・途中再開用）
    vocabSession: null, // 当日セッション（ことばクイズ・途中再開用）
  };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return init;
    const parsed = JSON.parse(raw);
    // 後方互換: 欠けたキーを補う
    return {
      imported: parsed.imported || [],
      progress: parsed.progress || {},
      meta: Object.assign(init.meta, parsed.meta || {}),
      session: parsed.session || null,
      vocabSession: parsed.vocabSession || null,
    };
  } catch (e) {
    console.warn("ストア読込に失敗。初期化します", e);
    return init;
  }
}

/** 状態を localStorage に保存 */
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    alert("保存に失敗しました。Safariの空き容量をご確認ください。");
    console.error(e);
  }
}

// --- 問題バンク ----------------------------------------------
/** 全バンク（3年復習 + 4年スターター + 取り込み問題）をまとめて返す */
function allProblems() {
  const grade3 = window.GRADE3_PROBLEMS || []; // 3年復習（tier1）
  const seed = window.SEED_PROBLEMS || []; // 4年スターター（tier2）
  return grade3.concat(seed, store.imported);
}

/** 問題の層（小さいほど先に出す）: 0=優先 / 1=3年以下の復習 / 2=4年 */
function tierOf(p) {
  if (p.requireReview) return 0;
  return (p.grade || 4) <= 3 ? 1 : 2;
}
/** IDから問題を引く */
function problemById(id) {
  return allProblems().find((p) => p.id === id) || null;
}

// --- 語彙バンク（ことばクイズ。漢字とは別枠で管理） -----------
/** ことばクイズの全問題を返す（漢字の allProblems() には混ぜない） */
function allVocabProblems() {
  return window.VOCAB_PROBLEMS || [];
}
/** IDから語彙問題を引く */
function vocabProblemById(id) {
  return allVocabProblems().find((p) => p.id === id) || null;
}

/** 習熟度カードを取得（無ければ新規カードの初期値） */
function getCard(id) {
  if (store.progress[id]) return store.progress[id];
  // 未学習カード: 今日が期限（=今日出題対象）
  return {
    box: 1,
    dueDate: todayStr(),
    history: [],
    wrongCount: 0,
    rightCount: 0,
  };
}

// --- 出題キューの組み立て（mistake-weighted SRS） ------------
/** 問題と習熟度カードから composeDaily 用の項目を作る（出題済み＝history あり） */
function toQueueItem(p, idx, tier) {
  const c = getCard(p.id);
  return {
    id: p.id,
    box: c.box,
    dueDate: c.dueDate,
    wrongCount: c.wrongCount,
    tier,
    idx,
    seen: c.history.length > 0,
  };
}

/**
 * 今日出す問題IDの配列を作る（配分は queue.js の composeDaily）。
 *   苦手＝期限が来た箱1〜3／定着＝期限が来た箱4以上／新出＝未出題（優先 tier0 が先頭）
 *   1. 新出の最低数と定着1問を確保 2. 苦手で埋める 3. 新出を目標数まで
 *   4. 定着を上限まで 5. 余りは新出、それでも余れば定着で埋める
 *   表示順は 苦手→定着→新出
 */
function buildQueue() {
  const daily = store.meta.settings.dailyCount || DEFAULT_DAILY;
  const newTarget = store.meta.settings.newPerDay ?? DEFAULT_NEW_PER_DAY;
  const items = allProblems().map((p, idx) => toQueueItem(p, idx, tierOf(p)));
  return window.DrillQueue.composeDaily(items, {
    today: todayStr(),
    daily,
    newMin: NEW_MIN,
    newTarget,
    masteredCap: MASTERED_CAP,
  });
}

/** ことばクイズの今日出す問題IDの配列を作る（buildQueue() の語彙版。優先語は tier0） */
function buildVocabQueue() {
  const items = allVocabProblems().map((p, idx) => toQueueItem(p, idx, p.priority ? 0 : 1));
  return window.DrillQueue.composeDaily(items, {
    today: todayStr(),
    daily: VOCAB_DAILY,
    newMin: VOCAB_NEW_MIN,
    newTarget: VOCAB_NEW_TARGET,
    masteredCap: VOCAB_MASTERED_CAP,
  });
}

// --- 回答の記録（SRS更新） -----------------------------------
/**
 * 初回○で短い復習を飛ばす対象か（まだ1度も答えていない漢字の問題だけ）。
 * ことばクイズ（3択で当てずっぽうでも○になる）と、要復習の印つき（学校で間違えた字）は対象外。
 */
function isFirstCorrectSkipTarget(id, card) {
  if (id.startsWith("v-") || card.history.length > 0) return false;
  const imp = store.imported.find((p) => p.id === id);
  return !(imp && imp.requireReview);
}

/** 自己採点の結果を記録し、箱と次回期限を更新する */
function recordAnswer(id, ok) {
  const c = JSON.parse(JSON.stringify(getCard(id))); // コピーして更新
  const firstCorrect = ok && isFirstCorrectSkipTarget(id, c);
  c.history.push({ date: todayStr(), result: ok ? "o" : "x" });
  if (firstCorrect) {
    c.rightCount += 1;
    c.box = FIRST_CORRECT_BOX;
  } else if (ok) {
    c.rightCount += 1;
    c.box = Math.min(c.box + 1, MAX_BOX);
  } else {
    c.wrongCount += 1;
    c.box = 1; // 間違えたら箱1へ戻す＝翌日また出る
  }
  c.dueDate = addDays(todayStr(), firstCorrect ? FIRST_CORRECT_DAYS : INTERVALS[c.box]);
  store.progress[id] = c;

  // 取り込んだ要復習フラグは、1回できたら解除（以後は通常のSRSに乗せる）
  if (ok) {
    const imp = store.imported.find((p) => p.id === id);
    if (imp && imp.requireReview) imp.requireReview = false;
  }
  saveStore();
}

// --- 統計 -----------------------------------------------------
/** マスター数（箱4以上）を数える（漢字のみ。ことばクイズの語彙IDは除外） */
function masteredCount() {
  return Object.entries(store.progress).filter(
    ([id, c]) => !id.startsWith("v-") && c.box >= 4
  ).length;
}
/** ことばクイズのマスター数（箱4以上・語彙IDのみ）を数える */
function vocabMasteredCount() {
  return Object.entries(store.progress).filter(
    ([id, c]) => id.startsWith("v-") && c.box >= 4
  ).length;
}
/** 苦手リスト（間違い回数の多い順）を返す */
function weakList(limit = 5) {
  return Object.entries(store.progress)
    .filter(([, c]) => c.wrongCount > 0 && c.box < 4)
    .sort((a, b) => b[1].wrongCount - a[1].wrongCount)
    .slice(0, limit)
    .map(([id, c]) => ({ p: problemById(id), c }))
    .filter((x) => x.p); // 削除済み問題は除外
}

// ============================================================
// 画面制御
// ============================================================
const screens = ["home", "quiz", "vocab", "result", "manage"];
function showScreen(name) {
  screens.forEach((s) => {
    const el = document.getElementById("screen-" + s);
    if (el) el.classList.toggle("hidden", s !== name);
  });
  window.scrollTo(0, 0);
}

// --- ホーム画面 ----------------------------------------------
function renderHome() {
  const queue = buildQueue();
  const today = todayStr();
  const session = store.session;
  const finishedToday =
    session && session.date === today && session.index >= session.ids.length;

  document.getElementById("home-streak").textContent = store.meta.streak || 0;
  document.getElementById("home-mastered").textContent = masteredCount();
  document.getElementById("home-count").textContent = queue.length;
  document.getElementById("home-vocab-mastered").textContent = vocabMasteredCount();

  const btnStart = document.getElementById("btn-start");
  const doneNote = document.getElementById("home-done-note");
  if (queue.length === 0) {
    btnStart.disabled = true;
    btnStart.textContent = "今日の問題はありません";
    doneNote.classList.add("hidden");
  } else if (finishedToday) {
    btnStart.disabled = false;
    btnStart.textContent = "もう一度ふくしゅうする";
    doneNote.classList.remove("hidden");
  } else if (session && session.date === today) {
    btnStart.disabled = false;
    btnStart.textContent = "つづきをする";
    doneNote.classList.add("hidden");
  } else {
    btnStart.disabled = false;
    btnStart.textContent = "▶ はじめる";
    doneNote.classList.add("hidden");
  }

  // ことばクイズの導線
  const vocabQueue = buildVocabQueue();
  const vSession = store.vocabSession;
  const vocabFinishedToday =
    vSession && vSession.date === today && vSession.index >= vSession.ids.length;
  const btnVocabHome = document.getElementById("btn-vocab-home");
  if (vocabQueue.length === 0) {
    btnVocabHome.disabled = true;
    btnVocabHome.textContent = "🗣 ことばは おやすみ";
  } else if (vocabFinishedToday) {
    btnVocabHome.disabled = false;
    btnVocabHome.textContent = "🗣 ことばクイズ おわったよ！もう一度";
  } else if (vSession && vSession.date === today) {
    btnVocabHome.disabled = false;
    btnVocabHome.textContent = "🗣 ことばクイズ つづきをする";
  } else {
    btnVocabHome.disabled = false;
    btnVocabHome.textContent = "🗣 ことばクイズ";
  }

  // 苦手リスト
  const weak = weakList(5);
  const weakBox = document.getElementById("home-weak");
  if (weak.length === 0) {
    weakBox.innerHTML = '<p class="muted">まだ苦手リストはありません。</p>';
  } else {
    weakBox.innerHTML =
      "<ul>" +
      weak
        .map(
          (x) =>
            `<li><span class="weak-kanji">${escapeHtml(x.p.answer)}</span>` +
            `<span class="muted">（${escapeHtml(x.p.word)}・×${x.c.wrongCount}回）</span></li>`
        )
        .join("") +
      "</ul>";
  }

  // バックアップ促し（保護者向け）: 進捗があり、最後の書き出しから一定日数たったら表示
  updateBackupReminder(today);
  // 「〇日ぶりだね」: 責めずに前向きに迎える一言（本人向け）
  updateAwayNote(today);

  document.getElementById("app-version").textContent = APP_VERSION;
  showScreen("home");
}

/** ホームの「〇日ぶりだね」表示を更新する（本人向け・責めない前向きな一言） */
function updateAwayNote(today) {
  const el = document.getElementById("home-away-note");
  if (!el) return;
  const last = store.meta.lastStudyDate;
  if (!last || last === today) {
    el.classList.add("hidden");
    return;
  }
  const gapDays = daysBetween(last, today);
  if (gapDays >= AWAY_REMIND_DAYS) {
    el.textContent = `${gapDays}日ぶりだね！またいっしょに がんばろう`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

/** 最終保存日を返す。別キーを優先し、無ければ旧 store.meta.lastBackup を見る（既存端末で促しが突然出ないように） */
function getLastBackup() {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    if (v) return v;
  } catch (e) {
    /* 読めなければ旧値へ */
  }
  return store.meta.lastBackup || null;
}

/** 保存を実行した日を別キーへ書く（旧 store.meta.lastBackup には書かない） */
function setLastBackup() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, todayStr());
  } catch (e) {
    console.warn("lastBackup の保存に失敗", e);
  }
}

/** ホームの「きろくを書き出してね」促しの表示/非表示を更新する */
function updateBackupReminder(today) {
  const el = document.getElementById("home-backup-reminder");
  if (!el) return;
  const hasProgress = masteredCount() > 0 || weakList(1).length > 0;
  const last = getLastBackup();
  // 未保存(null)、または最終保存+N日が今日以前なら促す
  const due = !last || addDays(last, BACKUP_REMIND_DAYS) <= today;
  el.classList.toggle("hidden", !(hasProgress && due));
}

// --- クイズ画面 ----------------------------------------------
let quizState = null; // {ids, index, results:{}}
let vocabState = null; // {ids, index, results:{}}（ことばクイズ用・quizStateとは別枠）

/** セッションを開始（途中なら再開、完了済みなら作り直し） */
function startSession() {
  const today = todayStr();
  const s = store.session;
  if (s && s.date === today && s.index < s.ids.length) {
    // 途中再開（マスター数の基準はセッション開始時点のものを引き継ぐ）
    quizState = {
      ids: s.ids,
      index: s.index,
      results: s.results || {},
      masteredBefore: s.masteredBefore ?? masteredCount(),
    };
  } else {
    // 新規（または当日完了後のふくしゅう）
    const ids = buildQueue();
    if (ids.length === 0) {
      renderHome();
      return;
    }
    const masteredBefore = masteredCount();
    quizState = { ids, index: 0, results: {}, masteredBefore };
    store.session = { date: today, ids, index: 0, results: {}, masteredBefore };
    saveStore();
  }
  showQuestion();
}

/** 現在の問題を表示 */
function showQuestion() {
  const id = quizState.ids[quizState.index];
  const p = problemById(id);
  if (!p) {
    // 取り込み問題が削除されたなどの保険
    nextQuestion();
    return;
  }
  document.getElementById("quiz-progress").textContent =
    `${quizState.index + 1} / ${quizState.ids.length}`;

  // 例文の {__} を「答えの漢字数ぶんの四角」に置き換えて表示
  // （漢字→四角1つ／かな(送りがな)→その文字をそのまま表示）
  const blankHtml = buildBlankHtml(p.answer);
  const promptHtml = escapeHtml(p.prompt).replace(escapeHtml(BLANK_TOKEN), blankHtml);
  document.getElementById("quiz-prompt").innerHTML = promptHtml;

  // 読み（よみ）は答えるための必須の手がかり。問題文の上に大きく表示
  document.getElementById("quiz-reading").textContent = p.reading || "";

  // 解答エリアを隠す & ボタンを「答えを見る」状態に戻す
  document.getElementById("reveal-area").classList.add("hidden");
  document.getElementById("btn-reveal").classList.remove("hidden");
  showScreen("quiz");
}

/** 答え文字列から空欄HTMLを作る（漢字→四角／かな→そのまま表示） */
function buildBlankHtml(answer) {
  const isKanji = (ch) => /[一-鿿々]/.test(ch);
  let html = "";
  for (const ch of String(answer)) {
    html += isKanji(ch)
      ? '<span class="blank"></span>'
      : '<span class="okuri">' + escapeHtml(ch) + "</span>";
  }
  return html || '<span class="blank"></span>';
}

/** 答えを表示（自己採点ボタンを出す） */
function revealAnswer() {
  const id = quizState.ids[quizState.index];
  const p = problemById(id);
  document.getElementById("reveal-answer").textContent = p.answer;
  document.getElementById("reveal-word").textContent = p.word;
  document.getElementById("reveal-area").classList.remove("hidden");
  document.getElementById("btn-reveal").classList.add("hidden");
}

/** 自己採点（ok=できた / false=まちがえた） */
function gradeCurrent(ok) {
  const id = quizState.ids[quizState.index];
  recordAnswer(id, ok);
  quizState.results[id] = ok ? "o" : "x";
  // セッション進捗を保存
  quizState.index += 1;
  store.session = {
    date: todayStr(),
    ids: quizState.ids,
    index: quizState.index,
    results: quizState.results,
    masteredBefore: quizState.masteredBefore,
  };
  saveStore();
  nextQuestion();
}

function nextQuestion() {
  if (quizState.index >= quizState.ids.length) {
    finishSession();
  } else {
    showQuestion();
  }
}

// --- 結果画面 ------------------------------------------------
/** 達成メッセージ（新しくマスターした数）を結果画面に表示する。0以下なら非表示にする */
function renderAchievement(newlyMastered, unit) {
  const el = document.getElementById("result-achievement");
  if (!el) return;
  if (newlyMastered > 0) {
    el.textContent = `🌟 新しく ${newlyMastered}${unit} マスターしたよ！`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function finishSession() {
  // 連続日数（streak）を1日1回だけ更新
  const today = todayStr();
  if (store.meta.lastStudyDate !== today) {
    if (store.meta.lastStudyDate === addDays(today, -1)) {
      store.meta.streak = (store.meta.streak || 0) + 1;
    } else {
      store.meta.streak = 1;
    }
    store.meta.lastStudyDate = today;
    saveStore();
  }

  const ids = quizState.ids;
  const okCount = ids.filter((id) => quizState.results[id] === "o").length;
  const total = ids.length;
  document.getElementById("result-score").textContent = `${okCount} / ${total}`;

  // ほめメッセージ
  const ratio = total ? okCount / total : 0;
  let msg = "よくがんばったね！";
  if (ratio === 1) msg = "全部できた！すごい！🎉";
  else if (ratio >= 0.7) msg = "いいちょうし！この調子！👍";
  else msg = "まちがえた字は明日また出るよ。だいじょうぶ！";
  document.getElementById("result-msg").textContent = msg;
  document.getElementById("result-streak").textContent =
    `🔥 連続 ${store.meta.streak} 日`;

  // 達成メッセージ（新しくマスターした字の数だけを前向きに伝える。正答率は見せない）
  renderAchievement(masteredCount() - (quizState.masteredBefore ?? masteredCount()), "字");

  // 今日できなかった字
  const wrong = ids
    .filter((id) => quizState.results[id] === "x")
    .map((id) => problemById(id))
    .filter(Boolean);
  const wrongBox = document.getElementById("result-weak");
  if (wrong.length === 0) {
    wrongBox.innerHTML = '<p class="muted">今日はぜんぶ○！</p>';
  } else {
    wrongBox.innerHTML =
      "<p>今日まちがえた字（明日また出ます）：</p><div class='kanji-row'>" +
      wrong.map((p) => `<span class="weak-kanji">${escapeHtml(p.answer)}</span>`).join("") +
      "</div>";
  }

  // ことばクイズが残っていれば「つづけて」導線を出す
  const vocabQueue = buildVocabQueue();
  const vSession = store.vocabSession;
  const vocabDoneToday =
    vSession && vSession.date === today && vSession.index >= vSession.ids.length;
  const btnVocabStart = document.getElementById("btn-vocab-start");
  btnVocabStart.classList.toggle("hidden", !(vocabQueue.length > 0 && !vocabDoneToday));

  showScreen("result");
}

// ============================================================
// ことばクイズ画面
// ============================================================

/** 配列をシャッフルした新しい配列を返す（Fisher-Yates） */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** セッションを開始（途中なら再開、完了済みなら作り直し） */
function startVocabSession() {
  const today = todayStr();
  const s = store.vocabSession;
  if (s && s.date === today && s.index < s.ids.length) {
    vocabState = {
      ids: s.ids,
      index: s.index,
      results: s.results || {},
      masteredBefore: s.masteredBefore ?? vocabMasteredCount(),
    };
  } else {
    const ids = buildVocabQueue();
    if (ids.length === 0) {
      renderHome();
      return;
    }
    const masteredBefore = vocabMasteredCount();
    vocabState = { ids, index: 0, results: {}, masteredBefore };
    store.vocabSession = { date: today, ids, index: 0, results: {}, masteredBefore };
    saveStore();
  }
  showVocabQuestion();
}

/** 現在の語彙問題を表示（3択をシャッフルして描画） */
function showVocabQuestion() {
  const id = vocabState.ids[vocabState.index];
  const p = vocabProblemById(id);
  if (!p) {
    nextVocabQuestion();
    return;
  }
  document.getElementById("vocab-progress").textContent =
    `${vocabState.index + 1} / ${vocabState.ids.length}`;
  document.getElementById("vocab-reading").textContent = p.reading || "";
  document.getElementById("vocab-word").textContent = p.word;
  document.getElementById("vocab-feedback").classList.add("hidden");

  const choices = shuffleArray([p.answer, ...p.distractors]);
  const box = document.getElementById("vocab-choices");
  box.innerHTML = "";
  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";
    btn.textContent = choice;
    btn.addEventListener("click", () => selectVocabChoice(choice, p, btn));
    box.appendChild(btn);
  });
  showScreen("vocab");
}

/** 選択肢タップ時の採点処理（自動採点・SRSへ記録） */
function selectVocabChoice(choice, p, btnEl) {
  const ok = choice === p.answer;
  document.querySelectorAll("#vocab-choices .choice-btn").forEach((b) => {
    b.disabled = true;
    if (b.textContent === p.answer) b.classList.add("ok");
    else if (b === btnEl && !ok) b.classList.add("ng");
  });

  recordAnswer(p.id, ok);
  vocabState.results[p.id] = ok ? "o" : "x";
  vocabState.index += 1;
  store.vocabSession = {
    date: todayStr(),
    ids: vocabState.ids,
    index: vocabState.index,
    results: vocabState.results,
    masteredBefore: vocabState.masteredBefore,
  };
  saveStore();

  document.getElementById("vocab-feedback-msg").textContent = ok
    ? "せいかい！🎉"
    : "おしい！正しい いみは…";
  document.getElementById("vocab-example").textContent = `れいぶん：${p.example}`;
  document.getElementById("vocab-feedback").classList.remove("hidden");
}

function nextVocabQuestion() {
  if (vocabState.index >= vocabState.ids.length) {
    finishVocabSession();
  } else {
    showVocabQuestion();
  }
}

/** ことばクイズの結果画面（漢字と同じ screen-result を再利用。streakは更新しない） */
function finishVocabSession() {
  const ids = vocabState.ids;
  const okCount = ids.filter((id) => vocabState.results[id] === "o").length;
  const total = ids.length;
  document.getElementById("result-score").textContent = `${okCount} / ${total}`;

  const ratio = total ? okCount / total : 0;
  let msg = "よくがんばったね！";
  if (ratio === 1) msg = "ことば全部せいかい！すごい！🎉";
  else if (ratio >= 0.7) msg = "いいちょうし！この調子！👍";
  else msg = "まちがえたことばは明日また出るよ。だいじょうぶ！";
  document.getElementById("result-msg").textContent = msg;
  document.getElementById("result-streak").textContent = "";

  // 達成メッセージ（新しくマスターしたことばの数だけを前向きに伝える）
  renderAchievement(vocabMasteredCount() - (vocabState.masteredBefore ?? vocabMasteredCount()), "ご");

  const wrong = ids
    .filter((id) => vocabState.results[id] === "x")
    .map((id) => vocabProblemById(id))
    .filter(Boolean);
  const wrongBox = document.getElementById("result-weak");
  if (wrong.length === 0) {
    wrongBox.innerHTML = '<p class="muted">今日はぜんぶ○！</p>';
  } else {
    wrongBox.innerHTML =
      "<p>今日まちがえたことば（明日また出ます）：</p><div class='kanji-row'>" +
      wrong.map((p) => `<span class="weak-kanji">${escapeHtml(p.word)}</span>`).join("") +
      "</div>";
  }
  document.getElementById("btn-vocab-start").classList.add("hidden");
  showScreen("result");
}

// ============================================================
// 取り込み・問題管理
// ============================================================

/** 連番のユニークIDを作る */
function makeImportId() {
  return "i-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4);
}

/** Geminiの出力に ``` や前後のゴミが混ざっても JSON 配列を取り出す */
function parseImportText(text) {
  let t = (text || "").trim();
  // ```json ... ``` のコードブロック記号を除去
  t = t.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "").trim();
  // 最初の [ から最後の ] までを抜き出す（前後の説明文対策）
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  const data = JSON.parse(t);
  if (!Array.isArray(data)) throw new Error("JSON配列ではありません");
  return data;
}

/** 1件の問題オブジェクトを検証・正規化（不正なら null） */
function normalizeProblem(obj) {
  if (!obj || typeof obj !== "object") return null;
  let { prompt, answer, reading, word } = obj;
  answer = (answer || "").toString().trim();
  reading = (reading || "").toString().trim();
  word = (word || "").toString().trim();
  prompt = (prompt || "").toString().trim();
  // 空欄記号のゆれを吸収（{__} / {**} / {  } など {…} を全て統一）
  if (prompt) prompt = window.ProblemFix.unifyBlank(prompt);
  if (!answer) return null; // 答えは必須

  // word が無ければ prompt から推測 / prompt が無ければ word から作る
  if (!word) word = prompt ? prompt.replace(BLANK_TOKEN, answer) : answer;
  if (!prompt) {
    // word の中の answer を {__} に置換して例文化（無ければ単体出題）
    prompt = word.includes(answer) ? word.replace(answer, BLANK_TOKEN) : answer + BLANK_TOKEN;
    if (!prompt.includes(BLANK_TOKEN)) prompt = BLANK_TOKEN; // 念のため
  }
  if (!window.ProblemFix.hasBlank(prompt)) return null; // 書く場所が無い問題は弾く

  return {
    id: makeImportId(),
    type: "write",
    grade: obj.grade || 4,
    prompt,
    answer,
    reading: reading || "",
    word,
    requireReview: true, // 取り込み＝苦手として最優先で出題
    createdAt: todayStr(),
  };
}

/** まとめて貼り付け取り込み。検査に掛かった行は取り込まず「たしかめて とりこむ」の列へ回す */
function importFromText(text) {
  let data;
  try {
    data = parseImportText(text);
  } catch (e) {
    return { ok: false, msg: "JSONを読み取れませんでした。Claudeの出力をそのまま貼り付けてください。" };
  }
  let added = 0;
  let skipped = 0;
  const held = [];
  for (const obj of data) {
    if (!obj || typeof obj !== "object") {
      skipped += 1;
      continue;
    }
    // 検査は正規化の前の生の行にかける（正規化は不正な行を黙って捨て、語を自動で作るため）
    if (window.ProblemFix.checkProblem(obj).length) {
      held.push(obj);
      continue;
    }
    const norm = normalizeProblem(obj);
    if (!norm || isDuplicateProblem(norm.prompt, norm.answer)) {
      skipped += 1; // 重複（同じ例文＋答え）はスキップ
      continue;
    }
    store.imported.push(norm);
    added += 1;
  }
  saveStore();
  addPending(held);
  return {
    ok: true,
    msg:
      `${added}問を取り込みました（最優先で出題します）。` +
      (held.length ? `${held.length}問は 下の「たしかめて とりこむ」で 直してから とりこめます。` : "") +
      (skipped ? "重複・不正で " + skipped + "問スキップ。" : ""),
  };
}

/** 取り込み済みに同じ例文＋答えがあるか（exceptId の問題は除く） */
function isDuplicateProblem(prompt, answer, exceptId) {
  return store.imported.some((p) => p.id !== exceptId && p.prompt === prompt && p.answer === answer);
}

/** 同梱の優先問題（priority_data.js）を初回だけ要復習として取り込む */
function seedPriorityOnce() {
  if (store.meta.prioritySeeded) return;
  const list = window.PRIORITY_PROBLEMS || [];
  for (const obj of list) {
    const norm = normalizeProblem(obj);
    if (!norm) continue;
    const dup = store.imported.some(
      (p) => p.prompt === norm.prompt && p.answer === norm.answer
    );
    if (dup) continue;
    store.imported.push(norm);
  }
  store.meta.prioritySeeded = true;
  saveStore();
}

/** 公開サイトの追加問題（inbox.json）を取り込む。同じidは一度だけ・最優先（要復習）で入れる */
async function importInboxOnce() {
  let data;
  try {
    const res = await fetch(INBOX_URL, { cache: "no-store" });
    if (!res.ok) return;
    data = await res.json();
  } catch (e) {
    return; // オフライン等は黙って次回に回す
  }
  const list = Array.isArray(data && data.problems) ? data.problems : [];
  // 取り込み済みの問題の直し（例文＋答えで当てる・id と学習記録は残る）
  const fixed = window.ProblemFix.applyFixes(store.imported, Array.isArray(data && data.fixes) ? data.fixes : []);
  const seen = new Set(store.meta.inboxSeen || []);
  let added = 0;
  let changed = false;
  for (const obj of list) {
    const id = obj && obj.id ? String(obj.id) : "";
    if (!id || seen.has(id)) continue;
    const norm = normalizeProblem(obj);
    if (!norm) continue; // 形式不正は記録せず、直されたら次回また試す
    const dup = store.imported.some((p) => p.prompt === norm.prompt && p.answer === norm.answer);
    if (!dup) {
      store.imported.push(norm);
      added += 1;
    }
    seen.add(id);
    changed = true;
  }
  if (!changed && fixed === 0) return;
  store.meta.inboxSeen = Array.from(seen);
  saveStore();
  // 出題中の画面を消さないよう、ホーム表示中だけ描き直す
  const home = document.getElementById("screen-home");
  if (added + fixed > 0 && home && !home.classList.contains("hidden")) renderHome();
}

let driveImportBusy = false; // 取り込み待ちの読み込み中（起動時と手動ボタンの重なり防止）

/** 受け口へ送って応答本文を返す（時間切れ・オフライン・非200は null） */
async function postToReceiver(req) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRIVE_TIMEOUT_MS);
  try {
    const res = await fetch(req.url, Object.assign({ signal: ctrl.signal }, req.options));
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ドライブの取り込み待ちファイル（claude.ai の写真変換スキルが置く）を取り込む。
 * 読めたファイルは id を driveImportSeen に入れてから importFromText に通し（同じ保存に乗る）、ゴミ箱へ送る。
 * 戻り値: {ok, msg, added, held, bad} または ドライブ未設定なら null
 */
async function importFromDrive() {
  const settings = DrillBackup.parseDriveSettings(safeGetDriveSync());
  if (!settings || driveImportBusy) return null;
  driveImportBusy = true;
  try {
    const text = await postToReceiver(DriveImport.buildListRequest(settings, BACKUP_APP_ID));
    const list = text === null ? { ok: false } : DriveImport.parseListResponse(text);
    if (!list.ok) return { ok: false, msg: "ドライブを よめませんでした。あとで もう一度 ためしてね。", added: 0, held: 0, bad: [] };
    const doneIds = [];
    const bad = list.skipped.slice();
    let added = 0;
    let held = 0;
    for (const f of list.files) {
      if ((store.meta.driveImportSeen || []).includes(f.id)) {
        doneIds.push(f.id); // 取り込み済みだがゴミ箱移動が失敗していた分
        continue;
      }
      try {
        parseImportText(f.content); // 先に解釈できるかだけ確かめる
      } catch (e) {
        bad.push(f.name); // 読めないファイルは消さず、記録もしない
        continue;
      }
      store.meta.driveImportSeen = DriveImport.rememberSeen(store.meta.driveImportSeen, f.id);
      const before = store.imported.length;
      const pendingBefore = loadPending().length;
      importFromText(f.content); // 中の saveStore() で driveImportSeen も一緒に保存される
      added += store.imported.length - before;
      held += loadPending().length - pendingBefore;
      doneIds.push(f.id);
    }
    if (doneIds.length) await postToReceiver(DriveImport.buildDoneRequest(settings, BACKUP_APP_ID, doneIds));
    const msg =
      (added || held ? `写真から ${added}問 とりこみました。` : "ドライブに 新しい問題は ありませんでした。") +
      (held ? `${held}問は ⚙の「たしかめて とりこむ」で たしかめてね。` : "") +
      (bad.length ? `よめない ファイル: ${bad.join("、")}` : "");
    return { ok: bad.length === 0, msg, added, held, bad }; // 読めないファイルがあれば赤で出す
  } finally {
    driveImportBusy = false;
  }
}

/** 起動時の取り込み。何か入った時だけホームに1行出す（出題中の画面は描き直さない） */
async function importFromDriveOnStart() {
  const res = await importFromDrive();
  if (!res || (res.added + res.held === 0 && res.bad.length === 0)) return;
  const note = document.getElementById("home-import-note");
  note.textContent = "📥 " + res.msg;
  note.className = "form-msg " + (res.ok ? "ok" : "ng");
  const home = document.getElementById("screen-home");
  if (home && !home.classList.contains("hidden")) renderHome();
}

/** 1問だけ手入力で追加 */
function addOneProblem(prompt, answer, reading, word) {
  const raw = { prompt, answer, reading, word };
  if (window.ProblemFix.checkProblem(raw).length) {
    addPending([raw]);
    return { ok: true, msg: "下の「たしかめて とりこむ」で たしかめてから とりこんでね。" };
  }
  const norm = normalizeProblem(raw);
  if (!norm) return { ok: false, msg: "「答え」と、{__}を含む例文を入れてください。" };
  store.imported.push(norm);
  saveStore();
  return { ok: true, msg: `「${norm.word}」を追加しました。` };
}

/** いまの問題数（分母）の内訳を描画（保護者向け・ホームには割合を出さない方針のため管理画面に置く） */
function renderManageSummary() {
  const el = document.getElementById("manage-summary");
  if (!el) return;
  const grade3 = (window.GRADE3_PROBLEMS || []).length;
  const seed = (window.SEED_PROBLEMS || []).length;
  const imported = store.imported.length;
  el.innerHTML =
    `<p>漢字 <strong>${masteredCount()} / ${allProblems().length}</strong> 字` +
    `<span class="muted small">（3年復習 ${grade3}・4年 ${seed}・とりこみ ${imported}）</span></p>` +
    `<p>ことば <strong>${vocabMasteredCount()} / ${allVocabProblems().length}</strong> 語</p>` +
    `<p class="muted small">とりこむほど分母も増えるため、ホーム画面には割合を出さず「おぼえた数」だけを表示しています。</p>`;
}

/** 取り込み問題の一覧を描画（⚠印・なおす・けす） */
function renderManageList() {
  renderManageSummary(); // 取り込み・削除のたびに呼ばれるので、問題数の内訳もここで一緒に更新する
  renderPendingList();
  const box = document.getElementById("manage-list");
  if (store.imported.length === 0) {
    box.innerHTML = '<p class="muted">取り込んだ問題はまだありません。</p>';
    return;
  }
  box.innerHTML = store.imported
    .map((p) => {
      if (p.id === manageEditingId) {
        return editorCardHtml(p, `data-edit-id="${escapeHtml(p.id)}"`, "ほぞん", "やめる");
      }
      const flag = p.requireReview ? "🔴要復習" : "学習中";
      const warn = window.ProblemFix.checkProblem(p).length ? '<span class="mi-warn">⚠</span>' : "";
      return (
        `<div class="manage-item">` +
        `<span class="mi-kanji">${escapeHtml(p.answer)}</span>` +
        `<span class="mi-word">${warn}${escapeHtml(p.word)}</span>` +
        `<span class="mi-flag muted">${flag}</span>` +
        `<button data-fix="${escapeHtml(p.id)}" class="mini-btn">なおす</button>` +
        `<button data-del="${escapeHtml(p.id)}" class="mini-btn">けす</button>` +
        `</div>`
      );
    })
    .join("");
  box.querySelectorAll("button[data-fix]").forEach((btn) => {
    btn.addEventListener("click", () => {
      manageEditingId = btn.getAttribute("data-fix");
      renderManageList();
    });
  });
  // 削除ボタン
  box.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      store.imported = store.imported.filter((p) => p.id !== id);
      delete store.progress[id];
      saveStore();
      renderManageList();
    });
  });
  box.querySelectorAll(".edit-card").forEach((card) => {
    bindEditorCard(card, (values) => saveEditedProblem(card.getAttribute("data-edit-id"), values), () => {
      manageEditingId = null;
      renderManageList();
    });
  });
}

// --- 編集カード（たしかめて とりこむ／取り込み済みを なおす） ---------------------
let manageEditingId = null; // 一覧で なおしている問題の id

/** 未取り込みの列を読む（記録とは別キー・バックアップ対象外） */
function loadPending() {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/** 未取り込みの列を書く（空なら消す） */
function savePending(list) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    // 保存できない環境でも取り込み自体は続ける
  }
}

/** 生の行を、編集カード用の4項目（＋並びの鍵）にして列へ足す */
function addPending(rows) {
  if (!rows.length) return;
  const text = (v) => (v === undefined || v === null ? "" : String(v));
  const list = loadPending();
  rows.forEach((r) =>
    list.push({ key: makeImportId(), prompt: text(r.prompt), answer: text(r.answer), reading: text(r.reading), word: text(r.word) })
  );
  savePending(list);
}

/** 編集カードのHTML（4つの欄・見え方の見本・指摘・ボタン） */
function editorCardHtml(v, attr, saveLabel, cancelLabel) {
  const field = (name, label) =>
    `<label>${label}<input type="text" data-field="${name}" value="${escapeHtml(v[name] || "")}" /></label>`;
  return (
    `<div class="edit-card" ${attr}>` +
    `<div class="edit-preview"></div>` +
    field("prompt", "れいぶん（書く場所は {__}）") +
    field("answer", "答えの かんじ") +
    field("reading", "読み") +
    field("word", "こたえの ことば") +
    `<ul class="edit-issues"></ul>` +
    `<div class="edit-buttons"><button class="mid-btn primary" data-act="save">${saveLabel}</button>` +
    `<button class="mini-btn" data-act="cancel">${cancelLabel}</button></div>` +
    `<p class="form-msg"></p>` +
    `</div>`
  );
}

/** カードの欄の値 */
function cardValues(card) {
  const v = {};
  card.querySelectorAll("input[data-field]").forEach((el) => (v[el.getAttribute("data-field")] = el.value));
  return v;
}

/** 入力のたびに検査し直し、見本・指摘・保存ボタンを更新する */
function refreshEditorCard(card) {
  const v = cardValues(card);
  const issues = window.ProblemFix.checkProblem(v);
  const prompt = window.ProblemFix.unifyBlank(v.prompt.trim());
  const promptHtml = escapeHtml(prompt).replace(escapeHtml(BLANK_TOKEN), buildBlankHtml(v.answer.trim()));
  card.querySelector(".edit-preview").innerHTML =
    `<div class="muted small">${escapeHtml(v.reading.trim())}</div><div class="prompt">${promptHtml}</div>`;
  card.querySelector(".edit-issues").innerHTML = issues.length
    ? issues.map((x) => `<li class="${x.level}">${x.level === "stop" ? "⛔" : "⚠"} ${escapeHtml(x.msg)}</li>`).join("")
    : '<li class="ok">✅ もんだい ありません</li>';
  card.querySelector('[data-act="save"]').disabled = window.ProblemFix.hasStop(issues);
}

/** カードに入力・保存・取り消しを結線する。onSave は {ok,msg} を返す */
function bindEditorCard(card, onSave, onCancel) {
  card.querySelectorAll("input[data-field]").forEach((el) => el.addEventListener("input", () => refreshEditorCard(card)));
  card.querySelector('[data-act="save"]').addEventListener("click", () => {
    const res = onSave(cardValues(card));
    if (!res.ok) {
      const msg = card.querySelector(".form-msg");
      msg.textContent = res.msg;
      msg.className = "form-msg ng";
    }
  });
  card.querySelector('[data-act="cancel"]').addEventListener("click", onCancel);
  refreshEditorCard(card);
}

/** 「たしかめて とりこむ」の列を描画 */
function renderPendingList() {
  const list = loadPending();
  document.getElementById("pending-panel").classList.toggle("hidden", list.length === 0);
  const box = document.getElementById("pending-list");
  box.innerHTML = list.map((v) => editorCardHtml(v, `data-key="${escapeHtml(v.key)}"`, "とりこむ", "すてる")).join("");
  box.querySelectorAll(".edit-card").forEach((card) => {
    const key = card.getAttribute("data-key");
    bindEditorCard(card, (values) => importPendingItem(key, values), () => {
      if (!confirm("この問題を すてますか？")) return;
      savePending(loadPending().filter((x) => x.key !== key));
      renderPendingList();
    });
  });
}

/** 列の1問を取り込む（直した値で） */
function importPendingItem(key, values) {
  if (window.ProblemFix.hasStop(window.ProblemFix.checkProblem(values))) return { ok: false, msg: "⛔の ところを 直してください。" };
  const norm = normalizeProblem(values);
  if (!norm) return { ok: false, msg: "例文と 答えを たしかめてください。" };
  if (isDuplicateProblem(norm.prompt, norm.answer)) return { ok: false, msg: "同じ問題が もう あります。" };
  store.imported.push(norm);
  saveStore();
  savePending(loadPending().filter((x) => x.key !== key));
  renderManageList();
  return { ok: true, msg: "" };
}

/** 取り込み済みの問題を直す（id・学習記録・要復習の印は残す） */
function saveEditedProblem(id, values) {
  if (window.ProblemFix.hasStop(window.ProblemFix.checkProblem(values))) return { ok: false, msg: "⛔の ところを 直してください。" };
  const p = store.imported.find((x) => x.id === id);
  if (!p) return { ok: false, msg: "問題が 見つかりません。" };
  const prompt = window.ProblemFix.unifyBlank(values.prompt.trim());
  const answer = values.answer.trim();
  if (isDuplicateProblem(prompt, answer, id)) return { ok: false, msg: "同じ問題が もう あります。" };
  p.prompt = prompt;
  p.answer = answer;
  p.reading = values.reading.trim();
  p.word = values.word.trim() || prompt.replace(BLANK_TOKEN, answer);
  saveStore();
  manageEditingId = null;
  renderManageList();
  return { ok: true, msg: "" };
}

// --- バックアップ兼きろく（保存 / 復元） ---------------------
/** ことばの苦手リスト（間違い回数の多い順・箱4未満）。漢字の weakList と対になる語彙版 */
function vocabWeakList(limit = WEAK_TOP_N) {
  return Object.entries(store.progress)
    .filter(([id, c]) => id.startsWith("v-") && c.wrongCount > 0 && c.box < 4)
    .sort((a, b) => b[1].wrongCount - a[1].wrongCount)
    .slice(0, limit)
    .map(([id, c]) => ({ p: vocabProblemById(id), c }))
    .filter((x) => x.p);
}

/** Claude が読む要約（できた数・苦手上位・連続日数・最終学習日） */
function buildBackupSummary() {
  return {
    masteredCount: masteredCount(),
    totalCount: allProblems().length,
    vocabMasteredCount: vocabMasteredCount(),
    vocabTotalCount: allVocabProblems().length,
    weakKanji: weakList(WEAK_TOP_N).map((x) => ({
      id: x.p.id,
      prompt: x.p.prompt,
      answer: x.p.answer,
      word: x.p.word,
      wrongCount: x.c.wrongCount,
      box: x.c.box,
    })),
    weakVocab: vocabWeakList(WEAK_TOP_N).map((x) => ({
      id: x.p.id,
      word: x.p.word,
      wrongCount: x.c.wrongCount,
      box: x.c.box,
    })),
    streak: store.meta.streak || 0,
    lastStudyDate: store.meta.lastStudyDate || null,
  };
}

function setBackupStatus(id, text, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = "form-msg " + (ok ? "ok" : "ng");
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/** 保存の結果を、ホームと管理画面の両方の表示欄に出す */
function showBackupStatus(text, ok = true) {
  setBackupStatus("home-backup-status", text, ok);
  setBackupStatus("backup-status", text, ok);
}

let fileFallbackPending = false; // ドライブ送信に失敗済み＝次のタップで共有/ダウンロードを開く
let driveBusy = false; // ドライブ送信中の二重タップ防止

/** 受け口へ送って ok:true を読めた時だけ true を返す（時間切れ・オフライン・非200・壊れた応答は false）。 */
async function sendToDrive(settings, backup, kind) {
  const req = DrillBackup.buildDriveRequest(settings, backup, kind);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRIVE_TIMEOUT_MS);
  try {
    const res = await fetch(req.url, Object.assign({ signal: ctrl.signal }, req.options));
    if (!res.ok) return false;
    return DrillBackup.parseDriveResponse(await res.text()).ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 保存結果の後始末（保存日を記録し、促しを更新する）。成功した時だけ呼ぶ */
function finishBackup(msg) {
  showBackupStatus(msg);
  setLastBackup();
  updateBackupReminder(todayStr());
}

/** 従来の経路（共有シート → 不可・失敗ならダウンロード）。挙動は変えない。 */
async function saveBackupAsFile(file) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      finishBackup(MSG_BACKUP_SHARED);
    } else {
      downloadFile(file);
      finishBackup(MSG_BACKUP_DOWNLOADED);
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // とちゅうで やめた
    try {
      downloadFile(file);
      finishBackup(MSG_BACKUP_DOWNLOADED);
    } catch (e2) {
      showBackupStatus(MSG_BACKUP_FAILED, false);
    }
  }
}

/** ドライブ設定済みなら送信。失敗時は保存日の記録も共有も行わず、次のタップで従来経路へ。 */
async function saveBackupToDrive(settings, backup) {
  driveBusy = true;
  showBackupStatus("ドライブに ほぞんしています…");
  try {
    if (await sendToDrive(settings, backup, "backup")) {
      fileFallbackPending = false;
      finishBackup(MSG_DRIVE_OK);
    } else {
      fileFallbackPending = true;
      showBackupStatus(MSG_DRIVE_FAILED, false);
    }
  } finally {
    driveBusy = false;
  }
}

/** きろくを保存する（ドライブ設定済みなら受け口へ。未設定・失敗の次のタップは共有シート/ダウンロード） */
async function saveBackup() {
  if (driveBusy) return;
  const today = todayStr();
  const backup = DrillBackup.buildBackup({
    appId: BACKUP_APP_ID,
    appVersion: APP_VERSION,
    today,
    summary: buildBackupSummary(),
    state: store,
  });
  const file = new File([JSON.stringify(backup, null, 2)], DrillBackup.backupFileName(BACKUP_APP_ID, today), {
    type: "application/json",
  });
  const settings = DrillBackup.parseDriveSettings(safeGetDriveSync());
  if (!settings || fileFallbackPending) {
    // 未設定、または直前のドライブ送信が失敗＝今のタップで従来経路を開く
    fileFallbackPending = false;
    await saveBackupAsFile(file);
    return;
  }
  await saveBackupToDrive(settings, backup);
}

// ---- ドライブの設定欄 ----

/** 設定の生文字列を読む（読めなければ null） */
function safeGetDriveSync() {
  try {
    return localStorage.getItem(DRIVE_SYNC_KEY);
  } catch (e) {
    return null;
  }
}

function setDriveStatus(text, ok = true) {
  setBackupStatus("drive-status", text, ok);
}

function loadDriveForm() {
  const s = DrillBackup.parseDriveSettings(safeGetDriveSync());
  document.getElementById("drive-url").value = s ? s.url : "";
  document.getElementById("drive-token").value = s ? s.token : "";
}

function readDriveForm() {
  return DrillBackup.parseDriveSettings(
    JSON.stringify({
      url: document.getElementById("drive-url").value,
      token: document.getElementById("drive-token").value,
    }),
  );
}

function saveDriveSettings() {
  const s = readDriveForm();
  if (!s) {
    setDriveStatus("URLか あいことばが ただしくありません。ほぞんしませんでした", false);
    return;
  }
  try {
    localStorage.setItem(DRIVE_SYNC_KEY, JSON.stringify(s));
  } catch (e) {
    setDriveStatus("せっていを ほぞんできませんでした", false);
    return;
  }
  fileFallbackPending = false;
  setDriveStatus("せっていを ほぞんしました");
}

/** 本物のバックアップを kind:"test" で送る（latest を汚さない） */
async function testDrive() {
  if (driveBusy) return;
  const s = readDriveForm();
  if (!s) {
    setDriveStatus("URLか あいことばが ただしくありません", false);
    return;
  }
  driveBusy = true;
  setDriveStatus("ためしています…");
  try {
    const backup = DrillBackup.buildBackup({
      appId: BACKUP_APP_ID,
      appVersion: APP_VERSION,
      today: todayStr(),
      summary: buildBackupSummary(),
      state: store,
    });
    const ok = await sendToDrive(s, backup, "test");
    setDriveStatus(ok ? "ためしに ほぞんできました" : "ためしに ほぞんできませんでした", ok);
  } finally {
    driveBusy = false;
  }
}

/** バックアップ側の store から、loadStore と同じ補い方で新しい store を組み立てる（inboxSeen は合算しない） */
function storeFromBackup(src) {
  const init = {
    meta: {
      streak: 0,
      lastStudyDate: null,
      lastBackup: null,
      settings: { dailyCount: DEFAULT_DAILY, newPerDay: DEFAULT_NEW_PER_DAY },
    },
  };
  return {
    imported: src.imported || [],
    progress: src.progress || {},
    meta: Object.assign(init.meta, src.meta || {}),
    session: src.session || null,
    vocabSession: src.vocabSession || null,
  };
}

/** 検証済みの store を適用する（退避に成功してから呼ぶ） */
function applyRestoredStore(src) {
  store = storeFromBackup(src);
  saveStore();
  setLastBackup();
  quizState = null;
  vocabState = null;
  importInboxOnce(); // バックアップ後に inbox へ足された問題を、重複なしで取り込み直す
  renderHome();
}

/** バックアップファイルのテキストから復元する（検証 → 確認 → 退避 → 適用） */
function restoreFromText(text) {
  const res = DrillBackup.parseBackup(text, BACKUP_APP_ID);
  if (!res.ok) {
    setBackupStatus("restore-msg", MSG_RESTORE_BAD_FILE, false);
    return;
  }
  if (!confirm(MSG_RESTORE_CONFIRM)) return;
  // 現記録があるのに退避できなかった時だけ中止する（記録が空の端末では退避を飛ばして復元できる）
  const arch = DrillBackup.archiveCurrentRecord(localStorage, STORE_KEY, RESTORE_KEY_PREFIX, todayStr());
  if (!arch.ok) {
    setBackupStatus("restore-msg", MSG_RESTORE_ARCHIVE_FAILED, false);
    return;
  }
  applyRestoredStore(res.state);
  showBackupStatus(MSG_RESTORE_DONE); // 復元後はホームへ戻るので、ホームの表示欄にも出す
}

// ============================================================
// 共通ユーティリティ
// ============================================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flashMsg(elId, result) {
  const el = document.getElementById(elId);
  el.textContent = result.msg;
  el.className = "form-msg " + (result.ok ? "ok" : "ng");
}

// ============================================================
// イベント結線・初期化
// ============================================================
/** 管理画面（とりこみ・せってい・バックアップ）を開く */
function openManage() {
  manageEditingId = null;
  renderManageList();
  document.getElementById("import-msg").textContent = "";
  document.getElementById("add-msg").textContent = "";
  // 新出ペースの選択を現在値に合わせる
  document.getElementById("setting-newperday").value = String(
    store.meta.settings.newPerDay ?? DEFAULT_NEW_PER_DAY
  );
  showScreen("manage");
}

function bindEvents() {
  // ホーム
  document.getElementById("btn-start").addEventListener("click", startSession);
  document.getElementById("btn-manage").addEventListener("click", openManage);
  document.getElementById("btn-vocab-home").addEventListener("click", startVocabSession);
  // 「きろくを ほぞん」と促しバナーのタップは、どちらも保存を直接実行する
  document.getElementById("btn-backup-home").addEventListener("click", saveBackup);
  document.getElementById("home-backup-reminder").addEventListener("click", saveBackup);
  // 新出ペースの変更
  document.getElementById("setting-newperday").addEventListener("change", (e) => {
    store.meta.settings.newPerDay = parseInt(e.target.value, 10) || DEFAULT_NEW_PER_DAY;
    saveStore();
  });

  // クイズ
  document.getElementById("btn-reveal").addEventListener("click", revealAnswer);
  document.getElementById("btn-correct").addEventListener("click", () => gradeCurrent(true));
  document.getElementById("btn-wrong").addEventListener("click", () => gradeCurrent(false));
  document.getElementById("btn-quit").addEventListener("click", renderHome);

  // 結果
  document.getElementById("btn-home").addEventListener("click", renderHome);
  document.getElementById("btn-vocab-start").addEventListener("click", startVocabSession);

  // ことばクイズ
  document.getElementById("btn-vocab-quit").addEventListener("click", renderHome);
  document.getElementById("btn-vocab-next").addEventListener("click", nextVocabQuestion);

  // 管理: ドライブの取り込み待ちを手で読む
  document.getElementById("btn-drive-import").addEventListener("click", async () => {
    const msgEl = document.getElementById("drive-import-msg");
    msgEl.textContent = "ドライブを よんでいます…";
    msgEl.className = "form-msg";
    const res = await importFromDrive();
    if (!res) {
      flashMsg("drive-import-msg", { ok: false, msg: "下の「ドライブの せってい」が まだです（またはよみこみ中）。" });
      return;
    }
    flashMsg("drive-import-msg", res);
    renderManageList();
    renderPendingList();
  });
  // 管理: 取り込み
  document.getElementById("btn-import").addEventListener("click", () => {
    const text = document.getElementById("import-text").value;
    const res = importFromText(text);
    flashMsg("import-msg", res);
    if (res.ok) {
      document.getElementById("import-text").value = "";
      renderManageList();
    }
  });
  // 管理: 1問追加
  document.getElementById("btn-add").addEventListener("click", () => {
    const res = addOneProblem(
      document.getElementById("add-prompt").value,
      document.getElementById("add-answer").value,
      document.getElementById("add-reading").value,
      document.getElementById("add-word").value
    );
    flashMsg("add-msg", res);
    if (res.ok) {
      ["add-prompt", "add-answer", "add-reading", "add-word"].forEach(
        (id) => (document.getElementById(id).value = "")
      );
      renderManageList();
    }
  });
  // 管理: バックアップ
  document.getElementById("btn-export").addEventListener("click", saveBackup);
  document.getElementById("drive-save").addEventListener("click", saveDriveSettings);
  document.getElementById("drive-test").addEventListener("click", testDrive);
  document.getElementById("restore-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => restoreFromText(String(reader.result));
    reader.onerror = () => setBackupStatus("restore-msg", MSG_RESTORE_READ_FAILED, false);
    reader.readAsText(file);
    e.target.value = ""; // 同じファイルをもう一度選べるように
  });
  document.getElementById("btn-back").addEventListener("click", renderHome);
}

function main() {
  seedPriorityOnce(); // 同梱の優先問題を初回だけ投入
  importInboxOnce(); // 公開サイトの追加問題を取り込む（失敗しても無視）
  importFromDriveOnStart(); // ドライブの取り込み待ち（写真から）を取り込む（未設定・失敗なら何もしない）
  bindEvents();
  loadDriveForm();
  renderHome();

  // ストレージ永続化を要求（iOS の自動削除を受けにくくする。失敗しても動作に影響なし）
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // PWA: service worker 登録（http/https 環境のみ。file:// では何もしない）
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    // すでに制御中のSWがあった状態から controller が変わった場合だけ「更新」とみなす
    // （初回インストール時も controllerchange は発火するが、それは更新ではないので除外する）
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadControllerAtLoad) return;
      const btn = document.getElementById("home-update-banner");
      if (!btn) return;
      btn.classList.remove("hidden");
      btn.onclick = () => location.reload();
    });
    navigator.serviceWorker
      .register("sw.js")
      // 自動更新チェックは最大24時間に1回しか走らない仕様のため、起動のたび明示的に即チェックする
      .then((reg) => reg.update().catch(() => {}))
      .catch((e) => console.warn("SW登録失敗", e));
  }
}

document.addEventListener("DOMContentLoaded", main);
