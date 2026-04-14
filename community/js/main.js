import { db } from "./firebase.js";
import { escapeHTML } from "./util.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const postsDiv = document.getElementById("posts");

// 🔥 유저 캐시
const userCache = {};

async function getUsername(uid) {
  if (!uid) return "익명";

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

async function loadPosts() {
  postsDiv.innerHTML = "";

  try {
    const q = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    for (const d of snapshot.docs) {
      const data = d.data();

      const post = document.createElement("div");
      post.className = "card post";
      post.style.cursor = "pointer";

      post.onclick = () => {
        window.location.href = `post.html?id=${d.id}`;
      };

      // 🔥 작성자 이름 가져오기
      const username = await getUsername(data.uid);

      post.innerHTML = `
        <h1>${escapeHTML(data.title)}</h1>
        <p style="color:#949ba4; font-size:13px;">👤 ${escapeHTML(username)}</p>
        <p>${escapeHTML(data.content)}</p>
      `;

      postsDiv.appendChild(post);
    }

  } catch (e) {
    console.error("게시글 로딩 실패:", e);
  }
}

loadPosts();