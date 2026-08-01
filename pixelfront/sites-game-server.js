import { auth } from "./auth/firebase.js";

const API_BASE = "https://pixelfront-authority.seoul2linejh.workers.dev";

async function call(path, init = {}) {
  await auth.authStateReady?.();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("게임 서버를 사용하려면 먼저 로그인해야 합니다.");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await response.text();let data;try{data=text?JSON.parse(text):{}}catch{const error=new Error(`게임 서버가 잘못된 응답을 보냈습니다. (${response.status})`);error.status=response.status;error.code="INVALID_SERVER_RESPONSE";throw error}
  if (!response.ok) {
    const error = new Error(data.error || `게임 서버 오류 (${response.status})`);
    error.status = response.status;
    error.code = data.error || "SERVER_ERROR";
    throw error;
  }
  return data;
}

export function decodeOwnerSnapshot(encoded, length) {
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pairs = new Int32Array(bytes.buffer), owner = new Int16Array(length); let cursor = 0;
  for (let i = 0; i < pairs.length; i += 2) owner.fill(pairs[i], cursor, cursor += pairs[i + 1]);
  if (cursor !== length) throw new Error("서버 지도 데이터가 손상되었습니다.");
  return owner;
}

export class PixelFrontServer {
  constructor() { this.sessionId = null; this.playerId = 0; }
  async create({ seed, mapType, name, aiCount, difficulty }) {
    const data = await call("/game", { method:"POST", body:JSON.stringify({ seed, mapType, name, aiCount, difficulty }) });
    this.sessionId=data.sessionId;this.playerId=data.playerId||0;return data;
  }
  async join(sessionId) {
    const data=await call(`/game/${encodeURIComponent(sessionId)}/join`,{method:"POST",body:"{}"});
    this.sessionId=data.sessionId;this.playerId=data.playerId;return data;
  }
  async spawn(tile) { return call(`/game/${encodeURIComponent(this.sessionId)}/spawn`,{method:"POST",body:JSON.stringify({tile})}) }
  toServerNation(id){return this.playerId===0?id:id===0?this.playerId:id===this.playerId?0:id}
  toLocalNation(id){return this.toServerNation(id)}
  async command(command) { command={...command};if(Number.isInteger(command.targetOwner))command.targetOwner=this.toServerNation(command.targetOwner);return call(`/game/${encodeURIComponent(this.sessionId)}/command`,{method:"POST",body:JSON.stringify({command})}) }
  async state(full=true) { return call(`/game/${encodeURIComponent(this.sessionId)}/state?full=${full?1:0}`) }
}
