import{RULES}from"./config.js";
import{Engine}from"./engine.js";
import{Renderer,short}from"./renderer.js";

function coastal(engine,tile){let coast=false;engine.eachNeighbor(tile,n=>{if(engine.owner[n]===-2)coast=true});return coast}
function closest(engine,tiles,target){const[tx,ty]=engine.xy(target);let best=-1,score=Infinity;for(const tile of tiles){const[x,y]=engine.xy(tile),d=(x-tx)**2+(y-ty)**2;if(d<score){score=d;best=tile}}return{tile:best,distance:Math.sqrt(score)}}
function shipyards(engine,nation){let count=0;for(const tile of(nation.buildingTiles||[]))if(engine.buildings?.[tile]===6)count++;return count}
function riverBlocks(map,from,to){const river=map.riverMask;return!!river&&((river[from]||0)>0||(river[to]||0)>0)}
function riverCrossings(engine,attacker,defender){const out=[];for(const from of(engine.nations[attacker].borderTiles||engine.nations[attacker].tiles))engine.eachNeighbor(from,to=>{if(engine.owner[to]===defender&&riverBlocks(engine.map,from,to))out.push({from,to})});return out}
function seaRoute(engine,starts,targets){const goals=new Map,seeds=new Map;for(const coast of targets)engine.eachNeighbor(coast,water=>{if(engine.owner[water]===-2&&!goals.has(water))goals.set(water,coast)});for(const coast of starts)engine.eachNeighbor(coast,water=>{if(engine.owner[water]===-2&&!seeds.has(water))seeds.set(water,coast)});if(!goals.size||!seeds.size)return null;const seen=new Uint8Array(engine.owner.length),parent=new Int32Array(engine.owner.length).fill(-1),queue=new Int32Array(engine.owner.length);let head=0,tail=0;for(const water of seeds.keys()){seen[water]=1;queue[tail++]=water}while(head<tail){const tile=queue[head++],goal=goals.get(tile);if(goal!==undefined){const water=[];for(let at=tile;at>=0;at=parent[at])water.push(at);water.reverse();const start=seeds.get(water[0]),route=[start,...water,goal];return{start,target:goal,route,distance:route.length-1}}engine.eachNeighbor(tile,next=>{if(!seen[next]&&engine.owner[next]===-2){seen[next]=1;parent[next]=tile;queue[tail++]=next}})}return null}
function routePosition(engine,route,progress){if(!route?.length)return null;const position=Math.max(0,Math.min(route.length-1,progress*(route.length-1))),index=Math.min(route.length-2,Math.floor(position)),t=position-index,[ax,ay]=engine.xy(route[index]),[bx,by]=engine.xy(route[index+1]);return{x:ax+(bx-ax)*t+.5,y:ay+(by-ay)*t+.5,angle:Math.atan2(by-ay,bx-ax)}}

