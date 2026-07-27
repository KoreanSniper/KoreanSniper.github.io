import { auth } from "./auth/firebase.js";

const API_BASE = globalThis.PIXELFRONT_API_BASE || localStorage.getItem("pixelfront-api-base") || "https://pixelfront-authority.seoul2linejh.workers.dev";

async function call(path, init = {}) {
  await auth.authStateReady?.();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("寃뚯엫 ?쒕쾭瑜??ъ슜?섎젮硫?癒쇱? 濡쒓렇?명빐???⑸땲??");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `寃뚯엫 ?쒕쾭 ?ㅻ쪟 (${response.status})`);
  return data;
}

export function decodeOwnerSnapshot(encoded, length) {
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pairs = new Int32Array(bytes.buffer), owner = new Int16Array(length); let cursor = 0;
  for (let i = 0; i < pairs.length; i += 2) owner.fill(pairs[i], cursor, cursor += pairs[i + 1]);
  if (cursor !== length) throw new Error("?쒕쾭 吏???ㅻ깄?룹씠 ?먯긽?섏뿀?듬땲??");
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
  async command(command) { command={...command};if(Number.isInteger(command.targetOwner))command.targetOwner=this.toServerNation(command.targetOwner);if(Number.isInteger(command.target))command.target=this.toServerNation(command.target);return call(`/game/${encodeURIComponent(this.sessionId)}/command`,{method:"POST",body:JSON.stringify({command})}) }
  async state(full=true) { return call(`/game/${encodeURIComponent(this.sessionId)}/state?full=${full?1:0}`) }
}
