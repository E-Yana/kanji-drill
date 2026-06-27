// 漢字ドリル スターター問題バンク（小学4年配当・書き取り）
//
// このファイルは「最初から入っている練習問題」です。
// 学校のドリル/ノートの間違いを Gemini で書き起こして取り込むと、
// そちらが最優先で出題され、ここの問題は「10問に満たない日の穴埋め」に使われます。
//
// 1問のかたち:
//   prompt  … 例文。漢字を書く場所を {__} で示す
//   answer  … {__} に入る正しい漢字
//   reading … 送りがな・読みのヒント（ひらがな）
//   word    … 答え合わせで見せる完成した語
//
// ※ window.SEED_PROBLEMS に格納（app.js から参照）

window.SEED_PROBLEMS = [
  { id: "w-0001", type: "write", grade: 4, prompt: "ペットを{__}する", answer: "愛", reading: "あい", word: "愛する" },
  { id: "w-0002", type: "write", grade: 4, prompt: "りょこうの{__}を立てる", answer: "案", reading: "あん", word: "案" },
  { id: "w-0003", type: "write", grade: 4, prompt: "五人{__}上あつまる", answer: "以", reading: "い", word: "以上" },
  { id: "w-0004", type: "write", grade: 4, prompt: "{__}ふくをたたむ", answer: "衣", reading: "い", word: "衣服" },
  { id: "w-0005", type: "write", grade: 4, prompt: "マラソンで一{__}になる", answer: "位", reading: "い", word: "一位" },
  { id: "w-0006", type: "write", grade: 4, prompt: "{__}語を話す", answer: "英", reading: "えい", word: "英語" },
  { id: "w-0007", type: "write", grade: 4, prompt: "町が{__}える", answer: "栄", reading: "さか", word: "栄える" },
  { id: "w-0008", type: "write", grade: 4, prompt: "りょうりに{__}を入れる", answer: "塩", reading: "しお", word: "塩" },
  { id: "w-0009", type: "write", grade: 4, prompt: "一{__}円のたから", answer: "億", reading: "おく", word: "億" },
  { id: "w-0010", type: "write", grade: 4, prompt: "なかまに{__}わる", answer: "加", reading: "くわ", word: "加わる" },
  { id: "w-0011", type: "write", grade: 4, prompt: "{__}物を食べる", answer: "果", reading: "くだ", word: "果物" },
  { id: "w-0012", type: "write", grade: 4, prompt: "国語の{__}題をする", answer: "課", reading: "か", word: "課題" },
  { id: "w-0013", type: "write", grade: 4, prompt: "しょくぶつの{__}が出る", answer: "芽", reading: "め", word: "芽" },
  { id: "w-0014", type: "write", grade: 4, prompt: "考えを{__}める", answer: "改", reading: "あらた", word: "改める" },
  { id: "w-0015", type: "write", grade: 4, prompt: "公{__}をふせぐ", answer: "害", reading: "がい", word: "公害" },
  { id: "w-0016", type: "write", grade: 4, prompt: "にぎやかな{__}を歩く", answer: "街", reading: "まち", word: "街" },
  { id: "w-0017", type: "write", grade: 4, prompt: "{__}自で考える", answer: "各", reading: "かく", word: "各自" },
  { id: "w-0018", type: "write", grade: 4, prompt: "目を{__}ます", answer: "覚", reading: "さ", word: "覚ます" },
  { id: "w-0019", type: "write", grade: 4, prompt: "作品が{__}成する", answer: "完", reading: "かん", word: "完成" },
  { id: "w-0020", type: "write", grade: 4, prompt: "けいさつ{__}になる", answer: "官", reading: "かん", word: "警察官" },
  { id: "w-0021", type: "write", grade: 4, prompt: "水道{__}をなおす", answer: "管", reading: "かん", word: "水道管" },
  { id: "w-0022", type: "write", grade: 4, prompt: "{__}係がふかい", answer: "関", reading: "かん", word: "関係" },
  { id: "w-0023", type: "write", grade: 4, prompt: "しあいを{__}戦する", answer: "観", reading: "かん", word: "観戦" },
  { id: "w-0024", type: "write", grade: 4, prompt: "せいこうを{__}う", answer: "願", reading: "ねが", word: "願う" },
  { id: "w-0025", type: "write", grade: 4, prompt: "{__}望を持つ", answer: "希", reading: "き", word: "希望" },
  { id: "w-0026", type: "write", grade: 4, prompt: "四{__}がうつりかわる", answer: "季", reading: "き", word: "四季" },
  { id: "w-0027", type: "write", grade: 4, prompt: "合格を{__}ぶ", answer: "喜", reading: "よろこ", word: "喜ぶ" },
  { id: "w-0028", type: "write", grade: 4, prompt: "食{__}をあらう", answer: "器", reading: "き", word: "食器" },
  { id: "w-0029", type: "write", grade: 4, prompt: "飛行{__}に乗る", answer: "機", reading: "き", word: "飛行機" },
  { id: "w-0030", type: "write", grade: 4, prompt: "クラスで{__}論する", answer: "議", reading: "ぎ", word: "議論" },
  { id: "w-0031", type: "write", grade: 4, prompt: "助けを{__}める", answer: "求", reading: "もと", word: "求める" },
  { id: "w-0032", type: "write", grade: 4, prompt: "あかちゃんが{__}く", answer: "泣", reading: "な", word: "泣く" },
  { id: "w-0033", type: "write", grade: 4, prompt: "おぼれた人を{__}う", answer: "救", reading: "すく", word: "救う" },
  { id: "w-0034", type: "write", grade: 4, prompt: "{__}食を食べる", answer: "給", reading: "きゅう", word: "給食" },
  { id: "w-0035", type: "write", grade: 4, prompt: "{__}業がさかんな町", answer: "漁", reading: "ぎょ", word: "漁業" },
  { id: "w-0036", type: "write", grade: 4, prompt: "{__}通の話題でもりあがる", answer: "共", reading: "きょう", word: "共通" },
  { id: "w-0037", type: "write", grade: 4, prompt: "みんなで{__}力する", answer: "協", reading: "きょう", word: "協力" },
  { id: "w-0038", type: "write", grade: 4, prompt: "{__}にすがたをうつす", answer: "鏡", reading: "かがみ", word: "鏡" },
  { id: "w-0039", type: "write", grade: 4, prompt: "{__}走で一番になる", answer: "競", reading: "きょう", word: "競走" },
  { id: "w-0040", type: "write", grade: 4, prompt: "学校を{__}業する", answer: "卒", reading: "そつ", word: "卒業" },
  { id: "w-0041", type: "write", grade: 4, prompt: "毎日れんしゅうに{__}める", answer: "努", reading: "つと", word: "努める" },
  { id: "w-0042", type: "write", grade: 4, prompt: "{__}人をうやまう", answer: "老", reading: "ろう", word: "老人" },
  { id: "w-0043", type: "write", grade: 4, prompt: "気おんが{__}い朝", answer: "低", reading: "ひく", word: "低い" },
  { id: "w-0044", type: "write", grade: 4, prompt: "話を{__}える", answer: "伝", reading: "つた", word: "伝える" },
  { id: "w-0045", type: "write", grade: 4, prompt: "あした{__}ず行く", answer: "必", reading: "かなら", word: "必ず" },
];
