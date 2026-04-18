import { auth, db } from "../community/js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 보드 크기와 시간 규칙은 여기서 한 번에 관리한다.
const BOARD_SIZE = 5;
const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;
const ROOM_COLLECTION = "minigameRooms";
const MATCH_WAIT_MS = 12000;
const AI_DELAY_MS = 5000;
const TURN_TIME_MS = 5 * 60 * 1000;
const TURN_INCREMENT_MS = 2000;
const AI_SEAT = "O";
const GUEST_KEY = "minigame.guestId";
const NAME_KEY = "minigame.displayName";
const AI_DIFFICULTY_KEY = "minigame.aiDifficulty";
const DEBUG_MINIGAME = true;

// 시작 배치와 특수 타일 위치를 따로 모아두면 맵 수정이 쉬워진다.
const START_POSITIONS = { X: [20, 22, 24], O: [0, 2, 4] };
const SPECIAL_TILES = {
  6: { type: "trap", label: "함정", icon: "☒", short: "T", pair: 18 },
  7: { type: "portal", label: "포털", icon: "⟲", short: "P", pair: 17 },
  8: { type: "fort", label: "요새", icon: "🛡", short: "F", pair: 16 },
  11: { type: "spring", label: "스프링", icon: "↯", short: "S", pair: 13 },
  12: { type: "trap", label: "함정", icon: "☒", short: "T", pair: 12 },
  13: { type: "spring", label: "스프링", icon: "↯", short: "S", pair: 11 },
  16: { type: "fort", label: "요새", icon: "🛡", short: "F", pair: 8 },
  17: { type: "portal", label: "포털", icon: "⟲", short: "P", pair: 7 },
  18: { type: "trap", label: "함정", icon: "☒", short: "T", pair: 6 },
};
const DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const THREE_LINES = buildThreeLines();

// ui는 화면 요소 저장소, session은 매칭/AI/채팅 상태 저장소다.
const ui = { board:null, status:null, turnInfo:null, roomInfo:null, matchStatus:null, playerName:null, aiDifficulty:null, skipTurnBtn:null, turnHistory:null, chatMessages:null, chatInput:null, chatStatus:null, chatSendBtn:null };
const session = { mode:"idle", roomRef:null, roomId:null, seat:null, host:false, unsubscribe:null, timeoutId:null, aiTimer:null, clockTimer:null, autoPassTimer:null, notice:"", roomStatus:null, chatUnsubscribe:null, chatLog:[], aiThinking:false };
let authUser = null;
let authReady = false;
let gameState = createInitialState();
let selectedIndex = null;

// 로그인 상태가 바뀌면 이름 입력칸과 화면을 다시 그린다.
onAuthStateChanged(auth, (user) => { authUser = user; authReady = true; syncNameField(); renderAll(); });

// HTML에서 직접 호출하는 함수들은 window에 붙여둔다.
window.startDefaultGame = startDefaultGame;
window.launchMiniGame = launchMiniGame;
window.goHome = goHome;
window.startLocalAIMatch = startLocalAIMatch;
window.startOnlineMatch = startOnlineMatch;
window.cancelOnlineMatch = cancelOnlineMatch;
window.restartCurrentGame = restartCurrentGame;
window.skipCurrentTurn = skipCurrentTurn;
window.renderBoard = renderBoard;
window.sendChatMessage = sendChatMessage;
window.copyTurnHistory = copyTurnHistory;
window.copyBoardPositions = copyBoardPositions;
window.copyDesktopBuildGuide = copyDesktopBuildGuide;

document.addEventListener("DOMContentLoaded", () => {
  // 화면의 각 패널과 버튼을 한 번에 연결한다.
  ui.board = document.getElementById("board");
  ui.status = document.getElementById("gameStatus");
  ui.turnInfo = document.getElementById("turnInfo");
  ui.roomInfo = document.getElementById("roomInfo");
  ui.matchStatus = document.getElementById("matchStatus");
  ui.playerName = document.getElementById("playerName");
  ui.aiDifficulty = document.getElementById("aiDifficulty");
  ui.skipTurnBtn = document.getElementById("skipTurnBtn");
  ui.turnHistory = document.getElementById("turnHistory");
  ui.chatMessages = document.getElementById("chatMessages");
  ui.chatInput = document.getElementById("chatInput");
  ui.chatStatus = document.getElementById("chatStatus");
  ui.chatSendBtn = document.getElementById("chatSendBtn");

  if (isDesktopApp()) {
    const downloadCard = document.getElementById("downloadCard");
    if (downloadCard) downloadCard.style.display = "none";
  }

  if (ui.playerName) {
    // 표시 이름은 새로고침 후에도 유지되도록 저장한다.
    ui.playerName.value = localStorage.getItem(NAME_KEY) || "";
    ui.playerName.addEventListener("input", () => {
      localStorage.setItem(NAME_KEY, ui.playerName.value.trim());
      renderAll();
    });
  }

  if (ui.aiDifficulty) {
    // AI 난이도도 사용자가 다시 고를 수 있게 저장해 둔다.
    const savedDifficulty = localStorage.getItem(AI_DIFFICULTY_KEY) || "normal";
    ui.aiDifficulty.value = savedDifficulty;
    ui.aiDifficulty.addEventListener("change", () => {
      localStorage.setItem(AI_DIFFICULTY_KEY, ui.aiDifficulty.value);
      setNotice(`AI 난이도를 ${getAiDifficultyLabel()}로 설정했습니다.`);
      renderAll();
    });
  }

  if (ui.chatInput) {
    // 엔터 키로 바로 채팅 전송이 가능하게 만든다.
    ui.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
  }

  ensureClockTicker();
  showHomePage();
  renderAll();
});

