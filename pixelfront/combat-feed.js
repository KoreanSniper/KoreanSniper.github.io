import { Engine } from "./engine.js";
import { RULES } from "./config.js";

const timeText = tick => {
  const seconds = Math.floor(tick * RULES.tickMs / 1000);
  return `${String(seconds / 60 | 0).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function installCombatFeed(engine, notify = () => {}) {
  engine.combatFeed ||= [];
  engine.combatAlertState ||= {};
  Engine.prototype.addCombatFeed = function (kind, text, important = false) {
    const last = this.combatFeed?.[0];
    if (last?.text === text && this.tick - last.tick < 80) return;
    this.combatFeed ||= [];
    this.combatFeed.unshift({ kind, text, important, tick: this.tick });
    this.combatFeed.length = Math.min(30, this.combatFeed.length);
    if (important) notify(text);
    this.updateCombatFeedUI?.();
  };

  const oldStep = Engine.prototype.step;
  Engine.prototype.step = function () {
    const me = this.nations[0], beforeCapital = me?.capitalLostAt != null;
    const navalBefore = new Map((this.navalMissions || []).filter(m => m.attacker === 0).map(m => [m.id, m.state]));
    const aliveBefore = new Set(this.nations.filter(n => n.alive).map(n => n.id));
    const frontsBefore = new Set(this.attacks.filter(a => a.alive !== false).map(a => a.id));
    oldStep.call(this);
    if (!me || me.spawn < 0) return;
    const capitalLost = me.capitalLostAt != null;
    if (!beforeCapital && capitalLost) this.addCombatFeed("capital", "수도가 함락되었습니다. 60초 안에 탈환하세요.", true);
    if (beforeCapital && !capitalLost) this.addCombatFeed("success", "수도를 탈환했습니다.", true);
    for (const mission of this.navalMissions || []) {
      if (mission.attacker !== 0) continue;
      const before = navalBefore.get(mission.id);
      if (before === "sailing" && mission.state === "ready") this.addCombatFeed("naval", "상륙 부대가 목표 해안에 도착했습니다.", true);
      if (before === "ready" && mission.state === "landed") this.addCombatFeed("naval", "상륙 작전이 개시되었습니다.", true);
    }
    for (const attack of this.attacks) {
      if (frontsBefore.has(attack.id)) continue;
      if (attack.defender === 0) this.addCombatFeed("danger", `${this.nations[attack.attacker]?.name || "적군"}이 공격을 시작했습니다.`, true);
      else if (attack.attacker === 0 && attack.defender >= 0) this.addCombatFeed("attack", `${this.nations[attack.defender]?.name || "적국"} 전선이 개설되었습니다.`);
    }
    for (const id of aliveBefore) if (id && !this.nations[id]?.alive) this.addCombatFeed("eliminated", `${this.nations[id]?.name || "국가"} 멸망`);
  };

  if (typeof document === "undefined") return;
  const shell = document.querySelector(".game-shell"), item = document.createElement("div");
  item.className = "feed-hud"; item.innerHTML = '<small>INTEL</small><button type="button">전투 기록</button>';
  const panel = document.createElement("aside"); panel.className = "feed-panel hidden";
  panel.innerHTML = '<button class="feed-close" type="button">×</button><p class="eyebrow">BATTLE INTELLIGENCE</p><h2>전투 기록</h2><div class="feed-list"></div>';
  document.body.append(panel);
  const style = document.createElement("style");
  style.textContent = `.feed-hud{position:absolute;z-index:16;right:18px;bottom:18px;display:flex;align-items:center;gap:10px;padding:9px 12px;background:#08111aeb;border:1px solid #ffffff28}.feed-hud small{color:#6f7d87;font-size:7px;letter-spacing:.15em}.feed-hud button{border:0;background:none;padding:0;color:#f4f6f7;font-size:10px;font-weight:900;cursor:pointer}.feed-hud button:hover{color:var(--acid)}.feed-panel{position:fixed;z-index:97;right:18px;top:76px;width:min(390px,calc(100vw - 28px));max-height:calc(100vh - 96px);overflow:auto;padding:22px;background:#08111af5;border:1px solid #ffffff25;box-shadow:0 25px 80px #000c}.feed-panel.hidden{display:none}.feed-panel h2{font-size:28px;margin:7px 0 16px}.feed-list{display:grid}.feed-entry{display:grid;grid-template-columns:58px 1fr;gap:10px;padding:11px 2px;border-top:1px solid #ffffff12;font-size:9px;color:#cbd2d7}.feed-entry time{color:#65727d}.feed-entry[data-kind=capital],.feed-entry[data-kind=danger]{color:#ff6969}.feed-entry[data-kind=success]{color:#c8ff3d}.feed-entry[data-kind=naval]{color:#55a8ff}.feed-entry[data-kind=supply]{color:#f4c84c}.feed-empty{padding:18px 0;color:#697680;font-size:9px}.feed-close{position:absolute;right:9px;top:9px;border:0;background:none;color:#fff;font-size:20px;cursor:pointer}@media(max-width:700px){.feed-hud{right:8px;bottom:76px}.feed-panel{right:8px;top:68px;max-height:72vh}}`;
  document.head.append(style);
  shell?.append(item);
  item.querySelector("button").onclick = event => { event.stopPropagation(); panel.classList.remove("hidden"); panel.style.display = "block"; engine.updateCombatFeedUI?.(); };
  panel.querySelector(".feed-close").onclick = () => { panel.classList.add("hidden"); panel.style.display = ""; };
  engine.updateCombatFeedUI = () => {
    const list = panel.querySelector(".feed-list");
    list.innerHTML = engine.combatFeed.length ? engine.combatFeed.map(entry => `<div class="feed-entry" data-kind="${entry.kind}"><time>${timeText(entry.tick)}</time><span>${entry.text}</span></div>`).join("") : '<p class="feed-empty">아직 보고된 전투 정보가 없습니다.</p>';
    const unread = engine.combatFeed.filter(entry => entry.important && entry.tick > (engine.combatFeedReadAt || 0)).length;
    item.querySelector("button").textContent = unread ? `긴급 정보 ${unread}` : "전투 기록";
  };
  panel.addEventListener("click", () => { engine.combatFeedReadAt = engine.tick; engine.updateCombatFeedUI(); });
  engine.updateCombatFeedUI();
}

export function updateCombatFeedUI(engine) { engine.updateCombatFeedUI?.(); }
