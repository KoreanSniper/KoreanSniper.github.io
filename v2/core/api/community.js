import { deleteDocument, documentRef, getDocument, updateDocument } from "./firestore.js";
import { auth } from "../firebase/app.js";
import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, increment, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase/app.js";

async function isOwner(post) {
  return Boolean(auth.currentUser?.uid && auth.currentUser.uid === post?.uid);
}

export async function deletePost(postId) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const snap = await getDocument("posts", postId);
  if (!snap.exists()) throw new Error("게시글을 찾을 수 없습니다.");
  const post = snap.data();
  const token = await getIdTokenResult(user);
  const admin = token.claims.admin === true || token.claims.isAdmin === true;
  if (!admin && !(await isOwner(post))) throw new Error("삭제 권한이 없습니다.");
  await deleteDocument("posts", postId);
}

export async function togglePostReaction(postId, type) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!["like", "dislike"].includes(type)) throw new Error("잘못된 반응입니다.");
  const postRef = documentRef("posts", postId);
  const reactionRef = doc(db, "post_likes", `${postId}_${user.uid}`);
  const [post, reaction] = await Promise.all([getDoc(postRef), getDoc(reactionRef)]);
  if (!post.exists()) throw new Error("게시글이 없습니다.");
  const current = reaction.exists() ? reaction.data().type : null;
  const field = type === "like" ? "likes" : "dislikes";
  const other = type === "like" ? "dislikes" : "likes";
  if (current === type) {
    await deleteDoc(reactionRef); await updateDocument("posts", postId, { [field]: increment(-1) }); return null;
  }
  if (current) await updateDocument("posts", postId, { [field]: increment(1), [other]: increment(-1) });
  else await updateDocument("posts", postId, { [field]: increment(1) });
  await setDoc(reactionRef, { uid: user.uid, type }); return type;
}

export async function reportPost(postId, reason) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const text = String(reason || "기타").trim().slice(0, 500);
  await setDoc(doc(db, "reports", `post_${postId}_${user.uid}`), {
    targetId: postId, targetType: "post", reporterUid: user.uid, reason: text,
    createdAt: new Date(), status: "pending"
  });
}
