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
