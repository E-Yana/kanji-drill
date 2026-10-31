/**
 * れんぞく欄（直近7日の●○・表示用の連続日数）と、問題0件の時の「できた／おやすみ」の判定。
 * DOM・store・window に触れない純関数だけ。
 * ⚠️ 都道府県ドリルの progress.js の日付関数（studyDates・recentDays・shownStreak・stepRestKind と補助）の写し。
 *    ずれたら両方直す（backup.js と同じ扱い）。
 * ブラウザでは window.DrillWeek、node では module.exports に公開する。
 */
(function (root) {
  "use strict";

  // ---- 定数 ----
  var RESULT_OK = "o"; // 履歴の正解
  var RESULT_NG = "x"; // 履歴の不正解
  var WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"]; // Date.getDay() の順

  /** 履歴の1件が正解/不正解のどちらかか（壊れた記録は飛ばすための判定） */
  function isKnownResult(entry) {
    return !!entry && (entry.result === RESULT_OK || entry.result === RESULT_NG);
  }

  /** 履歴（各カードの history 配列の配列）から、1問以上答えた日付（YYYY-MM-DD）の集合を返す */
  function studyDates(histories) {
    var dates = new Set();
    (histories || []).forEach(function (history) {
      (history || []).forEach(function (entry) {
        if (isKnownResult(entry) && entry.date) dates.add(entry.date);
      });
    });
    return dates;
  }

  /** YYYY-MM-DD をローカル時刻の Date にする（タイムゾーンずれを避けるため T00:00:00 を付ける） */
  function parseLocalDate(dateStr) {
    return new Date(dateStr + "T00:00:00");
  }

  /** Date を YYYY-MM-DD（ローカル時刻）にする */
  function formatLocalDate(d) {
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /**
   * today から n 日前〜今日までを古い順に並べる。
   * dates: studyDates の集合（Set または配列）。戻り値: [{date, weekday, studied, isToday}]
   */
  function recentDays(dates, today, n) {
    var set = dates instanceof Set ? dates : new Set(dates || []);
    var base = parseLocalDate(today);
    var list = [];
    for (var i = n; i >= 0; i--) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      var str = formatLocalDate(d);
      list.push({
        date: str,
        weekday: WEEKDAY_LABELS[d.getDay()],
        studied: set.has(str),
        isToday: i === 0,
      });
    }
    return list;
  }

  /** 前日の日付（YYYY-MM-DD） */
  function previousDay(dateStr) {
    var d = parseLocalDate(dateStr);
    return formatLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  }

  /** ホームに出す連続日数。最後に学習した日が今日か昨日なら保存値、それ以外（休み明け・記録なし）は 0 */
  function shownStreak(streak, lastStudyDate, today) {
    if (!lastStudyDate) return 0;
    return lastStudyDate === today || lastStudyDate === previousDay(today) ? streak || 0 : 0;
  }

  /**
   * 今日出す問題が無いステップの表示種別。
   * 今日のセッションを最後まで終えていれば "done"（できた）、それ以外は "rest"（おやすみ）。
   */
  function stepRestKind(session, today) {
    if (session && session.date === today && session.index >= session.ids.length) return "done";
    return "rest";
  }

  var api = {
    studyDates: studyDates,
    recentDays: recentDays,
    shownStreak: shownStreak,
    stepRestKind: stepRestKind,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DrillWeek = api;
  }
})(typeof window !== "undefined" ? window : this);
