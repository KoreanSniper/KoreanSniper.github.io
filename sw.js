const CACHE_NAME = "blockrail-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./lobby.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./BlockRail.png",
  "./subway-data.js",
  "./electron-main.js",
  "./minigame/index.html",
  "./minigame/app.js",
  "./gomoku/index.html",
  "./gomoku/app.js",
  "./train-map/index.html",
  "./train-map/app.js",
  "./admin-map/index.html",
  "./admin-map/admin-map.js",
  "./admin-map/voronoi-cache.js",
  "./community/index.html",
  "./community/community/index.html",
  "./community/write.html",
  "./community/edit.html",
  "./community/post.html",
  "./community/profile.html",
  "./community/my-posts.html",
  "./community/css/discord.css",
  "./community/js/auth.js",
  "./community/js/comment.js",
  "./community/js/commentlike.js",
  "./community/js/delete.js",
  "./community/js/deletecomment.js",
  "./community/js/edit.js",
  "./community/js/firebase.js",
  "./community/js/like.js",
  "./community/js/main.js",
  "./community/js/my-posts.js",
  "./community/js/post.js",
  "./community/js/profile.js",
  "./community/js/report.js",
  "./community/js/reportcomment.js",
  "./community/js/ui.js",
  "./community/js/util.js",
  "./community/js/write.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    )
  );
  self.clients.claim();
});

async function fetchNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return cached || new Response("", { status: 504, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetchNetworkFirst(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (
          (await cache.match("./index.html")) ||
          (await cache.match("./lobby.html")) ||
          new Response("", { status: 504, statusText: "Offline" })
        );
      })
    );
    return;
  }

  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(fetchNetworkFirst(request));
  }
});
