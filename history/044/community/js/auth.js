import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 회원가입
window.signup = async () => {
  const email = document.getElementById("email").value;
  const pw = document.getElementById("password").value;

  try {
    await createUserWithEmailAndPassword(auth, email, pw);
    alert("회원가입 완료");
  } catch (e) {
    if (e.code === "auth/email-already-in-use") {
      alert("이미 존재하는 이메일입니다");
    } else if (e.code === "auth/invalid-email") {
      alert("이메일 형식이 올바르지 않습니다");
    } else if (e.code === "auth/weak-password") {
      alert("비밀번호는 6자 이상이어야 합니다");
    } else {
      alert("회원가입 실패: " + e.message);
    }
  }
};

// 로그인
window.login = async () => {
  const email = document.getElementById("email").value;
  const pw = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, pw);
    alert("로그인 완료");
  } catch (e) {
    if (e.code === "auth/user-not-found") {
      alert("존재하지 않는 계정입니다");
    } else if (e.code === "auth/wrong-password") {
      alert("비밀번호가 틀렸습니다");
    } else {
      alert("로그인 실패: " + e.message);
    }
  }
};

// 로그아웃
window.logout = async () => {
  try {
    await signOut(auth);
    alert("로그아웃 완료");
  } catch (e) {
    alert("로그아웃 실패: " + e.message);
  } 
};

// 프로필 이동
window.goProfile = () => {
  window.location.href = "./profile.html";
};

// 글쓰기 이동
window.goWrite = () => {
  window.location.href = "./write.html";
};

// 글쓰기 이동
window.back = () => {
  window.history.back();
};


// UI 상태 업데이트
onAuthStateChanged(auth, (user) => {
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const profileBtn = document.getElementById("profileBtn");
  const writeBtn = document.getElementById("writeBtn");
  const backBtn = document.getElementById("backBtn");

  if (user) {
    loginBtn?.style && (loginBtn.style.display = "none");
    logoutBtn?.style && (logoutBtn.style.display = "block");
    profileBtn?.style && (profileBtn.style.display = "block");
    writeBtn?.style && (writeBtn.style.display = "block");
    backBtn?.style && (backBtn.style.display = "block");
  } else {
    loginBtn?.style && (loginBtn.style.display = "block");
    logoutBtn?.style && (logoutBtn.style.display = "none");
    profileBtn?.style && (profileBtn.style.display = "none");
    writeBtn?.style && (writeBtn.style.display = "none");
    backBtn?.style && (backBtn.style.display = "none");
  }
});