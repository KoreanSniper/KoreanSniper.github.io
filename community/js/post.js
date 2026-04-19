import { db, auth } from "./firebase.js";
import { renderNameWithBadge } from "./util.js";
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

if (!postId) {
  alert("잘못된 접근");
  location.href = "index.html";
}

const userCache = {};

async function getUserInfo(uid) {
  if (!uid) {
    return { name: "User", email: "", isAdmin: false };
  }

  if (userCache[uid]) return userCache[uid];

  try {
    const snap = await getDoc(doc(db, "users", uid));

    if (snap.exists()) {
      const data = snap.data();
      const info = {
        name: data.username || "User",
        email: data.email || "",
        isAdmin: Boolean(data.isAdmin)
      };

      userCache[uid] = info;
      return info;
    }
  } catch (e) {
    console.error("USER LOAD ERROR:", e);
  }

  return { name: "User", email: "", isAdmin: false };
}

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

    const userInfo = await getUserInfo(data.uid);
    const authorEl = document.getElementById("author");
    authorEl.innerHTML = renderNameWithBadge(userInfo.name, userInfo);
    authorEl.style.cursor = "pointer";
    authorEl.onclick = () => {
      location.href = `profile.html?id=${data.uid}`;
    };

    const user = auth.currentUser;
    if (user && user.uid === data.uid) {
      document.getElementById("editBtn").style.display = "inline-block";
    }
  } catch (e) {
    console.error("POST LOAD ERROR:", e);
  }
}

loadPost();

async function renderComments(comments) {
  const box = document.getElementById("comments");
  if (!box) return;

  box.innerHTML = "";

  for (const c of comments) {
    const div = document.createElement("div");
    div.className = "card";

    const userInfo = await getUserInfo(c.uid);

    const author = document.createElement("b");
    author.className = "userLink";
    author.dataset.uid = c.uid || "";
    author.innerHTML = renderNameWithBadge(userInfo.name, userInfo);
    author.style.cursor = "pointer";
    author.onclick = () => {
      location.href = `profile.html?id=${c.uid}`;
    };

    const content = document.createElement("p");
    content.textContent = c.content || "";

    const meta = document.createElement("p");
    meta.textContent = `👍 ${c.likes || 0}  👎 ${c.dislikes || 0}`;

    const likeButton = document.createElement("button");
    likeButton.className = "likeC";
    likeButton.type = "button";
    likeButton.textContent = "좋아요";
    likeButton.onclick = () => likeComment(c.id);

    const dislikeButton = document.createElement("button");
    dislikeButton.className = "dislikeC";
    dislikeButton.type = "button";
    dislikeButton.textContent = "싫어요";
    dislikeButton.onclick = () => dislikeComment(c.id);

    const reportButton = document.createElement("button");
    reportButton.className = "reportC";
    reportButton.type = "button";
    reportButton.textContent = "신고";
    reportButton.onclick = () => reportComment(c.id);

    const deleteButton = document.createElement("button");
    deleteButton.className = "deleteC";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.onclick = () => deleteComment(c.id);

    div.append(author, content, meta, likeButton, dislikeButton, reportButton, deleteButton);
    box.appendChild(div);
  }
}

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
listenComments(postId, renderComments);

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

  if (editBtn) {
    editBtn.onclick = () => {
      location.href = `edit.html?id=${postId}`;
    };
  }
});
