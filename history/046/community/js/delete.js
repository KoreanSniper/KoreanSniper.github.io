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

    // 🔥 삭제 확인 (강화 버전)
    const ok = confirm("정말 이 게시글을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.");
    if (!ok) return;

    const snap = await getDoc(doc(db, "posts", postId));

    if (!snap.exists()) {
      alert("존재하지 않는 게시글");
      return;
    }

    const data = snap.data();

    // 🔥 권한 체크
    if (user.email !== ADMIN && user.uid !== data.uid) {
      alert("권한 없음");
      return;
    }

    await deleteDoc(doc(db, "posts", postId));

    alert("삭제 완료");

    // 🔥 삭제 후 이동
    location.href = "index.html";

  } catch (e) {
    console.error("DELETE ERROR:", e);
    alert("삭제 실패");
  }
}