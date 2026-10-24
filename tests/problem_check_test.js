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
  return { id, type: "write", grade: 4, prompt, answer, reading: "よみ", word, requireReview: true, createdAt: "2026-10-01" };
}

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "problem_cases.json"), "utf8")).cases;

/** 指摘の一覧から一番重い段階 */
function topLevel(issues) {
  if (PF.hasStop(issues)) return "stop";
  return issues.length ? "warn" : "none";
}

test("見本：拾うべきものを拾い、正しいものは止めない", () => {
  fixtures.forEach((c) => {
    const issues = PF.checkProblem(c.problem);
    const rules = issues.map((x) => x.rule);
    assert.deepStrictEqual(rules, c.expect, c.note + " " + c.problem.prompt);
    assert.strictEqual(topLevel(issues), c.level, c.note + " " + c.problem.prompt);
  });
});

test("同梱バンクと inbox に「止める」が無く、「確認」は既知のかな交じりだけ", () => {
  const all = [].concat(
    loadBank("kanji_data.js", "SEED_PROBLEMS"),
    loadBank("grade3_data.js", "GRADE3_PROBLEMS"),
    inbox.problems
  );
  const flagged = all.filter((p) => PF.checkProblem(p).length);
  assert.deepStrictEqual(flagged.filter((p) => PF.hasStop(PF.checkProblem(p))).map((p) => p.id), []);
  assert.deepStrictEqual(flagged.map((p) => p.id).filter((id) => !KNOWN_KANA_MIXED.includes(id)), []);
});

test("生の行を検査する：正規化なら黙って捨てる・語を自動で作る行も指摘が出る", () => {
  assert.ok(PF.hasStop(PF.checkProblem({ prompt: "", answer: "乗", reading: "の", word: "乗る" })));
  assert.ok(PF.hasStop(PF.checkProblem({ prompt: "車に{__}る。", answer: "", reading: "の" })));
  assert.ok(PF.hasStop(PF.checkProblem({ prompt: "{__}と{__}", answer: "乗", reading: "の", word: "乗" })));
  assert.deepStrictEqual(PF.checkProblem({ prompt: "車に{__}る。", answer: "乗", reading: "の" }).map((x) => x.rule), ["word_empty"]);
  assert.ok(PF.hasStop(PF.checkProblem(null)));
});

test("空欄記号のゆれ（{**}・写真変換スキルの (__)・（＿＿））は検査の前に揃える", () => {
  assert.deepStrictEqual(PF.checkProblem({ prompt: "車に{**}る。", answer: "乗", reading: "の", word: "乗る" }), []);
  assert.deepStrictEqual(PF.checkProblem({ prompt: "目を(__)ます", answer: "覚", reading: "さ", word: "覚ます" }), []);
  assert.strictEqual(PF.unifyBlank("目を（＿＿）ます"), "目を{__}ます");
  assert.strictEqual(PF.unifyBlank("(注)目を(__)ます"), "(注)目を{__}ます"); // 下線以外のかっこは残す
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
