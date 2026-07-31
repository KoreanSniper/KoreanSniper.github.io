console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext || location.protocol === "file:") return;

  const currentScript = document.currentScript;
  const swSrc = `${currentScript?.dataset?.swSrc || "./sw.js"}?v=3`;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swSrc, { updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
})();

