import { auth, db } from "./auth/firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { PixelFrontServer } from "./sites-game-server.js";

const ROOMS = "pixelfrontRooms";
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomRef = code => doc(db, ROOMS, code);
const cleanCode = value => String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
const nameOf = () => String(document.querySelector("#playerName")?.value || "?뚮젅?댁뼱").trim().slice(0, 14) || "?뚮젅?댁뼱";

async function user() {
  if (auth.currentUser) return auth.currentUser;
  try { return (await signInAnonymously(auth)).user; }
  catch { throw new Error("?⑤씪???뚮젅?대? ?ъ슜?섎젮硫?癒쇱? Google 濡쒓렇?몄씠 ?꾩슂?⑸땲??"); }
}

async function unusedCode() {
  for (let tries = 0; tries < 8; tries++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.random() * alphabet.length | 0];
    if (!(await getDoc(roomRef(code))).exists()) return code;
  }
  throw new Error("諛?肄붾뱶瑜?留뚮뱾吏 紐삵뻽?듬땲?? ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??");
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
  if (code.length !== 6) throw new Error("6?먮━ 諛?肄붾뱶瑜??낅젰??二쇱꽭??");
  await runTransaction(db, async tx => {
    const ref = roomRef(code), snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("議댁옱?섏? ?딅뒗 諛⑹엯?덈떎.");
    const room = snap.data();
    if (room.status !== "waiting") throw new Error("?대? ?쒖옉??諛⑹엯?덈떎.");
    const players = (room.players || []).filter(p => p.uid !== me.uid);
    if (players.length >= 8) throw new Error("諛⑹씠 媛??李쇱뒿?덈떎.");
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
    if (!snap.exists() || snap.data().hostId !== me.uid) throw new Error("?몄뒪?몃쭔 寃뚯엫???쒖옉?????덉뒿?덈떎.");
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
