import { auth, db } from "../community/js/firebase.js";
import { ADMIN_EMAIL } from "../community/js/util.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const gate = document.getElementById("gate");
const dashboard = document.getElementById("dashboard");
const gateMessage = document.getElementById("gateMessage");
const dashboardMessage = document.getElementById("dashboardMessage");
let reports = [];
let logs = [];

const fmt = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date) : "기록 중";
};
const label = { pending: "처리 대기", resolved: "처리 완료", rejected: "반려" };

async function audit(action, targetType, targetId, metadata = {}) {
  await addDoc(collection(db, "activity_logs"), { actorUid: auth.currentUser.uid, actorEmail: auth.currentUser.email || "", action, targetType, targetId, metadata, createdAt: serverTimestamp() });
}

function reportCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  const head = document.createElement("div"); head.className = "card-head";
  const titleWrap = document.createElement("div");
  const title = document.createElement("h3"); title.textContent = item.type === "post" ? "게시글 신고" : "댓글 신고";
  const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = `${fmt(item.createdAt)} · 신고자 ${item.uid} · 대상 ${item.targetId}`;
  titleWrap.append(title, meta);
  const badge = document.createElement("span"); badge.className = `badge ${item.status || "pending"}`; badge.textContent = label[item.status] || item.status;
  head.append(titleWrap, badge);
  const reason = document.createElement("div"); reason.className = "reason"; reason.textContent = item.reason || "사유 없음";
  const actions = document.createElement("div"); actions.className = "actions";
  const open = document.createElement("a"); open.href = item.type === "post" ? `../community/post.html?id=${encodeURIComponent(item.targetId)}` : `../community/post.html?id=${encodeURIComponent(item.postId || "")}`; open.target = "_blank"; const openBtn = document.createElement("button"); openBtn.textContent = "대상 열기"; open.append(openBtn); actions.append(open);
  if (item.status === "pending") {
    const resolve = document.createElement("button"); resolve.className = "resolve"; resolve.textContent = "처리 완료"; resolve.onclick = () => setReportStatus(item, "resolved");
    const reject = document.createElement("button"); reject.textContent = "반려"; reject.onclick = () => setReportStatus(item, "rejected");
    actions.append(resolve, reject);
  }
  const remove = document.createElement("button"); remove.className = "danger"; remove.textContent = "대상 삭제"; remove.onclick = () => removeTarget(item); actions.append(remove);
  card.append(head, reason, actions);
  return card;
}

function renderReports() {
  const host = document.getElementById("reportsList"); host.replaceChildren();
  const status = document.getElementById("statusFilter").value;
  const needle = document.getElementById("reportSearch").value.trim().toLowerCase();
  const filtered = reports.filter((r) => (status === "all" || r.status === status) && `${r.uid} ${r.targetId} ${r.reason} ${r.type}`.toLowerCase().includes(needle));
  if (!filtered.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "조건에 맞는 신고가 없습니다."; host.append(empty); return; }
  filtered.forEach((item) => host.append(reportCard(item)));
}

function renderLogs() {
  const host = document.getElementById("logsList"); host.replaceChildren();
  const needle = document.getElementById("logSearch").value.trim().toLowerCase();
  const filtered = logs.filter((l) => `${l.action} ${l.actorEmail} ${l.actorUid} ${l.targetType} ${l.targetId}`.toLowerCase().includes(needle));
  if (!filtered.length) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "기록된 활동이 없습니다."; host.append(empty); return; }
  filtered.forEach((item) => { const card = document.createElement("article"); card.className = "card"; const h = document.createElement("h3"); h.textContent = item.action; const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = `${fmt(item.createdAt)} · ${item.actorEmail || item.actorUid} · ${item.targetType}:${item.targetId}`; card.append(h, meta); host.append(card); });
}

async function setReportStatus(item, status) {
  dashboardMessage.textContent = "";
  try {
    await updateDoc(doc(db, item.collection, item.id), { status, reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser.uid });
    await audit(`report_${status}`, item.type, item.targetId, { reportId: item.id });
    await loadData();
  } catch (error) { dashboardMessage.textContent = `처리 실패: ${error.message}`; }
}

async function removeTarget(item) {
  if (!confirm(`신고된 ${item.type === "post" ? "게시글" : "댓글"}을 삭제할까요? 복구할 수 없습니다.`)) return;
  try {
    const targetCollection = item.type === "post" ? "posts" : "comments";
    const target = doc(db, targetCollection, item.targetId);
    const snap = await getDoc(target);
    if (snap.exists()) await deleteDoc(target);
    await setReportStatus(item, "resolved");
    await audit("content_deleted", item.type, item.targetId, { reportId: item.id });
  } catch (error) { dashboardMessage.textContent = `삭제 실패: ${error.message}`; }
}

async function loadData() {
  dashboardMessage.textContent = "불러오는 중…";
  try {
    const [postReports, commentReports, logSnap] = await Promise.all([
      getDocs(query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(200))),
      getDocs(query(collection(db, "comment_reports"), orderBy("createdAt", "desc"), limit(200))),
      getDocs(query(collection(db, "activity_logs"), orderBy("createdAt", "desc"), limit(300))),
    ]);
    reports = [
      ...postReports.docs.map((d) => ({ id: d.id, collection: "reports", targetId: d.data().postId, ...d.data() })),
      ...commentReports.docs.map((d) => ({ id: d.id, collection: "comment_reports", targetId: d.data().commentId, ...d.data() })),
    ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    await Promise.all(reports.filter((item) => item.type === "comment").map(async (item) => {
      const comment = await getDoc(doc(db, "comments", item.targetId));
      if (comment.exists()) item.postId = comment.data().postId || "";
    }));
    logs = logSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    document.getElementById("pendingCount").textContent = reports.filter((r) => r.status === "pending").length;
    document.getElementById("reportCount").textContent = reports.length;
    document.getElementById("logCount").textContent = logs.length;
    renderReports(); renderLogs(); dashboardMessage.textContent = "";
  } catch (error) { dashboardMessage.textContent = `데이터를 불러오지 못했습니다: ${error.message}`; }
}

document.getElementById("loginBtn").onclick = async () => { gateMessage.textContent = ""; try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" }); await signInWithPopup(auth, provider); } catch (error) { gateMessage.textContent = `로그인 실패: ${error.message}`; } };
document.getElementById("logoutBtn").onclick = () => signOut(auth);
document.getElementById("refreshBtn").onclick = loadData;
document.getElementById("statusFilter").onchange = renderReports;
document.getElementById("reportSearch").oninput = renderReports;
document.getElementById("logSearch").oninput = renderLogs;
document.querySelectorAll("[data-tab]").forEach((button) => button.onclick = () => { document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b === button)); document.getElementById("reportsPanel").hidden = button.dataset.tab !== "reports"; document.getElementById("logsPanel").hidden = button.dataset.tab !== "logs"; });

onAuthStateChanged(auth, async (user) => {
  const allowed = user?.email === ADMIN_EMAIL;
  gate.hidden = allowed; dashboard.hidden = !allowed; document.getElementById("logoutBtn").hidden = !user; document.getElementById("account").textContent = user?.email || "";
  if (user && !allowed) { gateMessage.textContent = "이 계정은 관리자 권한이 없습니다."; await signOut(auth); return; }
  if (allowed) loadData();
});
