/**
 * drive_import.js の試験。実行: node tests/drive_import_test.js
 */
"use strict";
const assert = require("assert");
const D = require("../drive_import.js");

const SETTINGS = { url: "https://script.google.com/macros/s/x/exec", token: "t" };
const APP_ID = "kanji-drill";

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

test("一覧の要求は text/plain・kind=import_list・独自ヘッダーなし", () => {
  const r = D.buildListRequest(SETTINGS, APP_ID);
  assert.strictEqual(r.url, SETTINGS.url);
  assert.deepStrictEqual(r.options.headers, { "Content-Type": "text/plain;charset=utf-8" });
  assert.deepStrictEqual(JSON.parse(r.options.body), { token: "t", app: APP_ID, kind: "import_list", content: "" });
});

test("消し込みの要求は id 配列を JSON 文字列で送る", () => {
  const r = D.buildDoneRequest(SETTINGS, APP_ID, ["a", "b"]);
  const body = JSON.parse(r.options.body);
  assert.strictEqual(body.kind, "import_done");
  assert.deepStrictEqual(JSON.parse(body.content), ["a", "b"]);
});

test("一覧の応答：正しい件だけ返し、形の崩れた件は読み飛ばす", () => {
  const text = JSON.stringify({
    ok: true,
    files: [
      { id: "f1", name: "kanji_drill_import_1.json", content: "[]" },
      { id: "", name: "x", content: "[]" },
      { id: "f3", name: "y" },
      null,
    ],
    skipped: ["kanji_drill_import_doc.json", 3],
  });
  const r = D.parseListResponse(text);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.files.map((f) => f.id), ["f1"]);
  assert.deepStrictEqual(r.skipped, ["kanji_drill_import_doc.json"]);
});

test("一覧の応答：壊れたJSON・ok:false・空は失敗扱い", () => {
  for (const t of ["{", JSON.stringify({ ok: false }), "", "null", "[]"]) {
    const r = D.parseListResponse(t);
    assert.strictEqual(r.ok, false, t);
    assert.deepStrictEqual(r.files, []);
  }
});

test("rememberSeen：重複させず、新しい SEEN_KEEP 件だけ残し、元の配列を変えない", () => {
  const orig = ["a", "b"];
  const r1 = D.rememberSeen(orig, "a");
  assert.deepStrictEqual(r1, ["b", "a"]);
  assert.deepStrictEqual(orig, ["a", "b"]);
  let seen = [];
  for (let i = 0; i < D.SEEN_KEEP + 5; i++) seen = D.rememberSeen(seen, "id" + i);
  assert.strictEqual(seen.length, D.SEEN_KEEP);
  assert.strictEqual(seen[0], "id5");
  assert.strictEqual(seen[seen.length - 1], "id" + (D.SEEN_KEEP + 4));
  assert.deepStrictEqual(D.rememberSeen(null, "z"), ["z"]);
});

if (failed) {
  console.log(failed + " 件 失敗");
  process.exit(1);
}
console.log("drive_import: すべて成功");
