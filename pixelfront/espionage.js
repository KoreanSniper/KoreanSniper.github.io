import { Engine } from "./engine.js";
import { Renderer, short } from "./renderer.js";
import { RULES } from "./config.js";

const ticks = seconds => Math.ceil(seconds * 1000 / RULES.tickMs);
export const SPY_OPERATIONS = {
  recon: { name: "심층 정찰", cost: 30, cooldown: 65, detail: "35초간 적 국경과 수도 주변 공개" },
  sabotage: { name: "군수 방해", cost: 45, cooldown: 85, detail: "적 병력의 8% 손실 · 최대 15K" }
};

const radarCount = (engine, nation) => {
  let count = 0;
  for (const tile of nation.buildingTiles || []) if (engine.buildings?.[tile] === 3) count++;
  return count;
};
const cityCount = (engine, id) => {
  let count = 0;
  for (const city of engine.cities?.values?.() || []) if (engine.owner[city.tile] === id) count++;
  return count;
};

export function installEspionage(engine, renderer, notify = () => {}) {
  engine.intelRevealUntil ||= {};
  for (const nation of engine.nations) { nation.intel = Number.isFinite(nation.intel) ? nation.intel : 12; nation.espionageReady ||= {}; }
  Engine.prototype.launchEspionage = function (attackerId, targetId, type) {
    const attacker = this.nations[attackerId], target = this.nations[targetId], spec = SPY_OPERATIONS[type];
    if (!attacker?.alive || !target?.alive || attackerId === targetId || !spec) return { ok: false, message: "첩보 작전 대상을 선택하세요." };
    if (this.relation?.(attackerId, targetId) === 2) return { ok: false, message: "동맹국에는 첩보 작전을 실행할 수 없습니다." };
    const ready = attacker.espionageReady?.[type] || 0;
    if (this.tick < ready) return { ok: false, message: `${spec.name} 재사용까지 ${Math.ceil((ready - this.tick) * RULES.tickMs / 1000)}초` };
    if ((attacker.intel || 0) < spec.cost) return { ok: false, message: `정보점이 부족합니다. ${spec.cost} 필요` };
    attacker.intel -= spec.cost; attacker.espionageReady[type] = this.tick + ticks(spec.cooldown);
    let result = "";
    if (type === "recon") { this.intelRevealUntil[targetId] = this.tick + ticks(35); if (attackerId === 0) renderer.visionTick = -1; result = "국경선과 수도 위치를 확보했습니다."; }
    else if (type === "sabotage") { const loss = Math.min(15000, Math.max(800, Math.floor(target.troops * .08))); target.troops = Math.max(0, target.troops - loss); result = `적 병력 ${short(loss)} 손실`; }
    return { ok: true, message: `${spec.name} 성공 · ${result}` };
  };

  const oldStep = Engine.prototype.step;
  Engine.prototype.step = function () {
    oldStep.call(this);
    if (!this.running) return;
    for (const nation of this.nations) {
      if (!nation.alive || nation.spawn < 0) continue;
      nation.intel = Math.min(150, (nation.intel || 0) + .04 + radarCount(this, nation) * .015 + cityCount(this, nation.id) * .01);
      if (!nation.ai || this.tick % 400 || nation.intel < 30 || this.random() > .32) continue;
      const targets = this.nations.filter(other => other.alive && other.id !== nation.id && this.relation?.(nation.id, other.id) !== 2);
      if (!targets.length) continue;
      const target = targets[this.random() * targets.length | 0];
      const choices = Object.keys(SPY_OPERATIONS).filter(key => nation.intel >= SPY_OPERATIONS[key].cost && this.tick >= (nation.espionageReady[key] || 0));
      if (choices.length) this.launchEspionage(nation.id, target.id, choices[this.random() * choices.length | 0]);
    }
  };

  const oldVision = Renderer.prototype.vision;
  Renderer.prototype.vision = function () {
    const previous = this.intelTiles || [];
    for (const tile of previous) if (this.e.owner[tile] !== 0) this.visible[tile] = 0;
    oldVision.call(this);
    const dirty = new Set([...this.visionDirty, ...previous]); this.intelTiles = [];
    for (const [idText, until] of Object.entries(this.e.intelRevealUntil || {})) {
      const id = +idText, nation = this.e.nations[id]; if (!nation?.alive || until <= this.e.tick) continue;
      const reveal = new Set(nation.borderTiles || []);
      if (nation.spawn >= 0) {
        const [cx, cy] = this.e.xy(nation.spawn), range = 24;
        for (let y = Math.max(0, cy - range); y <= Math.min(this.e.map.height - 1, cy + range); y++) for (let x = Math.max(0, cx - range); x <= Math.min(this.e.map.width - 1, cx + range); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= range * range) reveal.add(y * this.e.map.width + x);
      }
      for (const tile of reveal) { this.visible[tile] = 2; this.explored[tile] = 1; this.intelTiles.push(tile); dirty.add(tile); }
    }
    this.visionDirty = [...dirty];
  };

  if (typeof document === "undefined") return;
  const button = document.createElement("button"); button.className = "spy-open"; button.type = "button"; button.innerHTML = '<small>INTELLIGENCE</small><b>12</b>'; document.querySelector(".game-shell")?.append(button);
  const panel = document.createElement("aside"); panel.className = "spy-panel hidden";
  panel.innerHTML = '<button class="spy-close" type="button">×</button><p class="eyebrow">INTELLIGENCE BUREAU</p><h2>첩보국</h2><p class="spy-status"></p><label>작전 대상<select class="spy-target"></select></label><div class="spy-grid"></div>';
  document.body.append(panel);
  const style = document.createElement("style"); style.textContent = `.spy-open{position:absolute;z-index:16;right:18px;bottom:138px;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #b56dff66;background:#08111aeb;color:#c38aff;cursor:pointer}.spy-open small{font-size:7px;letter-spacing:.12em}.spy-open b{font-size:10px}.spy-panel{position:fixed;z-index:97;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 28px));padding:28px;background:#0b101af7;border:1px solid #b56dff66;box-shadow:0 35px 100px #000d}.spy-panel.hidden{display:none}.spy-panel h2{font-size:36px;margin:8px 0}.spy-status{color:#c38aff;font-size:10px}.spy-panel label{display:grid;gap:7px;color:#87939c;font-size:9px}.spy-panel select{padding:11px;border:1px solid #ffffff25;background:#101821;color:#fff}.spy-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.spy-grid button{display:grid;grid-template-columns:1fr auto;gap:6px;text-align:left;padding:14px;border:1px solid #ffffff1c;background:#121a24;color:#edf1f3;cursor:pointer}.spy-grid button:hover:not(:disabled){border-color:#b56dff}.spy-grid button:disabled{opacity:.42;cursor:default}.spy-grid span{grid-column:1/-1;color:#84909a;font-size:8px}.spy-grid small{color:#c38aff}.spy-close{position:absolute;right:10px;top:10px;border:0;background:none;color:#fff;font-size:20px;cursor:pointer}@media(max-width:700px){.spy-open{right:8px;bottom:196px}.spy-grid{grid-template-columns:1fr}.spy-panel{padding:22px;max-height:86vh;overflow:auto}}`; document.head.append(style);
  button.onclick = () => { panel.classList.remove("hidden"); engine.updateEspionageUI?.(); }; panel.querySelector(".spy-close").onclick = () => panel.classList.add("hidden");
  engine.updateEspionageUI = () => {
    const me = engine.nations[0], select = panel.querySelector(".spy-target"), selected = +select.value;
    select.innerHTML = engine.nations.filter(n => n.alive && n.id && engine.relation?.(0, n.id) !== 2).map(n => `<option value="${n.id}" ${n.id === selected ? "selected" : ""}>${n.name}</option>`).join("");
    panel.querySelector(".spy-status").textContent = `보유 정보점 ${(me.intel || 0).toFixed(1)} / 150 · 레이더와 전략 도시에서 생산`;
    button.querySelector("b").textContent = Math.floor(me.intel || 0);
    panel.querySelector(".spy-grid").innerHTML = Object.entries(SPY_OPERATIONS).map(([key, spec]) => { const remain = Math.max(0, (me.espionageReady?.[key] || 0) - engine.tick); return `<button type="button" data-spy="${key}" ${me.intel < spec.cost || remain ? "disabled" : ""}><b>${spec.name}</b><small>${remain ? `${Math.ceil(remain * RULES.tickMs / 1000)}초` : `${spec.cost} 정보`}</small><span>${spec.detail}</span></button>`; }).join("");
    panel.querySelectorAll("[data-spy]").forEach(action => action.onclick = () => { const result = engine.launchEspionage(0, +select.value, action.dataset.spy); notify(result.message); engine.updateEspionageUI(); if (result.ok) panel.classList.add("hidden"); });
  };
  engine.updateEspionageUI();
}

export function updateEspionageUI(engine) { engine.updateEspionageUI?.(); }
