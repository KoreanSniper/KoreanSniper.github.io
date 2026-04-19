import { auth, db } from "./firebase.js";
import { ADMIN_EMAIL, escapeHTML, renderNameWithBadge } from "./util.js";

import {
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const urlUid = new URLSearchParams(location.search).get("id");

window.logout = async () => {
  await signOut(auth);
  location.href = "./index.html";
};

window.goHome = () => {
  location.href = "./index.html";
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "./index.html";
    return;
  }

  const targetUid = urlUid || user.uid;
  document.getElementById("email").innerText =
    targetUid === user.uid ? user.email : "-";

  const userRef = doc(db, "users", targetUid);
  const snap = await getDoc(userRef);

  let data = {};
  if (snap.exists()) {
    data = snap.data();
  }

  document.getElementById("username").innerHTML = renderNameWithBadge(
    data.username || "사용자",
    {
      email: data.email || (targetUid === user.uid ? user.email : ""),
      isAdmin: Boolean(data.isAdmin) || (targetUid === user.uid && user.email === ADMIN_EMAIL)
    }
  );
  document.getElementById("status").innerText = data.status || "방문자";
  document.getElementById("created").innerText =
    data.createdAt?.toDate?.().toLocaleString() || "-";

  if (targetUid !== user.uid) {
    document.querySelectorAll(".profile-actions").forEach((el) => (el.style.display = "none"));
  }

  loadUserPosts(targetUid);
});

async function loadUserPosts(uid) {
  const box = document.getElementById("userPosts");
  if (!box) return;

  box.innerHTML = "";

  try {
    const q = query(
      collection(db, "posts"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      box.innerHTML = "<p>작성한 글이 없습니다.</p>";
      document.getElementById("posts").innerText = "0";
      return;
    }

    snap.forEach((d) => {
      const data = d.data();

      const div = document.createElement("div");
      div.className = "card";
      div.style.cursor = "pointer";
      div.style.transition = "0.2s";
      div.onmouseover = () => (div.style.transform = "translateY(-2px)");
      div.onmouseout = () => (div.style.transform = "none");
      div.onclick = () => {
        location.href = `post.html?id=${d.id}`;
      };

      div.innerHTML = `
        <h3>${escapeHTML(data.title || "")}</h3>
        <p>${escapeHTML((data.content || "").slice(0, 100))}</p>
      `;

      box.appendChild(div);
    });

    document.getElementById("posts").innerText = snap.size;
  } catch (e) {
    console.error("USER POSTS ERROR:", e);
  }
}

window.saveProfile = async () => {
  const name = document.getElementById("editName").value.trim();
  const status = document.getElementById("editStatus").value.trim();

  const user = auth.currentUser;
  if (!user) return;

  try {
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      isAdmin: user.email === ADMIN_EMAIL,
      username: name || "User",
      status: status || "방문자",
      createdAt: new Date()
    }, { merge: true });

    await updateProfile(user, {
      displayName: name
    });

    document.getElementById("username").innerHTML = renderNameWithBadge(name || "User", {
      email: user.email,
      isAdmin: user.email === ADMIN_EMAIL
    });
    document.getElementById("status").innerText = status || "방문자";

    closeModal();
  } catch (e) {
    console.error("PROFILE SAVE ERROR:", e);
    alert("저장에 실패했습니다.");
  }
};
