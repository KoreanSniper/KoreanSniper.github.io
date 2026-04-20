console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
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
