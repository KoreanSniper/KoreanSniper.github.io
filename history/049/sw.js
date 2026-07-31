console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
const CACHE_NAME = "blockrail-pwa-v117";
const APP_SHELL = [
  "./",
  "./index.html",
  "./lobby.html",
  "./styles.css",
  "./site-shell.css",
  "./manifest.webmanifest",
  "./BlockRail.png",
  "./subway-data.js",
  "./electron-main.js",
  "./minigame/index.html",
  "./minigame/arcade.css",
  "./minigame/frontline-card.css",
  "./pixelfront/index.html",
  "./pixelfront/menu.html",
  "./pixelfront/menu.js",
  "./pixelfront/guide.html",
  "./pixelfront/guide.css",
  "./pixelfront/play.html",
  "./pixelfront/game.css",
  "./pixelfront/config.js",
  "./pixelfront/map.js",
  "./pixelfront/map-worker.js",
  "./pixelfront/engine.js",
  "./pixelfront/ai.js",
  "./pixelfront/renderer.js",
  "./pixelfront/visibility.js",
  "./pixelfront/diplomacy.js",
  "./pixelfront/victory.js",
  "./pixelfront/main.js",
  "./pixelfront/queue-ui.js",
  "./pixelfront/naval.js",
  "./pixelfront/stability.js",
  "./pixelfront/terrain-visual.js",
  "./pixelfront/save-system.js",
  "./pixelfront/firebase-online.js",
  "./pixelfront/buildings.js",
  "./pixelfront/operations.js",
  "./pixelfront/objectives.js",
  "./pixelfront/time-controls.js",
  "./pixelfront/missions.js",
  "./pixelfront/doctrines.js",
  "./pixelfront/decisions.js",
  "./pixelfront/research.js",
  "./pixelfront/war-events.js",
  "./pixelfront/combat-feed.js",
  "./pixelfront/mobile-controls.js",
  "./pixelfront/achievements.js",
  "./pixelfront/commanders.js",
  "./pixelfront/espionage.js",
  "./pixelfront/statistics.js",
  "./pixelfront/balance.html",
  "./pixelfront/balance.css",
  "./pixelfront/balance-core.js",
  "./pixelfront/balance-sim.js",
  "./gomoku/index.html",
  "./gomoku/gomoku.css",
  "./gomoku/gomoku-layout-fix.css",
  "./gomoku/app.js",
  "./train-map/index.html",
  "./train-map/app.js",
  "./train-map/atlas.css",
  "./train-map/map-performance.css",
  "./admin-map/index.html",
  "./admin-map/admin-map.js",
  "./admin-map/region-atlas.css",
  "./admin-map/voronoi-cache.js",
  "./community/index.html",
  "./community/write.html",
  "./community/edit.html",
  "./community/post.html",
  "./community/profile.html",
  "./community/my-posts.html",
  "./community/css/discord.css",
  "./community/css/community.css",
  "./community/css/community-page.css",
  "./community/css/global-auth.css",
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
  "./community/js/write.js",
  "./community/js/global-auth.js",
  "./community/js/activity-log.js",
  "./admin/index.html",
  "./admin/admin.css",
  "./admin/admin.js"
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

