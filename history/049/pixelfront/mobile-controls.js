export function installMobileControls(canvas, engine, renderer) {
  if (typeof document === "undefined") return;
  const coarse = matchMedia("(pointer: coarse)");
  let timer = 0, active = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; active = null; };

  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType !== "touch" && !coarse.matches) return;
    fired = false; active = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      if (!active) return;
      fired = true; engine.suppressNextTap = true;
      canvas.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: active.x, clientY: active.y, button: 2, buttons: 2 }));
      navigator.vibrate?.(35);
      cancel();
    }, 560);
  });
  canvas.addEventListener("pointermove", event => {
    if (!active || event.pointerId !== active.id) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 12) cancel();
  });
  canvas.addEventListener("pointerup", event => {
    if (active?.id === event.pointerId) cancel();
    if (fired) { event.preventDefault(); fired = false; }
  }, true);
  canvas.addEventListener("pointercancel", cancel);

  const button = document.createElement("button");
  button.className = "mobile-hud-toggle";
  button.type = "button";
  button.textContent = "HUD 접기";
  document.querySelector(".game-shell")?.append(button);
  button.onclick = () => {
    const collapsed = document.body.classList.toggle("mobile-hud-collapsed");
    button.textContent = collapsed ? "HUD 펼치기" : "HUD 접기";
  };

  const zoom = document.createElement("nav");
  zoom.className = "mobile-zoom-controls";
  zoom.setAttribute("aria-label", "지도 확대 축소");
  zoom.innerHTML = '<button type="button" data-zoom="in" aria-label="지도 확대">＋</button><button type="button" data-zoom="out" aria-label="지도 축소">－</button>';
  document.querySelector(".game-shell")?.append(zoom);
  const changeZoom = factor => {
    if (!renderer?.camera) return;
    renderer.camera.z = Math.max(.7, Math.min(10, renderer.camera.z * factor));
    renderer.draw();
  };
  zoom.querySelector('[data-zoom="in"]').onclick = () => changeZoom(1.28);
  zoom.querySelector('[data-zoom="out"]').onclick = () => changeZoom(.78);

  const style = document.createElement("style");
  style.textContent = `.mobile-hud-toggle,.mobile-zoom-controls{display:none;position:absolute;z-index:18}.mobile-hud-toggle{left:8px;top:68px;border:1px solid #ffffff28;background:#08111aeb;color:#aeb8bf;padding:7px 9px;font-size:8px;font-weight:800;cursor:pointer}.mobile-zoom-controls{left:8px;bottom:76px;gap:6px}.mobile-zoom-controls button{width:42px;height:42px;border:1px solid #ffffff35;background:#08111aeb;color:#fff;font:900 22px/1 Inter;touch-action:manipulation}@media(max-width:700px),(pointer:coarse){.mobile-hud-toggle,.mobile-zoom-controls{display:flex}.hud{overflow-x:auto;max-width:calc(100vw - 16px);right:auto;padding-right:1px}.hud::-webkit-scrollbar{height:2px}.hud>div{flex:0 0 86px}.mobile-hud-collapsed .hud>div:nth-child(n+5){display:none}.mobile-hud-collapsed .hud{max-width:calc(100vw - 16px)}.mobile-hud-collapsed .attack-queue{top:112px}}`;
  document.head.append(style);
}
