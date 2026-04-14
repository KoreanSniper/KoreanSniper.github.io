import { db, auth } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ======================
// refs
// ======================
const likeRef = (commentId, uid) =>
  doc(db, "comment_likes", `${commentId}_${uid}`);

const commentRef = (commentId) =>
  doc(db, "comments", commentId);

// ======================
// 🔥 버튼 잠금 (debounce)
// ======================
const clickLock = new Set();

function lockKey(type, commentId) {
  return `${type}_${commentId}`;
}

// ======================
// 🔥 좋아요
// ======================
export async function likeComment(commentId) {
  const user = auth.currentUser;
  if (!user) return alert("로그인 필요");

  const key = lockKey("like", commentId);

  // 🚫 이미 클릭 중이면 무시
  if (clickLock.has(key)) return;
  clickLock.add(key);

  try {
    const r = likeRef(commentId, user.uid);
    const cRef = commentRef(commentId);

    const snap = await getDoc(r);
    const commentSnap = await getDoc(cRef);

    if (!commentSnap.exists()) return;

    const commentData = commentSnap.data();

    let likes = commentData.likes ?? 0;

    // 처음 반응
    if (!snap.exists()) {
      await setDoc(r, {
        type: "like",
        uid: user.uid
      });

      await setDoc(cRef, {
        likes: likes + 1
      }, { merge: true });

      return;
    }

    const data = snap.data();

    // 👍 취소
    if (data.type === "like") {
      await deleteDoc(r);

      await setDoc(cRef, {
        likes: Math.max(0, likes - 1)
      }, { merge: true });

      return;
    }

    // 👎 → 👍 전환
    if (data.type === "dislike") {
      await deleteDoc(r);

      await setDoc(r, {
        type: "like",
        uid: user.uid
      });

      await setDoc(cRef, {
        likes: increment(1),
        dislikes: increment(-1)
      }, { merge: true });

      return;
    }

  } finally {
    // ⏱ 300ms 후 해제 (debounce 느낌)
    setTimeout(() => clickLock.delete(key), 300);
  }
}

// ======================
// 🔥 싫어요
// ======================
export async function dislikeComment(commentId) {
  const user = auth.currentUser;
  if (!user) return alert("로그인 필요");

  const key = lockKey("dislike", commentId);

  // 🚫 중복 클릭 방지
  if (clickLock.has(key)) return;
  clickLock.add(key);

  try {
    const r = likeRef(commentId, user.uid);
    const cRef = commentRef(commentId);

    const snap = await getDoc(r);
    const commentSnap = await getDoc(cRef);

    if (!commentSnap.exists()) return;

    const commentData = commentSnap.data();

    let dislikes = commentData.dislikes ?? 0;

    // 처음 반응
    if (!snap.exists()) {
      await setDoc(r, {
        type: "dislike",
        uid: user.uid
      });

      await setDoc(cRef, {
        dislikes: dislikes + 1
      }, { merge: true });

      return;
    }

    const data = snap.data();

    // 👎 취소
    if (data.type === "dislike") {
      await deleteDoc(r);

      await setDoc(cRef, {
        dislikes: Math.max(0, dislikes - 1)
      }, { merge: true });

      return;
    }

    // 👍 → 👎 전환
    if (data.type === "like") {
      await deleteDoc(r);

      await setDoc(r, {
        type: "dislike",
        uid: user.uid
      });

      await setDoc(cRef, {
        likes: increment(-1),
        dislikes: increment(1)
      }, { merge: true });

      return;
    }

  } finally {
    setTimeout(() => clickLock.delete(key), 300);
  }
}