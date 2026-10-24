/**
 * 問題ファイルの検査コマンド。実行: node tools/check_problems.js <ファイル>
 * 読めるもの: inbox.json（problems）・バックアップJSON（state.imported）・問題のJSON配列。
 * 「止める」が1件でもあれば終了コード1（CI・公開前の確認に使う）。
 */
"use strict";
const fs = require("fs");
const PF = require("../problem_fix.js");

/** ファイルの中身から問題の配列を取り出す */
function problemsOf(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.problems)) return data.problems;
  if (data && data.state && Array.isArray(data.state.imported)) return data.state.imported;
  if (data && Array.isArray(data.imported)) return data.imported;
  return null;
}

function main(file) {
  if (!file) {
    console.log("使い方: node tools/check_problems.js <ファイル>");
    return 2;
  }
  const list = problemsOf(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!list) {
    console.log("問題の一覧が見つかりません（problems / state.imported / 配列のどれでもない）");
    return 2;
  }
  let stops = 0;
  let warns = 0;
  list.forEach((p) => {
    const issues = PF.checkProblem(p);
    if (!issues.length) return;
    if (PF.hasStop(issues)) stops += 1;
    else warns += 1;
    console.log(`${p.id || "-"} | ${p.prompt} | ${p.answer} | ${p.word}`);
    issues.forEach((x) => console.log(`    ${x.level === PF.STOP ? "⛔止める" : "⚠確認"} ${x.msg}`));
  });
  console.log(`== ${list.length}問を検査：止める ${stops}問・確認 ${warns}問`);
  return stops ? 1 : 0;
}

process.exit(main(process.argv[2]));
