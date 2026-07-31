import { Engine } from "./engine.js";
import { RULES } from "./config.js";
import { short } from "./renderer.js";

const NAMES = ["아틀라스", "노바", "바이퍼", "오닉스", "솔라", "레이븐", "아이리스", "타이탄", "에코", "베가", "오로라", "크로노", "펄스", "제니스", "코멧", "가디언"];
const LEVELS = [0, 120, 420, 1100, 2500];
const ticks = seconds => Math.ceil(seconds * 1000 / RULES.tickMs);
export const SPECIALTIES = {
  assault: { name: "기동 공세", detail: "공격 +8% · 방어 -4%", ability: "전격전", abilityDetail: "25초간 공격 +20%" },
  guardian: { name: "종심 방어", detail: "방어 +10% · 공격 -4%", ability: "철벽", abilityDetail: "30초간 방어 +25%" },
  logistics: { name: "전선 병참", detail: "병력 생산 +12%", ability: "긴급 보급", abilityDetail: "병력 최대 8K 즉시 보급" }
};

const makeCommander = (engine, nation) => ({ name: NAMES[((engine.map.seed >>> 0) + nation.id * 7) % NAMES.length], xp: 0, level: 1, specialty: null, abilityReady: 0, attackUntil: 0, defenseUntil: 0 });
const levelFor = xp => { let level = 1; for (let i = 1; i < LEVELS.length; i++) if (xp >= LEVELS[i]) level = i + 1; return Math.min(5, level); };

