/**
 * 問題文の形の検査と、端末に取り込み済みの問題への直しの適用（DOM・store・window に触れない純関数だけ）。
 * ブラウザでは window.ProblemFix、node では module.exports に公開する。
 * 取り込み済みの問題は端末ごとに id が違うため、直しは「例文＋答え」の完全一致で当てる。
 */
(function (root) {
  "use strict";

  // ---- 定数 ----
  var BLANK_TOKEN = "{__}"; // 例文中の「書く場所」を表す印
  var FIXABLE_KEYS = ["prompt", "answer", "reading", "word"]; // 直しで上書きしてよい項目
  var PUNCT_RE = /[。、]/g; // 語の一致を見る時に無視する句読点

  /** 空欄記号のゆれを吸収（{__} / {**} / {  } など {…} と、写真変換スキルの (__)・（＿＿）を全て統一） */
  function unifyBlank(prompt) {
    return String(prompt || "")
      .replace(/\{[^}]*\}/g, BLANK_TOKEN)
      .replace(/[(（][_＿]+[)）]/g, BLANK_TOKEN);
  }

  /** 書く場所（{__}）がある例文か */
  function hasBlank(prompt) {
    return String(prompt || "").indexOf(BLANK_TOKEN) !== -1;
  }

  var KANJI_ONLY_RE = /^[一-鿿々]+$/;
  var HIRA_ONLY_RE = /^[ぁ-ゖ]+$/;
  var ANSWER_RE = /^[一-鿿々]+[ぁ-ゖ]*$/; // 漢字＋末尾の送りがな
  var READING_RE = /^[ぁ-ゖー]+$/;
  var THIN_RE = /^[ぁ-ゖ]{0,2}$/; // 空欄と句読点を除いた残りがこれなら手がかりが薄い
  var STOP = "stop"; // 直すまで取り込めない
  var WARN = "warn"; // 確かめれば そのまま取り込める

  function str(v) {
    return v === undefined || v === null ? "" : String(v).trim();
  }

  /** 1件の指摘 */
  function issue(rule, level, msg) {
    return { rule: rule, level: level, msg: msg };
  }

  /**
   * 1問（正規化する前の生の行でよい）を検査し、指摘の一覧を返す。空なら問題なし。
   * 段階: stop＝直すまで取り込めない／warn＝確かめれば取り込める（かな交じり「衣ふく」等の誤検知を通すため）。
   * ⚠️ 学年外の漢字は見ない（配当表のデータが無いため）。
   */
  function checkProblem(raw) {
    var p = raw && typeof raw === "object" ? raw : {};
    var prompt = unifyBlank(str(p.prompt));
    var answer = str(p.answer);
    var reading = str(p.reading);
    var word = str(p.word);
    var out = [];

    var blanks = prompt.split(BLANK_TOKEN).length - 1;
    if (!prompt) out.push(issue("prompt_empty", STOP, "例文がありません"));
    else if (blanks === 0) out.push(issue("blank_missing", STOP, "書く場所 {__} がありません"));
    else if (blanks > 1) out.push(issue("blank_many", STOP, "書く場所 {__} が2つ以上あります"));
    if (!answer) out.push(issue("answer_empty", STOP, "答えがありません"));
    else if (!ANSWER_RE.test(answer)) out.push(issue("answer_chars", STOP, "答えは 漢字（＋送りがな）だけにしてください"));
    if (!READING_RE.test(reading)) out.push(issue("reading_chars", STOP, "読みを ひらがなで 入れてください"));
    if (!word) out.push(issue("word_empty", WARN, "答え合わせの ことばが ありません（例文から 自動で作ります）"));
    if (out.some(function (x) { return x.level === STOP; }) || !word) return out;

    var ansKanji = answer.replace(/[ぁ-ゖ]+$/, "");
    var ansKana = answer.slice(ansKanji.length);
    if (word.indexOf(ansKanji) === -1) {
      out.push(issue("answer_not_in_word", STOP, "ことば「" + word + "」に 答えの漢字「" + ansKanji + "」が入っていません"));
      return out;
    }

    var filledRaw = prompt.replace(BLANK_TOKEN, answer);
    var filled = filledRaw.replace(PUNCT_RE, "");
    var after = prompt.slice(prompt.indexOf(BLANK_TOKEN) + BLANK_TOKEN.length);
    if (filled.indexOf(word.replace(PUNCT_RE, "")) === -1) {
      var rest = word.slice(ansKanji.length);
      if (word.indexOf(ansKanji) === 0 && HIRA_ONLY_RE.test(rest)) {
        // 語＝答えの漢字＋ひらがな：空欄の直後に送りがながそろっているか
        var need = rest.indexOf(ansKana) === 0 ? rest.slice(ansKana.length) : rest;
        var nextKana = (after.match(/^[ぁ-ゖ]+/) || [""])[0];
        var head = need.slice(0, -1);
        if (need && (!nextKana || (head && after.indexOf(head) !== 0))) {
          out.push(issue("okuri_missing", STOP,
            "送りがなが たりません：文が「" + filledRaw + "」になり、「" + word + "」の「" + need + "」が そろっていません"));
          return out;
        }
      }
      out.push(issue("word_mismatch", WARN,
        "答えを入れると「" + filledRaw + "」になり、「" + word + "」が見当たりません（かな交じりの文なら このままでOK）"));
    }
    if (KANJI_ONLY_RE.test(word) &&
        new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "す(。|、|$)").test(filledRaw)) {
      out.push(issue("extra_su", WARN, "「" + word + "す」になっています。「" + word + "する」では？"));
    }
    if (THIN_RE.test(prompt.replace(BLANK_TOKEN, "").replace(PUNCT_RE, ""))) {
      out.push(issue("thin_context", WARN, "手がかりが少ない文です（「店を{__}する」のように 前に ことばを足すと わかりやすい）"));
    }
    return out;
  }

  /** 指摘に「止める」が含まれるか */
  function hasStop(issues) {
    return (issues || []).some(function (x) { return x.level === STOP; });
  }

  /** 指摘のある問題だけを返す（検査コマンド・一覧の⚠印用） */
  function findSuspicious(list) {
    return (list || []).filter(function (p) { return checkProblem(p).length > 0; });
  }

  /** 1件の直しを検査し、使える形（{match, set}）にして返す。不正なら null */
  function normalizeFix(fix) {
    if (!fix || typeof fix !== "object") return null;
    var m = fix.match || {};
    var prompt = unifyBlank(m.prompt).trim();
    var answer = String(m.answer || "").trim();
    if (!prompt || !answer) return null;
    var set = {};
    var n = 0;
    FIXABLE_KEYS.forEach(function (k) {
      if (fix.set && typeof fix.set[k] === "string") {
        set[k] = fix.set[k].trim();
        n += 1;
      }
    });
    if (n === 0) return null;
    return { match: { prompt: prompt, answer: answer }, set: set };
  }

  /**
   * 取り込み済みの問題（配列）に直しを当てる。配列の要素をその場で書き換え、直した件数を返す。
   * id・要復習の印・作成日には触れない（学習記録は id で引かれるので残る）。
   * 直した後は一致しなくなるため、何度呼んでも二重には直らない。
   * 直した結果が不正（答えが空・{__}なし）や、別の問題と例文＋答えが重なる時はその直しを飛ばす。
   */
  function applyFixes(problems, fixes) {
    var list = problems || [];
    var changed = 0;
    (fixes || []).forEach(function (raw) {
      var fix = normalizeFix(raw);
      if (!fix) return;
      list.forEach(function (p) {
        if (!p || p.prompt !== fix.match.prompt || p.answer !== fix.match.answer) return;
        var next = {};
        FIXABLE_KEYS.forEach(function (k) {
          next[k] = k in fix.set ? fix.set[k] : p[k];
        });
        next.prompt = unifyBlank(next.prompt);
        if (!next.answer || !hasBlank(next.prompt)) return;
        var dup = list.some(function (q) {
          return q !== p && q && q.prompt === next.prompt && q.answer === next.answer;
        });
        if (dup) return;
        var same = FIXABLE_KEYS.every(function (k) { return p[k] === next[k]; });
        if (same) return;
        FIXABLE_KEYS.forEach(function (k) { p[k] = next[k]; });
        changed += 1;
      });
    });
    return changed;
  }

  var api = {
    BLANK_TOKEN: BLANK_TOKEN,
    unifyBlank: unifyBlank,
    hasBlank: hasBlank,
    STOP: STOP,
    WARN: WARN,
    checkProblem: checkProblem,
    hasStop: hasStop,
    findSuspicious: findSuspicious,
    applyFixes: applyFixes,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProblemFix = api;
  }
})(typeof window !== "undefined" ? window : this);
