export const ADMIN_EMAIL = "seoul2linejh@gmail.com";

const RESERVED_TERMS = [
  "\uc6b4\uc601\uc790",
  "\uad00\ub9ac\uc790",
  "\uc6b4\uc601\uc9c4",
  "\uad00\ub9ac\uc9c4",
  "admin",
  "administrator",
  "moderator",
  "staff",
  "owner",
  "manager",
  "operator",
  "support",
  "helpdesk",
  "\uc2dc\ubc1c",
  "\uc528\ubc1c",
  "\u3145\u3142",
  "\u3146\u3142",
  "\ubcd1\uc2e0",
  "\ubcd11\uc2e0",
  "\u3142\u3145",
  "\uc88c\uc8e1",
  "\ud328\ub4dc\ub9bd",
  "\ud328\ub4dc",
  "\uc139\uc2a4",
  "\uc139x",
  "sex",
  "sext",
  "sexx",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "damn",
  "\uc5bc\ub9c8",
  "\uc544\ubc84\uc9c0",
  "\uc5b4\uba38\ub2c8",
  "\uc5d0\ubbf8",
  "\uc5d0\ube44",
  "mom",
  "dad",
  "mother",
  "father",
];

export function isAdminUser(user = {}) {
  return Boolean(user.isAdmin) || user.email === ADMIN_EMAIL;
}

export function normalizeNickname(value = "") {
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/[\s._-]+/g, "")
    .toLowerCase();
}

function isReservedNickname(value = "") {
  const normalized = normalizeNickname(value);
  if (!normalized) return false;

  return RESERVED_TERMS.some((term) => normalized.includes(normalizeNickname(term)));
}

export function getNicknameIssue(name = "", user = {}) {
  const trimmed = String(name).normalize("NFKC").trim();

  if (!trimmed) {
    return "Nickname is required.";
  }

  if (trimmed.length > 20) {
    return "Nickname must be 20 characters or fewer.";
  }

  if (isAdminUser(user)) {
    return "";
  }

  if (isReservedNickname(trimmed)) {
    return "Reserved or abusive nicknames are not allowed.";
  }

  return "";
}

export function isAllowedNickname(name = "", user = {}) {
  return getNicknameIssue(name, user) === "";
}

export function getSafeNickname(name = "", fallback = "User", user = {}) {
  return isAllowedNickname(name, user) ? String(name).normalize("NFKC").trim() : fallback;
}
