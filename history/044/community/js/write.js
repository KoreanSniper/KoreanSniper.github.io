import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 홈 이동
window.goHome = () => {
  window.location.href = "./index.html";
};

// 로그인 체크
let currentUser = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    alert("로그인 후 이용 가능합니다.");
    window.location.href = "./index.html";
    return;
  }

  currentUser = user;
});

// 글 작성
window.writePost = async () => {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;
  const status = document.getElementById("status");

  if (!title || !content) {
    status.innerText = "⚠️ 제목과 내용을 입력하세요";
    return;
  }

  try {
    await addDoc(collection(db, "posts"), {
      title,
      content,
      uid: currentUser.uid,
      email: currentUser.email,
      createdAt: serverTimestamp()
    });

    status.innerText = "✅ 작성 완료!";
    
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 800);

  } catch (e) {
    console.error(e);
    status.innerText = "❌ 작성 실패";
  }
};