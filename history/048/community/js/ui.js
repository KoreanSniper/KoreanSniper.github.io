import { auth } from "./firebase.js";

const authDiv = document.getElementById("auth");

function renderTextButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

auth.onAuthStateChanged((user) => {
  if (!authDiv) return;

  authDiv.textContent = "";

  if (user) {
    const span = document.createElement("span");
    span.textContent = user.email || "";
    authDiv.append(span, document.createTextNode(" "));
    authDiv.appendChild(renderTextButton("로그아웃", () => logout()));
    return;
  }

  const email = document.createElement("input");
  email.id = "email";
  email.placeholder = "이메일";

  const password = document.createElement("input");
  password.id = "password";
  password.type = "password";
  password.placeholder = "비밀번호";

  authDiv.append(email, password);
  authDiv.appendChild(renderTextButton("로그인", () => login()));
  authDiv.appendChild(renderTextButton("회원가입", () => signup()));
});
