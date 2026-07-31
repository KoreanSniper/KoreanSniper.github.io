import { auth } from "./firebase.js";
import { writeActivityLog } from "./activity-log.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

if (location.pathname.includes("/minigame/")) {
  const arcadeStyle = document.createElement("link");
  arcadeStyle.rel = "stylesheet";
  arcadeStyle.href = "./frontline-card.css";
  document.head.append(arcadeStyle);
}

const host = document.querySelector("[data-global-auth]");
if (host) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const render = (user) => {
    host.replaceChildren();
    if (user) {
      const name = document.createElement("span");
      name.className = "global-auth-name";
      name.textContent = user.displayName || "Google 계정";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "로그아웃";
      button.addEventListener("click", () => signOut(auth));
      host.append(name, button);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Google 로그인";
      button.addEventListener("click", async () => {
        try {
          const result = await signInWithPopup(auth, provider);
          await writeActivityLog("signed_in", "user", result.user.uid);
        }
        catch (error) { if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") alert("Google 로그인에 실패했습니다."); }
      });
      host.appendChild(button);
    }
  };
  onAuthStateChanged(auth, render);
}
