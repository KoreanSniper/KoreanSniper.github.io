import { auth, db } from "./firebase.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function writeActivityLog(action, targetType, targetId, metadata = {}) {
  const user = auth.currentUser;
  if (!user) return;

  try {
    await addDoc(collection(db, "activity_logs"), {
      actorUid: user.uid,
      actorEmail: user.email || "",
      action,
      targetType,
      targetId: String(targetId || ""),
      metadata,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Logging must never prevent the user's original action.
    console.warn("ACTIVITY LOG ERROR:", error);
  }
}
