import { getNicknameIssue, isAllowedNickname, getSafeNickname } from "../nickname-policy.js";

let auth = null;
let db = null;
let onAuthStateChanged = null;
let signOut = null;
let addDoc = null;
let collection = null;
let doc = null;
let deleteDoc = null;
let getDoc = null;
let getDocs = null;
let signInAnonymously = null;
let limit = null;
let orderBy = null;
let onSnapshot = null;
let query = null;
let setDoc = null;
let runTransaction = null;
let serverTimestamp = null;
let updateDoc = null;
let where = null;
let firebaseLoadPromise = null;
let firebaseUnavailable = false;
let firebaseListenerInstalled = false;
let authAnonymousPromise = null;

const BOARD_SIZE = 11;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const WIN_LENGTH = 5;
const ROOM_COLLECTION = "gomokuRooms";
const AI_MEMORY_COLLECTION = "gomokuAiMemory";
const MATCHMAKING_COLLECTION = "gomokuMatchmaking";
const MATCHMAKING_DOC = "global";
const MATCH_WAIT_MS = 12000;
const AI_DELAY_MS = 450;
const AI_SEAT = "O";
const GUEST_KEY = "gomoku.guestId";
const NAME_KEY = "gomoku.displayName";
const AI_DIFFICULTY_KEY = "gomoku.aiDifficulty";
const DEBUG = false;
const MOVE_TILE_SPAWN_INTERVAL = 5;
const BOMB_TILE_SPAWN_INTERVAL = 20;
const MOVE_TILE_COUNT = 3;
const SPECIAL_RADIUS = 4;
const BOMB_TIMER_START = 10;
const RAILGUN_LIMIT = 3;
const RAILGUN_LINE_LENGTH = 5;
const PUSH_LIMIT = 2;
const AI_CHUNK_SIZE = 8;
const AI_MEMORY_MIN_USES = 2;

const DIRECTIONS = [
  { key: "N", dr: -1, dc: 0, label: "↑" },
  { key: "NE", dr: -1, dc: 1, label: "↗" },
  { key: "E", dr: 0, dc: 1, label: "→" },
  { key: "SE", dr: 1, dc: 1, label: "↘" },
  { key: "S", dr: 1, dc: 0, label: "↓" },
  { key: "SW", dr: 1, dc: -1, label: "↙" },
  { key: "W", dr: 0, dc: -1, label: "←" },
  { key: "NW", dr: -1, dc: -1, label: "↖" },
];

const CENTER_POINTS = new Set([
  idx(5, 5),
  idx(2, 2), idx(2, 8),
  idx(8, 2), idx(8, 8),
]);

const ui = {
  board: null,
  status: null,
  turnInfo: null,
  roomInfo: null,
  matchStatus: null,
  playerName: null,
  aiDifficulty: null,
  accountStatus: null,
  accountLogoutBtn: null,
  lobbyStatus: null,
  lobbyList: null,
  turnHistory: null,
  chatMessages: null,
  chatInput: null,
  chatStatus: null,
  chatSendBtn: null,
  specialPanel: null,
  railgunBtn: null,
  directionGrid: null,
};

  const session = {
  mode: "idle",
  roomRef: null,
  roomId: null,
  seat: null,
  host: false,
  unsubscribe: null,
  timeoutId: null,
  aiTimer: null,
  aiThinking: false,
  roomStatus: null,
  notice: "",
    chatUnsubscribe: null,
    chatLog: [],
    lobbyUnsubscribe: null,
    lobbyRooms: [],
  };

  let historyVersion = 0;
  let lastRenderedHistoryKey = "";

let authUser = null;
let authReady = false;
let gameState = createInitialState();
const aiMemoryCache = new Map();
let lastValidPlayerName = "";

const FIVE_LINES = buildFiveLines();

async function ensureFirebase() {
  if (auth && db && onAuthStateChanged) return true;
  if (firebaseUnavailable || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    authReady = true;
    return false;
  }
  if (firebaseLoadPromise) return firebaseLoadPromise;

  firebaseLoadPromise = (async () => {
    try {
      const firebaseModule = await import("../community/js/firebase.js");
      const authModule = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
      const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

      auth = firebaseModule.auth;
      db = firebaseModule.db;
      onAuthStateChanged = authModule.onAuthStateChanged;
      signOut = authModule.signOut;
      signInAnonymously = authModule.signInAnonymously;
      addDoc = firestoreModule.addDoc;
      collection = firestoreModule.collection;
      doc = firestoreModule.doc;
      deleteDoc = firestoreModule.deleteDoc;
      getDoc = firestoreModule.getDoc;
      getDocs = firestoreModule.getDocs;
      limit = firestoreModule.limit;
      orderBy = firestoreModule.orderBy;
      onSnapshot = firestoreModule.onSnapshot;
      query = firestoreModule.query;
      setDoc = firestoreModule.setDoc;
      runTransaction = firestoreModule.runTransaction;
      serverTimestamp = firestoreModule.serverTimestamp;
      updateDoc = firestoreModule.updateDoc;
      where = firestoreModule.where;

      if (!firebaseListenerInstalled) {
        firebaseListenerInstalled = true;
onAuthStateChanged(auth, handleAuthStateChanged);
      }

      firebaseUnavailable = false;
      return true;
    } catch (error) {
      console.warn("Firebase를 불러오지 못했습니다.", error);
      firebaseUnavailable = true;
      authReady = true;
      return false;
    } finally {
      firebaseLoadPromise = null;
    }
  })();

  return firebaseLoadPromise;
}

function handleAuthStateChanged(user) {
  authUser = user;
  authReady = true;
  syncNameField();
  updateAccountPanel();
  if (authUser) {
    subscribeLobbyRooms();
  } else {
    clearLobbyListener();
    session.lobbyRooms = [];
  }
  renderAll();
}

window.startLocalAIMatch = startLocalAIMatch;
window.startOnlineMatch = startOnlineMatch;
window.cancelOnlineMatch = cancelOnlineMatch;
window.restartCurrentGame = restartCurrentGame;
window.goHome = goHome;
window.copyTurnHistory = copyTurnHistory;
window.copyBoardPositions = copyBoardPositions;
window.sendChatMessage = sendChatMessage;
window.activateRailgun = activateRailgun;
window.choosePushDirection = choosePushDirection;
window.logoutCurrentAccount = logoutCurrentAccount;
window.watchGomokuRoom = watchGomokuRoom;

document.addEventListener("DOMContentLoaded", () => {
  ui.board = document.getElementById("board");
  ui.status = document.getElementById("gameStatus");
  ui.turnInfo = document.getElementById("turnInfo");
  ui.roomInfo = document.getElementById("roomInfo");
  ui.matchStatus = document.getElementById("matchStatus");
  ui.playerName = document.getElementById("playerName");
  ui.aiDifficulty = document.getElementById("aiDifficulty");
  ui.accountStatus = document.getElementById("accountStatus");
  ui.accountLogoutBtn = document.getElementById("accountLogoutBtn");
  ui.lobbyStatus = document.getElementById("lobbyStatus");
  ui.lobbyList = document.getElementById("lobbyList");
  ui.turnHistory = document.getElementById("turnHistory");
  ui.chatMessages = document.getElementById("chatMessages");
  ui.chatInput = document.getElementById("chatInput");
  ui.chatStatus = document.getElementById("chatStatus");
  ui.chatSendBtn = document.getElementById("chatSendBtn");
  ui.specialPanel = document.getElementById("specialPanel");
  ui.railgunBtn = document.getElementById("railgunBtn");
  ui.directionGrid = document.getElementById("directionGrid");

  if (ui.playerName) {
    const savedName = localStorage.getItem(NAME_KEY) || "";
    ui.playerName.value = isAllowedNickname(savedName, authUser || {}) ? savedName : "";
    if (!isAllowedNickname(savedName, authUser || {})) {
      localStorage.removeItem(NAME_KEY);
    }
    lastValidPlayerName = ui.playerName.value.trim();
    ui.playerName.addEventListener("input", () => {
      const typed = ui.playerName.value.trim();
      if (!typed) {
        lastValidPlayerName = "";
        localStorage.removeItem(NAME_KEY);
        renderAll();
        return;
      }

      if (!isAllowedNickname(typed, authUser || {})) {
        ui.playerName.value = lastValidPlayerName;
        setNotice(getNicknameIssue(typed, authUser || {}) || "닉네임을 사용할 수 없습니다.");
        return;
      }

      lastValidPlayerName = typed;
      localStorage.setItem(NAME_KEY, typed);
      renderAll();
    });
  }

  if (ui.aiDifficulty) {
    const saved = localStorage.getItem(AI_DIFFICULTY_KEY) || "normal";
    ui.aiDifficulty.value = saved;
    ui.aiDifficulty.addEventListener("change", () => {
      localStorage.setItem(AI_DIFFICULTY_KEY, ui.aiDifficulty.value);
      setNotice(`AI 난이도가 ${getAiDifficultyLabel()}로 바뀌었습니다.`);
      renderAll();
    });
  }

  if (ui.chatInput) {
    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
  }

  updateAccountPanel();
  void ensureFirebase();
  subscribeLobbyRooms();
  ensureAiTicker();
  startLocalAIMatch("오목 전장을 불러오는 중입니다.");
});

function makeStone(owner) {
  return { owner };
}

function idx(row, col) {
  return row * BOARD_SIZE + col;
}

function rc(index) {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE };
}

function coordLabel(index) {
  const { row, col } = rc(index);
  return `${String.fromCharCode(97 + col)}${row + 1}`;
}