function makePiece(owner) { return { owner, frozenTurns: 0, shieldTurns: 0 }; }
function isDesktopApp() { return /Electron/i.test(navigator.userAgent || ""); }
// 상태는 깊은 복사해서 AI 분석이나 미리보기에 원본이 오염되지 않게 한다.
function cloneState(state) { return JSON.parse(JSON.stringify(state)); }
function opponent(player) { return player === "X" ? "O" : "X"; }
function idx(row, col) { return row * BOARD_SIZE + col; }
function rc(index) { return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE }; }
function coordLabel(index) {
  const { row, col } = rc(index);
  return `${String.fromCharCode(97 + col)}${row + 1}`;
}
function pieceSignature(piece) {
  if (!piece) return "";
  return `${piece.owner}${piece.frozenTurns > 0 ? "f" : ""}${piece.shieldTurns > 0 ? "s" : ""}`;
}
function boardSignature(state) {
  // 동형 반복 판정을 위해 현재 판을 한 줄 문자열로 압축한다.
  const board = state.board.map((cell) => pieceSignature(cell) || ".");
  return `${state.currentPlayer}|${state.victoryHoldPlayer || "-"}|${board.join("")}`;
}
function ensureGameMeta(state) {
  // 저장된 상태가 조금 달라도 필요한 메타값은 항상 채워 넣는다.
  if (!state.clockMs || typeof state.clockMs !== "object") {
    state.clockMs = { X: TURN_TIME_MS, O: TURN_TIME_MS };
  }
  if (typeof state.turnStartedAt !== "number") state.turnStartedAt = Date.now();
  if (!state.repetitionCounts || typeof state.repetitionCounts !== "object") state.repetitionCounts = {};
  if (typeof state.lastClockUpdateAt !== "number") state.lastClockUpdateAt = state.turnStartedAt;
}
function recordRepetition(state) {
  // 같은 판이 몇 번 반복됐는지 누적한다.
  ensureGameMeta(state);
  const signature = boardSignature(state);
  const next = (state.repetitionCounts[signature] || 0) + 1;
  state.repetitionCounts[signature] = next;
  return next;
}
function seedRepetitionCount(state) {
  ensureGameMeta(state);
  if (!state.repetitionCounts || typeof state.repetitionCounts !== "object") state.repetitionCounts = {};
  const signature = boardSignature(state);
  if (!state.repetitionCounts[signature]) state.repetitionCounts[signature] = 1;
}
function getClockRemaining(state, player, now = Date.now()) {
  // 현재 차례의 남은 시간은 지나간 시간을 빼서 계산한다.
  ensureGameMeta(state);
  const base = state.clockMs[player] ?? TURN_TIME_MS;
  if (!state.gameOver && state.currentPlayer === player) {
    return Math.max(0, base - Math.max(0, now - state.turnStartedAt));
  }
  return Math.max(0, base);
}
function clockText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function startClockForCurrentPlayer(state) {
  // 다음 차례가 시작될 때 시계 기준 시각을 새로 잡는다.
  ensureGameMeta(state);
  state.turnStartedAt = Date.now();
  state.lastClockUpdateAt = state.turnStartedAt;
}
function maybeDeclareThreefoldDraw(state, effects) {
  // 같은 위치와 차례가 3번 반복되면 무승부로 끝낸다.
  if (state.gameOver) return;
  const count = recordRepetition(state);
  if (count >= 3) {
    state.gameOver = true;
    state.winner = null;
    state.drawReason = "3수 동형 무승부";
    effects.push("무승부! 같은 판이 3번 반복됐습니다.");
  }
}
function maybeDeclareHoldLimitDraw(state, effects) {
  // 3목 보존 시도가 너무 길어지면 게임이 끝나도록 막는다.
  if (state.gameOver) return;
  const attempts = state.victoryHoldAttempts || { X: 0, O: 0 };
  if (attempts.X >= 10 && attempts.O >= 10) {
    state.gameOver = true;
    state.winner = null;
    state.drawReason = "3목 보존 10회 제한";
    effects.push("무승부! 양쪽이 3목 보존을 10번씩 시도했습니다.");
  }
}
function finalizeTurnClock(state, player, effects) {
  // 한 턴에 실제로 쓴 시간을 반영하고, 초과하면 패배 처리한다.
  ensureGameMeta(state);
  const now = Date.now();
  const elapsed = Math.max(0, now - state.turnStartedAt);
  state.clockMs[player] = Math.max(0, (state.clockMs[player] ?? TURN_TIME_MS) - elapsed);
  if (state.clockMs[player] <= 0) {
    state.gameOver = true;
    state.winner = opponent(player);
    effects.push(`${state.winner} 승리! ${player}의 시간이 모두 소진됐습니다.`);
    return false;
  }
  state.clockMs[player] = Math.min(TURN_TIME_MS, state.clockMs[player] + TURN_INCREMENT_MS);
  return true;
}
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function formatHistoryCell(index, piece) {
  const special = SPECIAL_TILES[index];
  const tags = [];
  if (special) tags.push(special.short);
  if (piece?.frozenTurns > 0) tags.push("F");
  if (piece?.shieldTurns > 0) tags.push("S");
  return `${coordLabel(index)}${tags.length ? ` ${tags.join(" ")}` : ""}`;
}
function summarizeLandingNotes(notes) {
  // 특수 타일 효과를 턴 기록 뒤에 짧게 붙인다.
  return Array.isArray(notes) && notes.length ? ` [${notes.join(" ")}]` : "";
}
function getAiDifficulty() {
  // 난이도는 UI 선택값이 있으면 우선, 없으면 저장값을 쓴다.
  const value = ui.aiDifficulty?.value || localStorage.getItem(AI_DIFFICULTY_KEY) || "normal";
  return ["easy", "normal", "hard"].includes(value) ? value : "normal";
}
function getAiDifficultyLabel() {
  const difficulty = getAiDifficulty();
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "hard") return "최강";
  return "보통";
}
function debugLog(...args) {
  if (!DEBUG_MINIGAME) return;
  console.log("[minigame]", ...args);
}
function ensureTurnRecord(state) {
  // 한 턴에 여러 번 이동해도 기록은 한 덩어리로 묶는다.
  if (state.suppressHistory) return;
  if (!Array.isArray(state.pendingTurnSummary)) state.pendingTurnSummary = [];
  if (!state.pendingTurnStartSnapshot) {
    state.pendingTurnStartSnapshot = cloneState(state);
    state.pendingTurnMover = state.currentPlayer;
  }
}
function appendTurnSummary(state, summary) {
  if (state.suppressHistory) return;
  if (!summary) return;
  ensureTurnRecord(state);
  state.pendingTurnSummary.push(summary);
}
// 오프닝 연구표: 초반 수순이 후반에 주는 성향을 사람이 읽기 쉬운 이름으로 묶는다.
const OPENING_THEORY_BOOK = [
  {
    key: "fortress",
    name: "요새 구축형",
    impact: "밀기 방어를 먼저 쌓아 후반 푸시 싸움에서 버티기 쉽다.",
    targets: ["d2", "b4"],
  },
  {
    key: "portal",
    name: "포털 유도형",
    impact: "좌우 전환이 많아져 역공각과 교란이 강해진다.",
    targets: ["c2", "c4"],
  },
  {
    key: "spring",
    name: "스프링 연타형",
    impact: "추가 행동으로 템포를 벌 수 있지만 과속하면 형태가 흔들린다.",
    targets: ["b3", "d3"],
  },
  {
    key: "trap",
    name: "함정 교환형",
    impact: "상대를 늦추는 힘이 강하지만 내 말도 같이 묶일 수 있다.",
    targets: ["b2", "b5", "c3"],
  },
  {
    key: "central",
    name: "중앙 압박형",
    impact: "중앙 3x3를 먼저 장악해 3목 경로를 넓힌다.",
    targets: ["b2", "c2", "d2", "b3", "c3", "d3", "b4", "c4", "d4"],
  },
  {
    key: "flank",
    name: "측면 잠금형",
    impact: "바깥줄을 먼저 흔들어 밀기 루트를 만들고 퇴로를 막는다.",
    targets: ["a2", "a4", "e2", "e4", "a3", "e3"],
  },
];

function squareNameToIndex(square) {
  if (!/^[a-e][1-5]$/.test(square)) return -1;
  const col = square.charCodeAt(0) - 97;
  const row = Number(square.slice(1)) - 1;
  return idx(row, col);
}

function extractDestinationSquares(summaryText) {
  if (!summaryText) return [];
  const matches = [...summaryText.matchAll(/->\s*([a-e][1-5])/g)].map((match) => match[1]);
  return [...new Set(matches)];
}

function detectOpeningTheory(beforeState, summaryText) {
  const turn = beforeState.turnNumber || 1;
  if (turn > 5) return null;

  const destinations = new Set(extractDestinationSquares(summaryText));
  const scored = OPENING_THEORY_BOOK.map((opening) => {
    let score = 0;
    for (const target of opening.targets) {
      if (destinations.has(target)) score += 3;
    }

    // 첫 수가 실제로 중앙 쪽인지도 함께 본다.
    if (opening.key === "central") {
      for (const square of destinations) {
        const index = squareNameToIndex(square);
        if (index < 0) continue;
        const { row, col } = rc(index);
        if (row >= 1 && row <= 3 && col >= 1 && col <= 3) score += 1;
      }
    }

    return { opening, score };
  }).filter((entry) => entry.score > 0);

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].opening;
}

// 초반에 잡힌 오프닝을 상태에 저장해 두면, 뒤에서 다시 볼 때 설명하기 쉽다.
function refreshOpeningTheory(state, beforeState, summaryText) {
  if (state.openingKey) return;
  const opening = detectOpeningTheory(beforeState, summaryText);
  if (!opening) return;
  state.openingKey = opening.key;
  state.openingLabel = opening.name;
  state.openingImpact = opening.impact;
  state.openingTurn = beforeState.turnNumber || 1;
}
// 오프닝은 초반 몇 수를 기준으로 단순하게 본다.
function isOpeningTheoryTurn(state) {
  return (state.turnNumber || 1) <= 5;
}

// 3목 "이론 상황"은 이미 3목이 만들어졌거나, 보존 중인 상태로 본다.
function isThreeLineTheorySituation(state, player) {
  return Boolean(player && (getLine(state, player) || state.victoryHoldPlayer === player));
}

