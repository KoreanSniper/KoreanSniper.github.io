import { db, auth } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// URL에서 postId 가져오기
const postId = new URLSearchParams(location.search).get("id");

// 안전 가드
if (!postId) {
  alert("잘못된 접근");
  location.href = "index.html";
}

// ======================
// 📥 기존 글 불러오기
// ======================
async function loadPost() {
  try {
    const snap = await getDoc(doc(db, "posts", postId));

    if (!snap.exists()) {
      alert("글이 존재하지 않습니다.");
      location.href = "index.html";
      return;
    }

    const data = snap.data();

    // 🔥 본인 확인
    const user = auth.currentUser;
    if (!user || user.uid !== data.uid) {
      alert("수정 권한이 없습니다.");
      location.href = "index.html";
      return;
    }

    document.getElementById("title").value = data.title || "";
    document.getElementById("content").value = data.content || "";

  } catch (e) {
    console.error(e);
  }
}

loadPost();

// ======================
// 💾 수정 저장
// ======================
window.updatePost = async () => {
  const title = document.getElementById("title").value.trim();
  const content = document.getElementById("content").value.trim();
  const status = document.getElementById("status");

  if (!title || !content) {
    status.innerText = "제목과 내용을 입력하세요";
    return;
  }

  try {
    await updateDoc(doc(db, "posts", postId), {
      title,
      content,
      updatedAt: new Date()
    });

    status.innerText = "수정 완료!";

    setTimeout(() => {
      location.href = `post.html?id=${postId}`;
    }, 1000);

  } catch (e) {
    console.error(e);
    status.innerText = "오류 발생";
  }
};

// ======================
// 🔙 취소
// ======================
window.goBack = () => {
  history.back();
};