import { db, auth } from "./firebase.js";
import {
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { listenComments, addComment } from "./comment.js";
import { likeComment, dislikeComment } from "./commentlike.js";
import { reportComment } from "./reportcomment.js";
import { deleteComment } from "./deletecomment.js";

import { likePost, dislikePost } from "./like.js";
import { reportPost } from "./report.js";
import { deletePost } from "./delete.js";

const postId = new URLSearchParams(location.search).get("id");

// =====================
// 🚨 안전 가드
// =====================
if (!postId) {
  alert("잘못된 접근");
  location.href = "index.html";
}

// =====================
// 👤 유저 캐시 (성능 최적화)
// =====================
const userCache = {};

async function getUsername(uid) {
  if (!uid) return "익명";

  // 캐시 있으면 바로 반환
  if (userCache[uid]) return userCache[uid];

  try {
    const snap = await getDoc(doc(db, "users", uid));

    if (snap.exists()) {
      const name = snap.data().username || "사용자";
      userCache[uid] = name;
      return name;
    }
  } catch (e) {
    console.error("USER LOAD ERROR:", e);
  }

  return "익명";
}

// =====================
// 📌 게시글 로딩
// =====================
async function loadPost() {
  try {
    const snap = await getDoc(doc(db, "posts", postId));

    if (!snap.exists()) {
      document.getElementById("title").innerText = "없는 글";
      return;
    }

    const data = snap.data();

    document.getElementById("title").innerText = data.title || "";
    document.getElementById("content").innerText = data.content || "";

    // 🔥 작성자 이름 가져오기
    const username = await getUsername(data.uid);
    const authorEl = document.getElementById("author");
    authorEl.innerText = username;
    authorEl.style.cursor = "pointer";

    authorEl.onclick = () => {
      location.href = `profile.html?id=${data.uid}`;
    };

    // 🔥 본인 글이면 수정 버튼 표시
    const user = auth.currentUser;
    if (user && user.uid === data.uid) {
      document.getElementById("editBtn").style.display = "inline-block";
    }

  } catch (e) {
    console.error("POST LOAD ERROR:", e);
  }
}

loadPost();

// =====================
// 💬 댓글 렌더 (닉네임 적용)
// =====================
async function renderComments(comments) {
  const box = document.getElementById("comments");
  if (!box) return;

  box.innerHTML = "";

  for (const c of comments) {
    const div = document.createElement("div");
    div.className = "card";

    const username = await getUsername(c.uid);

    div.innerHTML = `
      <b class="userLink" data-uid="${c.uid}">${username}</b>
      <p>${c.content || ""}</p>

      👍 ${c.likes || 0}
      👎 ${c.dislikes || 0}

      <button class="likeC">👍</button>
      <button class="dislikeC">👎</button>
      <button class="reportC">🚨 신고</button>
      <button class="deleteC">🗑 삭제</button>

    `;
    div.querySelector(".userLink").onclick = () => {
      location.href = `profile.html?id=${c.uid}`;
    };
    div.querySelector(".likeC").onclick = () => likeComment(c.id);
    div.querySelector(".dislikeC").onclick = () => dislikeComment(c.id);
    div.querySelector(".reportC").onclick = () => reportComment(c.id);
    div.querySelector(".deleteC").onclick = () => deleteComment(c.id);

    box.appendChild(div);
  }
}

// =====================
// 🔥 좋아요 실시간 반영
// =====================
function listenPost(postId) {
  const ref = doc(db, "posts", postId);

  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();

    document.getElementById("likes").innerText = data.likes || 0;
    document.getElementById("dislikes").innerText = data.dislikes || 0;
  });
}

listenPost(postId);

// =====================
// 🔥 댓글 실시간
// =====================
listenComments(postId, renderComments);

// =====================
// 🎯 버튼 이벤트
// =====================
window.addEventListener("DOMContentLoaded", () => {

  const likeBtn = document.getElementById("likeBtn");
  const dislikeBtn = document.getElementById("dislikeBtn");
  const reportBtn = document.getElementById("reportBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const commentBtn = document.getElementById("commentBtn");
  const editBtn = document.getElementById("editBtn");

  if (likeBtn) likeBtn.onclick = () => likePost(postId);
  if (dislikeBtn) dislikeBtn.onclick = () => dislikePost(postId);
  if (reportBtn) reportBtn.onclick = () => reportPost(postId);
  if (deleteBtn) deleteBtn.onclick = () => deletePost(postId);
  if (commentBtn) commentBtn.onclick = () => addComment(postId);

  // ✏️ 수정 버튼
  if (editBtn) {
    editBtn.onclick = () => {
      location.href = `edit.html?id=${postId}`;
    };
  }

});