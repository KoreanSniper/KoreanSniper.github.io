import { Engine } from "./engine.js";
import { short } from "./renderer.js";

const MISSIONS = [
  { id: "expand", title: "교두보 확보", detail: "영토 1,000칸 확보", reward: 4000, done: e => e.nations[0].tiles.size >= 1000 },
  { id: "builder", title: "군수 기반", detail: "건물 3개 건설", reward: 6000, done: e => (e.nations[0].buildingTiles?.size || 0) >= 3 },
  { id: "city", title: "전략 거점", detail: "도시 1곳 점령", reward: 8000, done: e => [...(e.cities?.values?.() || [])].some(c => e.owner[c.tile] === 0) },
  { id: "conquest", title: "첫 번째 승전", detail: "적 국가 1곳 제거", reward: 12000, done: e => e.nations.slice(1).some(n => n.spawn >= 0 && !n.alive) }
];

export function installMissions(engine, notify = () => {}) {
  engine.missionState ||= { completed: [] };
  const panel = typeof document !== "undefined" ? document.createElement("aside") : null;
  if (panel) {
    panel.className = "mission-panel hidden";
    panel.innerHTML = '<div class="mission-kicker">OPERATIONS</div><strong id="missionTitle"></strong><small id="missionDetail"></small><span id="missionReward"></span>';
    document.querySelector("main")?.append(panel);
  }
  const render = () => {
    if (!panel || engine.nations[0].spawn < 0) return;
    panel.classList.remove("hidden");
    const completed = new Set(engine.missionState.completed || []), current = MISSIONS.find(m => !completed.has(m.id));
    if (!current) {
      panel.innerHTML = '<div class="mission-kicker">OPERATIONS</div><strong>모든 작전 완료</strong><small>이제 세계 제패에 집중하세요.</small>';
      return;
    }
    panel.querySelector("#missionTitle").textContent = current.title;
    panel.querySelector("#missionDetail").textContent = current.detail;
    panel.querySelector("#missionReward").textContent = `보상 +${short(current.reward)} 병력`;
  };
  const oldStep = Engine.prototype.step;
  Engine.prototype.step = function () {
    oldStep.call(this);
    if (!this.running || this.tick % 20) return;
    this.missionState ||= { completed: [] };
    const completed = new Set(this.missionState.completed || []), current = MISSIONS.find(m => !completed.has(m.id));
    if (current?.done(this)) {
      completed.add(current.id);
      this.missionState.completed = [...completed];
      this.nations[0].troops += current.reward;
      notify(`작전 완료: ${current.title} · 병력 +${short(current.reward)}`);
    }
    render();
  };
  engine.renderMission = render;
  render();
}

export { MISSIONS };