export function installNaval(){
  if(Engine.prototype.launchNaval)return;
  const oldStep=Engine.prototype.step,oldBegin=Engine.prototype.begin,oldDraw=Renderer.prototype.draw;
  Engine.prototype.ensureNaval=function(){this.navalMissions??=[]};
  Engine.prototype.resolveNavalTarget=function(attacker,clicked){const direct=this.owner[clicked];if(direct===-1||direct>=0&&direct!==attacker)return{defender:direct,tile:clicked};let best=null;for(const nation of this.nations){if(nation.id===attacker||!nation.alive||!nation.tiles.size||this.relation?.(attacker,nation.id)>0)continue;const candidates=[...nation.tiles].filter(tile=>coastal(this,tile)),target=closest(this,candidates.length?candidates:nation.tiles,clicked);if(target.tile>=0&&(!best||target.distance<best.distance))best={defender:nation.id,tile:target.tile,distance:target.distance}}return best};
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
    const targetTiles=defender>=0?[...this.nations[defender].tiles]:Array.from(this.owner,(owner,tile)=>owner===-1?tile:-1).filter(tile=>tile>=0),targetCoasts=targetTiles.filter(t=>coastal(this,t));
    const myCoasts=[...nation.tiles].filter(t=>coastal(this,t));
    if(!targetCoasts.length||!myCoasts.length)return{ok:false,message:"출발 또는 목표 해안이 없습니다"};
    targetCoasts.sort((a,b)=>closest(this,[a],clicked).distance-closest(this,[b],clicked).distance);const passage=seaRoute(this,myCoasts,targetCoasts),amount=Math.floor(nation.troops*Math.max(.05,Math.min(.9,percent/100)));
    if(!passage)return{ok:false,message:"연결된 바닷길이 없습니다"};const target=passage.target;
    if(amount<30)return{ok:false,message:"수송할 병력이 부족합니다"};
    nation.troops-=amount;
    let mission=this.navalMissions.find(m=>m.attacker===attacker&&m.defender===defender&&m.state==="sailing"&&m.target===target);
    if(mission){mission.troopQueue.push(amount);mission.troops+=amount;return{ok:true,message:`해상 수송 Queue +${short(amount)}`}}
    const navalSpeed=1+Math.min(.45,shipyards(this,nation)*.15),travelTicks=Math.max(1,Math.ceil(passage.distance*.2*1000/RULES.tickMs/navalSpeed));
    mission={id:`naval-${this.tick}-${this.navalMissions.length}`,attacker,defender,start:passage.start,target,route:passage.route,clicked,troops:amount,troopQueue:[amount],state:"sailing",started:this.tick,travelTicks,progress:0};
    this.navalMissions.push(mission);return{ok:true,message:`상륙함 출항 · ${short(amount)}명`}
  };
  Engine.prototype.step=function(){oldStep.call(this);this.ensureNaval();const arrived=[];for(const m of this.navalMissions){if(m.state!=="sailing")continue;m.progress=Math.min(1,(this.tick-m.started)/m.travelTicks);if(m.progress>=1){m.state="ready";arrived.push(m)}}for(const m of arrived)this.begin({type:"attack",playerId:m.attacker,target:m.target,targetOwner:m.defender,percent:0,navalArrival:true})};
  Engine.prototype.begin=function(c){
    if(c.type==="attack"){this.ensureNaval();const target=c.targetOwner,mission=this.navalMissions.find(m=>m.attacker===c.playerId&&m.defender===target&&m.state==="ready");if(mission){
      const nation=this.nations[c.playerId],extra=c.navalArrival?0:Math.floor(nation.troops*Math.max(.05,Math.min(.9,c.percent/100)));if(extra>=30)nation.troops-=extra;
      const power=mission.troops+(extra>=30?extra:0),fallbackTiles=target>=0?[...this.nations[target].tiles].filter(t=>coastal(this,t)):Array.from(this.owner,(owner,tile)=>owner===-1&&coastal(this,tile)?tile:-1).filter(tile=>tile>=0),landing=mission.isCrossing?mission.target:(this.owner[mission.target]===target?mission.target:closest(this,fallbackTiles,mission.target).tile);
      if(landing<0)return;const defender=target>=0?this.nations[target]:null,cost=defender?Math.max(12,Math.ceil(defender.troops/Math.max(1,defender.tiles.size))):RULES.neutralCost;
      if(power<=cost)return;if(defender)defender.troops=Math.max(0,defender.troops-cost);this.transfer(landing,c.playerId);
      this.attacks.push({id:`landing-${this.tick}-${this.attacks.length}`,attacker:c.playerId,defender:target,target:landing,committed:power,power:power-cost,front:new Set([landing]),captured:1,alive:true,isNaval:true,isCrossing:!!mission.isCrossing,reinforcementQueue:[],queuedTroops:0});
      mission.state="landed";mission.troops=0;mission.troopQueue=[];return
    }}oldBegin.call(this,c)
  };
  Renderer.prototype.draw=function(){oldDraw.call(this);const e=this.e;e.ensureNaval?.();if(!e.navalMissions)return;const c=this.ctx,now=performance.now();
    for(const m of e.navalMissions){if(m.attacker!==0||m.state==="landed")continue;if(!m.isCrossing&&!m.route)m.route=seaRoute(e,[m.start],[m.target])?.route;if(!m.route)m.route=[m.start,m.target];const t=m.state==="ready"?1:m.progress,pos=routePosition(e,m.route,t);if(!pos)continue;const q=this.point(pos.x,pos.y),size=Math.max(7,Math.min(13,q.s*2.1));c.save();c.strokeStyle="#42a5ff88";c.lineWidth=1.4;c.setLineDash([4,6]);c.lineDashOffset=-now*.02;c.beginPath();for(let i=0;i<m.route.length;i++){const[x,y]=e.xy(m.route[i]),point=this.point(x+.5,y+.5);if(i)c.lineTo(point.x,point.y);else c.moveTo(point.x,point.y)}c.stroke();c.setLineDash([]);c.translate(q.x,q.y);c.rotate(pos.angle);c.strokeStyle="#8fd0ff";c.lineWidth=1.5;c.fillStyle=m.state==="ready"?"#c8ff3d":"#42a5ff";c.beginPath();c.moveTo(size,0);c.lineTo(-size*.7,-size*.55);c.lineTo(-size*.38,0);c.lineTo(-size*.7,size*.55);c.closePath();c.fill();c.stroke();if(m.state==="sailing"){c.strokeStyle="#bce4ff99";c.lineWidth=1;c.beginPath();c.moveTo(-size*.65,-size*.32);c.lineTo(-size*1.15,-size*.55);c.moveTo(-size*.65,size*.32);c.lineTo(-size*1.15,size*.55);c.stroke()}c.restore();c.font="800 9px Inter";c.textAlign="center";c.lineWidth=3;c.strokeStyle="#061019";c.strokeText(short(m.troops),q.x,q.y-size-4);c.fillStyle=m.state==="ready"?"#c8ff3d":"#8fd0ff";c.fillText(short(m.troops),q.x,q.y-size-4)}
    for(const a of e.attacks){if(a.attacker!==0||!a.isNaval||!a.front.size)continue;let sx=0,sy=0;for(const tile of a.front){const[x,y]=e.xy(tile);sx+=x;sy+=y}const q=this.point(sx/a.front.size+.5,sy/a.front.size+.5);c.font="800 9px Inter";c.textAlign="center";c.lineWidth=3;c.strokeStyle="#061019";c.strokeText(short(a.power),q.x,q.y-7);c.fillStyle="#42a5ff";c.fillText(short(a.power),q.x,q.y-7)}
  }
}
