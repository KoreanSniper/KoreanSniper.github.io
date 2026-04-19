export function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ADMIN_EMAIL = "seoul2linejh@gmail.com";

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
