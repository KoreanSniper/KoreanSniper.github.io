import { auth, db } from "./firebase.js";
import { ADMIN_EMAIL } from "./util.js";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function setButtonDisplay(id, visible) {
  const el = document.getElementById(id);
  if (el?.style) el.style.display = visible ? "block" : "none";
}

async function syncVerifiedUser(user) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email || "",
      displayName: user.displayName || "",
      photoURL: user.photoURL || "",
      isAdmin: user.email === ADMIN_EMAIL,
      emailVerified: true,
      lastLoginAt: new Date(),
      provider: "google",
    },
    { merge: true },
  );
}

async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    await syncVerifiedUser(result.user);
  } catch (error) {
    console.error("GOOGLE SIGN-IN ERROR:", error);
    if (error.code === "auth/popup-closed-by-user") {
      alert("로그인 창이 닫혔습니다.");
      return;
    }
    if (error.code === "auth/cancelled-popup-request") {
      return;
    }
    alert("Google 로그인에 실패했습니다: " + error.message);
  }
}

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    alert("로그아웃에 실패했습니다.");
  }
}

function renderSignedOutUI() {
  const authDiv = document.getElementById("auth");
  if (!authDiv) return;

  authDiv.textContent = "";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "googleLoginBtn";
  button.textContent = "Google로 로그인";
  button.addEventListener("click", signInWithGoogle);
  authDiv.appendChild(button);
}

function renderSignedInUI(user) {
  const authDiv = document.getElementById("auth");
  if (!authDiv) return;

  authDiv.textContent = "";

  const span = document.createElement("span");
  span.textContent = user.displayName || user.email || "Google 계정";
  authDiv.append(span, document.createTextNode(" "));

  const button = document.createElement("button");
  button.type = "button";
  button.id = "logoutBtn";
  button.textContent = "로그아웃";
  button.addEventListener("click", logout);
  authDiv.appendChild(button);
}

window.login = signInWithGoogle;
window.logout = logout;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await syncVerifiedUser(user);
    setButtonDisplay("loginBtn", false);
    setButtonDisplay("logoutBtn", true);
    setButtonDisplay("profileBtn", true);
    setButtonDisplay("writeBtn", true);
    setButtonDisplay("backBtn", true);
    renderSignedInUI(user);
    return;
  }

  setButtonDisplay("loginBtn", true);
  setButtonDisplay("logoutBtn", false);
  setButtonDisplay("profileBtn", false);
  setButtonDisplay("writeBtn", false);
  setButtonDisplay("backBtn", false);
  renderSignedOutUI();
});
