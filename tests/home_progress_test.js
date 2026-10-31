/**
 * home_progress.js の試験。実行: node tests/home_progress_test.js
 */
"use strict";
const assert = require("assert");
const H = require("../home_progress.js");

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

const PROBLEMS = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
const HIST = [{ date: "2026-10-31", ok: true }];

test("箱4以上は mastered・箱1〜3で履歴ありは practicing", () => {
  const progress = {
    a: { box: 4, history: HIST },
    b: { box: 5, history: HIST },
    c: { box: 1, history: HIST },
    d: { box: 3, history: HIST },
  };
  const r = H.bandCounts(PROBLEMS, progress);
  assert.deepStrictEqual(r, { total: 5, mastered: 2, practicing: 2, unseen: 1 });
});
test("カード無しは unseen", () => {
  const r = H.bandCounts(PROBLEMS, {});
  assert.deepStrictEqual(r, { total: 5, mastered: 0, practicing: 0, unseen: 5 });
});
test("履歴が空のカードは unseen", () => {
  const r = H.bandCounts([{ id: "a" }], { a: { box: 1, history: [] } });
  assert.deepStrictEqual(r, { total: 1, mastered: 0, practicing: 0, unseen: 1 });
});
test("3色の合計は total と一致する", () => {
  const progress = { a: { box: 4, history: HIST }, c: { box: 2, history: HIST }, d: { box: 2, history: [] } };
  const r = H.bandCounts(PROBLEMS, progress);
  assert.strictEqual(r.mastered + r.practicing + r.unseen, r.total);
});
test("問題側の id だけで引く（v- のカードを漢字のまとまりに混ぜない）", () => {
  const progress = { a: { box: 4, history: HIST }, "v-1": { box: 5, history: HIST } };
  const kanji = H.bandCounts(PROBLEMS, progress);
  assert.strictEqual(kanji.mastered, 1);
  const vocab = H.bandCounts([{ id: "v-1" }, { id: "v-2" }], progress);
  assert.deepStrictEqual(vocab, { total: 2, mastered: 1, practicing: 0, unseen: 1 });
});
test("問題0件・記録なし（null）でも壊れない", () => {
  assert.deepStrictEqual(H.bandCounts([], null), { total: 0, mastered: 0, practicing: 0, unseen: 0 });
});

if (failed > 0) {
  console.log(failed + " 件失敗");
  process.exit(1);
}
console.log("全部成功");
