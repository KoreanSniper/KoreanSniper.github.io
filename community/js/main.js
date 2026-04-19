import { auth, db } from "./firebase.js";
import { escapeHTML, renderNameWithBadge } from "./util.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const postsDiv = document.getElementById("posts");
const userCache = {};
let authReady = false;
let currentUser = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  authReady = true;
  loadPosts();
});

async function getUserInfo(uid) {
  if (!uid) {
    return { name: "User", email: "", isAdmin: false };
  }

  if (!currentUser) {
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

async function loadPosts() {
  postsDiv.innerHTML = "";

  if (!authReady) return;

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

      const userInfo = await getUserInfo(data.uid);

      post.innerHTML = `
        <h1>${escapeHTML(data.title)}</h1>
        <p style="color:#949ba4; font-size:13px;">👤 ${renderNameWithBadge(userInfo.name, userInfo)}</p>
        <p>${escapeHTML(data.content)}</p>
      `;

      postsDiv.appendChild(post);
    }
  } catch (e) {
    console.error("게시글 로딩 실패:", e);
  }
}

loadPosts();
