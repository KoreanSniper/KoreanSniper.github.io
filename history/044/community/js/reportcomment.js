import { db, auth } from "./firebase.js";
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function reportComment(commentId) {
  alert("개발중")
  return;
  const reason = prompt("신고 사유");

  if (!reason) return;

  await addDoc(collection(db, "comment_reports"), {
    commentId,
    uid: auth.currentUser.uid,
    reason,
    created: new Date()
  });

  alert("신고 완료");
}