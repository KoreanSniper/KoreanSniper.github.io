console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { db, auth } from "./firebase.js";
import { writeActivityLog } from "./activity-log.js";
import { isVerifiedGoogleUser } from "./util.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function reportPost(postId) {
  try {
    const user = auth.currentUser;

    // 로그인 체크
    if (!isVerifiedGoogleUser(user)) {
      alert("로그인이 필요합니다");
      return;
    }

    // 🔥 중복 신고 체크
    const reportRef=doc(db,"reports",`${postId}_${user.uid}`);

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
    if (reason.trim().length > 500) { alert("신고 사유는 500자까지 입력할 수 있습니다"); return; }

    // 🔥 Firestore 저장
    await setDoc(reportRef, {
      postId,
      uid: user.uid,
      reason: reason.trim(),
      type: "post",
      status: "pending", // 처리 상태
      createdAt: serverTimestamp()
    });
    await writeActivityLog("post_reported", "post", postId, { reportId: reportRef.id });

    alert("신고가 접수되었습니다");

  } catch (e) {
    console.error("REPORT ERROR:", e);
    alert(e?.code === "permission-denied" ? "이미 신고했거나 신고 권한이 없습니다" : "신고 중 오류 발생");
  }
}
