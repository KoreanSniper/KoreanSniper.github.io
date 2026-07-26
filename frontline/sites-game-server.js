import { auth } from "../community/js/firebase.js";

const API_BASE = globalThis.PIXELFRONT_API_BASE || localStorage.getItem("pixelfront-api-base") || "https://pixelfront-game-service.koreansniper.chatgpt.site";

async function call(path = "", init = {}) {
  await auth.authStateReady?.();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("게임 서버를 사용하려면 먼저 로그인해야 합니다.");
  const response = await fetch(`${API_BASE}/api/game${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `게임 서버 오류 (${response.status})`);
  return data;
}

export class PixelFrontServer {
  constructor() { this.sessionId = null; this.seq = 0; this.cursor = 0; }
  async create({ mode = "single", seed, mapType, name, aiCount }) {
    const data = await call("", { method: "POST", body: JSON.stringify({ action: "create", mode, seed, mapType, name, aiCount }) });
    this.sessionId = data.sessionId; this.seq = 0; this.cursor = 0;
    return data;
  }
  async join(sessionId, name) {
    const data = await call("", { method: "POST", body: JSON.stringify({ action: "join", sessionId, name }) });
    this.sessionId = data.sessionId; this.seq = 0; this.cursor = 0;
    return data;
  }
  async command(command) {
    if (!this.sessionId) throw new Error("게임 서버 세션이 없습니다.");
    return call("", { method: "POST", body: JSON.stringify({ action: "command", sessionId: this.sessionId, seq: ++this.seq, command }) });
  }
  async updates() {
    if (!this.sessionId) return [];
    const data = await call(`?sessionId=${encodeURIComponent(this.sessionId)}&cursor=${this.cursor}`);
    const commands = data.commands || [];
    if (commands.length) this.cursor = commands.at(-1).id;
    return commands;
  }
  async finish() {
    return call("", { method: "POST", body: JSON.stringify({ action: "finish", sessionId: this.sessionId }) });
  }
}
