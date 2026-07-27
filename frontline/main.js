import{RULES}from"./config.js";
import{Engine}from"./engine.js";
import{makeMap}from"./map.js";
import"./victory.js";
import{Bots}from"./ai.js";
import{Renderer,short}from"./renderer.js";
import"./visibility.js";
import{installDiplomacy}from"./diplomacy.js";
import{installQueueUI}from"./queue-ui.js";
import{installNaval}from"./naval.js";
import{installTerrainVisual}from"./terrain-visual.js";
import{installBuildings}from"./buildings.js";
import{installStrategicCities,updateCityUI}from"./objectives.js";
import{installTimeControls}from"./time-controls.js";
import{installMissions}from"./missions.js";
import{installCombatFeed,updateCombatFeedUI}from"./combat-feed.js";
import{installMobileControls}from"./mobile-controls.js";
import{installAchievements,updateAchievementUI}from"./achievements.js";
import{installCommanders,updateCommanderUI}from"./commanders.js";
import{installEspionage,updateEspionageUI}from"./espionage.js";
import{readGame,saveGame,restoreGame,exportGameFile,importGameFile}from"./save-system.js";
import{PixelFrontServer,decodeOwnerSnapshot}from"./sites-game-server.js";

const $=s=>document.querySelector(s),canvas=$("#game"),params=new URLSearchParams(location.search);
const savedData=params.get("continue")==="1"?readGame():null,savedOpts=savedData?.opts||{};
const seedParam=params.get("seed"),urlSeed=seedParam!==null&&/^\d+$/.test(seedParam)&&Number(seedParam)<=4294967295?Number(seedParam)>>>0:null;
const opts={name:(savedOpts.name||params.get("name")||"플레이어").slice(0,14),mapType:savedData?.mapType||(["world","pangaea"].includes(params.get("map"))?params.get("map"):"world"),aiCount:Math.max(1,Math.min(50,+savedOpts.aiCount||+params.get("ai")||8)),difficulty:["easy","normal","hard"].includes(savedOpts.difficulty)?savedOpts.difficulty:(["easy","normal","hard"].includes(params.get("difficulty"))?params.get("difficulty"):"normal")};
const selectedSeed=savedData?.seed??urlSeed??crypto.getRandomValues(new Uint32Array(1))[0],loadingStages=["terrain","erosion","rivers","finalize"];
function loadingProgress(stage,percent){const current=loadingStages.indexOf(stage);$("#loadingFill").style.width=`${percent}%`;$("#loadingPercent").textContent=`${percent}%`;document.querySelectorAll("#mapLoading [data-stage]").forEach((item,index)=>{const done=index<current||percent>=100,active=index===current&&percent<100;item.classList.toggle("done",done);item.classList.toggle("active",active);item.querySelector("b").textContent=done?"✅":active?"⌛":"▢"})}
async function generateMap(seed,mapType){loadingProgress("terrain",2);if(typeof Worker==="undefined"){await new Promise(requestAnimationFrame);const map=makeMap(seed,mapType,loadingProgress);loadingProgress("finalize",100);return map}return new Promise((resolve,reject)=>{const worker=new Worker(new URL("./map-worker.js",import.meta.url),{type:"module"});worker.onmessage=event=>{const message=event.data;if(message.type==="progress")loadingProgress(message.stage,message.percent);else if(message.type==="complete"){loadingProgress("finalize",100);setTimeout(()=>{worker.terminate();resolve(message.map)},180)}else if(message.type==="error"){worker.terminate();reject(new Error(message.message))}};worker.onerror=error=>{worker.terminate();reject(error)};worker.postMessage({seed,mapType})})}
const generatedMap=await generateMap(selectedSeed,opts.mapType);
let e=new Engine({map:generatedMap,seed:selectedSeed,...opts}),r=new Renderer(canvas,e),b=new Bots(e,opts.difficulty),timer,percent=25,drag=false,moved=false,last={x:0,y:0};
const gameServer=new PixelFrontServer();
const gameServerReady=gameServer.create({seed:selectedSeed,mapType:opts.mapType,name:opts.name,aiCount:opts.aiCount,difficulty:opts.difficulty}).catch(error=>{toast("서버 연결이 필요합니다. 로그인 상태를 확인하세요.");console.warn("PIXELFRONT server unavailable",error);return null});
const issueLocal=e.issue.bind(e);
let authoritySync=null,syncBusy=false;
function applyAuthority(state){
  if(!state?.nations)return;
  if(state.ownerSnapshot){
    const owner=decodeOwnerSnapshot(state.ownerSnapshot,e.owner.length);e.changedTiles??=new Set;
    for(let i=0;i<owner.length;i++)if(e.owner[i]!==owner[i]){e.transfer(i,owner[i]);e.changedTiles.add(i)}
    r.visionTick=-1
  }
  for(const saved of state.nations){const nation=e.nations[saved.id];if(!nation)continue;nation.troops=saved.troops;nation.spawn=saved.spawn;nation.alive=saved.alive}
  e.tick=Math.max(e.tick,state.tick||0);e.running=state.running!==false;e.winner=state.winner??null
}
async function syncAuthority(){if(syncBusy||!gameServer.sessionId)return;syncBusy=true;try{applyAuthority((await gameServer.state(true)).state)}catch(error){console.warn("PIXELFRONT sync failed",error)}finally{syncBusy=false}}
function startAuthoritySync(){if(!authoritySync)authoritySync=setInterval(syncAuthority,1000)}
e.issue=command=>{if(command.playerId!==0)return issueLocal(command);gameServerReady.then(session=>{if(!session)throw new Error("SERVER_UNAVAILABLE");return gameServer.command(command)}).then(result=>{applyAuthority(result.state);issueLocal(command)}).catch(error=>{toast("서버가 명령을 거부했습니다.");console.warn("PIXELFRONT command rejected",error)});return true};
$("#seedLabel").textContent=`SEED ${e.map.seed>>>0}`;
const queueUI=installQueueUI(e);
installNaval();
installTerrainVisual();
installDiplomacy(canvas,e,r,toast,()=>percent);
installBuildings(canvas,e,r,toast);
installStrategicCities(e,r,toast);
const timeControls=installTimeControls(e);
installMissions(e,toast);
installCombatFeed(e,toast);
installMobileControls(canvas,e);
installAchievements(e,toast);
installCommanders(e,toast);
installEspionage(e,r,toast);
const saveTools=document.createElement("div");saveTools.className="file-save-tools";saveTools.innerHTML='<button type="button" data-save>PXFO 저장</button><button type="button" data-load>PXFO 불러오기</button><input type="file" accept=".pxfo,application/x-pixelfront+json" hidden>';document.querySelector(".game-shell").append(saveTools);saveTools.querySelector("[data-save]").onclick=()=>{try{exportGameFile(e,opts);toast(".pxfo 저장 파일을 만들었습니다")}catch(error){toast(error.message)}};const fileInput=saveTools.querySelector("input");saveTools.querySelector("[data-load]").onclick=()=>fileInput.click();fileInput.onchange=async()=>{try{await importGameFile(fileInput.files?.[0]);location.href="./play.html?continue=1"}catch(error){toast(error.message)}finally{fileInput.value=""}};
const resumed=restoreGame(e,savedData);e.renderMission?.();if(!resumed)for(let i=1;i<e.nations.length;i++)e.autoSpawn(i);
r.draw();
$("#mapLoading").classList.add("hidden");if(!resumed)$("#spawnPanel").classList.remove("hidden");
if(resumed){$("#spawnPanel").classList.add("hidden");["#hud","#leaderboard","#attackControl","#mapHelp"].forEach(x=>$(x).classList.remove("hidden"));queueUI.show();timeControls.show();ui();timer=setInterval(()=>{b.step();e.step();ui();r.draw();if(!e.spectating&&!e.nations[0].alive)finish(true);else if(e.winner!==null)finish(false)},RULES.tickMs)}
const idleSave=()=>{if(!e.running)return;const run=()=>saveGame(e,opts);if("requestIdleCallback"in window)requestIdleCallback(run,{timeout:4000});else setTimeout(run,0)};setInterval(idleSave,30000);addEventListener("beforeunload",()=>{if(e.running)saveGame(e,opts)});

