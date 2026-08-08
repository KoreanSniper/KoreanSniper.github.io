import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "../firebase/app.js";
import { isVerifiedGoogleUser } from "./permissions.js";

const provider = new GoogleAuthProvider();

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  if (!isVerifiedGoogleUser(result.user)) {
    await signOut(auth);
    throw new Error("Google 계정 인증 상태를 확인할 수 없습니다.");
  }
  return result.user;
}

export function logout() {
  return signOut(auth);
}
