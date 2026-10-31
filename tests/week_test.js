/**
 * week.js の試験。実行: node tests/week_test.js
 */
"use strict";
const assert = require("assert");
const W = require("../week.js");

const TODAY = "2026-11-01";

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("ok   " + name);
  } catch (e) {
    failed += 1;
    console.log("FAIL " + name + "\n" + e.stack);
  }
}

test("休み明け（最後が2日前）は0", () => {
  assert.strictEqual(W.shownStreak(5, "2026-10-30", TODAY), 0);
});
test("昨日が最後なら保存値のまま", () => {
  assert.strictEqual(W.shownStreak(5, "2026-10-31", TODAY), 5);
});
test("今日が最後なら保存値のまま", () => {
  assert.strictEqual(W.shownStreak(5, TODAY, TODAY), 5);
});
test("記録なしは0", () => {
  assert.strictEqual(W.shownStreak(0, null, TODAY), 0);
  assert.strictEqual(W.shownStreak(undefined, undefined, TODAY), 0);
});
test("月またぎ（12/1の昨日は11/30）", () => {
  assert.strictEqual(W.shownStreak(3, "2026-11-30", "2026-12-01"), 3);
  assert.strictEqual(W.shownStreak(3, "2026-11-29", "2026-12-01"), 0);
});
test("7日の並び・曜日・今日の印・●○", () => {
  const histories = [
    [{ date: "2026-10-30", result: "o" }, { date: "2026-11-01", result: "x" }],
    [{ date: "2026-10-27", result: "o" }, { date: "2026-10-28", result: "?" }],
  ];
  const days = W.recentDays(W.studyDates(histories), TODAY, 6);
  assert.strictEqual(days.length, 7);
  assert.deepStrictEqual(days.map((d) => d.date), [
    "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
  ]);
  assert.deepStrictEqual(days.map((d) => d.weekday), ["月", "火", "水", "木", "金", "土", "日"]);
  assert.deepStrictEqual(days.map((d) => d.studied), [false, true, false, false, true, false, true]);
  assert.deepStrictEqual(days.map((d) => d.isToday), [false, false, false, false, false, false, true]);
});
test("7日の並びが月をまたぐ", () => {
  const days = W.recentDays([], "2026-12-03", 6);
  assert.strictEqual(days[0].date, "2026-11-27");
  assert.strictEqual(days[6].date, "2026-12-03");
  assert.ok(days.every((d) => !d.studied));
});
test("stepRestKind: 今日やり終えたら done", () => {
  assert.strictEqual(W.stepRestKind({ date: TODAY, ids: ["a", "b"], index: 2 }, TODAY), "done");
});
test("stepRestKind: 途中・別の日・セッション無しは rest", () => {
  assert.strictEqual(W.stepRestKind({ date: TODAY, ids: ["a", "b"], index: 1 }, TODAY), "rest");
  assert.strictEqual(W.stepRestKind({ date: "2026-10-31", ids: ["a"], index: 1 }, TODAY), "rest");
  assert.strictEqual(W.stepRestKind(null, TODAY), "rest");
});

if (failed > 0) {
  console.log(failed + " 件失敗");
  process.exit(1);
}
console.log("全部成功");
