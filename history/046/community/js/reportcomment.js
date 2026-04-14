import { db, auth } from "./firebase.js";
import {
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function reportComment(commentId) {
  try {
    const user = auth.currentUser;

    // 🔥 로그인 체크
    if (!user) {
      alert("로그인이 필요합니다");
      return;
    }

    // 🔥 중복 신고 방지
    const q = query(
      collection(db, "comment_reports"),
      where("commentId", "==", commentId),
      where("uid", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      alert("이미 신고한 댓글입니다");
      return;
    }

    // 🔥 신고 사유 입력
    const reason = prompt(
      "신고 사유를 입력하세요:\n\n" +
      "1. 스팸\n" +
      "2. 욕설/혐오\n" +
      "3. 부적절한 내용\n" +
      "4. 기타"
    );

    if (!reason || reason.trim() === "") {
      alert("신고가 취소되었습니다");
      return;
    }

    // 🔥 Firestore 저장
    await addDoc(collection(db, "comment_reports"), {
      commentId,
      uid: user.uid,
      reason: reason.trim(),
      type: "comment",
      status: "pending",
      createdAt: serverTimestamp()
    });

    alert("댓글 신고가 접수되었습니다");

  } catch (e) {
    console.error("COMMENT REPORT ERROR:", e);
    alert("신고 중 오류 발생");
  }
}