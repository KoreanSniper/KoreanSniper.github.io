import { auth } from "./firebase.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const host = document.querySelector("[data-global-auth]");
if (host) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  onAuthStateChanged(auth, user => {
    host.replaceChildren();
    const button = document.createElement("button");
    button.type = "button";
    if (user) {
      const name = document.createElement("span");
      name.className = "global-auth-name";
      name.textContent = user.displayName || "Google 계정";
      button.textContent = "로그아웃";
      button.addEventListener("click", () => signOut(auth));
      host.append(name, button);
    } else {
      button.textContent = "Google 로그인";
      button.addEventListener("click", async () => {
        try { await signInWithPopup(auth, provider); }
        catch (error) { if (!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code)) alert("Google 로그인에 실패했습니다."); }
      });
      host.append(button);
    }
  });
}