import { db, auth } from "./firebase.js";
import { doc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ADMIN = "seoul2linejh@gmail.com";

export async function deleteComment(commentId) {
  try {
    const user = auth.currentUser;

    if (!user) {
      alert("로그인 필요");
      return;
    }

    // 🔥 삭제 확인
    const ok = confirm("정말 이 댓글을 삭제하시겠습니까?");
    if (!ok) return;

    const snap = await getDoc(doc(db, "comments", commentId));

    if (!snap.exists()) {
      alert("댓글이 존재하지 않음");
      return;
    }

    const data = snap.data();

    // 🔥 권한 체크
    if (user.email !== ADMIN && user.uid !== data.uid) {
      alert("삭제 권한 없음");
      return;
    }

    await deleteDoc(doc(db, "comments", commentId));

    alert("삭제 완료");

  } catch (e) {
    console.error("DELETE COMMENT ERROR:", e);
    alert("삭제 실패");
  }
}