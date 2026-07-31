console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
(function () {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext || location.protocol === "file:") return;

  const currentScript = document.currentScript;
  const swSrc = `${currentScript?.dataset?.swSrc || "./sw.js"}?v=4`;
  if (!document.querySelector('script[data-blockrail-mobile-menu]')) {
    const mobileMenu = document.createElement("script");
    mobileMenu.src = new URL("./mobile-menu.js?v=2", currentScript?.src || location.href).href;
    mobileMenu.defer = true;
    mobileMenu.dataset.blockrailMobileMenu = "";
    document.head.append(mobileMenu);
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swSrc, { updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
})();

