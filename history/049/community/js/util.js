console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
export function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ADMIN_EMAIL = "seoul2linejh@gmail.com";

export function isVerifiedGoogleUser(user) {
  return Boolean(user && !user.isAnonymous && user.emailVerified && user.providerData?.some(provider => provider.providerId === "google.com"));
}

export function isAdminUser(user = {}) {
  return Boolean(user.isAdmin) || user.email === ADMIN_EMAIL;
}

export function renderNameWithBadge(name = "", user = {}) {
  const safeName = escapeHTML(name || "User");

  if (!isAdminUser(user)) {
    return safeName;
  }

  return `${safeName} <span class="verified-badge" title="관리자 인증">&#10003;</span>`;
}

export function createNameWithBadge(name = "", user = {}) {
  const fragment = document.createDocumentFragment();
  const nameSpan = document.createElement("span");
  nameSpan.textContent = name || "User";
  fragment.appendChild(nameSpan);

  if (isAdminUser(user)) {
    fragment.appendChild(document.createTextNode(" "));
    const badge = document.createElement("span");
    badge.className = "verified-badge";
    badge.title = "관리자 인증";
    badge.textContent = "✓";
    fragment.appendChild(badge);
  }

  return fragment;
}

