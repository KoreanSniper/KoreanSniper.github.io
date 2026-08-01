console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
(function () {
  const currentScript = document.currentScript;
  if (!document.querySelector('script[data-blockrail-mobile-menu]')) {
    const mobileMenu = document.createElement("script");
    mobileMenu.src = new URL("./mobile-menu.js?v=3", currentScript?.src || location.href).href;
    mobileMenu.defer = true;
    mobileMenu.dataset.blockrailMobileMenu = "";
    document.head.append(mobileMenu);
  }

  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext || location.protocol === "file:") return;
  const swSrc = `${currentScript?.dataset?.swSrc || "./sw.js"}?v=7`;

  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.filter(registration => /^\/history\/\d{3}\//.test(new URL(registration.scope).pathname)).map(registration => registration.unregister()))).catch(() => {});
    navigator.serviceWorker.register(swSrc, { updateViaCache: "none" }).then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {});
  });
})();

