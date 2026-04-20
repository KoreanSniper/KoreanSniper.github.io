console.warn("[BlockRail] 경고: 이곳에 코드를 넣지 마십시오. 보안에 큰 위험이 있을수 있습니다.");
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

window.logout = async () => {
  await signOut(auth);
  location.href = "./index.html";
};

window.goHome = () => {
  location.href = "./index.html";
};

window.goProfile = () => {
  location.href = "./profile.html";
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "../index.html";
    return;
  }

  const postList = document.getElementById("postList");

  try {
    const q = query(
      collection(db, "posts"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.textContent = "작성한 글이 없습니다.";
      postList.replaceChildren(empty);
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();

      const card = document.createElement("div");
      card.className = "card post";

      const title = document.createElement("h1");
      title.textContent = data.title || "제목 없음";

      const content = document.createElement("p");
      content.textContent = data.content || "";

      const actions = document.createElement("div");
      actions.className = "actions";
      actions.textContent = `👍 ${data.likes || 0} · 💬 ${data.comments || 0}`;

      card.append(title, content, actions);

      card.onclick = () => {
        location.href = `./post.html?id=${doc.id}`;
      };

      postList.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    const error = document.createElement("p");
    error.textContent = "글을 불러오는 중 오류 발생";
    postList.replaceChildren(error);
  }
});

