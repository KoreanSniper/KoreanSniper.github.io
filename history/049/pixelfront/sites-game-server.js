async function call(path, init = {}) {
  void path;
  void init;
  const error = new Error("온라인 서버는 보안 점검 중입니다.");
  error.status = 503;
  error.code = "MAINTENANCE";
  throw error;
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
