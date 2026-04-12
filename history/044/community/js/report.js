import { db, auth } from "./firebase.js";
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function reportPost(postId) {
  try {
    const user = auth.currentUser;

    if (!user) {
      alert("로그인 필요");
      return;
    }

    const reason = prompt("신고 사유");
    if (!reason) return;

    await addDoc(collection(db, "reports"), {
      postId,
      uid: user.uid,
      reason,
      created: new Date()
    });

    alert("신고 완료");

  } catch (e) {
    console.error("REPORT ERROR:", e);
    alert("신고 실패");
  }
}