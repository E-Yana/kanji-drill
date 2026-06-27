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
// Leitner の箱ごとの「次に出すまでの日数」（箱が上がるほど間隔が伸びる）
const INTERVALS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 15 };
const MAX_BOX = 5;
const BLANK_TOKEN = "{__}"; // 例文中の「書く場所」を表す印

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

// --- ストア（永続化） ----------------------------------------
let store = loadStore();

/** localStorage から状態を読み込む（無ければ初期値） */
function loadStore() {
  const init = {
    imported: [], // 取り込んだ問題
    progress: {}, // 問題ID -> 習熟度カード
    meta: {
      streak: 0,
      lastStudyDate: null,
      settings: { dailyCount: DEFAULT_DAILY, newPerDay: DEFAULT_NEW_PER_DAY },
    },
    session: null, // 当日セッション（途中再開用）
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
/**
 * 今日出す問題IDの配列を作る（段階化＋新出キャップ）。
 *   1. 復習（既出で期限到来）を優先（要復習→箱小→間違い多い順）
 *   2. 新規の tier0（優先問題）をキャップなしで詰める
 *   3. 新規の tier1→tier2 を、合計 newPerDay 問まで詰める（3年→4年の順、4年は当面出ない）
 *   4. 全体を dailyCount で切る
 */
function buildQueue() {
  const today = todayStr();
  const dailyCount = store.meta.settings.dailyCount || DEFAULT_DAILY;
  const newPerDay = store.meta.settings.newPerDay ?? DEFAULT_NEW_PER_DAY;

  const pool = allProblems().map((p, idx) => ({ p, c: getCard(p.id), tier: tierOf(p), idx }));

  // 1. 復習（履歴あり & 期限到来）
  const reviews = pool
    .filter((x) => x.c.history.length > 0 && x.c.dueDate <= today)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier; // 優先層を先に
      if (a.c.box !== b.c.box) return a.c.box - b.c.box; // 苦手(箱小)を先に
      return b.c.wrongCount - a.c.wrongCount; // 間違い回数が多い順
    });

  // 2-3. 新規（未学習）。tier昇順→配列順で安定的に並べる
  const fresh = pool
    .filter((x) => x.c.history.length === 0)
    .sort((a, b) => a.tier - b.tier || a.idx - b.idx);
  const freshPriority = fresh.filter((x) => x.tier === 0); // 優先問題＝キャップなし
  const freshBanks = fresh.filter((x) => x.tier > 0).slice(0, newPerDay); // 復習/4年＝1日 newPerDay 問まで

  const ordered = [...reviews, ...freshPriority, ...freshBanks];
  return ordered.slice(0, dailyCount).map((x) => x.p.id);
}

// --- 回答の記録（SRS更新） -----------------------------------
/** 自己採点の結果を記録し、箱と次回期限を更新する */
function recordAnswer(id, ok) {
  const c = JSON.parse(JSON.stringify(getCard(id))); // コピーして更新
  c.history.push({ date: todayStr(), result: ok ? "o" : "x" });
  if (ok) {
    c.rightCount += 1;
    c.box = Math.min(c.box + 1, MAX_BOX);
  } else {
    c.wrongCount += 1;
    c.box = 1; // 間違えたら箱1へ戻す＝翌日また出る
  }
  c.dueDate = addDays(todayStr(), INTERVALS[c.box]);
  store.progress[id] = c;

  // 取り込んだ要復習フラグは、1回できたら解除（以後は通常のSRSに乗せる）
  if (ok) {
    const imp = store.imported.find((p) => p.id === id);
    if (imp && imp.requireReview) imp.requireReview = false;
  }
  saveStore();
}

// --- 統計 -----------------------------------------------------
/** マスター数（箱4以上）を数える */
function masteredCount() {
  return Object.values(store.progress).filter((c) => c.box >= 4).length;
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
const screens = ["home", "quiz", "result", "manage"];
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
  showScreen("home");
}

// --- クイズ画面 ----------------------------------------------
let quizState = null; // {ids, index, results:{}}

