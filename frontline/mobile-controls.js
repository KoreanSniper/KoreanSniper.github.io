export function installMobileControls(canvas, engine) {
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

  const style = document.createElement("style");
  style.textContent = `.mobile-hud-toggle{display:none;position:absolute;z-index:18;left:8px;top:68px;border:1px solid #ffffff28;background:#08111aeb;color:#aeb8bf;padding:7px 9px;font-size:8px;font-weight:800;cursor:pointer}@media(max-width:700px),(pointer:coarse){.mobile-hud-toggle{display:block}.hud{overflow-x:auto;max-width:calc(100vw - 16px);right:auto;padding-right:1px}.hud::-webkit-scrollbar{height:2px}.hud>div{flex:0 0 86px}.mobile-hud-collapsed .hud>div:nth-child(n+5){display:none}.mobile-hud-collapsed .hud{max-width:calc(100vw - 16px)}.mobile-hud-collapsed .attack-queue{top:112px}}`;
  document.head.append(style);
}