function analyzeTurnAnnotation(beforeState, afterState, mover, summaryText = "") {
  if (afterState.gameOver) {
    if (afterState.winner === mover) return "!!";
    return "💀";
  }
  // 오프닝이나 3목 보존/3목 상황은 책 아이콘을 붙여서 의미를 분리한다.
  if (isOpeningTheoryTurn(beforeState) || isThreeLineTheorySituation(afterState, mover)) return "📖 :)";

  // 밀기, 포털, 스프링, 함정처럼 설명이 길어지는 수는 조금 더 약한 기호를 쓴다.
  const complexMove =
    summaryText.includes("상대 말을 밀었습니다.") ||
    summaryText.includes(" [") ||
    summaryText.includes(" > ") ||
    summaryText.includes(") (");
  if (complexMove) return "??";

  // 아무 일 없이 이동만 한 경우는 가장 평범한 표정으로 보여준다.
  return ":)";
}
function flushTurnSummary(state) {
  // 턴이 끝날 때 모아 둔 이동 내용을 기록 목록에 저장한다.
  if (state.suppressHistory) return;
  const hasSummary = Array.isArray(state.pendingTurnSummary) && state.pendingTurnSummary.length > 0;
  const hasSnapshot = Boolean(state.pendingTurnStartSnapshot);
  if (!hasSummary && !hasSnapshot) return;
  if (!Array.isArray(state.turnHistory)) state.turnHistory = [];
  const mover = state.pendingTurnMover || state.currentPlayer;
  const beforeState = state.pendingTurnStartSnapshot || cloneState(state);
  const summaryText = hasSummary ? state.pendingTurnSummary.join(" ") : "";
  refreshOpeningTheory(state, beforeState, summaryText);
  const moveHints = analyzeMoveChoices(beforeState, mover);
  state.turnHistory.unshift({
    turn: state.turnNumber || 1,
    player: mover,
    text: hasSummary ? summaryText : "턴을 종료했습니다.",
    annotation: analyzeTurnAnnotation(beforeState, state, mover, summaryText),
    bestMove: moveHints.best,
    decentMove: moveHints.decent,
    openingLabel: state.openingLabel || "",
    openingImpact: state.openingImpact || "",
  });
  state.pendingTurnSummary = [];
  state.pendingTurnStartSnapshot = null;
  state.pendingTurnMover = null;
  state.turnNumber = (state.turnNumber || 1) + 1;
}
function moveToText(state, move) {
  // AI 분석용으로는 실제 판을 건드리지 않고 미리보기만 만든다.
  const preview = cloneState(state);
  preview.suppressHistory = true;
  const mover = pieceAt(preview, move.from);
  if (!mover) return "";

  const moveNotes = [];
  const pushedNotes = [];
  if (move.type === "push") {
    const pushed = pieceAt(preview, move.to);
    if (!pushed) return "";
    preview.board[move.pushTo] = pushed;
    preview.board[move.to] = mover;
    preview.board[move.from] = null;
    const pushedFinal = applyLandingEffects(preview, move.pushTo, pushed, [], pushedNotes);
    const moverFinal = applyLandingEffects(preview, move.to, mover, [], moveNotes);
    const moverPart = `(${formatHistoryCell(move.from, mover)} -> ${formatHistoryCell(move.to, mover)}${moverFinal !== move.to ? ` > ${coordLabel(moverFinal)}` : ""}${summarizeLandingNotes(moveNotes)})`;
    const pushedPart = `(${formatHistoryCell(move.to, pushed)} -> ${formatHistoryCell(move.pushTo, pushed)}${pushedFinal !== move.pushTo ? ` > ${coordLabel(pushedFinal)}` : ""}${summarizeLandingNotes(pushedNotes)})`;
    return `${moverPart} ${pushedPart}`;
  }

  preview.board[move.to] = mover;
  preview.board[move.from] = null;
  const finalIndex = applyLandingEffects(preview, move.to, mover, [], moveNotes);
  return `(${formatHistoryCell(move.from, mover)} -> ${formatHistoryCell(move.to, mover)}${finalIndex !== move.to ? ` > ${coordLabel(finalIndex)}` : ""}${summarizeLandingNotes(moveNotes)})`;
}
function formatEventLine(text) {
  return `<div class="status-line">${escapeHtml(text)}</div>`;
}
function formatStatusLines(lines) {
  return lines.map(formatEventLine).join("");
}
function scoreMoveForPlayer(state, move, player) {
  // AI는 수마다 점수를 매겨 순위를 만든다.
  const next = cloneState(state);
  next.suppressHistory = true;
  if (!applyMoveToState(next, move)) return -Infinity;
  const score = evaluateState(next);
  return player === AI_SEAT ? score : -score;
}
function rankMovesForPlayer(state, player) {
  const moves = allLegalMoves(state, player);
  return moves
    .map((move) => ({ move, score: scoreMoveForPlayer(state, move, player) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);
}
function analyzeMoveChoices(state, player) {
  // 턴 기록에는 최선수와 적당수를 같이 보여준다.
  const ranked = rankMovesForPlayer(state, player);
  if (!ranked.length) return { best: "없음", decent: "없음" };
  const best = moveToText(state, ranked[0].move);
  const decent = moveToText(state, ranked[Math.min(1, ranked.length - 1)].move);
  return { best, decent };
}
function inBounds(row, col) { return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }

function createInitialBoard() {
  // 시작 배치를 실제 보드 배열로 바꿔서 넣는다.
  const board = Array(BOARD_CELLS).fill(null);
  for (const index of START_POSITIONS.X) board[index] = makePiece("X");
  for (const index of START_POSITIONS.O) board[index] = makePiece("O");
  return board;
}

function createInitialState() {
  // 게임 한 판의 초기 상태를 여기서 한 번에 만든다.
  const state = {
    board: createInitialBoard(),
    currentPlayer: "X",
    turnActions: 1,
    victoryHoldPlayer: null,
    victoryHoldTurnsRemaining: 0,
    gameOver: false,
    winner: null,
    drawReason: "",
    lastEvent: "7-7 진영전이 준비되었습니다.",
    turnHistory: [],
    pendingTurnSummary: [],
    pendingTurnStartSnapshot: null,
    pendingTurnMover: null,
    turnNumber: 1,
    lastEventLines: ["7-7 진영전이 준비되었습니다."],
    clockMs: { X: TURN_TIME_MS, O: TURN_TIME_MS },
    turnStartedAt: Date.now(),
    repetitionCounts: {},
    victoryHoldAttempts: { X: 0, O: 0 },
    victoryHoldAttemptTurnByPlayer: { X: 0, O: 0 },
    bothThreeLineConflict: false,
    openingKey: "",
    openingLabel: "",
    openingImpact: "",
    openingTurn: 0,
  };
  seedRepetitionCount(state);
  return state;
}

function showGamePage() {
  const homePage = document.getElementById("homePage");
  const gamePage = document.getElementById("gamePage");
  if (homePage) homePage.style.display = "none";
  if (gamePage) gamePage.style.display = "block";
}

function showHomePage() {
  const homePage = document.getElementById("homePage");
  const gamePage = document.getElementById("gamePage");
  if (homePage) homePage.style.display = "block";
  if (gamePage) gamePage.style.display = "none";
}

function buildThreeLines() {
  // 5x5 보드에서 3목이 되는 모든 직선 조합을 미리 만든다.
  const lines = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col <= BOARD_SIZE - 3; col++) lines.push([idx(row, col), idx(row, col + 1), idx(row, col + 2)]);
  }
  for (let col = 0; col < BOARD_SIZE; col++) {
    for (let row = 0; row <= BOARD_SIZE - 3; row++) lines.push([idx(row, col), idx(row + 1, col), idx(row + 2, col)]);
  }
  for (let row = 0; row <= BOARD_SIZE - 3; row++) {
    for (let col = 0; col <= BOARD_SIZE - 3; col++) lines.push([idx(row, col), idx(row + 1, col + 1), idx(row + 2, col + 2)]);
  }
  for (let row = 0; row <= BOARD_SIZE - 3; row++) {
    for (let col = 2; col < BOARD_SIZE; col++) lines.push([idx(row, col), idx(row + 1, col - 1), idx(row + 2, col - 2)]);
  }
  return lines;
}

function getLine(state, player) {
  for (const line of THREE_LINES) {
    if (line.every((cellIndex) => state.board[cellIndex]?.owner === player)) return line;
  }
  return null;
}

function countPieces(state, player) { return state.board.filter((cell) => cell?.owner === player).length; }
function pieceAt(state, index) { return state.board[index]; }
function legalMovesForPiece(state, fromIndex, player = state.currentPlayer) {
  const piece = pieceAt(state, fromIndex);
  if (!piece || piece.owner !== player || piece.frozenTurns > 0) return [];

  const { row, col } = rc(fromIndex);
  const moves = [];
  for (const [dr, dc] of DIRECTIONS) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inBounds(nextRow, nextCol)) continue;
    const targetIndex = idx(nextRow, nextCol);
    const targetPiece = pieceAt(state, targetIndex);
    if (!targetPiece) {
      moves.push({ from: fromIndex, to: targetIndex, type: "move" });
      continue;
    }
    if (targetPiece.owner === player || targetPiece.shieldTurns > 0 || targetPiece.frozenTurns > 0) continue;
    const pushRow = nextRow + dr;
    const pushCol = nextCol + dc;
    if (!inBounds(pushRow, pushCol)) continue;
    const pushIndex = idx(pushRow, pushCol);
    if (pieceAt(state, pushIndex)) continue;
    moves.push({ from: fromIndex, to: targetIndex, type: "push", pushTo: pushIndex });
  }
  return moves;
}

function allLegalMoves(state, player = state.currentPlayer) {
  const moves = [];
  for (let i = 0; i < BOARD_CELLS; i++) {
    if (state.board[i]?.owner !== player) continue;
    moves.push(...legalMovesForPiece(state, i, player));
  }
  return moves;
}

function refreshVictoryHold(state) {
  // 3목이 유지되는지, 또 누가 보존 중인지 확인한다.
  const xLine = getLine(state, "X");
  const oLine = getLine(state, "O");
  state.bothThreeLineConflict = Boolean(xLine && oLine);

  if (state.bothThreeLineConflict) {
    state.victoryHoldPlayer = null;
    state.victoryHoldTurnsRemaining = 0;
    return;
  }

  if (state.victoryHoldPlayer && !getLine(state, state.victoryHoldPlayer)) {
    state.victoryHoldPlayer = null;
    state.victoryHoldTurnsRemaining = 0;
  }
  if (getLine(state, state.currentPlayer) && state.victoryHoldPlayer !== state.currentPlayer) {
    state.victoryHoldPlayer = state.currentPlayer;
    state.victoryHoldTurnsRemaining = 2;
  }
  if (getLine(state, state.currentPlayer)) {
    if (!state.victoryHoldAttempts) state.victoryHoldAttempts = { X: 0, O: 0 };
    if (!state.victoryHoldAttemptTurnByPlayer) state.victoryHoldAttemptTurnByPlayer = { X: 0, O: 0 };
    if (state.victoryHoldAttemptTurnByPlayer[state.currentPlayer] !== state.turnNumber) {
      state.victoryHoldAttempts[state.currentPlayer] = (state.victoryHoldAttempts[state.currentPlayer] || 0) + 1;
      state.victoryHoldAttemptTurnByPlayer[state.currentPlayer] = state.turnNumber;
    }
  }
}

