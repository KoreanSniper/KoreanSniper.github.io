import{RULES}from"./config.js";

export class Bots {
  constructor(engine,difficulty="normal") {
    this.e=engine;
    this.difficulty=difficulty;
    this.every=difficulty==="hard"?14:difficulty==="easy"?46:32;this.lastTick=-1;this.nextTick=this.every;
  }
  step() {
    if(this.e.timeScale===0||this.lastTick===this.e.tick)return;this.lastTick=this.e.tick;if(this.e.tick<this.nextTick)return;this.nextTick=this.e.tick+this.every;
    const easy=this.difficulty==="easy",hard=this.difficulty==="hard",actionChance=easy?.2:hard?.82:.42,reserveRatio=easy?.64:hard?.25:.42;
    for(const n of this.e.nations){
      if(!n.ai||!n.alive||this.e.random()>actionChance)continue;
      const max=RULES.popBase+n.tiles.size*RULES.popPerTile;
      if(n.troops<max*reserveRatio)continue;
      const targets=new Map, border=n.borderTiles||n.tiles;
      for(const i of border)this.e.eachNeighbor(i,t=>{const o=this.e.owner[t];if(o!==n.id&&o!==-2&&!targets.has(o))targets.set(o,t)});
      if(!targets.size)continue;
      const list=[...targets.entries()],neutral=list.find(x=>x[0]===-1),incoming=hard?this.e.attacks.filter(a=>a.alive!==false&&a.defender===n.id).sort((a,b)=>b.power-a.power)[0]:null;
      const score=([id])=>id<0?0:(this.e.nations[id].troops+this.e.nations[id].tiles.size*7)/(incoming?.attacker===id?2.6:1);
      const pick=neutral&&this.e.random()<(easy?.86:hard?.38:.68)?neutral:list.filter(x=>x[0]!==-1).sort((a,b)=>score(a)-score(b))[0]||neutral;
      const percent=pick[0]===-1?(easy?10+this.e.random()*10:hard?26+this.e.random()*18:18+this.e.random()*15):(easy?12+this.e.random()*12:hard?38+this.e.random()*32:24+this.e.random()*26);
      this.e.issue({type:"attack",playerId:n.id,target:pick[1],targetOwner:pick[0],percent});
      if(hard&&n.troops>max*.7&&list.length>1&&this.e.random()<.42){const second=list.find(x=>x[0]!==pick[0]);if(second)this.e.issue({type:"attack",playerId:n.id,target:second[1],targetOwner:second[0],percent:18+this.e.random()*16})}
    }
  }
}