function opponent(player) {
  return player === "X" ? "O" : "X";
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function transformPoint(row, col, transformId) {
  const last = BOARD_SIZE - 1;
  switch (transformId) {
    case 0: return { row, col };
    case 1: return { row: col, col: last - row };
    case 2: return { row: last - row, col: last - col };
    case 3: return { row: last - col, col: row };
    case 4: return { row: row, col: last - col };
    case 5: return { row: last - row, col };
    case 6: return { row: col, col: row };
    case 7: return { row: last - col, col: last - row };
    default: return { row, col };
  }
}

function buildTransformMaps() {
  const maps = [];
  const inverses = [];
  for (let transformId = 0; transformId < 8; transformId++) {
    const map = Array(BOARD_CELLS);
    const inverse = Array(BOARD_CELLS);
    for (let index = 0; index < BOARD_CELLS; index++) {
      const { row, col } = rc(index);
      const next = transformPoint(row, col, transformId);
      const mapped = idx(next.row, next.col);
      map[index] = mapped;
      inverse[mapped] = index;
    }
    maps.push(map);
    inverses.push(inverse);
  }
  return { maps, inverses };
}

const BOARD_TRANSFORMS = buildTransformMaps();

function boardTokenAt(state, index) {
  const stone = state.board[index];
  if (stone) {
    const bombTurns = stone.bombTurns ?? state.bombTimers?.[index];
    const pushLockTurns = stone.pushLockTurns ?? 0;
    const bombToken = bombTurns != null ? `${Math.max(0, Math.min(9, bombTurns))}` : "";
    const lockToken = pushLockTurns > 0 ? `P${Math.max(0, Math.min(9, pushLockTurns))}` : "";
    return `${stone.owner}${bombToken}${lockToken}`;
  }
  const pushLockTurns = state.pushLocks?.[index] ?? 0;
  if (pushLockTurns > 0) return `L${Math.max(0, Math.min(9, pushLockTurns))}`;
  if (isMoveTile(state, index)) return "M";
  if (isBombTile(state, index)) {
    const timer = state.bombTimers?.[index] ?? BOMB_TIMER_START;
    return `B${Math.max(0, Math.min(9, timer))}`;
  }
  return ".";
}

function canonicalizeAiState(state) {
  let best = null;
  let bestTransform = 0;
  for (let transformId = 0; transformId < BOARD_TRANSFORMS.maps.length; transformId++) {
    const map = BOARD_TRANSFORMS.maps[transformId];
    const cells = Array(BOARD_CELLS);
    for (let i = 0; i < BOARD_CELLS; i++) {
      cells[map[i]] = boardTokenAt(state, i);
    }
    const signature = `${state.currentPlayer}|${state.railgunUsesLeft || 0}|${cells.join("")}`;
    if (best == null || signature < best) {
      best = signature;
      bestTransform = transformId;
    }
  }
  return { key: hashString(best || ""), transformId: bestTransform };
}

function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ai-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function actualToCanonicalMove(index, transformId) {
  return BOARD_TRANSFORMS.maps[transformId]?.[index] ?? index;
}

function canonicalToActualMove(index, transformId) {
  return BOARD_TRANSFORMS.inverses[transformId]?.[index] ?? index;
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function createInitialState() {
  const state = {
    board: Array(BOARD_CELLS).fill(null),
    currentPlayer: "X",
    gameOver: false,
    winner: null,
    drawReason: "",
    pendingWinPlayer: null,
    pendingWinTurnsLeft: 0,
    turnNumber: 1,
    moveCount: 0,
    lastEvent: "오목 전장을 준비 중입니다.",
    lastEventLines: ["오목 전장을 준비 중입니다."],
    turnHistory: [],
    pendingTurnStartSnapshot: null,
    pendingTurnSummary: [],
    pendingTurnMover: null,
    moveTiles: [],
    bombTiles: [],
    bombTimers: {},
    pushLocks: {},
    pendingMovePush: null,
    railgunUsesLeft: RAILGUN_LIMIT,
  };
  refreshSpecialTiles(state);
  return state;
}

function normalizeState(raw) {
  const state = raw ? cloneState(raw) : createInitialState();
  state.board = Array.isArray(state.board) && state.board.length === BOARD_CELLS
    ? state.board
    : Array(BOARD_CELLS).fill(null);
  state.currentPlayer = state.currentPlayer === "O" ? "O" : "X";
  state.gameOver = Boolean(state.gameOver);
  state.winner = state.winner === "X" || state.winner === "O" ? state.winner : null;
  state.drawReason = typeof state.drawReason === "string" ? state.drawReason : "";
  state.pendingWinPlayer = state.pendingWinPlayer === "X" || state.pendingWinPlayer === "O" ? state.pendingWinPlayer : null;
  state.pendingWinTurnsLeft = typeof state.pendingWinTurnsLeft === "number" ? state.pendingWinTurnsLeft : 0;
  state.turnNumber = typeof state.turnNumber === "number" ? state.turnNumber : 1;
  state.moveCount = typeof state.moveCount === "number" ? state.moveCount : 0;
  state.lastEvent = typeof state.lastEvent === "string" ? state.lastEvent : "오목 전장을 준비 중입니다.";
  state.lastEventLines = Array.isArray(state.lastEventLines) ? state.lastEventLines : [state.lastEvent];
  state.turnHistory = Array.isArray(state.turnHistory) ? state.turnHistory : [];
  state.pendingTurnStartSnapshot = state.pendingTurnStartSnapshot || null;
  state.pendingTurnSummary = Array.isArray(state.pendingTurnSummary) ? state.pendingTurnSummary : [];
  state.pendingTurnMover = state.pendingTurnMover || null;
  state.moveTiles = Array.isArray(state.moveTiles) ? state.moveTiles : [];
  state.bombTiles = Array.isArray(state.bombTiles) ? state.bombTiles : [];
  state.bombTimers = state.bombTimers && typeof state.bombTimers === "object" ? state.bombTimers : {};
  state.pushLocks = state.pushLocks && typeof state.pushLocks === "object" ? state.pushLocks : {};
  state.pendingMovePush = state.pendingMovePush || null;
  state.railgunUsesLeft = typeof state.railgunUsesLeft === "number" ? state.railgunUsesLeft : RAILGUN_LIMIT;
  return state;
}

function signedIn() {
  return authReady && Boolean(authUser);
}

function getGuestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = `guest-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

function getDisplayName() {
  const typed = ui.playerName?.value.trim() || localStorage.getItem(NAME_KEY)?.trim();
  if (typed && isAllowedNickname(typed, authUser || {})) return getSafeNickname(typed, "User", authUser || {});
  if (authUser?.email) return authUser.email.split("@")[0];
  return getGuestId();
}

async function ensureIdentity() {
  if (!authReady) {
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (authReady) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }
  return { id: authUser?.uid || getGuestId(), name: getDisplayName() };
}

async function ensureOnlineIdentity() {
  if (authUser) return true;
  if (!(await ensureFirebase())) return false;
  if (!authReady) {
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (authReady) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }
  if (authUser) return true;
  if (!signInAnonymously) return false;
  if (!authAnonymousPromise) {
    authReady = false;
    authAnonymousPromise = (async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.warn("익명 로그인을 시작하지 못했습니다.", error);
        authReady = true;
      } finally {
        authAnonymousPromise = null;
      }
    })();
  }
  await authAnonymousPromise;
  if (!authReady) {
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (authReady) {
          clearInterval(timer);
          resolve();
        }
      }, 25);
    });
  }
  return Boolean(authUser);
}

function syncNameField() {
  if (ui.playerName && !ui.playerName.value.trim()) ui.playerName.placeholder = getDisplayName();
}

function updateAccountPanel() {
  const signedIn = Boolean(authUser);
  if (ui.accountStatus) {
    ui.accountStatus.textContent = signedIn
      ? `로그인됨: ${authUser.email || "계정"}`
      : "회원가입이나 로그인으로 닉네임을 더 안전하게 쓸 수 있습니다.";
  }
  if (ui.accountLogoutBtn?.style) {
    ui.accountLogoutBtn.style.display = signedIn ? "inline-flex" : "none";
  }
}

async function logoutCurrentAccount() {
  if (!signOut) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("ACCOUNT LOGOUT ERROR:", error);
    alert("로그아웃에 실패했습니다.");
  }
}

function setNotice(message) {
  session.notice = message || "";
  renderAll();
}

function stopAiTimer() {
  if (session.aiTimer) {
    clearTimeout(session.aiTimer);
    session.aiTimer = null;
  }
  session.aiThinking = false;
}

function clearOnlineListeners() {
  if (session.timeoutId) {
    clearTimeout(session.timeoutId);
    session.timeoutId = null;
  }
  if (session.unsubscribe) {
    session.unsubscribe();
    session.unsubscribe = null;
  }
  if (session.chatUnsubscribe) {
    session.chatUnsubscribe();
    session.chatUnsubscribe = null;
  }
}

function clearLobbyListener() {
  if (session.lobbyUnsubscribe) {
    session.lobbyUnsubscribe();
    session.lobbyUnsubscribe = null;
  }
}

function isRoomStale(room, maxAgeMs = 5 * 60 * 1000) {
  const updatedAt = room?.updatedAt;
  const millis = typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : null;
  return Number.isFinite(millis) && Date.now() - millis >= maxAgeMs;
}

function stopOnlineSession() {
  stopAiTimer();
  clearOnlineListeners();
  session.roomRef = null;
  session.roomId = null;
  session.seat = null;
  session.host = false;
  session.roomStatus = null;
  session.aiThinking = false;
  session.chatLog = [];
}

function markOpponentLeftWin(message = "상대가 나가서 승리했습니다.") {
  stopAiTimer();
  clearOnlineListeners();
  session.roomRef = null;
  session.roomId = null;
  session.host = false;
  session.roomStatus = "ended";
  session.notice = message;
  gameState.gameOver = true;
  gameState.winner = session.seat || gameState.winner;
  gameState.drawReason = "";
  gameState.lastEventLines = [message];
  gameState.lastEvent = message;
  renderAll();
}

async function deleteOnlineRoom(roomRef = session.roomRef) {
  if (!roomRef) return;
  if (!(await ensureFirebase())) return;
  try {
    await deleteDoc(roomRef);
  } catch (error) {
    console.error(error);
  }
  await clearMatchmakingIfRoom(roomRef.id);
}

async function clearMatchmakingIfRoom(roomId) {
  if (!roomId || !session.host || !(await ensureFirebase())) return;
  try {
    const matchRef = doc(db, MATCHMAKING_COLLECTION, MATCHMAKING_DOC);
    const matchSnap = await getDoc(matchRef);
    if (!matchSnap.exists() || matchSnap.data()?.roomId !== roomId) return;
    await deleteDoc(matchRef);
  } catch (error) {
    console.error(error);
  }
}

async function leaveOnlineRoom() {
  const roomRef = session.roomRef;
  clearOnlineListeners();
  await deleteOnlineRoom(roomRef);
  stopOnlineSession();
}

async function goHome() {
  if (session.mode === "online" && session.roomRef) {
    await leaveOnlineRoom();
  } else {
    stopOnlineSession();
  }
  gameState = createInitialState();
  session.mode = "idle";
  window.location.href = "../minigame/index.html";
}

function getAiDifficulty() {
  const value = ui.aiDifficulty?.value || localStorage.getItem(AI_DIFFICULTY_KEY) || "normal";
  return ["easy", "normal", "hard"].includes(value) ? value : "normal";
}

function getAiDifficultyLabel() {
  const difficulty = getAiDifficulty();
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "hard") return "최강";
  return "보통";
}

function buildFiveLines() {
  const lines = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col <= BOARD_SIZE - WIN_LENGTH; col++) {
      lines.push(Array.from({ length: WIN_LENGTH }, (_, i) => idx(row, col + i)));
    }
  }
  for (let col = 0; col < BOARD_SIZE; col++) {
    for (let row = 0; row <= BOARD_SIZE - WIN_LENGTH; row++) {
      lines.push(Array.from({ length: WIN_LENGTH }, (_, i) => idx(row + i, col)));
    }
  }
  for (let row = 0; row <= BOARD_SIZE - WIN_LENGTH; row++) {
    for (let col = 0; col <= BOARD_SIZE - WIN_LENGTH; col++) {
      lines.push(Array.from({ length: WIN_LENGTH }, (_, i) => idx(row + i, col + i)));
    }
  }
  for (let row = 0; row <= BOARD_SIZE - WIN_LENGTH; row++) {
    for (let col = WIN_LENGTH - 1; col < BOARD_SIZE; col++) {
      lines.push(Array.from({ length: WIN_LENGTH }, (_, i) => idx(row + i, col - i)));
    }
  }
  return lines;
}

function countPieces(state, player) {
  return state.board.filter((cell) => cell?.owner === player).length;
}

function pieceAt(state, index) {
  return state.board[index];
}

function lineOwner(state, line) {
  const first = state.board[line[0]];
  if (!first) return null;
  const owner = first.owner;
  return line.every((index) => state.board[index]?.owner === owner) ? owner : null;
}

function getWinningLine(state, player) {
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 },
  ];

  for (const { dr, dc } of directions) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const prevRow = row - dr;
        const prevCol = col - dc;
        if (toBounds(prevRow, prevCol) && state.board[idx(prevRow, prevCol)]?.owner === player) continue;

        const line = [];
        for (let step = 0; step < WIN_LENGTH; step++) {
          const nr = row + dr * step;
          const nc = col + dc * step;
          if (!toBounds(nr, nc)) {
            line.length = 0;
            break;
          }
          const stone = state.board[idx(nr, nc)];
          if (!stone || stone.owner !== player) {
            line.length = 0;
            break;
          }
          line.push(idx(nr, nc));
        }
        if (line.length !== WIN_LENGTH) continue;

        const nextRow = row + dr * WIN_LENGTH;
        const nextCol = col + dc * WIN_LENGTH;
        if (toBounds(nextRow, nextCol) && state.board[idx(nextRow, nextCol)]?.owner === player) continue;
        return line;
      }
    }
  }
  return null;
}

function countConsecutiveFrom(state, index, player, dr, dc) {
  let count = 1;
  const { row, col } = rc(index);

  let nr = row + dr;
  let nc = col + dc;
  while (toBounds(nr, nc) && state.board[idx(nr, nc)]?.owner === player) {
    count += 1;
    nr += dr;
    nc += dc;
  }

  nr = row - dr;
  nc = col - dc;
  while (toBounds(nr, nc) && state.board[idx(nr, nc)]?.owner === player) {
    count += 1;
    nr -= dr;
    nc -= dc;
  }

  return count;
}

function hasOverline(state, index, player) {
  return [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ].some(([dr, dc]) => countConsecutiveFrom(state, index, player, dr, dc) > WIN_LENGTH);
}

function countOpenThreeDirections(state, index, player) {
  const patterns = ["01110", "010110", "011010"];
  let count = 0;

  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const cells = [];
    for (let offset = -4; offset <= 4; offset++) {
      const row = rc(index).row + dr * offset;
      const col = rc(index).col + dc * offset;
      if (!toBounds(row, col)) {
        cells.push("2");
        continue;
      }
      const stone = state.board[idx(row, col)];
      if (!stone) cells.push("0");
      else if (stone.owner === player) cells.push("1");
      else cells.push("2");
    }

    const text = cells.join("");
    const center = 4;
    const hasPattern = patterns.some((pattern) => {
      const start = Math.max(0, center - pattern.length + 1);
      const end = Math.min(center, text.length - pattern.length);
      for (let i = start; i <= end; i++) {
        const slice = text.slice(i, i + pattern.length);
        if (slice.includes("2")) continue;
        if (!slice.includes("1")) continue;
        if (slice === pattern) return true;
      }
      return false;
    });

    if (hasPattern) count += 1;
  }

  return count;
}

function isForbiddenMove(state, index, player) {
  if (player !== "X") return false;
  if (state.board[index]) return false;
  const preview = cloneState(state);
  preview.board[index] = makeStone(player);
  if (hasOverline(preview, index, player)) return true;
  return countOpenThreeDirections(preview, index, player) >= 2;
}

function boardFull(state) {
  return state.board.every(Boolean);
}

function randomSample(items, count) {
  const pool = items.slice();
  const picked = [];
  while (pool.length && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function distanceToCenter(index) {
  const { row, col } = rc(index);
  return Math.max(Math.abs(row - 5), Math.abs(col - 5));
}

function isWithinSpecialZone(index) {
  return distanceToCenter(index) <= SPECIAL_RADIUS;
}

function isMoveTile(state, index) {
  return Array.isArray(state.moveTiles) && state.moveTiles.includes(index);
}

function isBombTile(state, index) {
  return Array.isArray(state.bombTiles) && state.bombTiles.includes(index);
}

function specialCellType(state, index) {
  if (isMoveTile(state, index)) return "move";
  if (isBombTile(state, index)) return "bomb";
  return null;
}

function listOccupiedSpecialCells(state) {
  const occupied = new Set();
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (state.board[i]) occupied.add(i);
  }
  return occupied;
}

function pickSpecialCells(state, count, used = new Set()) {
  const candidates = [];
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (!isWithinSpecialZone(i)) continue;
    if (state.board[i]) continue;
    if (state.pushLocks?.[i] > 0) continue;
    if (used.has(i)) continue;
    if (isMoveTile(state, i) || isBombTile(state, i)) continue;
    candidates.push(i);
  }
  return randomSample(candidates, count);
}

function refreshSpecialTiles(state) {
  if (state.moveCount > 0 && state.moveCount % MOVE_TILE_SPAWN_INTERVAL === 0) {
    const extra = pickSpecialCells(state, MOVE_TILE_COUNT);
    state.moveTiles = Array.from(new Set([...(state.moveTiles || []), ...extra]));
  }
  if (state.moveCount > 0 && state.moveCount % BOMB_TILE_SPAWN_INTERVAL === 0) {
    const used = new Set([...(state.moveTiles || []), ...(state.bombTiles || [])]);
    const extra = pickSpecialCells(state, 1, used);
    state.bombTiles = Array.from(new Set([...(state.bombTiles || []), ...extra]));
  }
}

function clearSpecialAt(state, index) {
  state.moveTiles = (state.moveTiles || []).filter((value) => value !== index);
  state.bombTiles = (state.bombTiles || []).filter((value) => value !== index);
  if (state.bombTimers && state.bombTimers[index] != null) delete state.bombTimers[index];
}

function legalPlacements(state) {
  const moves = [];
  if (state.pendingMovePush) return moves;
  const player = state.currentPlayer;
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (state.board[i] || state.pushLocks?.[i] > 0) continue;
    if (isForbiddenMove(state, i, player)) continue;
    moves.push({ to: i });
  }
  return moves;
}

function renderSpecialTileLabel(state, index) {
  if (isMoveTile(state, index)) return "MOVE";
  if (isBombTile(state, index)) {
    const timer = state.board[index]?.bombTurns || state.bombTimers?.[index];
    if (timer != null && state.board[index]) return `B${timer}`;
    return "BOMB";
  }
  return "";
}

function canPlaceOnSpecial(state, index) {
  return !state.board[index];
}

function toBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function directionFromName(name) {
  return DIRECTIONS.find((item) => item.key === name) || null;
}

  function directionNameFromDelta(dr, dc) {
    const dir = DIRECTIONS.find((item) => item.dr === dr && item.dc === dc);
    return dir ? dir.key : null;
  }

  function directionFromMoveTileClick(index) {
    if (!gameState.pendingMovePush) return null;
    const origin = rc(gameState.pendingMovePush.index);
    const target = rc(index);
    return directionNameFromDelta(target.row - origin.row, target.col - origin.col);
  }

function applyPushFromCell(state, index, directionName, player, effects) {
  const dir = directionFromName(directionName);
  if (!dir) return null;
  const stone = state.board[index];
  if (!stone || stone.owner !== player) return null;

  const origin = rc(index);
  let lastFree = { row: origin.row, col: origin.col };
  for (let step = 1; step <= PUSH_LIMIT; step++) {
    const nr = origin.row + dir.dr * step;
    const nc = origin.col + dir.dc * step;
    if (!toBounds(nr, nc)) break;
    const targetIndex = idx(nr, nc);
    if (state.board[targetIndex]) break;
    lastFree = { row: nr, col: nc };
  }

  const destinationIndex = idx(lastFree.row, lastFree.col);
  if (destinationIndex !== index) {
    state.board[index] = null;
    state.board[destinationIndex] = stone;
    delete state.bombTimers[index];
    if (isBombTile(state, destinationIndex)) {
      state.bombTimers[destinationIndex] = BOMB_TIMER_START;
      state.board[destinationIndex].bombTurns = BOMB_TIMER_START;
    } else {
      delete state.board[destinationIndex].bombTurns;
    }
    effects.push(`무브칸 방향 ${dir.label}로 ${coordLabel(index)} → ${coordLabel(destinationIndex)}`);
  } else {
    effects.push(`무브칸 방향 ${dir.label}으로 밀렸지만 더 갈 수 없어 제자리입니다.`);
  }
  return destinationIndex;
}

  function applyOpponentPushFromMoveTile(state, index, directionName, player, effects) {
    const dir = directionFromName(directionName);
    if (!dir) return null;
    const origin = rc(index);
    const sourceRow = origin.row + dir.dr;
    const sourceCol = origin.col + dir.dc;
    if (!toBounds(sourceRow, sourceCol)) {
      effects.push(`무브칸 ${coordLabel(index)} 방향 ${dir.label}로 공기를 밀었습니다.`);
      return index;
    }

  const sourceIndex = idx(sourceRow, sourceCol);
  const sourceStone = state.board[sourceIndex];
  if (!sourceStone || sourceStone.owner === player) {
    effects.push(`무브칸 ${coordLabel(index)} 방향 ${dir.label}로 공기를 밀었습니다.`);
    return index;
  }

  const destRow = sourceRow + dir.dr;
  const destCol = sourceCol + dir.dc;
  if (!toBounds(destRow, destCol)) {
    effects.push(`무브칸 ${coordLabel(index)} 방향 ${dir.label}은 벽에 막혔습니다.`);
    return null;
  }

    const destIndex = idx(destRow, destCol);
    if (state.board[destIndex]) {
      effects.push(`무브칸 ${coordLabel(index)} 방향 ${dir.label}은 다른 돌에 막혔습니다.`);
      return index;
    }

  state.board[sourceIndex] = null;
  state.board[destIndex] = sourceStone;
  state.pushLocks[sourceIndex] = 2;
  delete state.bombTimers[sourceIndex];
  if (isBombTile(state, destIndex)) {
    state.bombTimers[destIndex] = BOMB_TIMER_START;
    state.board[destIndex].bombTurns = BOMB_TIMER_START;
  } else {
    delete state.board[destIndex].bombTurns;
  }
  effects.push(`무브칸 ${coordLabel(index)}가 ${coordLabel(sourceIndex)}의 상대 돌을 ${coordLabel(destIndex)}로 밀었습니다.`);
  return destIndex;
}

function tickPushLocks(state) {
  for (const key of Object.keys(state.pushLocks || {})) {
    const index = Number(key);
    state.pushLocks[index] -= 1;
    if (state.pushLocks[index] <= 0) delete state.pushLocks[index];
  }
}

function findRailgunPatterns(state, player) {
  const patterns = [];
  for (const line of FIVE_LINES) {
    let mine = 0;
    let empty = -1;
    let enemy = 0;
    for (let i = 0; i < line.length; i++) {
      const stone = state.board[line[i]];
      if (!stone) {
        empty = line[i];
        continue;
      }
      if (stone.owner === player) mine += 1;
      else enemy += 1;
    }
    if (enemy === 0 && mine === RAILGUN_LINE_LENGTH - 1 && empty >= 0) {
      patterns.push({ line, empty });
    }
  }
  return patterns;
}

function applyRailgunAtPattern(state, pattern, player, effects) {
  const { line, empty } = pattern;
  const removed = [];
  clearSpecialAt(state, empty);
  for (const index of line) {
    if (index === empty) continue;
    if (state.board[index]) {
      removed.push(coordLabel(index));
      state.board[index] = null;
      delete state.bombTimers[index];
    }
  }

  const { row, col } = rc(empty);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = row + dr;
      const nc = col + dc;
      if (!toBounds(nr, nc)) continue;
      const index = idx(nr, nc);
      if (state.board[index]) {
        removed.push(coordLabel(index));
        state.board[index] = null;
        delete state.bombTimers[index];
      }
    }
  }
  state.railgunUsesLeft = Math.max(0, (state.railgunUsesLeft || 0) - 1);
  effects.push(`레일건 발동: ${coordLabel(empty)} 중심으로 ${removed.length}개를 제거했습니다.`);
  return true;
}

function chooseBestRailgunPattern(state, player) {
  const patterns = findRailgunPatterns(state, player);
  if (!patterns.length) return null;
  let best = patterns[0];
  let bestScore = -Infinity;
  for (const pattern of patterns) {
    const preview = cloneState(state);
    const effects = [];
    applyRailgunAtPattern(preview, pattern, player, effects);
    const score = evaluateState(preview, player);
    if (score > bestScore) {
      bestScore = score;
      best = pattern;
    }
  }
  return best;
}

function moveText(move) {
  return coordLabel(move.to);
}

function railgunPatternText(pattern) {
  if (!pattern || !Array.isArray(pattern.line)) return "";
  const cells = pattern.line.map((index) => coordLabel(index));
  if (!cells.length) return "";
  const first = cells[0];
  const last = cells[cells.length - 1];
  return `${first} ~ ${last}`;
}

function findWinningMoves(state, player) {
  const wins = [];
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (state.board[i]) continue;
    const test = cloneState(state);
    test.currentPlayer = player;
    test.board[i] = makeStone(player);
    if (getWinningLine(test, player)) wins.push(i);
  }
  return wins;
}

function countThreatLines(state, player) {
  let count = 0;
  for (const line of FIVE_LINES) {
    let mine = 0;
    let empty = 0;
    let theirs = 0;
    for (const index of line) {
      const stone = state.board[index];
      if (!stone) {
        empty += 1;
        continue;
      }
      if (stone.owner === player) mine += 1;
      else theirs += 1;
    }
    if (theirs === 0 && mine === 3 && empty >= 2) count += 1;
  }
  return count;
}

function classifyMoveAnnotation(beforeState, afterState, move, player) {
  const opp = opponent(player);
  const beforeOppWinning = findWinningMoves(beforeState, opp);
  const afterOppWinning = findWinningMoves(afterState, opp);
  const beforeMyWinning = findWinningMoves(beforeState, player);
  const afterMyWinning = findWinningMoves(afterState, player);
  const beforeScore = evaluateState(beforeState, player);
  const afterScore = evaluateState(afterState, player);
  const scoreDelta = afterScore - beforeScore;
  const specialMove = isMoveTile(afterState, move.to) || isBombTile(afterState, move.to);
  const blocksImmediateLoss = beforeOppWinning.length > 0 && afterOppWinning.length === 0;
  const missesImmediateWin = beforeMyWinning.length > 0 && afterMyWinning.length === 0 && !afterState.gameOver;
  const canStillBlock = beforeOppWinning.length > 0
    && legalPlacements(beforeState, player).some((candidate) => {
      const probe = cloneState(beforeState);
      probe.currentPlayer = player;
      return applyMoveToState(probe, candidate, true, true);
    }) && legalPlacements(beforeState, player).some((candidate) => {
      const probe = cloneState(beforeState);
      probe.currentPlayer = player;
      if (!applyMoveToState(probe, candidate, true, true)) return false;
      return findWinningMoves(probe, opp).length === 0;
    });

  if (afterState.gameOver) {
    if (afterState.winner === player) return "!!";
    if (afterState.winner === opp) return "??";
    return "!?";
  }

  if (afterState.pendingWinPlayer === player) {
    return scoreDelta >= 1200 ? "!" : ":)";
  }

  if (missesImmediateWin) return "??";
  if (beforeOppWinning.length > 0 && afterOppWinning.length > 0) {
    if (!canStillBlock) return scoreDelta >= 0 ? "?" : ":)";
    return "??";
  }
  if (beforeOppWinning.length > 0 && blocksImmediateLoss) return scoreDelta >= 1500 ? "!!" : "!";

  if (afterMyWinning.length > 0) {
    if (scoreDelta >= 1800) return "!!";
    return "!";
  }

  if (scoreDelta >= 2200) return "!!";
  if (scoreDelta >= 650) return "!";
  if (scoreDelta <= -3500) return "??";
  if (scoreDelta <= -650) return "?";
  if (specialMove && Math.abs(scoreDelta) < 300) return "!?";

  if (specialMove && scoreDelta > 0) return "!";
  if (specialMove && scoreDelta < 0) return "?!";

  return scoreDelta >= 0 ? ":)" : "?";
}

function analyzeMoveOutcome(state, move, player) {
  const next = cloneState(state);
  applyMoveToState(next, move, true, true);
  const score = evaluateState(next, player);
  return score;
}

function evaluateState(state, player) {
  const opp = opponent(player);
  if (state.gameOver) {
    if (state.winner === player) return 1000000;
    if (state.winner === opp) return -1000000;
    return 0;
  }

  let score = 0;
  const lineValues = [0, 6, 38, 220, 1800, 20000];
  for (const line of FIVE_LINES) {
    let mine = 0;
    let theirs = 0;
    for (const index of line) {
      const stone = state.board[index];
      if (!stone) continue;
      if (stone.owner === player) mine += 1; else theirs += 1;
    }
    if (mine && theirs) continue;
    if (mine) score += lineValues[mine];
    if (theirs) score -= lineValues[theirs] * 1.08;
  }

  for (let i = 0; i < BOARD_CELLS; i++) {
    const stone = state.board[i];
    if (!stone) continue;
    const { row, col } = rc(i);
    const distance = Math.abs(row - 5) + Math.abs(col - 5);
    if (stone.owner === player) score += Math.max(0, 8 - distance);
    else score -= Math.max(0, 7 - distance);
  }
  if (state.pendingWinPlayer === player) score += 120000;
  if (state.pendingWinPlayer === opp) score -= 160000;
  score += (state.railgunUsesLeft || 0) * 5;
  score += (state.moveTiles || []).length * 6;
  score -= (state.bombTiles || []).length * 3;
  if (state.pendingMovePush) score -= 12;
  return score;
}

function scoreMove(state, move, player, context = null) {
  const preview = cloneState(state);
  if (!applyPlacementToState(preview, move.to, true, true)) return -Infinity;
  const opp = opponent(player);
  const opponentWinningBefore = context?.opponentWinningBefore || findWinningMoves(state, opp);
  const opponentThreatBefore = context?.opponentThreatBefore ?? countThreatLines(state, opp);
  const myThreatBefore = context?.myThreatBefore ?? countThreatLines(state, player);
  const createdOwnWin = getWinningLine(preview, player);
  if (preview.pendingMovePush) {
    const push = chooseBestPushDirection(preview, preview.pendingMovePush.index, player);
    if (push) resolvePendingMovePush(preview, push, true);
    else advanceTurnState(preview, [], player, true);
  } else {
    advanceTurnState(preview, [], player, true);
  }
  let score = evaluateState(preview, player);
  const opponentWinningAfter = findWinningMoves(preview, opp);
  const myThreatAfter = countThreatLines(preview, player);
  if (createdOwnWin || preview.pendingWinPlayer === player) score += 350000;
  if (opponentWinningBefore.length > 0) {
    if (!opponentWinningBefore.includes(move.to) && opponentWinningAfter.length > 0) {
      score -= 300000;
    } else if (opponentWinningAfter.length >= opponentWinningBefore.length) {
      score -= 150000;
    } else {
      score += 120000;
    }
  }
  if (opponentWinningAfter.length > 0) score -= 400000;
  if (opponentThreatBefore > 0 && opponentWinningAfter.length > 0) score -= 80000;
  if (myThreatAfter > myThreatBefore) score += 900;
  const { row, col } = rc(move.to);
  score += Math.max(0, 10 - (Math.abs(row - 5) + Math.abs(col - 5)));
  if (isMoveTile(state, move.to)) score += 35;
  if (isBombTile(state, move.to)) score += 10;
  return score;
}

async function loadAiMemoryRecord(state) {
  if (session.mode !== "online" || !signedIn()) return null;
  if (!(await ensureFirebase())) return null;
  const canonical = canonicalizeAiState(state);
  const cached = aiMemoryCache.get(canonical.key);
  if (cached) return { ...cached, transformId: canonical.transformId, key: canonical.key };

  try {
    const snapshot = await getDoc(doc(db, AI_MEMORY_COLLECTION, canonical.key));
    const record = snapshot.exists() ? snapshot.data() : null;
    aiMemoryCache.set(canonical.key, record);
    return record ? { ...record, transformId: canonical.transformId, key: canonical.key } : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function saveAiMemoryRecord(beforeState, actualMoveIndex, afterState) {
  if (session.mode !== "online" || !signedIn()) return;
  if (!(await ensureFirebase())) return;
  const canonical = canonicalizeAiState(beforeState);
  const canonicalMove = actualToCanonicalMove(actualMoveIndex, canonical.transformId);
  const ref = doc(db, AI_MEMORY_COLLECTION, canonical.key);
  let nextRecord = null;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : {};
      const moveCounts = { ...(data.moveCounts || {}) };
      moveCounts[canonicalMove] = (moveCounts[canonicalMove] || 0) + 1;
      const entries = Object.entries(moveCounts);
      entries.sort((a, b) => b[1] - a[1]);
      const bestMoveCanonical = Number(entries[0][0]);
      const bestMoveCount = entries[0][1];
      const totalCount = (data.totalCount || 0) + 1;
      nextRecord = {
        signature: canonical.key,
        transformId: canonical.transformId,
        moveCounts,
        bestMoveCanonical,
        bestMoveCount,
        totalCount,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastOutcome: afterState.gameOver
          ? (afterState.winner ? `${afterState.winner}-win` : "draw")
          : "in-progress",
      };
      tx.set(ref, nextRecord, { merge: true });
    });
    if (nextRecord) aiMemoryCache.set(canonical.key, nextRecord);
  } catch (error) {
    console.error(error);
  }
}

function applyMemoryBiasToScores(scoredMoves, memoryRecord) {
  if (!memoryRecord || memoryRecord.bestMoveCanonical == null) return scoredMoves;
  const preferredActual = canonicalToActualMove(Number(memoryRecord.bestMoveCanonical), memoryRecord.transformId);
  const confidence = Math.max(1, Number(memoryRecord.bestMoveCount || 1));
  const bonus = Math.min(20000, confidence * 1800);
  return scoredMoves.map((item) => {
    if (item.move.to !== preferredActual) return item;
    return { ...item, score: item.score + bonus };
  });
}

function batchArray(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

  function simulateCandidateMove(state, move, player) {
    const preview = cloneState(state);
    if (!applyPlacementToState(preview, move.to, true, true)) return null;
    if (preview.pendingMovePush) {
      const push = chooseBestPushDirection(preview, preview.pendingMovePush.index, player);
    if (push) resolvePendingMovePush(preview, push, true);
    else advanceTurnState(preview, [], player, true);
  } else {
    advanceTurnState(preview, [], player, true);
    }
    return preview;
  }

  function simulateClassicMove(state, move, player) {
    const preview = cloneState(state);
    if (preview.board[move.to]) return null;
    preview.board[move.to] = makeStone(player);
    advanceTurnState(preview, [], player, true);
    return preview;
  }

  function scoreClassicMove(state, move, player) {
    const preview = simulateClassicMove(state, move, player);
    if (!preview) return -Infinity;
    const opp = opponent(player);
    let score = 0;
    const lineValues = [0, 6, 38, 220, 1800, 20000];
    for (const line of FIVE_LINES) {
      let mine = 0;
      let theirs = 0;
      for (const index of line) {
        const stone = preview.board[index];
        if (!stone) continue;
        if (stone.owner === player) mine += 1;
        else theirs += 1;
      }
      if (mine && theirs) continue;
      if (mine) score += lineValues[mine];
      if (theirs) score -= lineValues[theirs] * 1.08;
    }
  const myWinning = getWinningLine(preview, player);
  const oppWinning = getWinningLine(preview, opp);
  if (myWinning || preview.pendingWinPlayer === player) score += 300000;
  if (oppWinning || preview.pendingWinPlayer === opp) score -= 250000;
    const { row, col } = rc(move.to);
    score += Math.max(0, 8 - (Math.abs(row - 5) + Math.abs(col - 5)));
    if (isMoveTile(state, move.to)) score -= 1400;
    if (isBombTile(state, move.to)) score -= 1000;
    return score;
  }

  function chooseClassicThreatBlock(state, player) {
    const opp = opponent(player);
    const opponentWinningMoves = findWinningMoves(state, opp);
    if (!opponentWinningMoves.length) return null;
    const blockers = legalPlacements(state, player).filter((move) => opponentWinningMoves.includes(move.to));
    if (!blockers.length) return null;
    return blockers
      .map((move) => ({ move, score: scoreClassicMove(state, move, player) }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  async function chooseAiMove(state) {
    const legal = legalPlacements(state, AI_SEAT);
    if (!legal.length) return null;
    const opponentWinningBefore = findWinningMoves(state, opponent(AI_SEAT));
    const opponentThreatBefore = countThreatLines(state, opponent(AI_SEAT));
    const myThreatBefore = countThreatLines(state, AI_SEAT);
    const difficulty = getAiDifficulty();
    const useMemory = difficulty !== "easy";
    const memoryRecord = useMemory ? await loadAiMemoryRecord(state) : null;

    const simulateForDifficulty = difficulty === "easy" ? simulateClassicMove : simulateCandidateMove;
    const scoreForDifficulty = difficulty === "easy" ? scoreClassicMove : scoreMove;

    const winningMoves = legal.filter((move) => {
      const test = simulateForDifficulty(state, move, AI_SEAT);
      return test && test.pendingWinPlayer === AI_SEAT;
    });
    if (winningMoves.length) return winningMoves[0];

    const blocker = difficulty === "easy"
      ? chooseClassicThreatBlock(state, AI_SEAT)
      : (() => {
          const opponentWinningMoves = findWinningMoves(state, opponent(AI_SEAT));
          if (!opponentWinningMoves.length) return null;
          const blockers = legal.filter((move) => opponentWinningMoves.includes(move.to));
          if (!blockers.length) return null;
          return blockers
            .map((move) => ({ move, score: scoreMove(state, move, AI_SEAT) }))
            .sort((a, b) => b.score - a.score)[0].move;
        })();
    if (blocker) return blocker;

    if (opponentWinningBefore.length > 0) {
      const safeBlocks = legal
        .map((move) => {
          const test = simulateForDifficulty(state, move, AI_SEAT);
          if (!test) return null;
          return {
            move,
            score: scoreForDifficulty(state, move, AI_SEAT, { opponentWinningBefore, opponentThreatBefore, myThreatBefore }),
            opponentWinningAfter: findWinningMoves(test, opponent(AI_SEAT)).length,
          };
        })
        .filter(Boolean)
        .filter((item) => item.opponentWinningAfter === 0);
      if (safeBlocks.length) {
        return safeBlocks.sort((a, b) => b.score - a.score)[0].move;
      }
    }

    if (difficulty === "easy") {
      const scoredEasy = legal
        .map((move) => ({
          move,
          score: scoreClassicMove(state, move, AI_SEAT),
        }))
        .sort((a, b) => b.score - a.score);
      const pool = scoredEasy.slice(0, Math.min(8, scoredEasy.length));
      return pool[Math.floor(Math.random() * pool.length)].move;
    }

    if (opponentThreatBefore > 0) {
      const antiThreatCandidates = legal
        .map((move) => {
          const test = simulateCandidateMove(state, move, AI_SEAT);
          if (!test) return null;
          return {
            move,
            score: scoreMove(state, move, AI_SEAT, { opponentWinningBefore, opponentThreatBefore, myThreatBefore }),
            opponentThreatAfter: countThreatLines(test, opponent(AI_SEAT)),
          };
        })
        .filter(Boolean);

      const minThreat = Math.min(...antiThreatCandidates.map((item) => item.opponentThreatAfter));
      const blockers = antiThreatCandidates.filter((item) => item.opponentThreatAfter === minThreat);
      if (blockers.length) {
        return blockers.sort((a, b) => b.score - a.score)[0].move;
      }
    }

    const scored = [];
    for (const batch of batchArray(legal, AI_CHUNK_SIZE)) {
      for (const move of batch) {
        scored.push({
          move,
          score: scoreForDifficulty(state, move, AI_SEAT, { opponentWinningBefore, opponentThreatBefore, myThreatBefore }),
        });
      }
      if (batch.length === AI_CHUNK_SIZE) await yieldToBrowser();
    }

    const biasedScores = applyMemoryBiasToScores(scored, memoryRecord)
      .sort((a, b) => b.score - a.score);

    if (difficulty === "normal") {
      const candidates = biasedScores.slice(0, Math.min(4, biasedScores.length));
      let bestMove = candidates[0]?.move || biasedScores[0].move;
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        const preview = simulateClassicMove(state, candidate.move, AI_SEAT);
        if (!preview) continue;
        let combined = evaluateState(preview, AI_SEAT) + candidate.score * 0.01;
        if (isMoveTile(state, candidate.move.to)) combined -= 180;
        if (isBombTile(state, candidate.move.to)) combined -= 120;
        if (opponentWinningBefore.includes(candidate.move.to)) combined += 4000;
        if (combined > bestScore) {
          bestScore = combined;
          bestMove = candidate.move;
        }
      }
      return bestMove;
    }

    if (difficulty === "hard") {
      const candidates = biasedScores.slice(0, Math.min(3, biasedScores.length));
      let bestMove = candidates[0]?.move || biasedScores[0].move;
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        const preview = simulateCandidateMove(state, candidate.move, AI_SEAT);
        if (!preview) continue;
        let combined = evaluateState(preview, AI_SEAT) + candidate.score * 0.02;
        const opponentWinningAfter = findWinningMoves(preview, opponent(AI_SEAT));
        const opponentThreatAfter = countThreatLines(preview, opponent(AI_SEAT));
        if (opponentWinningAfter.length > 0) combined -= 180000;
        if (opponentThreatAfter > 0) combined -= opponentThreatAfter * 2500;
        if (isMoveTile(state, candidate.move.to)) combined -= 100;
        if (isBombTile(state, candidate.move.to)) combined -= 70;
        if (combined > bestScore) {
          bestScore = combined;
          bestMove = candidate.move;
        }
      }
      return bestMove;
    }

    const pool = biasedScores.slice(0, Math.min(3, biasedScores.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

function appendHistory(state, entry) {
  if (!Array.isArray(state.turnHistory)) state.turnHistory = [];
  state.turnHistory.unshift(entry);
  historyVersion += 1;
}

function ensureTurnSummary(state) {
  if (!Array.isArray(state.pendingTurnSummary)) state.pendingTurnSummary = [];
  if (state.pendingTurnMover !== state.currentPlayer) {
    state.pendingTurnMover = state.currentPlayer;
    state.pendingTurnSummary = [];
  }
}

function recordTurnLine(state, line) {
  ensureTurnSummary(state);
  if (line) state.pendingTurnSummary.push(line);
  state.lastEventLines = state.pendingTurnSummary.slice();
  state.lastEvent = state.lastEventLines.join(" · ");
}

function checkImmediateResult(state, player, effects) {
  const xWin = getWinningLine(state, "X");
  const oWin = getWinningLine(state, "O");

  if (state.pendingWinPlayer) {
    const stillAlive = Boolean(getWinningLine(state, state.pendingWinPlayer));
    if (!stillAlive) {
      effects.push(`${state.pendingWinPlayer}의 5목이 깨졌습니다.`);
      state.pendingWinPlayer = null;
      state.pendingWinTurnsLeft = 0;
    } else if ((state.pendingWinTurnsLeft || 0) <= 0) {
      state.gameOver = true;
      state.winner = state.pendingWinPlayer;
      state.drawReason = "";
      effects.push(`${state.pendingWinPlayer}의 5목을 1턴 유지하여 승리했습니다.`);
      state.pendingWinPlayer = null;
      state.pendingWinTurnsLeft = 0;
      return true;
    }
  }

  if (xWin && oWin) {
    state.gameOver = true;
    state.winner = null;
    state.drawReason = "양쪽이 동시에 5목을 만들었습니다.";
    effects.push(state.drawReason);
    return true;
  }

  const formedWin = xWin ? "X" : (oWin ? "O" : null);
  if (formedWin) {
    state.pendingWinPlayer = formedWin;
    state.pendingWinTurnsLeft = 1;
    state.winner = null;
    state.gameOver = false;
    state.drawReason = "";
    effects.push(`${formedWin}가 5목을 만들었습니다. 1턴 더 유지하면 승리합니다.`);
    return false;
  }

  if (boardFull(state)) {
    state.gameOver = true;
    state.winner = null;
    state.drawReason = "무승부";
    effects.push("무승부! 더 둘 자리가 없습니다.");
    return true;
  }
  return false;
}

function explodeBombs(state, effects) {
  const expired = Object.entries(state.bombTimers || {})
    .filter(([, timer]) => timer <= 0)
    .map(([key]) => Number(key));
  if (!expired.length) return;

  for (const index of expired) {
    const { row, col } = rc(index);
    effects.push(`자폭칸 ${coordLabel(index)}가 폭발했습니다.`);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (!toBounds(nr, nc)) continue;
        const target = idx(nr, nc);
        if (state.board[target]) {
          state.board[target] = null;
        }
        delete state.bombTimers[target];
      }
    }
    clearSpecialAt(state, index);
  }
}

function tickBombs(state, effects) {
  for (const key of Object.keys(state.bombTimers || {})) {
    state.bombTimers[key] -= 1;
  }
  explodeBombs(state, effects);
}

function advanceTurnState(state, effects, player, silent = false) {
  ensureTurnSummary(state);
  const turnIndex = state.turnNumber;
  const turnSummary = state.pendingTurnSummary.slice();
  state.turnNumber += 1;
  state.moveCount += 1;

  if (!state.gameOver) {
    state.currentPlayer = opponent(player);
    if (state.pendingWinPlayer && state.pendingWinPlayer !== player) {
      state.pendingWinTurnsLeft = Math.max(0, (state.pendingWinTurnsLeft || 0) - 1);
    }
    tickBombs(state, effects);
    tickPushLocks(state);
    checkImmediateResult(state, player, effects);
    if (!state.gameOver) refreshSpecialTiles(state);
  }

  const finalSummary = [...turnSummary, ...effects].filter(Boolean);
  const finalAnnotation = state.gameOver
    ? (state.winner === player ? "!!" : state.winner ? "??" : "💀")
    : (typeof state.pendingTurnAnnotation === "string" ? state.pendingTurnAnnotation : ":)");

  appendHistory(state, {
    turn: turnIndex,
    player,
    text: finalSummary.length ? finalSummary.join(" · ") : `${player}의 턴`,
    annotation: finalAnnotation,
  });

  state.lastEventLines = finalSummary;
  state.lastEvent = state.lastEventLines.join(" · ");
  state.pendingTurnSummary = [];
  state.pendingTurnMover = null;
  state.pendingMovePush = null;
  state.pendingTurnAnnotation = null;

  if (!silent) {
    renderAll();
    if (!state.gameOver) scheduleAiTurn();
  }
  return true;
}

function applyPlacementToState(state, index, silent = false, skipAnnotation = false) {
  const player = state.currentPlayer;
  if (state.gameOver || state.pendingMovePush) return false;
  if (state.board[index]) return false;
  if (isForbiddenMove(state, index, player)) return false;
  if (!legalPlacements(state, player).some((item) => item.to === index)) return false;
  const before = cloneState(state);

  const effects = [];
  state.board[index] = makeStone(player);
  const special = specialCellType(state, index);
  if (special === "bomb") {
    state.board[index].bombTurns = BOMB_TIMER_START;
    state.bombTimers[index] = BOMB_TIMER_START;
    effects.push(`자폭칸 ${coordLabel(index)}에 돌이 놓였습니다. ${BOMB_TIMER_START}턴 뒤 폭발합니다.`);
  }

  recordTurnLine(state, `${player} ${coordLabel(index)}${special === "move" ? " [무브칸]" : special === "bomb" ? " [자폭칸]" : ""}`);

  if (special === "move") {
    state.pendingMovePush = { index, player };
    if (!skipAnnotation) {
      state.pendingTurnAnnotation = classifyMoveAnnotation(before, state, { to: index }, player);
    }
    effects.push(`무브칸 ${coordLabel(index)}가 발동했습니다. 방향을 선택하세요.`);
    state.lastEventLines = [...state.pendingTurnSummary, ...effects];
    state.lastEvent = state.lastEventLines.join(" · ");
    if (!silent) renderAll();
    return true;
  }

  if (!skipAnnotation) {
    state.pendingTurnAnnotation = classifyMoveAnnotation(before, state, { to: index }, player);
  }
  if (checkImmediateResult(state, player, effects)) {
    state.lastEventLines = [...state.pendingTurnSummary, ...effects];
    state.lastEvent = state.lastEventLines.join(" · ");
    advanceTurnState(state, effects, player, silent);
    return true;
  }

  state.lastEventLines = [...state.pendingTurnSummary, ...effects];
  state.lastEvent = state.lastEventLines.join(" · ");
  advanceTurnState(state, effects, player, silent);
  return true;
}

  function chooseBestPushDirection(state, index, player) {
    let best = null;
    let bestScore = -Infinity;
    for (const dir of DIRECTIONS) {
      const preview = cloneState(state);
      const effects = [];
      applyOpponentPushFromMoveTile(preview, index, dir.key, player, effects);
      checkImmediateResult(preview, player, effects);
      const score = evaluateState(preview, player);
      if (score > bestScore) {
        bestScore = score;
        best = dir.key;
    }
  }
  return best;
}

  function resolvePendingMovePush(state, directionName, silent = false) {
    if (!state.pendingMovePush) return false;
    const { index, player } = state.pendingMovePush;
    if (player !== state.currentPlayer) return false;
    const before = cloneState(state);
    const effects = [];
    const finalIndex = applyOpponentPushFromMoveTile(state, index, directionName, player, effects);
    if (finalIndex == null) return false;
  const dir = directionFromName(directionName);
  state.moveTiles = (state.moveTiles || []).filter((value) => value !== index);
  state.pendingTurnAnnotation = classifyMoveAnnotation(before, state, { to: index }, player);
  recordTurnLine(state, `${player}의 무브칸 방향 선택: ${dir ? dir.label : directionName}`);
  if (checkImmediateResult(state, player, effects)) {
    state.lastEventLines = [...state.pendingTurnSummary, ...effects];
    state.lastEvent = state.lastEventLines.join(" · ");
    advanceTurnState(state, effects, player, silent);
    return true;
  }
  state.lastEventLines = [...state.pendingTurnSummary, ...effects];
  state.lastEvent = state.lastEventLines.join(" · ");
  advanceTurnState(state, effects, player, silent);
  return true;
}

function applyRailgunAction(state, player, silent = false) {
  if (state.gameOver || state.pendingMovePush) return false;
  if ((state.railgunUsesLeft || 0) <= 0) return false;
  const pattern = chooseBestRailgunPattern(state, player);
  if (!pattern) return false;
  const before = cloneState(state);
  const effects = [];
  recordTurnLine(state, `${player}가 레일건을 발동했습니다. (${coordLabel(pattern.empty)})`);
  applyRailgunAtPattern(state, pattern, player, effects);
  state.pendingTurnAnnotation = classifyMoveAnnotation(before, state, { to: pattern.empty }, player);
  state.lastEventLines = [...state.pendingTurnSummary, ...effects];
  state.lastEvent = state.lastEventLines.join(" · ");
  checkImmediateResult(state, player, effects);
  advanceTurnState(state, effects, player, silent);
  return true;
}

function applyMoveToState(state, move, silent = false, skipAnnotation = false) {
  return applyPlacementToState(state, move.to, silent, skipAnnotation);
}

  function canInteractWithCell(index) {
    if (session.mode === "spectator") return false;
    if (session.mode === "online" && session.roomStatus !== "active") return false;
    if (gameState.gameOver) return false;
    if (gameState.pendingMovePush) {
      return Boolean(directionFromMoveTileClick(index));
    }
    if (session.mode === "ai" && gameState.currentPlayer === AI_SEAT) return false;
    return legalPlacements(gameState, gameState.currentPlayer).some((move) => move.to === index);
  }

  function handleCellClick(index) {
    if (gameState.pendingMovePush) {
      const directionName = directionFromMoveTileClick(index);
      if (directionName) {
        void choosePushDirection(directionName);
      } else {
        setNotice("무브칸은 방향키처럼 주변 8칸을 눌러 방향을 고릅니다.");
      }
      return;
    }
    if (!canInteractWithCell(index)) return;
    commitMove({ to: index });
  }

async function commitMove(move) {
  if (session.mode === "online" && session.roomRef) {
    await commitOnlineMove(move);
    return;
  }
  if (applyMoveToState(gameState, move)) {
    renderAll();
    if (!gameState.pendingMovePush) scheduleAiTurn();
  }
}

async function commitOnlineMove(move) {
  const roomRef = session.roomRef;
  const seat = session.seat;
  if (!roomRef || !seat) return;

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error("room-missing");
      const room = snap.data();
      if (room.status !== "active") throw new Error("room-not-active");

      const state = normalizeState(room.state);
      if (state.gameOver || state.currentPlayer !== seat) throw new Error("not-your-turn");
      if (!applyMoveToState(state, move, true)) throw new Error("illegal-move");

      tx.update(roomRef, {
        state,
        status: state.gameOver ? "ended" : "active",
        winner: state.winner || null,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    setNotice("온라인에서 수를 반영하지 못했습니다.");
  }
}

async function activateRailgun() {
  if (session.mode === "online" && session.roomRef) {
    await commitOnlineRailgun();
    return;
  }
  if (applyRailgunAction(gameState, gameState.currentPlayer)) {
    renderAll();
  }
}

async function commitOnlineRailgun() {
  const roomRef = session.roomRef;
  const seat = session.seat;
  if (!roomRef || !seat) return;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error("room-missing");
      const room = snap.data();
      if (room.status !== "active") throw new Error("room-not-active");
      const state = normalizeState(room.state);
      if (state.gameOver || state.currentPlayer !== seat) throw new Error("not-your-turn");
      if (!applyRailgunAction(state, seat, true)) throw new Error("illegal-railgun");
      tx.update(roomRef, {
        state,
        status: state.gameOver ? "ended" : "active",
        winner: state.winner || null,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    setNotice("레일건을 사용할 수 없습니다.");
  }
}

async function choosePushDirection(directionName) {
  if (!gameState.pendingMovePush) return;
  if (session.mode === "online" && session.roomRef) {
    await commitOnlinePushDirection(directionName);
    return;
  }
  if (resolvePendingMovePush(gameState, directionName)) {
    renderAll();
  }
}

async function commitOnlinePushDirection(directionName) {
  const roomRef = session.roomRef;
  const seat = session.seat;
  if (!roomRef || !seat) return;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error("room-missing");
      const room = snap.data();
      if (room.status !== "active") throw new Error("room-not-active");
      const state = normalizeState(room.state);
      if (state.gameOver || state.currentPlayer !== seat || !state.pendingMovePush) throw new Error("not-your-turn");
      if (!resolvePendingMovePush(state, directionName, true)) throw new Error("illegal-push");
      tx.update(roomRef, {
        state,
        status: state.gameOver ? "ended" : "active",
        winner: state.winner || null,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    setNotice("무브칸 방향을 적용하지 못했습니다.");
  }
}

function scheduleAiTurn() {
  if (session.mode !== "ai") return;
  if (gameState.gameOver) return;
  if (gameState.currentPlayer !== AI_SEAT) return;
  if (session.aiTimer) return;
  session.aiThinking = true;
  session.aiTimer = setTimeout(() => { void runAiTurn(); }, AI_DELAY_MS);
  renderAll();
}

async function runAiTurn() {
  if (session.aiTimer) {
    clearTimeout(session.aiTimer);
    session.aiTimer = null;
  }
  session.aiThinking = false;
  if (session.mode !== "ai" || gameState.gameOver || gameState.currentPlayer !== AI_SEAT) {
    renderAll();
    return;
  }
  const beforeState = cloneState(gameState);
  const move = await chooseAiMove(gameState);
  if (!move) {
    gameState.gameOver = true;
    gameState.drawReason = "AI가 둘 수 있는 수가 없습니다.";
    gameState.lastEventLines = [gameState.drawReason];
    gameState.lastEvent = gameState.drawReason;
    renderAll();
    return;
  }
  applyMoveToState(gameState, move);
  if (gameState.pendingMovePush) {
    const push = chooseBestPushDirection(gameState, gameState.pendingMovePush.index, AI_SEAT);
    if (push) resolvePendingMovePush(gameState, push, true);
  }
  void saveAiMemoryRecord(beforeState, move.to, gameState);
  renderAll();
}

function startLocalAIMatch(message = "AI 대전 준비 완료") {
  stopOnlineSession();
  stopAiTimer();
  session.mode = "ai";
  session.notice = message;
  gameState = createInitialState();
  renderAll();
  scheduleAiTurn();
}

async function startOnlineMatch() {
  stopOnlineSession();
  stopAiTimer();
  session.mode = "online";
  session.notice = "자동 온라인 매칭으로 상대를 찾는 중입니다.";
  gameState = createInitialState();
  renderAll();

  if (!(await ensureFirebase())) {
    startLocalAIMatch("인터넷이 연결되어야 온라인 대전을 시작할 수 있습니다.");
    return;
  }

  const hasIdentity = await ensureOnlineIdentity();
  if (!hasIdentity) {
    startLocalAIMatch("온라인 대전을 시작하려면 Firebase 로그인이나 익명 로그인이 필요합니다.");
    return;
  }

  const identity = await ensureIdentity();
  try {
    await cleanupStaleWaitingRooms();

    const waitingQuery = query(collection(db, ROOM_COLLECTION), where("status", "==", "waiting"), limit(10));
    const waitingSnapshot = await getDocs(waitingQuery);

    for (const roomDoc of waitingSnapshot.docs) {
      const joined = await tryJoinRoom(roomDoc.ref, identity);
      if (joined) {
        attachRoomListener(roomDoc.ref, false);
        subscribeRoomChat(roomDoc.ref);
        setNotice(`방 ${roomDoc.id.slice(0, 6)}에 합류했습니다.`);
        renderAll();
        return;
      }
    }

    const roomRef = await addDoc(collection(db, ROOM_COLLECTION), {
      status: "waiting",
      hostId: identity.id,
      hostName: identity.name,
      guestId: null,
      guestName: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      state: normalizeState(createInitialState()),
    });

    await setDoc(doc(db, MATCHMAKING_COLLECTION, MATCHMAKING_DOC), {
      roomId: roomRef.id,
      hostId: identity.id,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    session.roomRef = roomRef;
    session.roomId = roomRef.id;
    session.seat = "X";
    session.host = true;
    session.roomStatus = "waiting";
    attachRoomListener(roomRef, true);
    subscribeRoomChat(roomRef);
    session.timeoutId = setTimeout(() => fallbackToAiIfWaiting(roomRef), MATCH_WAIT_MS);
    setNotice(`방 ${roomRef.id.slice(0, 6)}를 만들었습니다. 상대를 기다립니다.`);
    renderAll();
  } catch (error) {
    console.error(error);
    startLocalAIMatch("온라인 매칭 중 문제가 생겼습니다.");
  }
}

async function watchGomokuRoom(roomId) {
  if (!roomId) return;
  stopOnlineSession();
  stopAiTimer();
  session.mode = "spectator";
  session.notice = "관전 모드로 전환했습니다.";
  gameState = createInitialState();
  renderAll();

  if (!(await ensureFirebase())) {
    session.notice = "관전하려면 인터넷 연결이 필요합니다.";
    renderAll();
    return;
  }

  const hasIdentity = await ensureOnlineIdentity();
  if (!hasIdentity) {
    session.notice = "관전을 위해 로그인 또는 익명 로그인이 필요합니다.";
    renderAll();
    return;
  }

  try {
    const roomRef = doc(db, ROOM_COLLECTION, roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) {
      session.notice = "해당 경기를 찾을 수 없습니다.";
      renderAll();
      return;
    }

    const room = snap.data();
    session.roomRef = roomRef;
    session.roomId = snap.id;
    session.host = false;
    session.seat = null;
    session.roomStatus = room.status;
    gameState = normalizeState(room.state);
    if (room.status === "ended") {
      gameState.gameOver = true;
      gameState.winner = room.winner || gameState.winner;
    }
    attachRoomListener(roomRef, false);
    subscribeRoomChat(roomRef);
    session.notice = `방 ${roomId.slice(0, 6)}를 관전 중입니다.`;
    renderAll();
  } catch (error) {
    console.error(error);
    session.notice = "관전할 수 없습니다.";
    renderAll();
  }
}

async function tryJoinRoom(roomRef, identity) {
  let joined = false;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = snap.data();
      if (room.status !== "waiting" || room.guestId || room.hostId === identity.id) return;
      tx.update(roomRef, {
        status: "active",
        guestId: identity.id,
        guestName: identity.name,
        updatedAt: serverTimestamp(),
      });
      joined = true;
    });
  } catch (error) {
    console.error(error);
  }

  if (joined) {
    session.roomRef = roomRef;
    session.roomId = roomRef.id;
    session.seat = "O";
    session.host = false;
    session.roomStatus = "active";
  }
  return joined;
}

async function cleanupStaleWaitingRooms() {
  if (!(await ensureFirebase())) return;
  try {
    const waitingQuery = query(collection(db, ROOM_COLLECTION), where("status", "==", "waiting"), limit(20));
    const snapshot = await getDocs(waitingQuery);
    for (const roomDoc of snapshot.docs) {
      const room = roomDoc.data();
      if (!isRoomStale(room)) continue;
      await deleteOnlineRoom(roomDoc.ref);
    }
  } catch (error) {
    console.error(error);
  }
}

function attachRoomListener(roomRef, hostCreated) {
  if (session.unsubscribe) session.unsubscribe();
  session.unsubscribe = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      if (session.mode === "online") markOpponentLeftWin();
      return;
    }

    const room = snap.data();
    session.roomStatus = room.status;
    session.roomId = snap.id;

    if (room.status === "waiting" && hostCreated) {
      gameState = normalizeState(room.state);
      if (!gameState.lastEvent) gameState.lastEvent = "상대를 기다리는 중입니다.";
    } else if (room.status === "active") {
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
      }
      gameState = normalizeState(room.state);
      if (!gameState.lastEvent) gameState.lastEvent = "상대와 연결되었습니다.";
      subscribeRoomChat(roomRef);
    } else if (room.status === "ended") {
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
      }
      gameState = normalizeState(room.state);
      gameState.gameOver = true;
      gameState.winner = room.winner || gameState.winner;
    } else if (room.status === "cancelled" && session.mode === "online") {
      startLocalAIMatch("상대가 없어서 AI 대전으로 전환되었습니다.");
      return;
    }

    renderAll();
  });
}

async function fallbackToAiIfWaiting(roomRef) {
  if (session.mode !== "online" || session.roomRef?.id !== roomRef.id) return;
  try {
    await deleteOnlineRoom(roomRef);
  } catch (error) {
    console.error(error);
  }
  startLocalAIMatch("상대가 없어서 AI 대전으로 전환되었습니다.");
}

async function cancelOnlineMatch() {
  if (session.mode !== "online") return;
  await leaveOnlineRoom();
  startLocalAIMatch("온라인 매칭을 취소하고 AI 대전으로 돌아갑니다.");
}

async function restartCurrentGame() {
  if (session.mode === "online") {
    await cancelOnlineMatch();
    await startOnlineMatch();
    return;
  }
  startLocalAIMatch("새 게임을 시작했습니다.");
}

function chatRoomRef(roomRef = session.roomRef) {
  if (!roomRef) return null;
  return collection(db, ROOM_COLLECTION, roomRef.id, "chat");
}

function roomCanChat() {
  return session.roomRef && ["active", "ended"].includes(session.roomStatus);
}

function renderLobby() {
  if (!ui.lobbyList) return;

  const rooms = Array.isArray(session.lobbyRooms) ? session.lobbyRooms : [];
  if (ui.lobbyStatus) {
    ui.lobbyStatus.textContent = rooms.length
      ? `관전 가능한 진행 중 경기 ${rooms.length}개`
      : "현재 진행 중인 오목 경기가 없습니다.";
  }

  if (!rooms.length) {
    ui.lobbyList.innerHTML = '<div class="lobby-empty">진행 중인 경기가 생기면 여기서 바로 관전할 수 있습니다.</div>';
    return;
  }

  ui.lobbyList.innerHTML = rooms.map((room) => {
    const roomLabel = room.id ? room.id.slice(0, 6) : "-";
    const host = room.hostName || "호스트";
    const guest = room.guestName || "대기 중";
    const updated = room.updatedAt?.toDate?.()?.toLocaleTimeString?.() || "";
    return `
      <div class="lobby-card">
        <div class="lobby-card-top">
          <div class="lobby-card-title">
            <strong>방 ${escapeHtml(roomLabel)}</strong>
            <div class="lobby-card-meta">
              <span>호스트: ${escapeHtml(host)}</span>
              <span>상대: ${escapeHtml(guest)}</span>
            </div>
          </div>
          <span class="turn-chip">${escapeHtml(room.status || "active")}</span>
        </div>
        <div class="lobby-card-actions">
          <button type="button" onclick="watchGomokuRoom(${JSON.stringify(room.id || "")})">관전</button>
        </div>
        ${updated ? `<div class="panel-hint">업데이트 ${escapeHtml(updated)}</div>` : ""}
      </div>`;
  }).join("");
}

function subscribeLobbyRooms() {
  if (session.lobbyUnsubscribe) {
    session.lobbyUnsubscribe();
    session.lobbyUnsubscribe = null;
  }
  if (!(authReady && authUser) || !db) {
    session.lobbyRooms = [];
    renderLobby();
    return;
  }

  const lobbyQuery = query(
    collection(db, ROOM_COLLECTION),
    where("status", "==", "active"),
    limit(12),
  );

  session.lobbyUnsubscribe = onSnapshot(lobbyQuery, (snapshot) => {
    session.lobbyRooms = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => {
        const left = a.updatedAt?.toMillis?.() || 0;
        const right = b.updatedAt?.toMillis?.() || 0;
        return right - left;
      });
    renderLobby();
  }, (error) => {
    console.error("LOBBY SNAPSHOT ERROR:", error);
    session.lobbyRooms = [];
    renderLobby();
  });
}

function renderChat() {
  const active = session.mode === "online" || session.mode === "spectator"
    ? roomCanChat()
    : false;
  if (ui.chatStatus) {
    if (session.mode === "spectator") ui.chatStatus.textContent = session.roomStatus === "ended"
      ? "관전 중인 경기입니다. 종료 후에도 채팅할 수 있습니다."
      : "관전 중인 경기입니다. 채팅할 수 있습니다.";
    else if (session.mode !== "online") ui.chatStatus.textContent = "온라인 대전에서만 채팅을 사용할 수 있습니다.";
    else if (session.roomStatus === "waiting") ui.chatStatus.textContent = "상대가 들어오면 채팅을 사용할 수 있습니다.";
    else if (session.roomStatus === "active") ui.chatStatus.textContent = "온라인 대전 중입니다.";
    else if (session.roomStatus === "ended") ui.chatStatus.textContent = "대전이 끝났습니다.";
    else ui.chatStatus.textContent = "채팅 준비 중입니다.";
  }

  if (!ui.chatMessages) return;
  const messages = Array.isArray(session.chatLog) ? session.chatLog : [];
  if (!messages.length) {
    ui.chatMessages.innerHTML = '<span class="chat-empty">아직 채팅이 없습니다.</span>';
  } else {
    ui.chatMessages.innerHTML = messages.map((message) => {
      const mine = message.uid && message.uid === (authUser?.uid || getGuestId());
      return `
        <div class="chat-item ${mine ? "mine" : ""}">
          <div class="chat-meta">${escapeHtml(message.name || "익명")}</div>
          <div class="chat-bubble">${escapeHtml(message.text || "")}</div>
        </div>`;
    }).join("");
  }

  if (ui.chatInput) ui.chatInput.disabled = !active;
}

function subscribeRoomChat(roomRef) {
  if (session.chatUnsubscribe) {
    session.chatUnsubscribe();
    session.chatUnsubscribe = null;
  }
  if (!roomRef) return;
  const chatQuery = query(chatRoomRef(roomRef), orderBy("createdAt", "asc"), limit(80));
  session.chatUnsubscribe = onSnapshot(chatQuery, (snapshot) => {
    session.chatLog = snapshot.docs.map((docSnap) => docSnap.data());
    renderChat();
  });
}

async function sendChatMessage() {
  if (!roomCanChat()) return;
  if (!(await ensureFirebase())) return;
  const text = ui.chatInput?.value.trim();
  if (!text) return;

  try {
    const identity = await ensureIdentity();
    await addDoc(chatRoomRef(), {
      uid: identity.id,
      name: identity.name,
      text,
      clientTs: Date.now(),
      createdAt: serverTimestamp(),
    });
    if (ui.chatInput) ui.chatInput.value = "";
  } catch (error) {
    console.error(error);
    setNotice("채팅을 보낼 수 없습니다.");
  }
}

function renderRoomInfo() {
  if (!ui.roomInfo) return;
  const modeLabel = session.mode === "online"
    ? "온라인"
    : session.mode === "spectator"
      ? "관전"
      : session.mode === "ai"
        ? "AI"
        : "대기";
  const room = session.roomId ? session.roomId.slice(0, 6) : "-";
  const extra = session.mode === "online"
    ? `${session.host ? "호스트" : "참가자"} | ${session.roomStatus || "대기"}`
    : session.mode === "spectator"
      ? `관전 | ${session.roomStatus || "대기"}`
      : `AI 난이도 ${getAiDifficultyLabel()}`;
  ui.roomInfo.innerHTML = [
    `<span class="turn-chip"><strong>모드</strong> ${modeLabel}</span>`,
    `<span class="turn-chip">${room}</span>`,
    `<span class="turn-chip">${extra}</span>`,
  ].join("");
}

function renderTurnInfo() {
  if (!ui.turnInfo) return;
  const turnText = gameState.gameOver
    ? (gameState.winner ? `${gameState.winner} 승리` : gameState.drawReason || "무승부")
    : gameState.pendingWinPlayer
      ? `${gameState.pendingWinPlayer} 5목 유지 중`
    : `${gameState.currentPlayer} 차례`;
  const moveCount = `돌 ${countPieces(gameState, "X")} / ${countPieces(gameState, "O")}`;
  const moveTileText = `무브칸 ${gameState.moveTiles?.length || 0}개`;
  const bombTileText = `자폭칸 ${gameState.bombTiles?.length || 0}개`;
  const railgunText = `레일건 ${gameState.railgunUsesLeft || 0}회`;
  const pendingText = gameState.pendingMovePush
    ? `방향 선택 중: ${coordLabel(gameState.pendingMovePush.index)}`
    : "방향 선택 없음";
  ui.turnInfo.innerHTML = [
    `<span class="turn-chip"><strong>${turnText}</strong></span>`,
    `<span class="turn-chip">${moveCount}</span>`,
    `<span class="turn-chip">${moveTileText}</span>`,
    `<span class="turn-chip">${bombTileText}</span>`,
    `<span class="turn-chip">${railgunText}</span>`,
    `<span class="turn-chip">${pendingText}</span>`,
  ].join("");
}

function renderStatus() {
  if (!ui.status) return;
  const lines = [
    session.mode === "online"
      ? "자동 온라인 매칭으로 상대를 찾습니다."
      : session.mode === "ai"
        ? `AI가 ${AI_SEAT}를 담당합니다.`
        : "오목 전장에 오신 것을 환영합니다.",
    gameState.pendingWinPlayer
      ? `${gameState.pendingWinPlayer}의 5목이 유지 중입니다. 한 턴 더 버티면 승리합니다.`
      : "",
    gameState.gameOver
      ? (gameState.winner ? `${gameState.winner}가 승리했습니다.` : gameState.drawReason || "무승부입니다.")
      : "11x11 보드에서 정확히 5개를 잇으면 승리합니다.",
    gameState.pendingMovePush
      ? `무브칸: 상대 돌을 한 칸 밀 방향을 고르세요. (${coordLabel(gameState.pendingMovePush.index)})`
      : `공개된 특수칸: 무브칸 ${gameState.moveTiles?.length || 0}개, 자폭칸 ${gameState.bombTiles?.length || 0}개`,
    Object.entries(gameState.bombTimers || {}).length
      ? `자폭카운트: ${Object.entries(gameState.bombTimers).map(([index, timer]) => `${coordLabel(Number(index))} ${timer}`).join(", ")}`
      : "자폭카운트 없음",
    Object.keys(gameState.pushLocks || {}).length
      ? `밀린 위치 잠금: ${Object.entries(gameState.pushLocks).map(([index, turns]) => `${coordLabel(Number(index))} ${turns}`).join(", ")}`
      : "",
    session.notice || "",
    ...gameState.lastEventLines,
  ].filter(Boolean);
  ui.status.innerHTML = lines.map((line) => `<span class="status-line">${escapeHtml(line)}</span>`).join("");
}

function renderHistory() {
  if (!ui.turnHistory) return;
  const entries = Array.isArray(gameState.turnHistory) ? gameState.turnHistory : [];
  const historyKey = entries.length
    ? `${entries.length}|${entries[0]?.turn ?? ""}|${entries[0]?.text ?? ""}|${entries[0]?.annotation ?? ""}`
    : "empty";
  if (lastRenderedHistoryKey === historyKey) return;
  lastRenderedHistoryKey = historyKey;
  if (!entries.length) {
    ui.turnHistory.innerHTML = '<span class="history-empty">아직 기록이 없습니다.</span>';
    return;
  }
  ui.turnHistory.innerHTML = entries
    .map((entry) => `
      <div class="history-row">
        <strong>${entry.turn}.</strong>
        <div class="history-body">
          <div class="history-main">${escapeHtml(entry.text)}</div>
          <div class="history-meta">판정: <span class="turn-anno">${escapeHtml(entry.annotation || "")}</span></div>
        </div>
      </div>`)
    .join("");
}

function boardPositionSummary() {
  const x = [];
  const o = [];
  for (let i = 0; i < BOARD_CELLS; i++) {
    const stone = gameState.board[i];
    if (!stone) continue;
    if (stone.owner === "X") x.push(coordLabel(i));
    else o.push(coordLabel(i));
  }
  return `x: ${x.length ? x.join(" ") : "없음"}\no: ${o.length ? o.join(" ") : "없음"}`;
}

function turnHistoryText() {
  const entries = Array.isArray(gameState.turnHistory) ? gameState.turnHistory : [];
  if (!entries.length) return "아직 기록이 없습니다.";
  return entries
    .slice()
    .reverse()
    .map((entry) => `${entry.turn}. ${entry.text}${entry.annotation ? ` ${entry.annotation}` : ""}`)
    .join("\n");
}

async function copyTextToClipboard(text, message = "복사했습니다.") {
  try {
    await navigator.clipboard.writeText(text);
    setNotice(message);
  } catch (error) {
    console.error(error);
    setNotice("복사에 실패했습니다.");
  }
}

function copyTurnHistory() {
  copyTextToClipboard(turnHistoryText(), "턴 기록을 복사했습니다.");
}

function copyBoardPositions() {
  copyTextToClipboard(boardPositionSummary(), "현재 판 정보를 복사했습니다.");
}

function renderModeHelp() {
  if (!ui.matchStatus) return;
  if (session.mode === "online") {
    if (session.roomStatus === "waiting") ui.matchStatus.textContent = `방 ${session.roomId?.slice(0, 6) || "-"}에서 상대를 기다리는 중입니다. 12초 뒤 AI로 바뀝니다.`;
    else if (session.roomStatus === "active") ui.matchStatus.textContent = "상대와 연결되었습니다. 온라인 대전이 진행됩니다.";
    else if (session.roomStatus === "ended") ui.matchStatus.textContent = "온라인 대전이 끝났습니다.";
    else if (session.roomStatus === "cancelled") ui.matchStatus.textContent = "매칭이 취소되었습니다.";
    else ui.matchStatus.textContent = "온라인 룸을 준비 중입니다.";
    return;
  }
  if (session.mode === "spectator") {
    if (session.roomStatus === "ended") ui.matchStatus.textContent = "경기가 끝난 뒤에도 관전과 채팅을 이어갈 수 있습니다.";
    else ui.matchStatus.textContent = "현재 진행 중인 경기를 관전하고 있습니다.";
    return;
  }
  if (session.mode === "ai") {
    ui.matchStatus.textContent = session.aiThinking
      ? `AI가 ${AI_DELAY_MS / 1000}초 동안 고민 중입니다. 난이도: ${getAiDifficultyLabel()}`
      : `AI가 자동으로 O를 담당합니다. 난이도: ${getAiDifficultyLabel()}`;
    return;
  }
  ui.matchStatus.textContent = "오목 전장을 준비 중입니다.";
}

function renderSpecialControls() {
  const isMyTurn = session.mode === "online"
    ? session.roomStatus === "active" && session.seat === gameState.currentPlayer
    : session.mode === "ai"
      ? gameState.currentPlayer !== AI_SEAT
      : true;
  const railgunPatterns = findRailgunPatterns(gameState, gameState.currentPlayer);

  if (ui.railgunBtn) {
    ui.railgunBtn.disabled = gameState.gameOver || gameState.pendingMovePush || !isMyTurn || (gameState.railgunUsesLeft || 0) <= 0 || !railgunPatterns.length;
    ui.railgunBtn.textContent = `레일건 발동 (${gameState.railgunUsesLeft || 0}회, ${railgunPatterns.length}개 가능)`;
    ui.railgunBtn.title = railgunPatterns.length
      ? railgunPatterns.map((pattern) => coordLabel(pattern.empty)).join(", ")
      : "발동 가능한 레일건이 없습니다.";
  }

  if (!ui.directionGrid) return;
  ui.directionGrid.innerHTML = "";
  if (!gameState.pendingMovePush) {
    ui.directionGrid.innerHTML = '<span class="panel-hint">무브칸에 돌을 두면 상대 돌을 한 칸 밀 수 있습니다.</span>';
    return;
  }
  if (!isMyTurn) {
    ui.directionGrid.innerHTML = '<span class="panel-hint">상대가 무브칸 방향을 고르는 중입니다.</span>';
    return;
  }
  for (const dir of DIRECTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "direction-btn";
    button.textContent = dir.label;
    button.onclick = () => choosePushDirection(dir.key);
    ui.directionGrid.appendChild(button);
  }
}

  function renderBoard() {
    if (!ui.board) return;
    ui.board.innerHTML = "";
    ui.board.classList.add("gomoku-board");
    const pendingOrigin = gameState.pendingMovePush ? rc(gameState.pendingMovePush.index) : null;
    const railgunPatterns = findRailgunPatterns(gameState, gameState.currentPlayer);
    const railgunTargets = new Map();
    for (const pattern of railgunPatterns) {
      const label = railgunPatternText(pattern);
      if (!railgunTargets.has(pattern.empty)) railgunTargets.set(pattern.empty, []);
      if (label) railgunTargets.get(pattern.empty).push(label);
    }

    for (let i = 0; i < BOARD_CELLS; i++) {
      const stone = gameState.board[i];
      const classes = ["cell"];
      if (stone?.owner === "X") classes.push("piece-x");
      if (stone?.owner === "O") classes.push("piece-o");
      const tileType = specialCellType(gameState, i);
      if (tileType === "move") classes.push("shift-cell");
      if (tileType === "bomb") classes.push("bomb-cell");
        if (!stone && railgunTargets.has(i)) classes.push("railgun-target");
      if (!stone && gameState.pushLocks?.[i] > 0) classes.push("push-lock-cell");
      if (stone) classes.push("has-piece");
      if (pendingOrigin) {
        const pos = rc(i);
        const dr = pos.row - pendingOrigin.row;
        const dc = pos.col - pendingOrigin.col;
        if (directionNameFromDelta(dr, dc)) classes.push("direction-target");
      }

      const cell = document.createElement("div");
      cell.className = classes.join(" ");
        const railgunLabel = railgunTargets.has(i) ? ` / 레일건 가능 (${railgunTargets.get(i).join(", ")})` : "";
        cell.title = `${coordLabel(i)}${tileType === "move" ? " / 무브칸" : ""}${tileType === "bomb" ? " / 자폭칸" : ""}${railgunLabel}`;
      cell.addEventListener("click", () => handleCellClick(i));

      const mark = stone ? stone.owner : "";
      const specialBadge = tileType === "move"
        ? '<span class="tile-badge">MOVE</span>'
        : tileType === "bomb"
          ? '<span class="tile-badge">BOMB</span>'
          : "";
      const lockBadge = !stone && gameState.pushLocks?.[i] ? `<span class="tile-badge push-lock-badge">L${gameState.pushLocks[i]}</span>` : "";
      const bombLabel = stone?.bombTurns ? `<span class="tile-badge bomb-count">B${stone.bombTurns}</span>` : "";
        const railgunBadge = !stone && railgunTargets.has(i) ? `<span class="tile-badge railgun-badge">RG</span>` : "";
      cell.innerHTML = `
        <div class="cell-content">
          <span class="cell-coord">${coordLabel(i)}</span>
          <span class="cell-mark ${stone ? `piece-${stone.owner.toLowerCase()}` : ""}">${mark}</span>
          ${specialBadge}
          ${lockBadge}
          ${railgunBadge}
          ${bombLabel}
        </div>`;

      ui.board.appendChild(cell);
    }
  }

function renderAll() {
  renderRoomInfo();
  renderTurnInfo();
  renderStatus();
  renderHistory();
  renderChat();
  renderBoard();
  renderModeHelp();
  renderSpecialControls();
  if (session.mode === "ai" && !gameState.gameOver && gameState.currentPlayer === AI_SEAT && !session.aiTimer) {
    scheduleAiTurn();
  }
}

function ensureAiTicker() {
  if (session.aiTimer) return;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function debugLog(...args) {
  if (DEBUG) console.log("[gomoku]", ...args);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    renderAll();
    scheduleAiTurn();
  }
});

