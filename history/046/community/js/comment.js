import { db, auth } from "./firebase.js";
import {
  collection,
  addDoc,
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
  if (!auth.currentUser) return alert("로그인 필요");

  await addDoc(collection(db, "comments"), {
    postId,
    uid: auth.currentUser.uid,
    content: text,
    likes: 0,
    dislikes: 0,
    created: serverTimestamp()
  });

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