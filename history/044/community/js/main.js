console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { auth, db } from "./firebase.js";
import { createNameWithBadge } from "./util.js";

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
  postsDiv.replaceChildren();

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

      const title = document.createElement("h1");
      title.textContent = data.title || "";

      const author = document.createElement("p");
      author.style.color = "#949ba4";
      author.style.fontSize = "13px";
      author.textContent = "👤 ";
      author.appendChild(createNameWithBadge(userInfo.name, userInfo));

      const content = document.createElement("p");
      content.textContent = data.content || "";

      post.append(title, author, content);

      postsDiv.appendChild(post);
    }
  } catch (e) {
    console.error("게시글 로딩 실패:", e);
  }
}

loadPosts();

