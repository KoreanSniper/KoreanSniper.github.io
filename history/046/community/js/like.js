import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let likeLock = false;
let dislikeLock = false;

const ref = (postId, uid) =>
  doc(db, "likes", `${postId}_${uid}`);

const postRef = (postId) =>
  doc(db, "posts", postId);

// 👍 좋아요
export async function likePost(postId) {
  if (likeLock) return;
  likeLock = true;

  try {
    const user = auth.currentUser;
    if (!user) return alert("로그인 필요");

    const r = ref(postId, user.uid);
    const post = postRef(postId);
    const snap = await getDoc(r);

    if (!snap.exists()) {
      await setDoc(r, { type: "like", uid: user.uid });

      await setDoc(post, {
        likes: increment(1)
      }, { merge: true });

      return;
    }

    const data = snap.data();

    // 👍 취소
    if (data.type === "like") {
      await deleteDoc(r);

      await setDoc(post, {
        likes: increment(-1)
      }, { merge: true });

      return;
    }

    // 👎 → 👍 전환
    if (data.type === "dislike") {
      await deleteDoc(r);

      await setDoc(r, { type: "like", uid: user.uid });

      await setDoc(post, {
        likes: increment(1),
        dislikes: increment(-1)
      }, { merge: true });

      return;
    }

  } catch (e) {
    console.error("LIKE ERROR:", e);
  } finally {
    likeLock = false;
  }
}

// 👎 싫어요
export async function dislikePost(postId) {
  if (dislikeLock) return;
  dislikeLock = true;

  try {
    const user = auth.currentUser;
    if (!user) return alert("로그인 필요");

    const r = ref(postId, user.uid);
    const post = postRef(postId);
    const snap = await getDoc(r);

    if (!snap.exists()) {
      await setDoc(r, { type: "dislike", uid: user.uid });

      await setDoc(post, {
        dislikes: increment(1)
      }, { merge: true });

      return;
    }

    const data = snap.data();

    // 👎 취소
    if (data.type === "dislike") {
      await deleteDoc(r);

      await setDoc(post, {
        dislikes: increment(-1)
      }, { merge: true });

      return;
    }

    // 👍 → 👎 전환
    if (data.type === "like") {
      await deleteDoc(r);

      await setDoc(r, { type: "dislike", uid: user.uid });

      await setDoc(post, {
        dislikes: increment(1),
        likes: increment(-1)
      }, { merge: true });

      return;
    }

  } catch (e) {
    console.error("DISLIKE ERROR:", e);
  } finally {
    dislikeLock = false;
  }
}