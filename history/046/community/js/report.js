import { db, auth } from "./firebase.js";
import {
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function reportPost(postId) {
  try {
    const user = auth.currentUser;

    // 로그인 체크
    if (!user) {
      alert("로그인이 필요합니다");
      return;
    }

    // 🔥 중복 신고 체크
    const q = query(
      collection(db, "reports"),
      where("postId", "==", postId),
      where("uid", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      alert("이미 신고한 글입니다");
      return;
    }

    // 🔥 신고 사유 선택 (개선된 UX)
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
    await addDoc(collection(db, "reports"), {
      postId,
      uid: user.uid,
      reason: reason.trim(),
      type: "post",
      status: "pending", // 처리 상태
      createdAt: serverTimestamp()
    });

    alert("신고가 접수되었습니다");

  } catch (e) {
    console.error("REPORT ERROR:", e);
    alert("신고 중 오류 발생");
  }
}