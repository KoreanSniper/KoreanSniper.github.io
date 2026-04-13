import { db } from "./firebase.js";
import { escapeHTML } from "./util.js"
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const postsDiv = document.getElementById("posts");

async function loadPosts() {
  postsDiv.innerHTML = "";

  try {
    const q = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    snapshot.forEach((doc) => {
      const data = doc.data();

      const post = document.createElement("div");
      post.className = "card post";

      post.className = "card post";
      post.style.cursor = "pointer";

      post.onclick = () => {
      window.location.href = `post.html?id=${doc.id}`;
      };

      post.innerHTML = `
      <h1>${escapeHTML(data.title)}</h1>
      <p>${escapeHTML(data.content)}</p>
      `;

      postsDiv.appendChild(post);
    });

  } catch (e) {
    console.error("게시글 로딩 실패:", e);
  }
}

loadPosts();