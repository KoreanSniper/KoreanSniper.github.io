import { db } from "./firebase.js";
import { onSnapshot,doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
// 📌 게시글 로딩
// =====================
async function loadPost() {
  try {
    const snap = await getDoc(doc(db, "posts", postId));

    if (!snap.exists()) {
      const t = document.getElementById("title");
      if (t) t.innerText = "없는 글";
      return;
    }

    const data = snap.data();

    const title = document.getElementById("title");
    const content = document.getElementById("content");

    if (title) title.innerText = data.title || "";
    if (content) content.innerText = data.content || "";

  } catch (e) {
    console.error("POST LOAD ERROR:", e);
  }
}

loadPost();

// =====================
// 💬 댓글 렌더 (안정 버전)
// =====================
function renderComments(comments) {
  const box = document.getElementById("comments");
  if (!box) return;

  box.innerHTML = "";

  comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <b>${c.uid || "익명"}</b>
      <p>${c.content || ""}</p>

      👍 ${c.likes || 0}
      👎 ${c.dislikes || 0}

      <button class="likeC">👍</button>
      <button class="dislikeC">👎</button>
      <button class="reportC">🚨 신고</button>
      <button class="deleteC">🗑 삭제</button>
    `;

    div.querySelector(".likeC").onclick = () => likeComment(c.id);
    div.querySelector(".dislikeC").onclick = () => dislikeComment(c.id);
    div.querySelector(".reportC").onclick = () => reportComment(c.id);
    div.querySelector(".deleteC").onclick = () => deleteComment(c.id);

    box.appendChild(div);
  });
}


function listenPost(postId) {
  const ref = doc(db, "posts", postId);

  onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();

    const likes = document.getElementById("likes");
    const dislikes = document.getElementById("dislikes");

    if (likes) likes.innerText = data.likes || 0;
    if (dislikes) dislikes.innerText = data.dislikes || 0;
  });
}

// 실행
listenPost(postId);
// =====================
// 🔥 댓글 실시간 (중복 방지 중요)
// =====================
listenComments(postId, renderComments);

// =====================
// 💬 댓글 작성
// =====================
window.addEventListener("DOMContentLoaded", () => {

  const likeBtn = document.getElementById("likeBtn");
  const dislikeBtn = document.getElementById("dislikeBtn");
  const reportBtn = document.getElementById("reportBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const commentBtn = document.getElementById("commentBtn");

  console.log("LIKE BTN:", likeBtn);
  console.log("DISLIKE BTN:", dislikeBtn);

  if (likeBtn) likeBtn.onclick = () => likePost(postId);
  if (dislikeBtn) dislikeBtn.onclick = () => dislikePost(postId);
  if (reportBtn) reportBtn.onclick = () => reportPost(postId);
  if (deleteBtn) deleteBtn.onclick = () => deletePost(postId);
  if (commentBtn) commentBtn.onclick = () => addComment(postId);
}); 