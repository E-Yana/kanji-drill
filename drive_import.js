/**
 * ドライブの「漢字Apps」に置かれた取り込み待ちファイル（<元>_import_*.json）を、
 * 受け口（Apps Script）経由で読む・消すための純関数。画面と保存は app.js が受け持つ。
 * 取り込み待ちファイルは claude.ai の写真変換スキルが作る。
 */
(function (root) {
  "use strict";

  var DRIVE_CONTENT_TYPE = "text/plain;charset=utf-8"; // application/json だとプリフライトで失敗するため使わない
  var SEEN_KEEP = 50; // 読んだファイルの id を残す件数（ゴミ箱へ送るので古い id は再び出ない）

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  /** 受け口へ送る fetch 用の引数を組み立てる（backup.js の buildDriveRequest と同じ送り方） */
  function buildRequest(settings, app, kind, content) {
    return {
      url: settings.url,
      options: {
        method: "POST",
        headers: { "Content-Type": DRIVE_CONTENT_TYPE },
        body: JSON.stringify({ token: settings.token, app: app, kind: kind, content: content }),
      },
    };
  }

  /** 取り込み待ちの一覧を求める */
  function buildListRequest(settings, app) {
    return buildRequest(settings, app, "import_list", "");
  }

  /** 取り込み済みのファイルをゴミ箱へ送るよう求める */
  function buildDoneRequest(settings, app, ids) {
    return buildRequest(settings, app, "import_done", JSON.stringify(ids));
  }

  /**
   * 一覧の応答を読む。ok:true のときだけ files を返す。
   * 形の崩れた件は読み飛ばす。壊れた JSON・ok:false は {ok:false, files:[], skipped:[]}。
   */
  function parseListResponse(text) {
    var empty = { ok: false, files: [], skipped: [] };
    var v;
    try {
      v = JSON.parse(text);
    } catch (e) {
      return empty;
    }
    if (!isPlainObject(v) || v.ok !== true) return empty;
    var files = (Array.isArray(v.files) ? v.files : []).filter(function (f) {
      return (
        isPlainObject(f) &&
        typeof f.id === "string" &&
        f.id !== "" &&
        typeof f.name === "string" &&
        typeof f.content === "string"
      );
    });
    var skipped = (Array.isArray(v.skipped) ? v.skipped : []).filter(function (s) {
      return typeof s === "string";
    });
    return { ok: true, files: files, skipped: skipped };
  }

  /** 読んだ id を足し、新しい SEEN_KEEP 件だけ残した配列を返す（元の配列は変えない） */
  function rememberSeen(seen, id) {
    var list = (Array.isArray(seen) ? seen : []).filter(function (x) {
      return x !== id;
    });
    list.push(id);
    return list.slice(-SEEN_KEEP);
  }

  var api = {
    buildListRequest: buildListRequest,
    buildDoneRequest: buildDoneRequest,
    parseListResponse: parseListResponse,
    rememberSeen: rememberSeen,
    SEEN_KEEP: SEEN_KEEP,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DriveImport = api;
  }
})(typeof window !== "undefined" ? window : this);
