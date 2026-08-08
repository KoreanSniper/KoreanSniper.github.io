import { $ } from "../core/utils/dom.js";

export function mountFooter() {
  const root = $("#site-footer");
  if (!root) return;
  root.innerHTML = `
    <footer class="site-footer">
      <span>BlockRail V2</span>
      <span>새 구조 테스트 버전</span>
    </footer>
  `;
}
