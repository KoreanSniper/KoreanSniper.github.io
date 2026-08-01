console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { auth, db } from "./firebase.js";
import { writeActivityLog } from "./activity-log.js";
import { isVerifiedGoogleUser } from "./util.js";
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
    currentUser = null;
    const status = document.getElementById("status");
    if (status) status.innerText = "상단의 Google 로그인 후 글을 작성할 수 있습니다.";
    return;
  }

  currentUser = user;
  const status = document.getElementById("status");
  if (status) status.innerText = "";
});

// 글 작성
window.writePost = async () => {
  const title = document.getElementById("title").value;
  const content = document.getElementById("content").value;
  const status = document.getElementById("status");

  if (!isVerifiedGoogleUser(currentUser)) {
    status.innerText = "상단의 Google 로그인 버튼을 먼저 눌러주세요.";
    return;
  }

  if (!title.trim() || !content.trim() || title.length > 120 || content.length > 10000) {
    status.innerText = "⚠️ 제목과 내용을 입력하세요";
    return;
  }

  try {
    const post = await addDoc(collection(db, "posts"), {
      title,
      content,
      uid: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await writeActivityLog("post_created", "post", post.id);

    status.innerText = "✅ 작성 완료!";
    
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 800);

  } catch (e) {
    console.error(e);
    status.innerText = "❌ 작성 실패";
  }
};
