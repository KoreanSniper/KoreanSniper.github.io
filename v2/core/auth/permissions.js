const ADMIN_EMAIL = "seoul2linejh@gmail.com";

export function isVerifiedGoogleUser(user) {
  return Boolean(
    user &&
    !user.isAnonymous &&
    user.emailVerified &&
    user.providerData?.some(provider => provider.providerId === "google.com")
  );
}

export function isAdminUser(user = {}) {
  return Boolean(user.isAdmin) || user.email === ADMIN_EMAIL;
}

export { ADMIN_EMAIL };
