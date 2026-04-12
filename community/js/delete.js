import { db, auth } from "./firebase.js";
import { doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN = "seoul2linejh@gmail.com";

export async function deletePost(postId) {
  try {
    const user = auth.currentUser;

    if (!user) {
      alert("로그인 필요");
      return;
    }

    const snap = await getDoc(doc(db, "posts", postId));

    if (!snap.exists()) {
      alert("존재하지 않는 게시글");
      return;
    }

    const data = snap.data();

    if (user.email !== ADMIN && user.uid !== data.uid) {
      alert("권한 없음");
      return;
    }

    await deleteDoc(doc(db, "posts", postId));

    location.href = "index.html";

  } catch (e) {
    console.error("DELETE ERROR:", e);
    alert("삭제 실패");
  }
}