async function deploy(i){
  try{const session=await gameServerReady;if(!session)throw new Error("SERVER_UNAVAILABLE");const result=await gameServer.spawn(i);applyAuthority(result.state)}
  catch(error){toast("서버가 시작 위치를 거부했습니다.");console.warn("PIXELFRONT spawn rejected",error);return}
  if(e.nations[0].spawn<0&&!e.spawn(0,i)){toast("해안과 다른 국가에서 떨어진 땅을 선택하세요");return}
  e.start();startAuthoritySync();r.visionTick=-1;r.visible.fill(0);r.draw();
  $("#spawnPanel").classList.add("hidden");
  ["#hud","#leaderboard","#attackControl","#mapHelp"].forEach(x=>$(x).classList.remove("hidden"));
  queueUI.show();timeControls.show();ui();
  timer=setInterval(()=>{b.step();e.step();ui();r.draw();if(!e.spectating&&!e.nations[0].alive)finish(true);else if(e.winner!==null)finish(false)},RULES.tickMs)
}
function ui(){
  if(e.tick&&e.tick%4)return;
  updateCityUI(e);
  updateCombatFeedUI(e);
  updateAchievementUI(e);
  updateCommanderUI(e);
  updateEspionageUI(e);
  const me=e.nations[0],rank=[...e.nations].sort((a,z)=>z.tiles.size-a.tiles.size),sec=e.tick*RULES.tickMs/1000|0;
  $("#troops").textContent=short(me.troops)+" / "+short(RULES.popBase+me.tiles.size*RULES.popPerTile);
  $("#territory").textContent=me.tiles.size.toLocaleString();
  $("#rank").textContent=(rank.findIndex(n=>n.id===0)+1)+" / "+e.nations.filter(n=>n.alive).length;
  $("#time").textContent=String(sec/60|0).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");
  $("#alive").textContent=e.nations.filter(n=>n.alive).length+" ALIVE";
  $("#ranking").innerHTML=rank.slice(0,12).map((n,i)=>`<li class="${n.id===0?'me':''}"><span>${i+1}</span><span><i style="background:${n.color};display:inline-block;margin-right:7px"></i>${n.name}</span><small>${n.alive?n.tiles.size:'제거됨'}</small></li>`).join("");
  queueUI.update()
}
function toast(text){const el=$("#toast");el.textContent=text;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1600)}
function finish(defeated=false){clearInterval(timer);const won=!defeated&&e.winner===0,result=$("#result"),replay=$("#replay"),menuLink=result.querySelector("a");$("#resultTitle").textContent=won?"승리":"패배";$("#resultText").textContent=won?"지도의 95%를 점령했습니다.":"모든 영토를 잃어 국가가 제거되었습니다.";let button=$("#continueGame");if(!button){button=document.createElement("button");button.id="continueGame";button.style.background="#42a5ff";result.insertBefore(button,replay)}e.renderAfterAction?.(result);button.textContent=defeated?"관전하기":"계속하기";button.onclick=()=>{e.continueAfterVictory=true;e.spectating=defeated;e.winner=null;e.running=true;result.classList.add("hidden");timer=setInterval(()=>{b.step();e.step();ui();r.draw()},RULES.tickMs)};if(defeated){replay.textContent="메뉴로";replay.onclick=()=>location.href="./menu.html";menuLink.style.display="none"}else{replay.textContent="같은 설정으로 다시";replay.onclick=()=>location.reload();menuLink.style.display="block"}result.classList.remove("hidden")}
$("#randomSpawn").onclick=()=>{for(let n=0;n<5000;n++){const i=e.random()*e.owner.length|0;if(e.validSpawn(i)){deploy(i);break}}};
$("#replay").onclick=()=>location.reload();
$("#attackPercent").oninput=x=>setPercent(+x.target.value);
document.querySelectorAll("[data-percent]").forEach(x=>x.onclick=()=>setPercent(+x.dataset.percent));
function setPercent(v){percent=v;$("#attackPercent").value=v;$("#percentText").textContent=v+"%";document.querySelectorAll("[data-percent]").forEach(x=>x.classList.toggle("active",+x.dataset.percent===v))}
canvas.onpointerdown=x=>{if(x.button===2)return;drag=true;moved=false;last={x:x.clientX,y:x.clientY};canvas.setPointerCapture(x.pointerId)};
canvas.onpointermove=x=>{if(!drag)return;const dx=x.clientX-last.x,dy=x.clientY-last.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(moved){r.camera.x+=dx;r.camera.y+=dy;r.draw()}last={x:x.clientX,y:x.clientY}};
canvas.onpointerup=x=>{if(x.button===2)return;if(e.suppressNextTap){e.suppressNextTap=false;drag=false;return}drag=false;if(moved)return;const box=canvas.getBoundingClientRect(),i=r.tile(x.clientX-box.left,x.clientY-box.top);if(!e.running)deploy(i);else if(i>=0&&!r.visible[i]){toast("현재 확인되지 않은 지역입니다");return}else if(i>=0&&e.owner[i]!==0&&e.owner[i]!==-2){const target=e.owner[i],land=e.sharedBorder(0,target).length>0,landing=e.hasNavalReserve?.(0,target);if(!land&&!landing){toast("공격 경로를 확보할 수 없습니다");return}if(!e.issue({type:"attack",playerId:0,targetOwner:target,percent})){toast("현재 공격할 수 없습니다");return}toast(landing&&!land?"상륙 공격 명령 추가":"목표 국가 공격 명령 추가")}};
canvas.onwheel=x=>{x.preventDefault();r.camera.z=Math.max(.7,Math.min(10,r.camera.z*(x.deltaY>0?.88:1.13)));r.draw()};
