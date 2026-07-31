import { auth } from "./firebase.js";
import { writeActivityLog } from "./activity-log.js";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const header = document.querySelector(".site-header");
if (header && !document.querySelector(".mobile-menu-toggle")) {
  const archive = location.pathname.match(/^(\/history\/\d{3}\/)/)?.[1] || "/";
  const links = [["HOME","index.html"],["ARCADE","minigame/index.html"],["COMMUNITY","community/index.html"],["HISTORY","history/index.html"]];
  const toggle = document.createElement("button");toggle.type="button";toggle.className="mobile-menu-toggle";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls","mobileSiteMenu");toggle.innerHTML="MENU <b>＋</b>";
  const menu = document.createElement("div");menu.id="mobileSiteMenu";menu.className="mobile-site-menu";menu.setAttribute("aria-hidden","true");menu.innerHTML=`<div><small>BLOCKRAIL / NAVIGATION</small>${links.map(([label,path],i)=>`<a href="${path==="history/index.html"?"/history/index.html":archive+path}"><span>0${i+1}</span>${label}<b>↗</b></a>`).join("")}</div>`;
  const close = force => { const open=force??!menu.classList.contains("open");menu.classList.toggle("open",open);menu.setAttribute("aria-hidden",String(!open));toggle.setAttribute("aria-expanded",String(open));toggle.innerHTML=open?"CLOSE <b>×</b>":"MENU <b>＋</b>";document.body.classList.toggle("menu-open",open) };
  toggle.addEventListener("click",()=>close());menu.addEventListener("click",event=>{if(event.target===menu)close(false)});addEventListener("keydown",event=>{if(event.key==="Escape")close(false)});header.append(toggle);document.body.append(menu);
}

if (location.pathname.includes("/minigame/")) {
  const arcadeStyle = document.createElement("link");
  arcadeStyle.rel = "stylesheet";
  arcadeStyle.href = "./frontline-card.css";
  document.head.append(arcadeStyle);
}

const host = document.querySelector("[data-global-auth]");
if (host) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const render = (user) => {
    host.replaceChildren();
    if (user) {
      const name = document.createElement("span");
      name.className = "global-auth-name";
      name.textContent = user.displayName || "Google 계정";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "로그아웃";
      button.addEventListener("click", () => signOut(auth));
      host.append(name, button);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Google 로그인";
      button.addEventListener("click", async () => {
        try {
          const result = await signInWithPopup(auth, provider);
          await writeActivityLog("signed_in", "user", result.user.uid);
        }
        catch (error) { if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") alert("Google 로그인에 실패했습니다."); }
      });
      host.appendChild(button);
    }
  };
  onAuthStateChanged(auth, render);
}
