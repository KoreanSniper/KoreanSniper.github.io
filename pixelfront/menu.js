import{hasSavedGame,readGame}from"./save-system.js";
import{createFirebaseRoom,joinFirebaseRoom,watchFirebaseRoom,startFirebaseRoom,leaveFirebaseRoom,cleanCode}from"./firebase-online.js";

const form=document.querySelector("#gameForm");
const seedInput=document.querySelector("#seedInput"),incomingSeed=new URLSearchParams(location.search).get("seed");
if(incomingSeed!==null&&/^\d+$/.test(incomingSeed)&&Number(incomingSeed)<=4294967295)seedInput.value=String(Number(incomingSeed));
document.querySelector("#randomSeed").onclick=()=>seedInput.value=String(crypto.getRandomValues(new Uint32Array(1))[0]);
form.addEventListener("submit",event=>{event.preventDefault();if(!form.reportValidity())return;const data=new FormData(form),params=new URLSearchParams;params.set("name",String(data.get("name")||"플레이어").trim().slice(0,14)||"플레이어");params.set("map",String(data.get("map")||"world"));params.set("ai",String(data.get("ai")||"8"));params.set("difficulty",String(data.get("difficulty")||"normal"));const seed=String(data.get("seed")||"").trim();if(seed)params.set("seed",String(Number(seed)>>>0));location.href=`./play.html?${params}`});
if(hasSavedGame()){const saved=readGame(),button=document.createElement("button");button.type="button";button.innerHTML=`이어하기 <small>${new Date(saved.savedAt).toLocaleString("ko-KR")}</small><span>→</span>`;button.style.cssText="margin-bottom:10px;background:#42a5ff;color:#061019";button.onclick=()=>location.href="./play.html?continue=1";form.prepend(button)}

const online=document.createElement("section");online.className="firebase-lobby";
online.innerHTML=`<h2>FIREBASE ONLINE</h2><p class="online-status">방을 만들거나 6자리 코드를 입력하세요.</p><div class="online-actions"><button type="button" data-create>방 만들기</button><input maxlength="6" placeholder="ROOM CODE" aria-label="방 코드"><button type="button" data-join>참가</button></div><div class="room-view hidden"><strong class="room-code"></strong><ul class="room-players"></ul><div><button type="button" data-start class="hidden">접속 확정</button><button type="button" data-leave>나가기</button></div></div>`;
online.style.cssText="margin-top:18px;padding-top:18px;border-top:1px solid #ffffff1c";
online.querySelector("h2").style.cssText="font-size:11px;letter-spacing:.15em";
online.querySelector(".online-actions").style.cssText="display:grid;grid-template-columns:1fr 1fr 70px;gap:6px";
online.querySelector("input").style.cssText="min-width:0;text-transform:uppercase";
form.after(online);
const status=online.querySelector(".online-status"),view=online.querySelector(".room-view"),codeEl=online.querySelector(".room-code"),playersEl=online.querySelector(".room-players"),start=online.querySelector("[data-start]");
let session=null,unsubscribe=null;
const settings=()=>{const data=new FormData(form),seed=String(data.get("seed")||"").trim();return{map:String(data.get("map")||"world"),difficulty:String(data.get("difficulty")||"normal"),ai:String(data.get("ai")||"8"),seed:seed?Number(seed)>>>0:null}};
function message(text,error=false){status.textContent=text;status.style.color=error?"#ff6b70":""}
function connect(result){session=result;unsubscribe?.();view.classList.remove("hidden");codeEl.textContent=`ROOM ${result.code}`;unsubscribe=watchFirebaseRoom(result.code,room=>{if(!room){message("방이 종료되었습니다.",true);view.classList.add("hidden");return}playersEl.innerHTML=(room.players||[]).map(p=>`<li>${p.host?'◆ ':''}${p.name}</li>`).join("");start.classList.toggle("hidden",room.hostId!==session.uid);if(room.status==="starting"&&room.serverSessionId){const q=new URLSearchParams({session:room.serverSessionId,room:room.code,seed:String(room.seed),map:room.settings?.map||"world",ai:room.settings?.ai||"8",difficulty:room.settings?.difficulty||"normal",name:String((room.players||[]).find(p=>p.uid===session.uid)?.name||"플레이어")});location.href=`./play.html?${q}`}else message(`${room.players?.length||0}/8명 접속 중`)},error=>message(error.message,true))}
online.querySelector("[data-create]").onclick=async()=>{try{message("Firebase에 방을 만드는 중...");connect(await createFirebaseRoom(settings()))}catch(error){message(error.message,true)}};
online.querySelector("[data-join]").onclick=async()=>{try{message("Firebase 방에 접속하는 중...");connect(await joinFirebaseRoom(online.querySelector("input").value))}catch(error){message(error.message,true)}};
online.querySelector("input").oninput=event=>event.target.value=cleanCode(event.target.value);
start.onclick=async()=>{try{await startFirebaseRoom(session.code)}catch(error){message(error.message,true)}};
online.querySelector("[data-leave]").onclick=async()=>{if(!session)return;await leaveFirebaseRoom(session.code);unsubscribe?.();session=null;view.classList.add("hidden");message("방에서 나왔습니다.")};