function applyLandingEffects(state, index, piece, effects, notes = []) {
  // 이동 후 특수 타일이 있으면 그 자리에서 바로 효과를 적용한다.
  let currentIndex = index;
  const visited = new Set([currentIndex]);
  while (true) {
    const special = SPECIAL_TILES[currentIndex];
    if (!special) break;
    if (special.type === "portal") {
      const destination = special.pair;
      if (visited.has(destination)) break;
      if (pieceAt(state, destination)) break;
      state.board[destination] = piece;
      if (destination !== currentIndex) state.board[currentIndex] = null;
      currentIndex = destination;
      visited.add(currentIndex);
      effects.push(`${piece.owner} 말이 포털(${special.icon})을 타고 이동했습니다.`);
      notes.push(`⟲${coordLabel(currentIndex)}`);
      continue;
    }
    if (special.type === "spring") {
      state.turnActions += 1;
      effects.push(`${piece.owner} 말이 스프링(${special.icon})으로 추가 행동을 얻었습니다.`);
      notes.push("↯+1");
    } else if (special.type === "trap") {
      piece.frozenTurns = Math.max(piece.frozenTurns, 1);
      piece.frozenAppliedTurn = state.turnNumber || 1;
      effects.push(`${piece.owner} 말이 함정(${special.icon})에 걸려 1턴 동안 묶입니다.`);
      notes.push("☒F1");
    } else if (special.type === "fort") {
      piece.shieldTurns = Math.max(piece.shieldTurns, 3);
      piece.shieldAppliedTurn = state.turnNumber || 1;
      effects.push(`${piece.owner} 말이 요새(${special.icon})를 밟아 밀기 방어 3턴을 얻었습니다.`);
      notes.push("🛡S3");
    }
    break;
  }
  return currentIndex;
}

function decrementEndTurnStatuses(state, endingPlayer) {
  // 턴이 끝날 때만 지속 상태를 한 칸 줄인다.
  for (const cell of state.board) {
    if (!cell) continue;
    if (cell.shieldTurns > 0 && cell.shieldAppliedTurn !== state.turnNumber) cell.shieldTurns -= 1;
  }
  for (const cell of state.board) {
    if (!cell || cell.owner !== endingPlayer) continue;
    if (cell.frozenTurns > 0 && cell.frozenAppliedTurn !== state.turnNumber) cell.frozenTurns -= 1;
  }
}

function advanceTurn(state, effects) {
  // 한 턴이 끝나면 상태 지속시간, 타이머, 3목 보존 여부를 순서대로 정리한다.
  const endingPlayer = state.currentPlayer;
  decrementEndTurnStatuses(state, endingPlayer);
  if (!finalizeTurnClock(state, endingPlayer, effects)) {
    state.lastEventLines = effects.slice();
    flushTurnSummary(state);
    return;
  }
  state.currentPlayer = opponent(state.currentPlayer);
  state.turnActions = 1;
  startClockForCurrentPlayer(state);
  refreshVictoryHold(state);
  if (state.victoryHoldPlayer === state.currentPlayer && getLine(state, state.currentPlayer)) {
    state.victoryHoldTurnsRemaining = Math.max(0, (state.victoryHoldTurnsRemaining || 0) - 1);
    if (state.victoryHoldTurnsRemaining <= 0) {
      state.gameOver = true;
      state.winner = state.currentPlayer;
      effects.push(`${state.winner} 승리! 3목을 2턴 버텼습니다.`);
    } else {
      effects.push(`${state.currentPlayer}가 3목을 보존 중입니다. ${state.victoryHoldTurnsRemaining}턴 더 버텨야 합니다.`);
    }
  } else {
    effects.push(`${state.currentPlayer}의 차례가 시작됩니다.`);
    maybeDeclareThreefoldDraw(state, effects);
  }
  maybeDeclareHoldLimitDraw(state, effects);
  state.lastEventLines = effects.slice();
  flushTurnSummary(state);
}

function applyMoveToState(state, move) {
  // 실제 이동/밀기 규칙의 중심 함수다.
  const piece = pieceAt(state, move.from);
  if (!piece || piece.owner !== state.currentPlayer) return false;

  const effects = [];
  // 이동/밀기 결과를 effects와 turnHistory 둘 다에 남겨서,
  // 화면 문구와 복사용 기록이 서로 어긋나지 않게 맞춘다.
  if (move.type === "push") {
    const pushedPiece = pieceAt(state, move.to);
    if (!pushedPiece || pushedPiece.owner === state.currentPlayer || pushedPiece.shieldTurns > 0 || pushedPiece.frozenTurns > 0) return false;
    ensureTurnRecord(state);
    const moverNotes = [];
    const pushedNotes = [];
    state.board[move.pushTo] = pushedPiece;
    state.board[move.to] = piece;
    state.board[move.from] = null;
    const pushedFinal = applyLandingEffects(state, move.pushTo, pushedPiece, effects, pushedNotes);
    const moverFinal = applyLandingEffects(state, move.to, piece, effects, moverNotes);
    appendTurnSummary(state, `(${formatHistoryCell(move.from, piece)} -> ${formatHistoryCell(move.to, piece)}${moverFinal !== move.to ? ` > ${coordLabel(moverFinal)}` : ""}${summarizeLandingNotes(moverNotes)}) (${formatHistoryCell(move.to, pushedPiece)} -> ${formatHistoryCell(move.pushTo, pushedPiece)}${pushedFinal !== move.pushTo ? ` > ${coordLabel(pushedFinal)}` : ""}${summarizeLandingNotes(pushedNotes)})`);
    effects.unshift(`${state.currentPlayer}가 상대 말을 밀었습니다.`);
  } else {
    ensureTurnRecord(state);
    const moverNotes = [];
    state.board[move.to] = piece;
    state.board[move.from] = null;
    const finalIndex = applyLandingEffects(state, move.to, piece, effects, moverNotes);
    appendTurnSummary(state, `(${formatHistoryCell(move.from, piece)} -> ${formatHistoryCell(move.to, piece)}${finalIndex !== move.to ? ` > ${coordLabel(finalIndex)}` : ""}${summarizeLandingNotes(moverNotes)})`);
    effects.unshift(`${state.currentPlayer}가 이동했습니다.`);
  }

  refreshVictoryHold(state);
  state.turnActions -= 1;
  if (state.turnActions <= 0 && !state.gameOver) advanceTurn(state, effects);
  state.lastEvent = effects.join(" ");
  state.lastEventLines = effects.slice();
  return true;
}

function forcePassTurn(state, reason = "둘 수 있는 수가 없어 턴을 넘깁니다.") {
  // 둘 수 없거나 스킵해야 할 때 턴을 넘긴다.
  const effects = [reason];
  ensureTurnRecord(state);
  appendTurnSummary(state, reason);
  advanceTurn(state, effects);
  state.lastEvent = effects.join(" ");
  state.lastEventLines = effects.slice();
}

function scorePotentialLine(state, player) {
  let score = 0;
  for (const line of THREE_LINES) {
    let mine = 0;
    let opp = 0;
    for (const cellIndex of line) {
      const cell = state.board[cellIndex];
      if (!cell) continue;
      if (cell.owner === player) mine += 1; else opp += 1;
    }
    if (opp > 0) continue;
    if (mine === 3) score += 1000; else if (mine === 2) score += 80; else if (mine === 1) score += 12;
  }
  return score;
}

function mobilityScore(state, player) {
  let score = 0;
  for (let i = 0; i < BOARD_CELLS; i++) if (state.board[i]?.owner === player) score += legalMovesForPiece(state, i, player).length;
  return score;
}

function evaluateState(state) {
  const me = AI_SEAT;
  const opp = opponent(me);
  if (state.gameOver) return state.winner === me ? 100000 : state.winner === opp ? -100000 : 0;

  let score = 0;
  score += countPieces(state, me) * 30;
  score -= countPieces(state, opp) * 28;
  score += scorePotentialLine(state, me);
  score -= scorePotentialLine(state, opp) * 1.15;
  score += mobilityScore(state, me) * 4;
  score -= mobilityScore(state, opp) * 3.5;

  for (const cell of state.board) {
    if (!cell) continue;
    if (cell.owner === me) {
      if (cell.shieldTurns > 0) score += 14;
      if (cell.frozenTurns > 0) score -= 18;
    } else {
      if (cell.shieldTurns > 0) score -= 10;
      if (cell.frozenTurns > 0) score += 10;
    }
  }

  if (state.victoryHoldPlayer === me && getLine(state, me)) score += 600;
  if (state.victoryHoldPlayer === opp && getLine(state, opp)) score -= 620;
  return score;
}

function minimax(state, depth) {
  if (state.gameOver || depth <= 0) return evaluateState(state);

  const moves = allLegalMoves(state, state.currentPlayer);
  if (!moves.length) {
    const next = cloneState(state);
    forcePassTurn(next, `${next.currentPlayer}는 둘 수 있는 수가 없어 턴을 넘깁니다.`);
    return minimax(next, depth - 1);
  }

  let best = state.currentPlayer === AI_SEAT ? -Infinity : Infinity;
  for (const move of moves) {
    const next = cloneState(state);
    if (!applyMoveToState(next, move)) continue;
    const score = minimax(next, depth - 1);
    if (state.currentPlayer === AI_SEAT) best = Math.max(best, score); else best = Math.min(best, score);
  }
  return best;
}

