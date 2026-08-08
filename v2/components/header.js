import { $, setText } from "../core/utils/dom.js";
import { watchAuth, signInWithGoogle, logout } from "../core/auth/auth.js";

const V2_ROOT = "/v2/";

export function mountHeader() {
  const root = $("#site-header");
  if (!root) return;

  root.innerHTML = `
    <header class="site-header">
      <a class="site-brand" href="${V2_ROOT}index.html">BlockRail V2</a>
      <nav class="site-nav" aria-label="주요 메뉴">
        <a href="${V2_ROOT}pages/community/index.html">커뮤니티</a>
      </nav>
      <div class="auth-area">
        <span id="auth-status">로그인 필요</span>
        <button id="auth-button" type="button">Google 로그인</button>
      </div>
    </header>
  `;

  const status = $("#auth-status", root);
  const button = $("#auth-button", root);

  watchAuth(user => {
    if (user) {
      setText(status, user.displayName || user.email || "로그인됨");
      button.textContent = "로그아웃";
    } else {
      setText(status, "로그인 필요");
      button.textContent = "Google 로그인";
    }
  });

  button.addEventListener("click", async () => {
    try {
      if (button.textContent === "로그아웃") await logout();
      else await signInWithGoogle();
    } catch (error) {
      console.error(error);
      alert("로그인 처리 중 문제가 발생했습니다.");
    }
  });
}
