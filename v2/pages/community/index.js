import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "../../core/firebase/app.js";
import { listPosts } from "../../core/api/community-supabase.js";

const postsElement = document.querySelector("#posts");

function renderMessage(text) {
  postsElement.replaceChildren();
  const message = document.createElement("p");
  message.textContent = text;
  postsElement.append(message);
}

async function renderPosts() {
  const posts = await listPosts();
  postsElement.replaceChildren();
  if (!posts.length) return renderMessage("아직 게시글이 없습니다.");
  for (const post of posts) {
    const article = document.createElement("article");
    article.className = "post-card";
    article.tabIndex = 0;
    const open = () => { location.href = `./post.html?id=${encodeURIComponent(post.id)}`; };
    article.addEventListener("click", open);
    article.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    const title = document.createElement("h2");
    title.textContent = post.title || "제목 없음";
    const author = document.createElement("p");
    author.className = "post-author";
    author.textContent = `👤 ${post.profiles?.username || "User"}`;
    const content = document.createElement("p");
    content.textContent = post.content || "";
    article.append(title, author, content);
    postsElement.append(article);
  }
}

onAuthStateChanged(auth, async () => {
  try { await renderPosts(); }
  catch (error) { console.error("V2 COMMUNITY LOAD ERROR:", error); renderMessage("게시글을 불러오지 못했습니다."); }
});
