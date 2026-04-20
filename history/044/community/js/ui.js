console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { auth } from "./firebase.js";

const authDiv = document.getElementById("auth");

auth.onAuthStateChanged(user => {
  if (user) {
    authDiv.innerHTML = `
      <span>${user.email}</span>
      <button onclick="logout()">로그아웃</button>
    `;
  } else {
    authDiv.innerHTML = `
      <input id="email" placeholder="이메일">
      <input id="password" type="password" placeholder="비밀번호">
      <button onclick="login()">로그인</button>
      <button onclick="signup()">회원가입</button>
    `;
  }
});
