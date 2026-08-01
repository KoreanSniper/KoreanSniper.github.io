console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { db, auth } from "./firebase.js";
import { writeActivityLog } from "./activity-log.js";
import { isVerifiedGoogleUser } from "./util.js";
import {
  collection,
  doc,
  writeBatch,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 💬 댓글 작성
export async function addComment(postId) {
  const text = document.getElementById("comment").value;

  if (!text.trim()) return;
  if (!isVerifiedGoogleUser(auth.currentUser)) return alert("Google 로그인이 필요합니다");
  if (text.length > 2000) return alert("댓글은 2,000자까지 작성할 수 있습니다");

  const comment = doc(collection(db, "comments"));
  const rateRef = doc(db, "rateLimits", `${auth.currentUser.uid}_comment`);
  const batch = writeBatch(db);
  batch.set(comment, {
    postId,
    uid: auth.currentUser.uid,
    content: text,
    likes: 0,
    dislikes: 0,
    created: serverTimestamp()
  });
  batch.set(rateRef, { uid: auth.currentUser.uid, kind: "comment", lastAt: serverTimestamp() });
  await batch.commit();
  await writeActivityLog("comment_created", "comment", comment.id, { postId });

  document.getElementById("comment").value = "";
}

// 🔄 댓글 실시간
export function listenComments(postId, render) {
  const q = query(
    collection(db, "comments"),
    where("postId", "==", postId),
    orderBy("created", "asc")
  );

  onSnapshot(q, (snap) => {
    const list = [];

    snap.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() });
    });

    render(list);
  });
}
