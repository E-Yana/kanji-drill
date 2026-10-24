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

  /** 空欄記号のゆれを吸収（{__} / {**} / {  } など {…} を全て統一） */
  function unifyBlank(prompt) {
    return String(prompt || "").replace(/\{[^}]*\}/g, BLANK_TOKEN);
  }

  /** 書く場所（{__}）がある例文か */
  function hasBlank(prompt) {
    return String(prompt || "").indexOf(BLANK_TOKEN) !== -1;
  }

  /**
   * 答えを空欄に入れた文に、答え合わせの語（word）が含まれない問題を返す。
   * 送りがなの抜け（車に□。＝乗る）や語の崩れ（しゃ□＝写真）を拾う。
   * ⚠️ かな交じり（衣ふく）も掛かるので、結果は目で見て判断する。
   * ⚠️ 語の後ろに余計なかなが付く形（持参す）や、手がかりが薄い形（□する）は拾えない。
   */
  function findSuspicious(list) {
    return (list || []).filter(function (p) {
      if (!p || !p.word) return false;
      var filled = String(p.prompt || "").replace(BLANK_TOKEN, p.answer || "").replace(PUNCT_RE, "");
      return filled.indexOf(String(p.word).replace(PUNCT_RE, "")) === -1;
    });
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
    findSuspicious: findSuspicious,
    applyFixes: applyFixes,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProblemFix = api;
  }
})(typeof window !== "undefined" ? window : this);
