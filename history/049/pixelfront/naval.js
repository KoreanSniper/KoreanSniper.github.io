import{RULES}from"./config.js";
import{Engine}from"./engine.js";
import{Renderer,short}from"./renderer.js";

function coastal(engine,tile){let coast=false;engine.eachNeighbor(tile,n=>{if(engine.owner[n]===-2)coast=true});return coast}
function closest(engine,tiles,target){const[tx,ty]=engine.xy(target);let best=-1,score=Infinity;for(const tile of tiles){const[x,y]=engine.xy(tile),d=(x-tx)**2+(y-ty)**2;if(d<score){score=d;best=tile}}return{tile:best,distance:Math.sqrt(score)}}
function shipyards(engine,nation){let count=0;for(const tile of(nation.buildingTiles||[]))if(engine.buildings?.[tile]===6)count++;return count}
function riverBlocks(map,from,to){const river=map.riverMask;return!!river&&((river[from]||0)>0||(river[to]||0)>0)}
function riverCrossings(engine,attacker,defender){const out=[];for(const from of(engine.nations[attacker].borderTiles||engine.nations[attacker].tiles))engine.eachNeighbor(from,to=>{if(engine.owner[to]===defender&&riverBlocks(engine.map,from,to))out.push({from,to})});return out}

export function installNaval(){
  if(Engine.prototype.launchNaval)return;
  const oldStep=Engine.prototype.step,oldBegin=Engine.prototype.begin,oldDraw=Renderer.prototype.draw;
  Engine.prototype.ensureNaval=function(){this.navalMissions??=[]};
  Engine.prototype.resolveNavalTarget=function(attacker,clicked){const direct=this.owner[clicked];if(direct===-1||direct>=0&&direct!==attacker)return{defender:direct,tile:clicked};let best=null;for(const nation of this.nations){if(nation.id===attacker||!nation.alive||!nation.tiles.size||this.relation?.(attacker,nation.id)>0)continue;const candidates=[...(nation.borderTiles||nation.tiles)].filter(tile=>coastal(this,tile)),target=closest(this,candidates.length?candidates:nation.tiles,clicked);if(target.tile>=0&&(!best||target.distance<best.distance))best={defender:nation.id,tile:target.tile,distance:target.distance}}return best};
  Engine.prototype.hasNavalReserve=function(attacker,defender){this.ensureNaval();return this.navalMissions.some(m=>m.attacker===attacker&&m.defender===defender&&m.state==="ready")};
  Engine.prototype.launchNaval=function(attacker,clicked,percent){
    this.ensureNaval();const resolved=this.resolveNavalTarget(attacker,clicked),defender=resolved?.defender,nation=this.nations[attacker];clicked=resolved?.tile??clicked;
    if(!nation?.alive||defender==null||defender===-2||defender===attacker||defender>=0&&this.relation?.(attacker,defender)>0)return{ok:false,message:"해상 공격할 수 없는 영토입니다"};
    const crossings=riverCrossings(this,attacker,defender);
    if(crossings.length){
      const[tx,ty]=this.xy(clicked);crossings.sort((a,b)=>{const[x,y]=this.xy(a.to),[u,v]=this.xy(b.to);return(x-tx)**2+(y-ty)**2-((u-tx)**2+(v-ty)**2)});
      const point=crossings[0],amount=Math.floor(nation.troops*Math.max(.05,Math.min(.9,percent/100)));if(amount<30)return{ok:false,message:"도하 병력이 부족합니다"};nation.troops-=amount;
      let mission=this.navalMissions.find(m=>m.isCrossing&&m.attacker===attacker&&m.defender===defender&&m.state==="sailing"&&m.target===point.to);
      if(mission){mission.troopQueue.push(amount);mission.troops+=amount;return{ok:true,message:`도하 Queue +${short(amount)}`}}
      mission={id:`crossing-${this.tick}-${this.navalMissions.length}`,attacker,defender,start:point.from,target:point.to,clicked,troops:amount,troopQueue:[amount],state:"sailing",started:this.tick,travelTicks:Math.max(4,Math.ceil(1200/RULES.tickMs)),progress:0,isCrossing:true};
      this.navalMissions.push(mission);return{ok:true,message:`도하 준비 · ${short(amount)}명`}
    }
    const targetTiles=defender>=0?[...(this.nations[defender].borderTiles||this.nations[defender].tiles)]:Array.from(this.owner,(owner,tile)=>owner===-1?tile:-1).filter(tile=>tile>=0),targetCoasts=targetTiles.filter(t=>coastal(this,t));
    const myCoasts=[...(nation.borderTiles||nation.tiles)].filter(t=>coastal(this,t));
    if(!targetCoasts.length||!myCoasts.length)return{ok:false,message:"출발 또는 목표 해안이 없습니다"};
    const target=closest(this,targetCoasts,clicked).tile,startInfo=closest(this,myCoasts,target),amount=Math.floor(nation.troops*Math.max(.05,Math.min(.9,percent/100)));
    if(amount<30)return{ok:false,message:"수송할 병력이 부족합니다"};
    nation.troops-=amount;
    let mission=this.navalMissions.find(m=>m.attacker===attacker&&m.defender===defender&&m.state==="sailing"&&m.target===target);
    if(mission){mission.troopQueue.push(amount);mission.troops+=amount;return{ok:true,message:`해상 수송 Queue +${short(amount)}`}}
    const navalSpeed=1+Math.min(.45,shipyards(this,nation)*.15),travelTicks=Math.max(1,Math.ceil(startInfo.distance*.2*1000/RULES.tickMs/navalSpeed));
    mission={id:`naval-${this.tick}-${this.navalMissions.length}`,attacker,defender,start:startInfo.tile,target,clicked,troops:amount,troopQueue:[amount],state:"sailing",started:this.tick,travelTicks,progress:0};
    this.navalMissions.push(mission);return{ok:true,message:`상륙함 출항 · ${short(amount)}명`}
  };
  Engine.prototype.step=function(){oldStep.call(this);this.ensureNaval();for(const m of this.navalMissions){if(m.state!=="sailing")continue;m.progress=Math.min(1,(this.tick-m.started)/m.travelTicks);if(m.progress>=1)m.state="ready"}};
  Engine.prototype.begin=function(c){
    if(c.type==="attack"){this.ensureNaval();const target=c.targetOwner,mission=this.navalMissions.find(m=>m.attacker===c.playerId&&m.defender===target&&m.state==="ready");if(mission){
      const nation=this.nations[c.playerId],extra=Math.floor(nation.troops*Math.max(.05,Math.min(.9,c.percent/100)));if(extra>=30)nation.troops-=extra;
      const power=mission.troops+(extra>=30?extra:0),fallbackTiles=target>=0?[...(this.nations[target].borderTiles||this.nations[target].tiles)].filter(t=>coastal(this,t)):Array.from(this.owner,(owner,tile)=>owner===-1&&coastal(this,tile)?tile:-1).filter(tile=>tile>=0),landing=mission.isCrossing?mission.target:(this.owner[mission.target]===target?mission.target:closest(this,fallbackTiles,mission.target).tile);
      if(landing<0)return;const defender=target>=0?this.nations[target]:null,cost=defender?Math.max(12,Math.ceil(defender.troops/Math.max(1,defender.tiles.size))):RULES.neutralCost;
      if(power<=cost)return;if(defender)defender.troops=Math.max(0,defender.troops-cost);this.transfer(landing,c.playerId);
      this.attacks.push({id:`landing-${this.tick}-${this.attacks.length}`,attacker:c.playerId,defender:target,target:landing,committed:power,power:power-cost,front:new Set([landing]),captured:1,alive:true,isNaval:true,isCrossing:!!mission.isCrossing,reinforcementQueue:[],queuedTroops:0});
      mission.state="landed";mission.troops=0;mission.troopQueue=[];return
    }}oldBegin.call(this,c)
  };
  Renderer.prototype.draw=function(){oldDraw.call(this);const e=this.e;e.ensureNaval?.();if(!e.navalMissions)return;const c=this.ctx;
    for(const m of e.navalMissions){if(m.attacker!==0||m.state==="landed")continue;const[a,b]=e.xy(m.start),[x,y]=e.xy(m.target),t=m.state==="ready"?1:m.progress,q=this.point(a+(x-a)*t+.5,b+(y-b)*t+.5);c.fillStyle="#42a5ff";c.beginPath();c.arc(q.x,q.y,Math.max(3,Math.min(6,q.s*1.2)),0,Math.PI*2);c.fill();c.font="700 9px Inter";c.textAlign="center";c.fillText(short(m.troops),q.x,q.y-8)}
    for(const a of e.attacks){if(a.attacker!==0||!a.isNaval||!a.front.size)continue;let sx=0,sy=0;for(const tile of a.front){const[x,y]=e.xy(tile);sx+=x;sy+=y}const q=this.point(sx/a.front.size+.5,sy/a.front.size+.5);c.font="800 9px Inter";c.textAlign="center";c.lineWidth=3;c.strokeStyle="#061019";c.strokeText(short(a.power),q.x,q.y-7);c.fillStyle="#42a5ff";c.fillText(short(a.power),q.x,q.y-7)}
  }
}