function chooseAiMove(state) {
  // 난이도에 따라 최선/차선/엉성한 수를 섞어서 고른다.
  const ranked = rankMovesForPlayer(state, AI_SEAT);
  if (!ranked.length) return null;
  const difficulty = getAiDifficulty();

  if (difficulty === "hard") {
    return ranked[0].move;
  }

  if (difficulty === "normal") {
    const roll = Math.random();
    const top = ranked.slice(0, Math.min(2, ranked.length));
    const mid = ranked.slice(0, Math.min(4, ranked.length));
    const pool = roll < 0.55 ? top : roll < 0.9 ? mid : ranked;
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  const len = ranked.length;
  const top = ranked.slice(0, Math.min(1, len));
  const mid = ranked.slice(Math.max(0, Math.floor(len * 0.25)), Math.max(1, Math.min(len, Math.floor(len * 0.6))));
  const low = ranked.slice(Math.max(0, Math.floor(len * 0.5)));
  const roll = Math.random();
  const pool = roll < 0.1 ? top : roll < 0.35 ? mid : low;
  const chosenPool = pool.length ? pool : ranked;
  return chosenPool[Math.floor(Math.random() * chosenPool.length)].move;
}

function normalizeState(raw) {
  // 저장소에서 읽은 상태를 현재 코드가 쓸 수 있는 모양으로 맞춘다.
  if (!raw) return createInitialState();
  const state = cloneState(raw);
  state.board = Array.isArray(state.board) ? state.board : createInitialBoard();
  state.currentPlayer = state.currentPlayer || "X";
  state.turnActions = typeof state.turnActions === "number" ? state.turnActions : 1;
  state.victoryHoldPlayer = state.victoryHoldPlayer || null;
  state.gameOver = Boolean(state.gameOver);
  state.winner = state.winner || null;
  state.drawReason = state.drawReason || "";
  state.lastEvent = state.lastEvent || "";
  state.lastEventLines = Array.isArray(state.lastEventLines) ? state.lastEventLines : [state.lastEvent].filter(Boolean);
  state.turnHistory = Array.isArray(state.turnHistory) ? state.turnHistory : [];
  state.pendingTurnSummary = Array.isArray(state.pendingTurnSummary) ? state.pendingTurnSummary : [];
  state.pendingTurnStartSnapshot = state.pendingTurnStartSnapshot || null;
  state.pendingTurnMover = state.pendingTurnMover || null;
  state.victoryHoldTurnsRemaining = typeof state.victoryHoldTurnsRemaining === "number" ? state.victoryHoldTurnsRemaining : 0;
  state.victoryHoldAttempts = state.victoryHoldAttempts && typeof state.victoryHoldAttempts === "object" ? state.victoryHoldAttempts : { X: 0, O: 0 };
  state.victoryHoldAttemptTurnByPlayer = state.victoryHoldAttemptTurnByPlayer && typeof state.victoryHoldAttemptTurnByPlayer === "object" ? state.victoryHoldAttemptTurnByPlayer : { X: 0, O: 0 };
  state.bothThreeLineConflict = Boolean(state.bothThreeLineConflict);
  state.openingKey = state.openingKey || "";
  state.openingLabel = state.openingLabel || "";
  state.openingImpact = state.openingImpact || "";
  state.openingTurn = typeof state.openingTurn === "number" ? state.openingTurn : 0;
  state.turnNumber = typeof state.turnNumber === "number" ? state.turnNumber : state.turnHistory.length + 1;
  ensureGameMeta(state);
  seedRepetitionCount(state);
  return state;
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
  if (typed) return typed;
  if (authUser?.email) return authUser.email.split("@")[0];
  return getGuestId();
}

async function ensureIdentity() {
  if (!authReady) {
    await new Promise((resolve) => {
      const timer = setInterval(() => { if (authReady) { clearInterval(timer); resolve(); } }, 25);
    });
  }
  return { id: authUser?.uid || getGuestId(), name: getDisplayName() };
}

function syncNameField() {
  if (ui.playerName && !ui.playerName.value.trim()) ui.playerName.placeholder = getDisplayName();
}

function stopAiTimer() { if (session.aiTimer) { clearTimeout(session.aiTimer); session.aiTimer = null; } session.aiThinking = false; }
function stopOnlineSession() {
  stopAiTimer();
  stopAutoPassTimer();
  if (session.timeoutId) { clearTimeout(session.timeoutId); session.timeoutId = null; }
  if (session.unsubscribe) { session.unsubscribe(); session.unsubscribe = null; }
  if (session.chatUnsubscribe) { session.chatUnsubscribe(); session.chatUnsubscribe = null; }
  session.roomRef = null;
  session.roomId = null;
  session.seat = null;
  session.host = false;
  session.roomStatus = null;
  session.chatLog = [];
  session.aiThinking = false;
  renderChat();
}

function goHome() {
  // 진행 중인 대전과 타이머를 끊고 홈 허브로 돌아간다.
  stopOnlineSession();
  stopAiTimer();
  stopAutoPassTimer();
  session.mode = "idle";
  session.notice = "미니게임 허브입니다. 원하는 모드를 골라 시작하세요.";
  gameState = createInitialState();
  selectedIndex = null;
  showHomePage();
  renderAll();
}

function launchMiniGame(mode) {
  // 홈 카드에서 선택한 모드로 진입한다.
  if (mode === "online") {
    startOnlineMatch();
    return;
  }
  if (mode === "study") {
    startLocalAIMatch("7-7 진영전에 입장했습니다.");
    return;
  }
  startLocalAIMatch("7-7 진영전에 입장했습니다.");
}

function setNotice(message) { session.notice = message || ""; renderAll(); }
function currentModeLabel() {
  if (session.mode === "online") return session.roomId ? (session.host ? "온라인 방 호스트" : "온라인 방 참가") : "온라인 매칭 중";
  if (session.mode === "ai") return "AI 대전";
  return "미니게임 허브";
}
function roomInfoText() {
  if (session.mode === "online") {
    const roomShort = session.roomId ? session.roomId.slice(0, 6) : "-";
    const seat = session.seat ? `내 말: ${session.seat}` : "내 말: 대기";
    const opp = session.roomStatus === "active" ? "상대와 연결됨" : session.roomStatus === "waiting" ? "상대 대기 중" : session.roomStatus || "";
    return `${roomShort} | ${seat} | ${opp}`;
  }
  if (session.mode === "ai") return `AI가 ${AI_SEAT}를 담당합니다.`;
  return "홈 허브에서 모드를 선택하세요.";
}

function renderRoomInfo() {
  // 모드와 방 정보는 작은 칩 형태로 보여준다.
  if (!ui.roomInfo) return;
  const aiLabel = session.mode === "ai" ? `AI 난이도 ${getAiDifficultyLabel()}` : "";
  ui.roomInfo.innerHTML = [
    `<span class="turn-chip"><strong>모드</strong> ${currentModeLabel()}</span>`,
    `<span class="turn-chip">${roomInfoText()}</span>`,
    aiLabel ? `<span class="turn-chip">${aiLabel}</span>` : "",
  ].filter(Boolean).join("");
}

function renderTurnInfo() {
  // 현재 차례, 남은 시간, 3목 보존 상태를 한 줄에 보여준다.
  if (!ui.turnInfo) return;
  const selectedPiece = selectedIndex !== null ? gameState.board[selectedIndex] : null;
  const holdOwner = gameState.victoryHoldPlayer || gameState.currentPlayer;
  const holdLine = getLine(gameState, holdOwner);
  const piecesText = `X ${countPieces(gameState, "X")} / O ${countPieces(gameState, "O")}`;
  const holdAttemptsText = `보존 시도 X ${gameState.victoryHoldAttempts?.X || 0} / O ${gameState.victoryHoldAttempts?.O || 0}`;
  const openingText = gameState.openingLabel
    ? `오프닝 ${gameState.openingLabel}`
    : (gameState.turnNumber <= 5 ? "오프닝 분석 중" : "오프닝 없음");
  const conflictText = gameState.bothThreeLineConflict ? "양쪽이 3목을 만들었습니다. 스킵은 하지 않습니다." : "";
  const turnText = gameState.gameOver ? `승자: ${gameState.winner}` : `${gameState.currentPlayer} 차례`;
  const now = Date.now();
  const xClock = clockText(getClockRemaining(gameState, "X", now));
  const oClock = clockText(getClockRemaining(gameState, "O", now));
  ui.turnInfo.innerHTML = [
    `<span class="turn-chip"><strong>${turnText}</strong></span>`,
    `<span class="turn-chip">남은 행동 ${gameState.turnActions}</span>`,
    `<span class="turn-chip">X ${xClock}</span>`,
    `<span class="turn-chip">O ${oClock}</span>`,
    `<span class="turn-chip">${selectedPiece ? `${selectedPiece.owner} 선택 중` : "선택 없음"}</span>`,
    `<span class="turn-chip">${openingText}</span>`,
    conflictText ? `<span class="turn-chip">${conflictText}</span>` : "",
    `<span class="turn-chip">${holdLine && gameState.victoryHoldPlayer ? `3목 보존 중: ${gameState.victoryHoldPlayer} (${gameState.victoryHoldTurnsRemaining || 0}턴)` : "3목 보존 중 없음"}</span>`,
    `<span class="turn-chip">${holdAttemptsText}</span>`,
    `<span class="turn-chip">${piecesText}</span>`,
  ].join("");
}

function renderStatus() {
  // 상태창은 줄바꿈 블록처럼 여러 줄로 표시한다.
  if (!ui.status) return;
  const frozenCount = gameState.board.filter((cell) => cell?.frozenTurns > 0).length;
  const noLegalMoves = !gameState.gameOver && allLegalMoves(gameState, gameState.currentPlayer).length === 0;
  const headline = gameState.gameOver
    ? (gameState.winner ? `${gameState.winner} 승리` : gameState.drawReason || "무승부")
    : `${gameState.currentPlayer} 차례`;
  const leadLine = !gameState.gameOver
    ? (gameState.victoryHoldPlayer ? `${gameState.victoryHoldPlayer}가 3목을 보존 중입니다. 2턴을 버텨야 승리합니다.` : "3목을 만들고 2턴을 버티면 승리")
    : (gameState.drawReason || "");
  const openingLine = gameState.openingLabel
    ? `오프닝: ${gameState.openingLabel}${gameState.openingImpact ? ` · ${gameState.openingImpact}` : ""}`
    : (gameState.turnNumber <= 5 ? "오프닝을 분류하는 중입니다." : "");
  const conflictLine = gameState.bothThreeLineConflict ? "양쪽이 동시에 3목을 만들었습니다. 스킵 규칙을 적용하지 않습니다." : "";
  const eventLines = Array.isArray(gameState.lastEventLines) && gameState.lastEventLines.length
    ? gameState.lastEventLines
    : (gameState.lastEvent ? gameState.lastEvent.split(" · ").filter(Boolean) : []);
  const extraLines = [
    session.notice,
    openingLine,
    conflictLine,
    noLegalMoves ? "둘 수 있는 수가 없어 자동으로 턴이 넘어갑니다." : "",
    gameState.gameOver && gameState.drawReason === "3목 보존 10회 제한" ? "양쪽 모두 3목 보존을 10번씩 시도했습니다." : "",
    frozenCount ? `얼어 있는 말 ${frozenCount}개` : "",
  ].filter(Boolean);
  ui.status.innerHTML = [
    formatEventLine(currentModeLabel()),
    formatEventLine(headline),
    leadLine ? formatEventLine(leadLine) : "",
    ...eventLines.map(formatEventLine),
    ...extraLines.map(formatEventLine),
  ].filter(Boolean).join("");
}

function renderTurnHistory() {
  // 한 턴 기록은 이동 내용, 분석 기호, 최선수/적당수를 같이 보여준다.
  if (!ui.turnHistory) return;
  const entries = Array.isArray(gameState.turnHistory) ? gameState.turnHistory : [];
  if (!entries.length) {
    ui.turnHistory.innerHTML = '<span class="history-empty">아직 기록이 없습니다.</span>';
    return;
  }
  ui.turnHistory.innerHTML = entries
    .map((entry) => `
      <div class="history-row">
        <strong>${entry.turn}.</strong>
        <div class="history-body">
          <div class="history-main">${entry.text}</div>
          <div class="history-meta">분석: 최선 ${entry.bestMove || "없음"} / 적당 ${entry.decentMove || "없음"}</div>
          <div class="history-anno">판정: <span class="turn-anno">${entry.annotation || ""}</span></div>
          ${entry.openingLabel ? `<div class="history-opening">오프닝: ${entry.openingLabel}${entry.openingImpact ? ` · ${entry.openingImpact}` : ""}</div>` : ""}
        </div>
      </div>`)
    .join("");
}

function boardPositionSummary(state = gameState) {
  const players = ["X", "O"];
  return players
    .map((player) => {
      const coords = [];
      for (let i = 0; i < BOARD_CELLS; i++) {
        const piece = state.board[i];
        if (!piece || piece.owner !== player) continue;
        coords.push(coordLabel(i));
      }
      return `${player.toLowerCase()}: ${coords.length ? coords.join(" ") : "없음"}`;
    })
    .join(", ");
}

function turnHistoryText(state = gameState) {
  const entries = Array.isArray(state.turnHistory) ? state.turnHistory : [];
  if (!entries.length) return "아직 기록이 없습니다.";
  return entries
    .slice()
    .reverse()
    .map((entry) => {
      const lines = [`${entry.turn}. ${entry.text}`];
      if (entry.bestMove || entry.decentMove) lines.push(`분석: 최선 ${entry.bestMove || "없음"} / 적당 ${entry.decentMove || "없음"}`);
      if (entry.annotation) lines.push(`판정: ${entry.annotation}`);
      if (entry.openingLabel) lines.push(`오프닝: ${entry.openingLabel}${entry.openingImpact ? ` · ${entry.openingImpact}` : ""}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

async function copyTextToClipboard(text, successMessage = "복사했습니다.") {
  try {
    await navigator.clipboard.writeText(text);
    setNotice(successMessage);
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

function copyDesktopBuildGuide() {
  const guide = [
    "BlockRail Arcade Windows 빌드 안내",
    "1. npm install",
    "2. npm run dist",
    "3. 생성된 portable exe는 release-gomoku2/ 폴더 안에 있습니다.",
    "4. 배포용 이름은 package.json의 productName으로 바꿀 수 있습니다.",
  ].join("\n");
  copyTextToClipboard(guide, "Windows 빌드 안내를 복사했습니다.");
}

function renderChat() {
  const active = session.mode === "online" && session.roomStatus === "active";
  if (ui.chatStatus) {
    if (session.mode !== "online") ui.chatStatus.textContent = "온라인 대전에서만 채팅이 가능합니다.";
    else if (session.roomStatus === "waiting") ui.chatStatus.textContent = "상대가 입장하면 채팅을 사용할 수 있습니다.";
    else if (session.roomStatus === "active") ui.chatStatus.textContent = "상대와 직접 대화할 수 있습니다.";
    else if (session.roomStatus === "ended") ui.chatStatus.textContent = "대전이 끝났습니다.";
    else ui.chatStatus.textContent = "채팅 준비 중입니다.";
  }

  const messages = Array.isArray(session.chatLog) ? session.chatLog : [];
  if (ui.chatMessages) {
    if (!messages.length) {
      ui.chatMessages.innerHTML = '<div class="chat-empty">대화가 아직 없습니다.</div>';
    } else {
      ui.chatMessages.innerHTML = messages
        .map((message) => {
          const mine = message.uid && (message.uid === authUser?.uid || message.uid === getGuestId());
          return `
            <div class="chat-item ${mine ? "mine" : "theirs"}">
              <div class="chat-meta">${message.name || "익명"} · ${message.timeText || ""}</div>
              <div class="chat-bubble">${escapeHtml(message.text || "")}</div>
            </div>`;
        })
        .join("");
    }
  }

  if (ui.chatInput) ui.chatInput.disabled = !active;
  if (ui.chatSendBtn) ui.chatSendBtn.disabled = !active;
}

function chatTimeText(data) {
  if (!data) return "";
  const date = data.toDate ? data.toDate() : data instanceof Date ? data : null;
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function subscribeRoomChat(roomRef) {
  if (!roomRef) return;
  if (session.chatUnsubscribe) session.chatUnsubscribe();
  session.chatUnsubscribe = onSnapshot(query(collection(roomRef, "chat"), limit(40)), (snap) => {
    const messages = snap.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          uid: data.uid || "",
          name: data.name || "익명",
          text: data.text || "",
          clientTs: typeof data.clientTs === "number" ? data.clientTs : 0,
          createdAt: data.createdAt || null,
        };
      })
      .sort((a, b) => {
        const aTime = a.clientTs || a.createdAt?.seconds || 0;
        const bTime = b.clientTs || b.createdAt?.seconds || 0;
        return aTime - bTime;
      })
      .map((message) => ({ ...message, timeText: chatTimeText(message.createdAt) || chatTimeText(new Date(message.clientTs)) }));
    session.chatLog = messages;
    renderChat();
  });
}

async function sendChatMessage() {
  if (session.mode !== "online" || session.roomStatus !== "active" || !session.roomRef) return;
  const text = ui.chatInput?.value.trim();
  if (!text) return;
  const identity = await ensureIdentity();
  try {
    await addDoc(collection(session.roomRef, "chat"), {
      uid: identity.id,
      name: identity.name,
      text,
      clientTs: Date.now(),
      createdAt: serverTimestamp(),
    });
    if (ui.chatInput) ui.chatInput.value = "";
  } catch (error) {
    console.error(error);
    setNotice("채팅 전송에 실패했습니다.");
  }
}

function describeCell(index, piece, special) {
  const { row, col } = rc(index);
  const parts = [coordLabel(index), `${row + 1},${col + 1}`];
  if (piece) {
    parts.push(`${piece.owner} 말`);
    if (piece.frozenTurns > 0) parts.push("이동 제한");
    if (piece.shieldTurns > 0) parts.push("밀기 방어");
  } else {
    parts.push("빈 칸");
  }
  if (special) parts.push(special.label);
  return parts.join(" · ");
}

function renderBoard() {
  // 보드의 각 칸을 다시 그리면서 말, 특수 타일, 좌표를 함께 넣는다.
  if (!ui.board) return;
  const highlightLine = getLine(gameState, gameState.victoryHoldPlayer || gameState.currentPlayer);
  const selectedMoves = selectedIndex === null ? [] : legalMovesForPiece(gameState, selectedIndex, gameState.currentPlayer);
  ui.board.innerHTML = "";
  for (let i = 0; i < BOARD_CELLS; i++) {
    const piece = gameState.board[i];
    const special = SPECIAL_TILES[i];
    const classes = ["cell"];
    if (special) classes.push(`special-${special.type}`);
    if (piece?.owner === "X") classes.push("piece-x");
    if (piece?.owner === "O") classes.push("piece-o");
    if (piece) classes.push("has-piece");
    if (piece?.frozenTurns > 0) classes.push("frozen");
    if (piece?.shieldTurns > 0) classes.push("shielded");
    if (selectedIndex === i) classes.push("selected");
    const moveInfo = selectedMoves.find((move) => move.to === i);
    if (moveInfo) classes.push(moveInfo.type === "push" ? "push-target" : "move-target");
    if (highlightLine && highlightLine.includes(i)) classes.push("threat");

    const cell = document.createElement("div");
    cell.className = classes.join(" ");
    cell.title = describeCell(i, piece, special);
    const mark = piece ? piece.owner : special ? special.icon : "";
    cell.innerHTML = `
      <div class="cell-content">
        <span class="cell-coord">${coordLabel(i)}</span>
        <span class="cell-mark ${piece ? `piece-${piece.owner.toLowerCase()}` : ""}">${mark}</span>
        ${special ? `<span class="tile-icon">${special.icon}</span>` : ""}
        ${special ? `<span class="tile-badge">${special.short}</span>` : ""}
        ${piece?.frozenTurns > 0 ? '<span class="status-badge">F</span>' : ""}
        ${piece?.shieldTurns > 0 ? '<span class="status-badge shield-badge">S</span>' : ""}
      </div>`;
    cell.addEventListener("click", () => handleCellClick(i));
    ui.board.appendChild(cell);
  }
}

function renderMatchStatus() {
  // 매칭 상태 문구는 온라인/AI/로컬 모드에 따라 달라진다.
  if (!ui.matchStatus) return;
  if (session.mode === "online") {
    if (session.roomStatus === "waiting") ui.matchStatus.textContent = `방 ${session.roomId?.slice(0,6) || "-"} 에서 상대를 기다리는 중입니다. 12초 후 AI로 전환됩니다.`;
    else if (session.roomStatus === "active") ui.matchStatus.textContent = "상대와 연결되었습니다. 온라인 대전이 시작됩니다.";
    else if (session.roomStatus === "ended") ui.matchStatus.textContent = "온라인 대전이 끝났습니다.";
    else if (session.roomStatus === "cancelled") ui.matchStatus.textContent = "매칭이 취소되었습니다.";
    else ui.matchStatus.textContent = "온라인 룸을 준비 중입니다.";
    return;
  }
  if (session.mode === "ai") { ui.matchStatus.textContent = "AI가 자동으로 O를 담당합니다."; return; }
  ui.matchStatus.textContent = "로컬 대전 모드입니다.";
}

function isHumanTurn() {
  if (gameState.gameOver) return false;
  if (session.mode === "online") return session.roomStatus === "active" && session.seat === gameState.currentPlayer;
  if (session.mode === "ai") return gameState.currentPlayer !== AI_SEAT;
  return true;
}

function canInteractWithCell(index) {
  // 선택 전에는 내 말만, 선택 후에는 가능한 수만 클릭하게 한다.
  if (!isHumanTurn()) return false;
  const piece = gameState.board[index];
  if (selectedIndex === null) return !!piece && piece.owner === gameState.currentPlayer;
  if (index === selectedIndex) return true;
  return legalMovesForPiece(gameState, selectedIndex, gameState.currentPlayer).some((move) => move.to === index);
}

function handleCellClick(index) {
  if (!canInteractWithCell(index)) return;
  const piece = gameState.board[index];

  if (selectedIndex === null) {
    if (piece && piece.owner === gameState.currentPlayer && piece.frozenTurns === 0) {
      selectedIndex = index;
      setNotice("말을 선택했습니다.");
      renderAll();
    } else if (piece && piece.owner === gameState.currentPlayer && piece.frozenTurns > 0) {
      setNotice("이 말은 함정에 걸려 이번 턴에는 움직일 수 없습니다.");
    }
    return;
  }

  if (index === selectedIndex) {
    selectedIndex = null;
    setNotice("선택을 취소했습니다.");
    renderAll();
    return;
  }

  const move = legalMovesForPiece(gameState, selectedIndex, gameState.currentPlayer).find((item) => item.to === index);
  if (move) {
    commitMove(move);
    return;
  }

  if (piece && piece.owner === gameState.currentPlayer && piece.frozenTurns === 0) {
    selectedIndex = index;
    setNotice("다른 말을 선택했습니다.");
    renderAll();
    return;
  }

  selectedIndex = null;
  setNotice("이동할 수 없는 칸입니다.");
  renderAll();
}
async function commitMove(move) {
  // 로컬/온라인에 따라 실제로 수를 반영하는 경로를 나눈다.
  if (session.mode === "online" && session.roomRef) {
    await commitOnlineMove(move);
    selectedIndex = null;
    return;
  }
  if (applyMoveToState(gameState, move)) {
    selectedIndex = null;
    renderAll();
    scheduleAiTurn();
  }
}

async function commitOnlineMove(move) {
  // 온라인 대전은 트랜잭션으로 동시 수정 충돌을 막는다.
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
      if (!applyMoveToState(state, move)) throw new Error("illegal-move");

      tx.update(roomRef, {
        state,
        status: state.gameOver ? "ended" : "active",
        winner: state.winner || null,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    setNotice("온라인 동기화에 실패했습니다. 다시 시도해 주세요.");
  }
}

async function commitOnlinePass() {
  // 온라인에서도 스킵은 같은 룸 상태를 업데이트하는 방식으로 처리한다.
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
      forcePassTurn(state, "턴을 종료했습니다.");
      tx.update(roomRef, {
        state,
        status: state.gameOver ? "ended" : "active",
        winner: state.winner || null,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    setNotice("턴 종료를 동기화하지 못했습니다.");
  }
}

function skipCurrentTurn() {
  if (gameState.gameOver) return;
  if (gameState.bothThreeLineConflict) {
    setNotice("양쪽이 동시에 3목이라 스킵할 수 없습니다.");
    return;
  }
  if (gameState.victoryHoldPlayer !== gameState.currentPlayer || gameState.victoryHoldTurnsRemaining > 1) return;
  selectedIndex = null;
  if (session.mode === "online") {
    commitOnlinePass();
    return;
  }
  forcePassTurn(gameState, `${gameState.currentPlayer}가 3목을 지키기 위해 스킵했습니다.`);
  renderAll();
  scheduleAiTurn();
}

function scheduleAiTurn() {
  // AI 차례가 되면 5초 뒤 runAiTurn을 예약한다.
  if (session.mode !== "ai") {
    debugLog("scheduleAiTurn skipped: not ai mode", { mode: session.mode, currentPlayer: gameState.currentPlayer });
    return;
  }
  if (gameState.gameOver) {
    debugLog("scheduleAiTurn skipped: game over");
    return;
  }
  if (gameState.currentPlayer !== AI_SEAT) {
    debugLog("scheduleAiTurn skipped: not AI turn", { currentPlayer: gameState.currentPlayer });
    return;
  }
  if (session.aiTimer) {
    debugLog("scheduleAiTurn skipped: already armed", { currentPlayer: gameState.currentPlayer, turnActions: gameState.turnActions });
    return;
  }
  session.aiThinking = true;
  debugLog("scheduleAiTurn armed", { currentPlayer: gameState.currentPlayer, turnActions: gameState.turnActions });
  session.aiTimer = setTimeout(runAiTurn, AI_DELAY_MS);
}

function stopAutoPassTimer() {
  if (session.autoPassTimer) { clearTimeout(session.autoPassTimer); session.autoPassTimer = null; }
}

function scheduleAutoPass() {
  // 둘 수 있는 수가 없으면 자동으로 턴을 넘긴다.
  stopAutoPassTimer();
  if (gameState.gameOver) return;
  if (allLegalMoves(gameState, gameState.currentPlayer).length > 0) return;
  session.autoPassTimer = setTimeout(() => {
    if (gameState.gameOver) return;
    if (allLegalMoves(gameState, gameState.currentPlayer).length > 0) return;
    if (session.mode === "online") {
      commitOnlinePass();
      return;
    }
    forcePassTurn(gameState, "둘 수 있는 수가 없어 자동으로 턴이 넘어갑니다.");
    renderAll();
    scheduleAiTurn();
  }, 600);
}

async function commitTimeoutLoss() {
  // 초읽기를 다 쓰면 상대가 승리한다.
  if (session.mode === "online" && session.roomRef) {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(session.roomRef);
        if (!snap.exists()) return;
        const room = snap.data();
        if (room.status !== "active") return;
        const state = normalizeState(room.state);
        if (state.gameOver) return;
        const remaining = getClockRemaining(state, state.currentPlayer);
        if (remaining > 0) return;
        state.gameOver = true;
        state.winner = opponent(state.currentPlayer);
        state.drawReason = "";
        state.lastEvent = `${state.winner} 승리! ${state.currentPlayer}의 시간이 모두 소진됐습니다.`;
        state.lastEventLines = [state.lastEvent];
        tx.update(session.roomRef, {
          state,
          status: "ended",
          winner: state.winner,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      console.error(error);
    }
    return;
  }

  if (!gameState.gameOver) {
    gameState.gameOver = true;
    gameState.winner = opponent(gameState.currentPlayer);
    gameState.drawReason = "";
    gameState.lastEvent = `${gameState.winner} 승리! ${gameState.currentPlayer}의 시간이 모두 소진됐습니다.`;
    gameState.lastEventLines = [gameState.lastEvent];
    renderAll();
  }
}

function onClockTick() {
  // 초읽기 틱은 남은 시간만 갱신하고, 자동 패스 여부를 확인한다.
  if (gameState.gameOver) {
    stopAutoPassTimer();
    return;
  }
  const remaining = getClockRemaining(gameState, gameState.currentPlayer);
  if (remaining <= 0) {
    commitTimeoutLoss();
    return;
  }
  renderTurnInfo();
  if (!allLegalMoves(gameState, gameState.currentPlayer).length) scheduleAutoPass(); else stopAutoPassTimer();
}

function ensureClockTicker() {
  if (session.clockTimer) return;
  session.clockTimer = setInterval(onClockTick, 250);
}

function runAiTurn() {
  // AI가 실제로 수를 두는 본체 함수다.
  if (session.aiTimer) { clearTimeout(session.aiTimer); session.aiTimer = null; }
  session.aiThinking = false;
  debugLog("runAiTurn enter", {
    mode: session.mode,
    gameOver: gameState.gameOver,
    currentPlayer: gameState.currentPlayer,
    aiTimer: Boolean(session.aiTimer),
    turnActions: gameState.turnActions,
  });
  if (session.mode !== "ai" || gameState.gameOver || gameState.currentPlayer !== AI_SEAT) {
    debugLog("runAiTurn aborted");
    return;
  }

  if (gameState.victoryHoldPlayer === AI_SEAT && gameState.victoryHoldTurnsRemaining <= 1) {
    debugLog("runAiTurn choosing skip to preserve line");
    forcePassTurn(gameState, "AI가 3목을 지키기 위해 스킵했습니다.");
    renderAll();
    return;
  }

  const move = chooseAiMove(gameState);
  if (!move) {
    debugLog("runAiTurn no move, passing turn");
    forcePassTurn(gameState, "AI가 둘 수 있는 수가 없어 턴을 넘깁니다.");
    renderAll();
    scheduleAiTurn();
    return;
  }

  debugLog("runAiTurn move selected", move, moveToText(gameState, move));
  applyMoveToState(gameState, move);
  debugLog("runAiTurn after move", {
    currentPlayer: gameState.currentPlayer,
    turnActions: gameState.turnActions,
    gameOver: gameState.gameOver,
    winner: gameState.winner,
    lastEvent: gameState.lastEvent,
  });
  renderAll();
  if (session.mode === "ai" && !gameState.gameOver && gameState.currentPlayer === AI_SEAT) {
    debugLog("runAiTurn rescheduling because AI still has turn");
    session.aiThinking = true;
    session.aiTimer = setTimeout(runAiTurn, AI_DELAY_MS);
  }
}

function startLocalAIMatch(message = "AI 대전 준비 완료") {
  // AI 대전은 항상 새 판으로 시작한다.
  stopOnlineSession();
  stopAiTimer();
  session.mode = "ai";
  session.notice = message;
  debugLog("startLocalAIMatch", { message });
  gameState = createInitialState();
  selectedIndex = null;
  showGamePage();
  renderAll();
  scheduleAiTurn();
}

async function startOnlineMatch() {
  // 온라인 매칭은 방 찾기 → 참가 → 없으면 새 방 생성 순서로 진행한다.
  stopOnlineSession();
  stopAiTimer();
  session.mode = "online";
  session.notice = "자동 온라인 매칭을 찾는 중입니다.";
  gameState = createInitialState();
  selectedIndex = null;
  showGamePage();
  renderAll();

  const identity = await ensureIdentity();
  const waitingQuery = query(collection(db, ROOM_COLLECTION), where("status", "==", "waiting"), limit(10));
  const waitingSnapshot = await getDocs(waitingQuery);

  for (const roomDoc of waitingSnapshot.docs) {
    const joined = await tryJoinRoom(roomDoc.ref, identity);
    if (joined) {
      attachRoomListener(roomDoc.ref, false);
      subscribeRoomChat(roomDoc.ref);
      setNotice(`방 ${roomDoc.id.slice(0, 6)} 에 합류했습니다.`);
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

  session.roomRef = roomRef;
  session.roomId = roomRef.id;
  session.seat = "X";
  session.host = true;
  session.roomStatus = "waiting";
  attachRoomListener(roomRef, true);
  subscribeRoomChat(roomRef);
  session.timeoutId = setTimeout(() => fallbackToAiIfWaiting(roomRef), MATCH_WAIT_MS);
  setNotice(`방 ${roomRef.id.slice(0, 6)} 을 만들었습니다. 상대를 기다리는 중입니다.`);
  renderAll();
}

async function tryJoinRoom(roomRef, identity) {
  let joined = false;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = snap.data();
      if (room.status !== "waiting" || room.guestId || room.hostId === identity.id) return;
      tx.update(roomRef, { status: "active", guestId: identity.id, guestName: identity.name, updatedAt: serverTimestamp() });
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

function attachRoomListener(roomRef, hostCreated) {
  // 방 문서가 바뀌면 화면 상태와 게임 상태를 다시 맞춘다.
  if (session.unsubscribe) session.unsubscribe();
  session.unsubscribe = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      if (session.mode === "online") startLocalAIMatch("온라인 방이 사라져 AI 대전으로 전환했습니다.");
      return;
    }

    const room = snap.data();
    session.roomStatus = room.status;
    session.roomId = snap.id;

    if (room.status === "waiting" && hostCreated) {
      gameState = normalizeState(room.state);
      if (!gameState.lastEvent) gameState.lastEvent = "상대를 기다리는 중입니다.";
    } else if (room.status === "active") {
      if (session.timeoutId) { clearTimeout(session.timeoutId); session.timeoutId = null; }
      gameState = normalizeState(room.state);
      selectedIndex = null;
      if (!gameState.lastEvent) gameState.lastEvent = "상대와 연결되었습니다.";
      subscribeRoomChat(roomRef);
    } else if (room.status === "ended") {
      if (session.timeoutId) { clearTimeout(session.timeoutId); session.timeoutId = null; }
      gameState = normalizeState(room.state);
      gameState.gameOver = true;
      gameState.winner = room.winner || gameState.winner;
      selectedIndex = null;
    } else if (room.status === "cancelled") {
      if (session.timeoutId) { clearTimeout(session.timeoutId); session.timeoutId = null; }
      if (session.mode === "online") {
        startLocalAIMatch("상대가 없어 AI 대전으로 전환했습니다.");
        return;
      }
    }

    renderAll();
  });
}

async function fallbackToAiIfWaiting(roomRef) {
  if (session.mode !== "online" || session.roomRef?.id !== roomRef.id) return;
  try {
    await updateDoc(roomRef, { status: "cancelled", updatedAt: serverTimestamp() });
  } catch (error) {
    console.error(error);
  }
  startLocalAIMatch("상대가 없어 AI 대전으로 전환했습니다.");
}

async function cancelOnlineMatch() {
  if (session.mode !== "online") return;
  if (session.roomRef && session.roomStatus === "waiting") {
    try {
      await updateDoc(session.roomRef, { status: "cancelled", updatedAt: serverTimestamp() });
    } catch (error) {
      console.error(error);
    }
  }
  startLocalAIMatch("온라인 매칭을 취소하고 AI 대전으로 돌아갑니다.");
}

async function restartCurrentGame() {
  if (session.mode === "online") {
    await cancelOnlineMatch();
    await startOnlineMatch();
    return;
  }
  showGamePage();
  startLocalAIMatch("새 게임을 시작했습니다.");
}

function startDefaultGameIfHidden() {
  if (session.mode === "idle") session.notice = "미니게임 허브입니다. 카드 하나를 골라 시작하세요.";
}

function renderModeHelp() {
  // 아래 설명 문구는 현재 모드에 맞게 바뀐다.
  if (!ui.matchStatus) return;
  if (session.mode === "online") {
    if (session.roomStatus === "waiting") ui.matchStatus.textContent = `방 ${session.roomId?.slice(0,6) || "-"} 에서 상대를 기다리는 중입니다. 12초 후 AI로 전환됩니다.`;
    else if (session.roomStatus === "active") ui.matchStatus.textContent = "상대와 연결되었습니다. 온라인 대전이 시작됩니다.";
    else if (session.roomStatus === "ended") ui.matchStatus.textContent = "온라인 대전이 끝났습니다.";
    else if (session.roomStatus === "cancelled") ui.matchStatus.textContent = "매칭이 취소되었습니다.";
    else ui.matchStatus.textContent = "온라인 룸을 준비 중입니다.";
    return;
  }
  if (session.mode === "ai") {
    ui.matchStatus.textContent = session.aiThinking
      ? `AI가 5초 동안 고민 중입니다. 현재 난이도는 ${getAiDifficultyLabel()}입니다.`
      : `AI가 자동으로 O를 담당합니다. 현재 난이도는 ${getAiDifficultyLabel()}입니다.`;
    return;
  }
  ui.matchStatus.textContent = "미니게임 허브입니다. 카드 하나를 골라 시작하세요.";
}

function renderSkipButton() {
  if (!ui.skipTurnBtn) return;
  const showSkip = !gameState.gameOver && !gameState.bothThreeLineConflict && gameState.victoryHoldPlayer === gameState.currentPlayer && gameState.victoryHoldTurnsRemaining <= 1 && isHumanTurn();
  ui.skipTurnBtn.style.display = showSkip ? "inline-flex" : "none";
}

function renderAll() {
  // 화면은 이 함수 하나로 통째로 다시 그린다.
  renderTurnInfo();
  renderRoomInfo();
  renderStatus();
  renderTurnHistory();
  renderChat();
  renderBoard();
  renderModeHelp();
  renderSkipButton();
  if (session.mode === "ai" && !gameState.gameOver && gameState.currentPlayer === AI_SEAT && !session.aiTimer) {
    debugLog("renderAll forcing AI schedule", { currentPlayer: gameState.currentPlayer, gameOver: gameState.gameOver });
    scheduleAiTurn();
  }
}

function startDefaultGame() {
  if (session.mode === "idle") showHomePage();
  renderAll();
  if (session.mode === "ai") scheduleAiTurn();
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderAll(); scheduleAiTurn(); } });

