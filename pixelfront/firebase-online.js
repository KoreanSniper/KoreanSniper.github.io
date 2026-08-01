import { auth, db } from "./auth/firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { PixelFrontServer } from "./sites-game-server.js?v=4";

const ROOMS = "pixelfrontRooms";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomRef = code => doc(db, ROOMS, code);
const cleanCode = value => String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
const nameOf = () => String(document.querySelector("#playerName")?.value || "플레이어").trim().slice(0, 14) || "플레이어";

async function user() {
  if (auth.currentUser) return auth.currentUser;
  try { return (await signInAnonymously(auth)).user; }
  catch { throw new Error("온라인 플레이를 사용하려면 먼저 Google 로그인이 필요합니다."); }
}

async function unusedCode() {
  for (let tries = 0; tries < 8; tries++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.random() * alphabet.length | 0];
    if (!(await getDoc(roomRef(code))).exists()) return code;
  }
  throw new Error("방 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

export async function createFirebaseRoom(settings = {}) {
  const me = await user();
  const code = await unusedCode();
  const player = { uid: me.uid, name: nameOf(), joinedAt: Date.now(), host: true };
  const seed=Number.isInteger(settings.seed)?settings.seed>>>0:crypto.getRandomValues(new Uint32Array(1))[0];
  const authority=new PixelFrontServer(),server=await authority.create({seed,mapType:settings.map||"world",name:player.name,aiCount:Math.max(1,Math.min(50,Number(settings.ai)||8)),difficulty:settings.difficulty||"normal"});
  await setDoc(roomRef(code), {
    code, status: "waiting", hostId: me.uid, seed, settings, serverSessionId:server.sessionId,
    players: [player], playerIds: [me.uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  });
  return { code, uid: me.uid };
}

export async function joinFirebaseRoom(rawCode) {
  const me = await user();
  const code = cleanCode(rawCode);
  if (code.length !== 6) throw new Error("6자리 방 코드를 입력해 주세요.");
  await runTransaction(db, async tx => {
    const ref = roomRef(code), snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("존재하지 않는 방입니다.");
    const room = snap.data();
    if (room.status !== "waiting") throw new Error("이미 시작된 방입니다.");
    const players = (room.players || []).filter(p => p.uid !== me.uid);
    if (players.length >= 8) throw new Error("방이 가득 찼습니다.");
    players.push({ uid: me.uid, name: nameOf(), joinedAt: Date.now(), host: false });
    tx.update(ref, { players, playerIds: players.map(p => p.uid), updatedAt: serverTimestamp() });
  });
  return { code, uid: me.uid };
}

export function watchFirebaseRoom(code, onRoom, onError) {
  return onSnapshot(roomRef(cleanCode(code)), snap => onRoom(snap.exists() ? snap.data() : null), onError);
}

export async function startFirebaseRoom(code) {
  const me = await user(), ref = roomRef(cleanCode(code));
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().hostId !== me.uid) throw new Error("호스트만 게임을 시작할 수 있습니다.");
    tx.update(ref, { status: "starting", startedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function leaveFirebaseRoom(code) {
  const me = auth.currentUser;
  if (!me) return;
  const ref = roomRef(cleanCode(code));
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data(), players = (room.players || []).filter(p => p.uid !== me.uid);
    if (!players.length) { tx.delete(ref); return; }
    const nextHost = room.hostId === me.uid ? players[0].uid : room.hostId;
    tx.update(ref, {
      players: players.map(p => ({ ...p, host: p.uid === nextHost })),
      playerIds: players.map(p => p.uid), hostId: nextHost, updatedAt: serverTimestamp()
    });
  });
}

export { cleanCode };
