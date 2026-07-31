import{short}from"./renderer.js";

export function installQueueUI(engine){
  const style=document.createElement("style");
  style.textContent=`.attack-queue{position:absolute;z-index:7;left:18px;top:92px;width:305px;max-height:calc(100% - 190px);overflow:hidden;background:#08111aee;border:1px solid var(--line);backdrop-filter:blur(12px)}.attack-queue header{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:11px 13px;border-bottom:1px solid var(--line);font-size:7px;letter-spacing:.13em;color:#89949e}.attack-queue header b{color:var(--acid)}.queue-collapse{border:0;background:none;color:#89949e;padding:0;cursor:pointer;font-size:11px}.attack-queue.collapsed .queue-list{display:none}.queue-list{max-height:calc(100vh - 265px);overflow:auto}.queue-empty{margin:0;padding:18px 13px;color:#697580;font-size:9px;text-align:center}.queue-item{padding:11px 13px;border-bottom:1px solid #ffffff12}.queue-head{display:grid;grid-template-columns:8px 1fr auto;gap:8px;align-items:center}.queue-head i{width:7px;height:7px;border-radius:50%}.queue-item strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.queue-head span{font-size:7px;color:var(--acid)}.queue-item.paused{background:#ffc8570b}.queue-item.incoming{background:#ff3f4d0b;border-left:2px solid #ff5361}.queue-stats{display:flex;justify-content:space-between;margin:8px 0 6px;color:#77838e;font-size:8px}.queue-stats b{color:#dbe1e5}.queue-forecast{display:flex;justify-content:space-between;margin:0 0 7px;font-size:7px;color:#687681}.queue-forecast b{color:#aeb9c0}.queue-bar{height:3px;background:#ffffff12;overflow:hidden}.queue-bar i{display:block;height:100%;background:var(--acid)}.front-actions{display:flex;gap:5px;margin-top:9px}.front-actions button{flex:1;border:1px solid #ffffff1c;background:#ffffff08;color:#b8c2ca;padding:6px 4px;font:700 7px Inter;cursor:pointer}.front-actions button:hover{border-color:var(--acid);color:var(--acid)}.front-actions .retreat{color:#ff7079}.returning{padding:8px 13px;color:#f5c65b;font-size:8px;border-bottom:1px solid #ffffff12}@media(max-width:700px){.attack-queue{left:8px;top:112px;width:245px;max-height:260px}.queue-list{max-height:225px}.queue-item{padding:9px}.queue-stats{display:none}}`;
  document.head.append(style);
  const panel=document.createElement("aside");panel.className="attack-queue hidden";
  panel.innerHTML=`<header><span>FRONT COMMAND</span><b>0개 명령</b><button class="queue-collapse" type="button" aria-label="전선 패널 접기">−</button></header><div class="queue-list"><p class="queue-empty">진행 중인 전선이 없습니다</p></div>`;
  document.querySelector(".game-shell").append(panel);
  const total=panel.querySelector("header b"),list=panel.querySelector(".queue-list");
  const returning=[];
  panel.querySelector(".queue-collapse").onclick=event=>{event.stopPropagation();const collapsed=panel.classList.toggle("collapsed");event.currentTarget.textContent=collapsed?"+":"−";event.currentTarget.setAttribute("aria-label",collapsed?"전선 패널 펼치기":"전선 패널 접기")};

  panel.addEventListener("click",event=>{
    const button=event.target.closest("button[data-front]");if(!button)return;
    const attack=engine.attacks.find(a=>a.id===button.dataset.front&&a.attacker===0);if(!attack)return;
    if(button.dataset.action==="pause"){engine.authorityCommand?.({type:"pause",frontId:attack.id,targetOwner:attack.defender});attack.paused=!attack.paused;api.update();return}
    engine.authorityCommand?.({type:"retreat",frontId:attack.id,targetOwner:attack.defender});
    const troops=Math.max(0,Math.floor(attack.power+(attack.queuedTroops||0)));
    attack.alive=false;engine.attacks=engine.attacks.filter(a=>a!==attack);
    const order={troops,readyAt:Date.now()+5000};returning.push(order);
    setTimeout(()=>{const index=returning.indexOf(order);if(index>=0)returning.splice(index,1);const nation=engine.nations[0];if(nation?.alive)nation.troops+=troops;api.update()},5000);
    api.update();
  });

  const api={show(){panel.classList.remove("hidden")},update(){
    const attacks=engine.attacks.filter(a=>a.attacker===0&&a.alive!==false),incoming=engine.attacks.filter(a=>a.defender===0&&a.alive!==false);
    total.textContent=`${attacks.length}개 전선`;
    const returningHtml=returning.map(r=>`<div class="returning">철수 병력 ${short(r.troops)} · ${Math.max(1,Math.ceil((r.readyAt-Date.now())/1000))}초 후 복귀</div>`).join("");
    const incomingHtml=incoming.map(a=>{const nation=engine.nations[a.attacker],defense=engine.nations[0].troops,ratio=a.power/Math.max(1,defense),threat=ratio>1.35?'위험':ratio>.75?'대등':'방어 우세';return`<article class="queue-item incoming"><div class="queue-head"><i style="background:${nation?.color||'#ff5361'}"></i><strong>${nation?.name||'적 국가'}</strong><span>${threat}</span></div><div class="queue-stats"><span>공격 <b>${short(a.power)}</b></span><span>방어 <b>${short(defense)}</b></span></div><div class="queue-forecast"><span>적 전력비 <b>${ratio.toFixed(2)}</b></span><span>교전 중</span></div></article>`}).join("");
    const landHtml=attacks.map(a=>{const nation=a.defender<0?null:engine.nations[a.defender],target=nation?.name||"중립 영토",waiting=a.queuedTroops||0,defense=nation?.troops||Math.max(1,a.power),ratio=a.power/Math.max(1,defense),balance=a.defender<0?'확장':ratio>1.35?'우세':ratio>.75?'대등':'열세',width=Math.min(100,Math.max(3,a.power/Math.max(1,a.committed+waiting)*100)),sample=a.feedbackSample||(a.feedbackSample={tick:engine.tick,captured:a.captured||0,rate:0}),elapsed=Math.max(1,engine.tick-sample.tick),delta=Math.max(0,(a.captured||0)-sample.captured);if(elapsed>=12){sample.rate=sample.rate?sample.rate*.65+delta/elapsed*.35:delta/elapsed;sample.tick=engine.tick;sample.captured=a.captured||0}const remaining=nation?.tiles.size||0,eta=a.paused?'정지됨':sample.rate>.002&&remaining?`${Math.max(1,Math.ceil(remaining/sample.rate*80/1000))}초`:'측정 중';return`<article class="queue-item ${a.paused?'paused':''}"><div class="queue-head"><i style="background:${nation?.color||'#69736f'}"></i><strong>${target}</strong><span>${a.paused?'일시정지':balance}</span></div><div class="queue-stats"><span>전선 <b>${short(a.power)}</b></span><span>대기 <b>${short(waiting)}</b></span><span>방어 <b>${short(defense)}</b></span></div><div class="queue-forecast"><span>전력비 <b>${ratio.toFixed(2)}</b></span><span>예상 ${eta}</span></div><div class="queue-bar"><i style="width:${width}%"></i></div><div class="front-actions"><button data-front="${a.id}" data-action="pause">${a.paused?'재개':'일시정지'}</button><button class="retreat" data-front="${a.id}" data-action="retreat">철수</button></div></article>`}).join("");
    list.innerHTML=returningHtml+incomingHtml+landHtml||`<p class="queue-empty">진행 중인 전선이 없습니다</p>`;
  }};
  return api;
}
