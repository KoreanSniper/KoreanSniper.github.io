import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔥 URL에서 uid 가져오기
const urlUid = new URLSearchParams(location.search).get("id");

// ======================
// 로그아웃 / 홈
// ======================
window.logout = async () => {
  await signOut(auth);
  location.href = "./index.html";
};

window.goHome = () => {
  location.href = "./index.html";
};

// ======================
// 🔥 프로필 로드
// ======================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "./index.html";
    return;
  }

  const targetUid = urlUid || user.uid;

  // 🔥 이메일 (내 프로필만 표시)
  document.getElementById("email").innerText =
    (targetUid === user.uid) ? user.email : "-";

  const userRef = doc(db, "users", targetUid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();

    document.getElementById("username").innerText =
      data.username || "사용자";

    document.getElementById("status").innerText =
      data.status || "온라인";

    document.getElementById("created").innerText =
      data.createdAt?.toDate?.().toLocaleString() || "-";

  } else {
    document.getElementById("username").innerText = "사용자";
    document.getElementById("status").innerText = "-";
    document.getElementById("created").innerText = "-";
  }

  // 🔥 내 프로필 아니면 수정 버튼 숨김
  if (targetUid !== user.uid) {
    document.querySelectorAll(".profile-actions")
      .forEach(el => el.style.display = "none");
  }

  // 🔥 유저 게시글 로드
  loadUserPosts(targetUid);
});

// ======================
// 🔥 유저 게시글
// ======================
async function loadUserPosts(uid) {
  const box = document.getElementById("userPosts");
  if (!box) return;

  box.innerHTML = "";

  try {
    const q = query(
      collection(db, "posts"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      box.innerHTML = "<p>작성한 글 없음</p>";
      document.getElementById("posts").innerText = "0";
      return;
    }

    snap.forEach(d => {
      const data = d.data();

      const div = document.createElement("div");
      div.className = "card";
      div.style.cursor = "pointer";

      // 🔥 클릭 이동
      div.onclick = () => {
        location.href = `post.html?id=${d.id}`;
      };

      // 🔥 hover 효과
      div.style.transition = "0.2s";
      div.onmouseover = () => div.style.transform = "translateY(-2px)";
      div.onmouseout = () => div.style.transform = "none";

      div.innerHTML = `
        <h3>${data.title || ""}</h3>
        <p>${(data.content || "").slice(0, 100)}</p>
      `;

      box.appendChild(div);
    });

    // 🔥 게시글 수 표시
    document.getElementById("posts").innerText = snap.size;

  } catch (e) {
    console.error("USER POSTS ERROR:", e);
  }
}

// ======================
// 🔥 프로필 저장
// ======================
window.saveProfile = async () => {
  const name = document.getElementById("editName").value.trim();
  const status = document.getElementById("editStatus").value.trim();

  const user = auth.currentUser;
  if (!user) return;

  try {
    await setDoc(doc(db, "users", user.uid), {
      username: name || "사용자",
      status: status || "온라인",
      createdAt: new Date() // 🔥 최초 저장 시만 의미 있음
    }, { merge: true });

    await updateProfile(user, {
      displayName: name
    });

    document.getElementById("username").innerText = name;
    document.getElementById("status").innerText = status;

    closeModal();

  } catch (e) {
    console.error("PROFILE SAVE ERROR:", e);
    alert("저장 실패");
  }
};