/** セッションを開始（途中なら再開、完了済みなら作り直し） */
function startSession() {
  const today = todayStr();
  const s = store.session;
  if (s && s.date === today && s.index < s.ids.length) {
    // 途中再開
    quizState = { ids: s.ids, index: s.index, results: s.results || {} };
  } else {
    // 新規（または当日完了後のふくしゅう）
    const ids = buildQueue();
    if (ids.length === 0) {
      renderHome();
      return;
    }
    quizState = { ids, index: 0, results: {} };
    store.session = { date: today, ids, index: 0, results: {} };
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
  if (prompt) prompt = prompt.replace(/\{[^}]*\}/g, BLANK_TOKEN);
  if (!answer) return null; // 答えは必須

  // word が無ければ prompt から推測 / prompt が無ければ word から作る
  if (!word) word = prompt ? prompt.replace(BLANK_TOKEN, answer) : answer;
  if (!prompt) {
    // word の中の answer を {__} に置換して例文化（無ければ単体出題）
    prompt = word.includes(answer) ? word.replace(answer, BLANK_TOKEN) : answer + BLANK_TOKEN;
    if (!prompt.includes(BLANK_TOKEN)) prompt = BLANK_TOKEN; // 念のため
  }
  if (!prompt.includes(BLANK_TOKEN)) return null; // 書く場所が無い問題は弾く

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

/** まとめて貼り付け取り込み */
function importFromText(text) {
  let data;
  try {
    data = parseImportText(text);
  } catch (e) {
    return { ok: false, msg: "JSONを読み取れませんでした。Geminiの出力をそのまま貼り付けてください。" };
  }
  let added = 0;
  let skipped = 0;
  for (const obj of data) {
    const norm = normalizeProblem(obj);
    if (!norm) {
      skipped += 1;
      continue;
    }
    // 重複（同じ例文＋答え）はスキップ
    const dup = store.imported.some(
      (p) => p.prompt === norm.prompt && p.answer === norm.answer
    );
    if (dup) {
      skipped += 1;
      continue;
    }
    store.imported.push(norm);
    added += 1;
  }
  saveStore();
  return {
    ok: true,
    msg: `${added}問を取り込みました（最優先で出題します）。${skipped ? "重複・不正で " + skipped + "問スキップ。" : ""}`,
  };
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

/** 1問だけ手入力で追加 */
function addOneProblem(prompt, answer, reading, word) {
  const norm = normalizeProblem({ prompt, answer, reading, word });
  if (!norm) return { ok: false, msg: "「答え」と、{__}を含む例文を入れてください。" };
  store.imported.push(norm);
  saveStore();
  return { ok: true, msg: `「${norm.word}」を追加しました。` };
}

/** 取り込み問題の一覧を描画（個別削除つき） */
function renderManageList() {
  const box = document.getElementById("manage-list");
  if (store.imported.length === 0) {
    box.innerHTML = '<p class="muted">取り込んだ問題はまだありません。</p>';
    return;
  }
  box.innerHTML = store.imported
    .map((p) => {
      const flag = p.requireReview ? "🔴要復習" : "学習中";
      return (
        `<div class="manage-item">` +
        `<span class="mi-kanji">${escapeHtml(p.answer)}</span>` +
        `<span class="mi-word">${escapeHtml(p.word)}</span>` +
        `<span class="mi-flag muted">${flag}</span>` +
        `<button data-del="${p.id}" class="mini-btn">けす</button>` +
        `</div>`
      );
    })
    .join("");
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
}

// --- バックアップ（エクスポート / 復元） ---------------------
function exportData() {
  const blob = new Blob([JSON.stringify(store, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kanji_drill_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function restoreData(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("不正なデータ");
    store = {
      imported: parsed.imported || [],
      progress: parsed.progress || {},
      meta: parsed.meta || { streak: 0, lastStudyDate: null, settings: { dailyCount: DEFAULT_DAILY } },
      session: parsed.session || null,
    };
    saveStore();
    return { ok: true, msg: "進捗を復元しました。" };
  } catch (e) {
    return { ok: false, msg: "復元に失敗しました。バックアップJSONを確認してください。" };
  }
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
function bindEvents() {
  // ホーム
  document.getElementById("btn-start").addEventListener("click", startSession);
  document.getElementById("btn-manage").addEventListener("click", () => {
    renderManageList();
    document.getElementById("import-msg").textContent = "";
    document.getElementById("add-msg").textContent = "";
    // 新出ペースの選択を現在値に合わせる
    document.getElementById("setting-newperday").value = String(
      store.meta.settings.newPerDay ?? DEFAULT_NEW_PER_DAY
    );
    showScreen("manage");
  });
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
  document.getElementById("btn-export").addEventListener("click", exportData);
  document.getElementById("restore-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = restoreData(reader.result);
      flashMsg("restore-msg", res);
      if (res.ok) renderManageList();
    };
    reader.readAsText(file);
  });
  document.getElementById("btn-back").addEventListener("click", renderHome);
}

function main() {
  seedPriorityOnce(); // 同梱の優先問題を初回だけ投入
  bindEvents();
  renderHome();

  // PWA: service worker 登録（http/https 環境のみ。file:// では何もしない）
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW登録失敗", e));
  }
}

document.addEventListener("DOMContentLoaded", main);
