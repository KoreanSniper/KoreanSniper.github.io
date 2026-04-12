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

    const snap = await getDoc(doc(db, "comments", commentId));

    if (!snap.exists()) {
      alert("댓글이 존재하지 않음");
      return;
    }

    const data = snap.data();

    if (user.email !== ADMIN && user.uid !== data.uid) {
      alert("삭제 권한 없음");
      return;
    }

    await deleteDoc(doc(db, "comments", commentId));

  } catch (e) {
    console.error("DELETE COMMENT ERROR:", e);
    alert("삭제 실패");
  }
}