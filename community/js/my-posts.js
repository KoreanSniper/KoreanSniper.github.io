import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ======================
// 버튼 함수
// ======================
window.logout = async () => {
  await signOut(auth);
  location.href = "./index.html";
};

window.goHome = () => {
  location.href = "./index.html";
};

window.goProfile = () => {
  location.href = "./profile.html";
};

// ======================
// 내 글 불러오기
// ======================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "../index.html";
    return;
  }

  const postList = document.getElementById("postList");

  try {
    const q = query(
      collection(db, "posts"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      postList.innerHTML = "<p>작성한 글이 없습니다.</p>";
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();

      const card = document.createElement("div");
      card.className = "card post";

      card.innerHTML = `
        <h1>${data.title || "제목 없음"}</h1>
        <p>${data.content || ""}</p>
        <div class="actions">
          👍 ${data.likes || 0} · 💬 ${data.comments || 0}
        </div>
      `;

      // 상세 페이지 이동
      card.onclick = () => {
        location.href = `./post.html?id=${doc.id}`;
      };

      postList.appendChild(card);
    });

  } catch (e) {
    console.error(e);
    postList.innerHTML = "<p>글을 불러오는 중 오류 발생</p>";
  }
});