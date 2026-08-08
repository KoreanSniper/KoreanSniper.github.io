import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase/app.js";

export function collectionRef(name){return collection(db,name)}
export function documentRef(collectionName,id){return doc(db,collectionName,id)}
export function getDocument(collectionName,id){return getDoc(documentRef(collectionName,id))}
export function getCollection(collectionName){return getDocs(collectionRef(collectionName))}
export function addDocument(collectionName,data){return addDoc(collectionRef(collectionName),data)}
export function updateDocument(collectionName,id,data){return updateDoc(documentRef(collectionName,id),data)}
export function deleteDocument(collectionName,id){return deleteDoc(documentRef(collectionName,id))}

export async function addPost(user,title,content){
  if(!user?.uid)throw new Error("로그인이 필요합니다.");
  const post=doc(collectionRef("posts"));
  const rate=documentRef("rateLimits",`${user.uid}_post`);
  const batch=writeBatch(db);
  batch.set(post,{uid:user.uid,title,content,createdAt:serverTimestamp()});
  batch.set(rate,{uid:user.uid,kind:"post",lastAt:serverTimestamp()});
  await batch.commit();
  return post.id;
}

export async function getPosts(){const snapshot=await getDocs(query(collectionRef("posts"),orderBy("createdAt","desc")));return snapshot.docs.map(item=>({id:item.id,...item.data()}))}
export async function getUser(uid){if(!uid)return null;const snapshot=await getDocument("users",uid);return snapshot.exists()?{id:snapshot.id,...snapshot.data()}:null}
export function listenComments(postId,callback){const q=query(collectionRef("comments"),where("postId","==",postId),orderBy("created","asc"));return onSnapshot(q,snap=>callback(snap.docs.map(item=>({id:item.id,...item.data()}))))}

export async function addComment(postId,user,content){const text=content.trim();if(!user?.uid||!text)throw new Error("로그인과 댓글 내용이 필요합니다.");if(text.length>2000)throw new Error("댓글은 2,000자까지 작성할 수 있습니다.");const comment=doc(collectionRef("comments"));const rate=documentRef("rateLimits",`${user.uid}_comment`);const batch=writeBatch(db);batch.set(comment,{postId,uid:user.uid,content:text,likes:0,dislikes:0,created:serverTimestamp()});batch.set(rate,{uid:user.uid,kind:"comment",lastAt:serverTimestamp()});await batch.commit();return comment.id}

export async function toggleCommentReaction(commentId,uid,type){if(!uid||!["like","dislike"].includes(type))throw new Error("잘못된 요청입니다.");const reactionRef=documentRef("comment_likes",`${commentId}_${uid}`);const commentRef=documentRef("comments",commentId);const[reaction,comment]=await Promise.all([getDoc(reactionRef),getDoc(commentRef)]);if(!comment.exists())throw new Error("댓글이 없습니다.");const current=reaction.exists()?reaction.data().type:null;const field=type==="like"?"likes":"dislikes",other=type==="like"?"dislikes":"likes";const batch=writeBatch(db);if(current===type){batch.delete(reactionRef);batch.update(commentRef,{[field]:increment(-1)})}else{batch.set(reactionRef,{type,uid});batch.update(commentRef,current?{[field]:increment(1),[other]:increment(-1)}:{[field]:increment(1)})}await batch.commit();return current===type?null:type}