export function installCommanders(engine, notify = () => {}) {
  for (const nation of engine.nations) { nation.commander = { ...makeCommander(engine, nation), ...(nation.commander || {}) }; engine.applyDoctrine?.(nation); }
  Engine.prototype.setCommanderSpecialty = function (nationId, key) {
    const nation = this.nations[nationId], commander = nation?.commander, spec = SPECIALTIES[key];
    if (!nation?.alive || !commander || !spec) return { ok: false, message: "선택할 수 없는 특화입니다." };
    if (commander.level < 2) return { ok: false, message: "사령관 2레벨부터 특화를 선택할 수 있습니다." };
    if (commander.specialty) return { ok: false, message: "이미 사령관 특화가 확정되었습니다." };
    commander.specialty = key; this.applyDoctrine?.(nation); return { ok: true, message: `${commander.name} · ${spec.name} 특화` };
  };
  Engine.prototype.useCommanderAbility = function (nationId) {
    const nation = this.nations[nationId], commander = nation?.commander, spec = SPECIALTIES[commander?.specialty];
    if (!nation?.alive || !commander || commander.level < 3 || !spec) return { ok: false, message: "사령관 3레벨과 특화 선택이 필요합니다." };
    if (this.tick < commander.abilityReady) return { ok: false, message: `사령관 능력 재사용까지 ${Math.ceil((commander.abilityReady - this.tick) * RULES.tickMs / 1000)}초` };
    commander.abilityReady = this.tick + ticks(110);
    if (commander.specialty === "assault") commander.attackUntil = this.tick + ticks(25);
    else if (commander.specialty === "guardian") commander.defenseUntil = this.tick + ticks(30);
    else { const cap = RULES.popBase + nation.tiles.size * RULES.popPerTile, gain = Math.min(8000, Math.max(3000, Math.floor(cap * .12))); nation.troops = Math.min(cap, nation.troops + gain); }
    this.applyDoctrine?.(nation); return { ok: true, message: `${commander.name} · ${spec.ability} 발동` };
  };

  const oldTransfer = Engine.prototype.transfer;
  Engine.prototype.transfer = function (tile, to) {
    const from = this.owner[tile]; oldTransfer.call(this, tile, to);
    if (to < 0 || from < 0 || from === to) return;
    const nation = this.nations[to], commander = nation?.commander; if (!commander) return;
    const before = commander.level; commander.xp += 1; commander.level = levelFor(commander.xp);
    if (commander.level !== before) { this.applyDoctrine?.(nation); if (to === 0) notify(`사령관 ${commander.name} ${commander.level}레벨 달성`); }
  };
  const oldStep = Engine.prototype.step;
  Engine.prototype.step = function () {
    oldStep.call(this);
    for (const nation of this.nations) {
      if (!nation.alive || !nation.commander) continue; const commander = nation.commander;
      if ((commander.attackUntil && commander.attackUntil <= this.tick) || (commander.defenseUntil && commander.defenseUntil <= this.tick)) { if (commander.attackUntil <= this.tick) commander.attackUntil = 0; if (commander.defenseUntil <= this.tick) commander.defenseUntil = 0; this.applyDoctrine?.(nation); }
      if (!nation.ai) continue;
      if (commander.level >= 2 && !commander.specialty) { const incoming = this.attacks.some(a => a.defender === nation.id), key = incoming ? "guardian" : nation.troops < 12000 ? "logistics" : "assault"; this.setCommanderSpecialty(nation.id, key); }
      if (commander.level >= 3 && this.tick % 500 === 0 && this.tick >= commander.abilityReady && this.random() < .42) this.useCommanderAbility(nation.id);
    }
  };

  if (typeof document === "undefined") return;
  const button = document.createElement("button"); button.className = "commander-open"; button.type = "button"; button.innerHTML = '<small>COMMANDER</small><b>LV.1</b>'; document.querySelector(".game-shell")?.append(button);
  const panel = document.createElement("aside"); panel.className = "commander-panel hidden"; panel.innerHTML = '<button class="commander-close" type="button">×</button><p class="eyebrow">FIELD COMMAND</p><h2></h2><p class="commander-rank"></p><div class="commander-xp"><i></i></div><p class="commander-effect"></p><div class="commander-specs"></div><button class="commander-ability" type="button"></button>'; document.body.append(panel);
  const style = document.createElement("style"); style.textContent = `.commander-open{position:absolute;z-index:16;right:18px;bottom:98px;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #55a8ff55;background:#08111aeb;color:#55a8ff;cursor:pointer}.commander-open small{font-size:7px;letter-spacing:.13em}.commander-open b{font-size:10px}.commander-panel{position:fixed;z-index:97;left:50%;top:50%;transform:translate(-50%,-50%);width:min(540px,calc(100vw - 28px));padding:28px;background:#08111af7;border:1px solid #55a8ff66;box-shadow:0 35px 100px #000d}.commander-panel.hidden{display:none}.commander-panel h2{font-size:37px;margin:8px 0}.commander-rank,.commander-effect{color:#8d99a2;font-size:10px}.commander-xp{height:4px;margin:14px 0;background:#ffffff15}.commander-xp i{display:block;height:100%;background:#55a8ff}.commander-specs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:18px 0}.commander-specs button{display:grid;gap:6px;text-align:left;padding:13px;border:1px solid #ffffff1d;background:#111b24;color:#eef3f5;cursor:pointer}.commander-specs button:hover:not(:disabled),.commander-specs button.active{border-color:#55a8ff}.commander-specs button:disabled{opacity:.45;cursor:default}.commander-specs span{color:#84919a;font-size:8px;line-height:1.5}.commander-ability{width:100%;padding:13px;border:1px solid #55a8ff66;background:#55a8ff16;color:#79bcff;font-weight:900;cursor:pointer}.commander-ability:disabled{opacity:.4;cursor:default}.commander-close{position:absolute;right:10px;top:10px;border:0;background:none;color:#fff;font-size:20px;cursor:pointer}@media(max-width:700px){.commander-open{right:8px;bottom:156px}.commander-specs{grid-template-columns:1fr}.commander-panel{padding:22px;max-height:86vh;overflow:auto}}`; document.head.append(style);
  button.onclick = () => { panel.classList.remove("hidden"); engine.updateCommanderUI?.(); }; panel.querySelector(".commander-close").onclick = () => panel.classList.add("hidden");
  panel.querySelector(".commander-ability").onclick = () => { const result = engine.useCommanderAbility(0); notify(result.message); engine.updateCommanderUI(); if (result.ok) panel.classList.add("hidden"); };
  engine.updateCommanderUI = () => { const nation = engine.nations[0], commander = nation.commander, spec = SPECIALTIES[commander.specialty], next = LEVELS[commander.level] ?? LEVELS.at(-1), previous = LEVELS[commander.level - 1] || 0, progress = commander.level >= 5 ? 100 : (commander.xp - previous) / Math.max(1, next - previous) * 100; button.querySelector("b").textContent = `LV.${commander.level}`; panel.querySelector("h2").textContent = commander.name; panel.querySelector(".commander-rank").textContent = `LEVEL ${commander.level} · 경험치 ${commander.xp}${commander.level < 5 ? ` / ${next}` : " · 최고 레벨"}`; panel.querySelector(".commander-xp i").style.width = `${Math.max(0, Math.min(100, progress))}%`; panel.querySelector(".commander-effect").textContent = `지휘 보너스 · 공격 +${(commander.level - 1) * 3}% · 방어 +${(commander.level - 1) * 2}%${spec ? ` · ${spec.detail}` : ""}`; panel.querySelector(".commander-specs").innerHTML = Object.entries(SPECIALTIES).map(([key, value]) => `<button type="button" data-spec="${key}" class="${commander.specialty === key ? "active" : ""}" ${commander.level < 2 || !!commander.specialty ? "disabled" : ""}><b>${value.name}</b><span>${value.detail}<br>${value.ability}: ${value.abilityDetail}</span></button>`).join(""); panel.querySelectorAll("[data-spec]").forEach(choice => choice.onclick = () => { const result = engine.setCommanderSpecialty(0, choice.dataset.spec); notify(result.message); engine.updateCommanderUI(); }); const ability = panel.querySelector(".commander-ability"), remain = Math.max(0, commander.abilityReady - engine.tick); ability.disabled = commander.level < 3 || !spec || remain > 0; ability.textContent = !spec ? "2레벨에서 특화를 선택하세요" : commander.level < 3 ? `${spec.ability} · 3레벨 필요` : remain ? `${spec.ability} · ${Math.ceil(remain * RULES.tickMs / 1000)}초` : `${spec.ability} 발동 · ${spec.abilityDetail}`; };
  engine.updateCommanderUI();
}

export function updateCommanderUI(engine) { engine.updateCommanderUI?.(); }
