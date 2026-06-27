// service worker: オフラインで使えるよう、アプリ一式をキャッシュする
// 中身を更新したら CACHE バージョン名を上げること（古いキャッシュを破棄）
const CACHE = "kanji-drill-v5";
// 必須アセット（必ずキャッシュ）。priority_data.js は個人データのため公開版には無いことがある→任意扱い
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./kanji_data.js",
  "./grade3_data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
// 任意アセット（あればキャッシュ、無くても無視）
const OPTIONAL = ["./priority_data.js"];

// インストール時に一式をキャッシュ（任意アセットは存在すれば取り込む）
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(ASSETS); // 必須はまとめて
      // 任意は1つずつ。無ければ握りつぶす（オフライン動作を壊さない）
      await Promise.allSettled(OPTIONAL.map((u) => cache.add(u)));
      await self.skipWaiting();
    })
  );
});

// 旧バージョンのキャッシュを掃除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 取得はキャッシュ優先（オフライン動作）。無ければネットワーク。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
