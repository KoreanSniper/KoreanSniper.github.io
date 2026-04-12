import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 로그아웃
window.logout = async () => {
  await signOut(auth);
  window.location.href = "./index.html";
};

// 홈 이동
window.goHome = () => {
  window.location.href = "./index.html";
};

// 유저 정보 표시
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  document.getElementById("username").innerText =
    user.displayName || "사용자";

  document.getElementById("email").innerText =
    user.email;

  document.getElementById("status").innerText =
    "온라인 🟢";

  document.getElementById("created").innerText =
    user.metadata.creationTime || "-";
});