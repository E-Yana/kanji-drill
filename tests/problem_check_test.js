/**
 * problem_fix.js の試験と、同梱の問題バンクの検査。実行: node tests/problem_check_test.js
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const PF = require("../problem_fix.js");

const ROOT = path.join(__dirname, "..");
// かな交じりで検査に掛かるが、正しい問題（目で見て確かめたもの）
const KNOWN_KANA_MIXED = ["w-0004", "w-0020", "g3-0016", "g3-0020", "m-0001"];

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

/** window.XXX = [...] 形式のデータファイルを読む */
function loadBank(file, name) {
  const sandbox = { window: {} };
  new Function("window", fs.readFileSync(path.join(ROOT, file), "utf8"))(sandbox.window);
  return sandbox.window[name];
}

const inbox = JSON.parse(fs.readFileSync(path.join(ROOT, "inbox.json"), "utf8"));

/** 端末の取り込み済みの問題を模した1件 */
function imported(id, prompt, answer, word) {
  return { id, type: "write", grade: 4, prompt, answer, reading: "", word, requireReview: true, createdAt: "2026-10-01" };
}

test("同梱バンクと inbox に送りがな抜け・語の崩れが無い（既知のかな交じりを除く）", () => {
  const all = [].concat(
    loadBank("kanji_data.js", "SEED_PROBLEMS"),
    loadBank("grade3_data.js", "GRADE3_PROBLEMS"),
    inbox.problems
  );
  const bad = PF.findSuspicious(all).filter((p) => !KNOWN_KANA_MIXED.includes(p.id));
  assert.deepStrictEqual(bad.map((p) => p.id + " " + p.prompt), []);
});

test("検査は送りがな抜けを拾い、正しい問題は拾わない", () => {
  const list = [imported("a", "車に{__}。", "乗", "乗る"), imported("b", "車に{__}る。", "乗", "乗る")];
  assert.deepStrictEqual(PF.findSuspicious(list).map((p) => p.id), ["a"]);
});

test("inbox の直しはどれも、直した後の問題が検査を通る", () => {
  inbox.fixes.forEach((f) => {
    const word = { 乗: "乗る", 投: "投げる", 育: "育てる", 関: "関わる", 配: "配る", 果: "果たす", 富: "富士山", 参: "持参", 予約: "予約", 観光: "観光" }[f.match.answer];
    const p = imported("x", f.match.prompt, f.match.answer, word);
    assert.strictEqual(PF.applyFixes([p], [f]), 1, f.match.prompt);
    assert.deepStrictEqual(PF.findSuspicious([p]), [], p.prompt);
  });
});

test("直しは中身だけ変え、id・要復習の印・作成日は残す", () => {
  const p = imported("i-abc", "車に{__}。", "乗", "乗る");
  const n = PF.applyFixes([p], [{ match: { prompt: "車に{__}。", answer: "乗" }, set: { prompt: "車に{__}る。" } }]);
  assert.strictEqual(n, 1);
  assert.strictEqual(p.prompt, "車に{__}る。");
  assert.strictEqual(p.id, "i-abc");
  assert.strictEqual(p.requireReview, true);
  assert.strictEqual(p.createdAt, "2026-10-01");
});

test("2回当てても二重に直らない（冪等）", () => {
  const p = imported("a", "使命を{__}す。", "果", "果たす");
  const fixes = [{ match: { prompt: "使命を{__}す。", answer: "果" }, set: { prompt: "使命を{__}たす。" } }];
  assert.strictEqual(PF.applyFixes([p], fixes), 1);
  assert.strictEqual(PF.applyFixes([p], fixes), 0);
  assert.strictEqual(p.prompt, "使命を{__}たす。");
});

test("一致しない・不正な直しでは何も変わらない（失敗経路）", () => {
  const p = imported("a", "車に{__}。", "乗", "乗る");
  const before = JSON.stringify(p);
  const bad = [
    { match: { prompt: "車に{__}。", answer: "投" }, set: { prompt: "車に{__}る。" } }, // 答えが違う
    { match: { prompt: "車に{__}。", answer: "乗" }, set: { prompt: "車にのる。" } }, // {__} が無い
    { match: { prompt: "車に{__}。", answer: "乗" }, set: { answer: "" } }, // 答えが空
    { match: { prompt: "車に{__}。", answer: "乗" }, set: { id: "zzz" } }, // 上書き不可の項目だけ
    { match: { answer: "乗" }, set: { prompt: "車に{__}る。" } }, // 例文なし
    null,
  ];
  assert.strictEqual(PF.applyFixes([p], bad), 0);
  assert.strictEqual(JSON.stringify(p), before);
});

test("直した結果が別の問題と重なる時は直さない", () => {
  const a = imported("a", "車に{__}。", "乗", "乗る");
  const b = imported("b", "車に{__}る。", "乗", "乗る");
  assert.strictEqual(PF.applyFixes([a, b], [{ match: { prompt: "車に{__}。", answer: "乗" }, set: { prompt: "車に{__}る。" } }]), 0);
  assert.strictEqual(a.prompt, "車に{__}。");
});

test("直しの例文の空欄記号のゆれも揃える", () => {
  const p = imported("a", "車に{__}。", "乗", "乗る");
  PF.applyFixes([p], [{ match: { prompt: "車に{**}。", answer: "乗" }, set: { prompt: "車に{ }る。" } }]);
  assert.strictEqual(p.prompt, "車に{__}る。");
});

if (failed) {
  console.log(failed + " 件失敗");
  process.exit(1);
}
console.log("すべて成功");
