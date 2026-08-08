import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "../../core/firebase/app.js";
import { getPosts, getUser } from "../../core/api/firestore.js";

const postsElement = document.querySelector("#posts");
const userCache = new Map();

function renderError() {
  postsElement.replaceChildren();
  const message = document.createElement("p");
  message.textContent = "게시글을 불러오지 못했습니다.";
  postsElement.append(message);
}

function renderEmpty() {
  postsElement.replaceChildren();
  const message = document.createElement("p");
  message.textContent = "아직 게시글이 없습니다.";
  postsElement.append(message);
}

async function getCachedUser(uid) {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const user = await getUser(uid);
  userCache.set(uid, user);
  return user;
}

async function renderPosts() {
  postsElement.replaceChildren();
  const posts = await getPosts();

  if (!posts.length) {
    renderEmpty();
    return;
  }

  for (const post of posts) {
    const user = await getCachedUser(post.uid);
    const article = document.createElement("article");
    article.className = "post-card";
    article.tabIndex = 0;
    article.addEventListener("click", () => {
      location.href = `./post.html?id=${encodeURIComponent(post.id)}`;
    });
    article.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        location.href = `./post.html?id=${encodeURIComponent(post.id)}`;
      }
    });

    const title = document.createElement("h2");
    title.textContent = post.title || "제목 없음";

    const author = document.createElement("p");
    author.className = "post-author";
    author.textContent = `👤 ${user?.username || user?.displayName || "User"}`;

    const content = document.createElement("p");
    content.textContent = post.content || "";

    article.append(title, author, content);
    postsElement.append(article);
  }
}

onAuthStateChanged(auth, async () => {
  try {
    await renderPosts();
  } catch (error) {
    console.error("V2 COMMUNITY LOAD ERROR:", error);
    renderError();
  }
});
