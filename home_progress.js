/**
 * ホームの「すすみぐあい」用の集計（漢字ドリル専用の純関数。DOM・保存には触れない）。
 * 3色の意味: mastered＝箱4以上（「おぼえた」と同じ数え方）／
 * practicing＝1回以上答えて箱3以下／unseen＝カードが無い、または答えた回数0。
 * ことばクイズの id は "v-" 付きのまま問題側の id で引く（漢字のまとまりには混ぜない）。
 */
(function (root) {
  "use strict";

  /** 「おぼえた」とみなす箱の下限（app.js の masteredCount と同じ） */
  var MASTERED_BOX_MIN = 4;

  /**
   * 問題の配列と学習記録から、3色の数を返す。
   * @param {{id:string}[]} problems まとまりの問題
   * @param {Object<string,{box:number,history:Array}>} progress 問題 id → カード
   * @returns {{total:number, mastered:number, practicing:number, unseen:number}}
   */
  function bandCounts(problems, progress) {
    var list = problems || [];
    var cards = progress || {};
    var counts = { total: list.length, mastered: 0, practicing: 0, unseen: 0 };
    list.forEach(function (p) {
      var card = cards[p.id];
      var answered = card && Array.isArray(card.history) && card.history.length >= 1;
      if (!answered) {
        counts.unseen += 1;
      } else if (card.box >= MASTERED_BOX_MIN) {
        counts.mastered += 1;
      } else {
        counts.practicing += 1;
      }
    });
    return counts;
  }

  var api = { bandCounts: bandCounts };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.KanjiHomeProgress = api;
  }
})(typeof window !== "undefined" ? window : this);
