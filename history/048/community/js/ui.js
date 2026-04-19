import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const authDiv = document.getElementById("auth");

function renderTextButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

onAuthStateChanged(auth, (user) => {
  if (!authDiv) return;

  authDiv.textContent = "";

  if (user) {
    const span = document.createElement("span");
    span.textContent = user.displayName || user.email || "Google 계정";
    authDiv.append(span, document.createTextNode(" "));
    authDiv.appendChild(renderTextButton("로그아웃", () => logout()));
    return;
  }

  authDiv.appendChild(renderTextButton("Google로 로그인", () => login()));
});
