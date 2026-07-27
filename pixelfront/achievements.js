import { Engine } from "./engine.js";
import { short } from "./renderer.js";

const PROFILE_KEY = "pixelfront-medals-v1";
const profile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || { medals: 0, unlocked: {} }; } catch { return { medals: 0, unlocked: {} }; } };
const saveProfile = value => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(value)); } catch {} };
const citiesHeld = e => [...(e.cities?.values?.() || [])].filter(city => e.owner[city.tile] === 0).length;

export const ACHIEVEMENTS = {
  conqueror: { name: "국경 파괴자", detail: "적 영토 500칸 점령", medals: 1, reward: "+4K 병력", done: (e, s) => s.conqueredTiles >= 500, progress: (e, s) => `${Math.min(500, s.conqueredTiles)} / 500`, apply: e => e.nations[0].troops += 4000 },
  cities: { name: "도시의 지배자", detail: "전략 도시 3곳 동시 점령", medals: 1, reward: "+5K 병력", done: e => citiesHeld(e) >= 3, progress: e => `${citiesHeld(e)} / 3`, apply: e => e.nations[0].troops += 5000 },
  architect: { name: "전쟁 설계자", detail: "건물 6개 보유", medals: 1, reward: "+3.5K 병력", done: e => (e.nations[0].buildingTiles?.size || 0) >= 6, progress: e => `${e.nations[0].buildingTiles?.size || 0} / 6`, apply: e => e.nations[0].troops += 3500 },
  marine: { name: "푸른 교두보", detail: "해상 상륙 작전 성공", medals: 1, reward: "+4.5K 병력", done: e => (e.navalMissions || []).some(m => m.attacker === 0 && m.state === "landed"), progress: e => (e.navalMissions || []).some(m => m.attacker === 0 && m.state === "landed") ? "완료" : "미달성", apply: e => e.nations[0].troops += 4500 },
  capital: { name: "불굴의 수도", detail: "함락된 수도 탈환", medals: 2, reward: "+7K 병력", done: (e, s) => s.capitalRecovered, progress: (e, s) => s.capitalWasLost ? "탈환 대기" : "미달성", apply: e => e.nations[0].troops += 7000 },
  power: { name: "세계 강국", detail: "전체 육지의 10% 확보", medals: 3, reward: "+10K 병력", done: (e, s) => e.nations[0].tiles.size >= s.landTiles * .1, progress: (e, s) => `${Math.min(10, e.nations[0].tiles.size / Math.max(1, s.landTiles) * 100).toFixed(1)}% / 10%`, apply: e => e.nations[0].troops += 10000 }
};

export function installAchievements(engine, notify = () => {}) {
  engine.achievementState ||= { completed: [], conqueredTiles: 0, capitalWasLost: false, capitalRecovered: false, landTiles: engine.map.land.reduce((sum, value) => sum + (value ? 1 : 0), 0) };
  const oldTransfer = Engine.prototype.transfer;
  Engine.prototype.transfer = function (tile, to) { const from = this.owner[tile]; oldTransfer.call(this, tile, to); if (to === 0 && from > 0) this.achievementState.conqueredTiles++; };
  const oldStep = Engine.prototype.step;
  Engine.prototype.step = function () {
    oldStep.call(this); const me = this.nations[0], state = this.achievementState;
    if (!me || me.spawn < 0) return;
    if (me.capitalLostAt != null) state.capitalWasLost = true;
    else if (state.capitalWasLost) state.capitalRecovered = true;
    if (this.tick % 20) return;
    const completed = new Set(state.completed || []);
    for (const [id, achievement] of Object.entries(ACHIEVEMENTS)) {
      if (completed.has(id) || !achievement.done(this, state)) continue;
      completed.add(id); state.completed = [...completed]; achievement.apply(this);
      const saved = profile(); saved.medals = (saved.medals || 0) + achievement.medals; saved.unlocked ||= {}; saved.unlocked[id] ||= Date.now(); saveProfile(saved);
      notify(`훈장 획득: ${achievement.name} · ${achievement.reward}`); this.addCombatFeed?.("success", `훈장 획득 · ${achievement.name}`);
    }
    this.updateAchievementUI?.();
  };

  if (typeof document === "undefined") return;
  const button = document.createElement("button"); button.className = "medal-open"; button.type = "button"; button.innerHTML = '<small>MEDALS</small><b>0</b>';
  document.querySelector(".game-shell")?.append(button);
  const panel = document.createElement("aside"); panel.className = "medal-panel hidden"; panel.innerHTML = '<button class="medal-close" type="button">×</button><p class="eyebrow">SERVICE RECORD</p><h2>훈장 기록</h2><p class="medal-total"></p><div class="medal-grid"></div>'; document.body.append(panel);
  const style = document.createElement("style"); style.textContent = `.medal-open{position:absolute;z-index:16;right:18px;bottom:58px;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #f4c84c55;background:#08111aeb;color:#f4c84c;cursor:pointer}.medal-open small{font-size:7px;letter-spacing:.15em}.medal-open b{font-size:11px}.medal-panel{position:fixed;z-index:97;left:50%;top:50%;transform:translate(-50%,-50%);width:min(650px,calc(100vw - 28px));max-height:86vh;overflow:auto;padding:28px;background:#0a1119f7;border:1px solid #f4c84c55;box-shadow:0 35px 100px #000d}.medal-panel.hidden{display:none}.medal-panel h2{font-size:35px;margin:8px 0}.medal-total{color:#f4c84c;font-size:10px}.medal-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.medal-card{display:grid;grid-template-columns:1fr auto;gap:6px;padding:14px;border:1px solid #ffffff18;background:#111a23}.medal-card.done{border-color:#f4c84c66;background:#f4c84c0a}.medal-card b{font-size:11px}.medal-card em{color:#f4c84c;font-size:9px;font-style:normal}.medal-card span{grid-column:1/-1;color:#84919a;font-size:9px}.medal-card small{color:#b8c1c7;font-size:8px}.medal-close{position:absolute;right:10px;top:10px;border:0;background:none;color:#fff;font-size:20px;cursor:pointer}@media(max-width:700px){.medal-open{right:8px;bottom:116px}.medal-grid{grid-template-columns:1fr}.medal-panel{padding:22px}}`; document.head.append(style);
  button.onclick = () => { panel.classList.remove("hidden"); engine.updateAchievementUI?.(); }; panel.querySelector(".medal-close").onclick = () => panel.classList.add("hidden");
  engine.updateAchievementUI = () => { const state = engine.achievementState, saved = profile(), completed = new Set(state.completed || []); button.querySelector("b").textContent = saved.medals || 0; panel.querySelector(".medal-total").textContent = `누적 훈장 ${saved.medals || 0}개 · 이번 경기 ${completed.size}/${Object.keys(ACHIEVEMENTS).length}`; panel.querySelector(".medal-grid").innerHTML = Object.entries(ACHIEVEMENTS).map(([id, item]) => `<article class="medal-card ${completed.has(id) ? "done" : ""}"><b>${item.name}</b><em>◆ ${item.medals}</em><span>${item.detail}</span><small>${completed.has(id) ? "획득 완료" : item.progress(engine, state)} · 보상 ${item.reward}</small></article>`).join(""); };
  engine.updateAchievementUI();
}

export function updateAchievementUI(engine) { engine.updateAchievementUI?.(); }
