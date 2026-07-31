import{RULES}from"./config.js";

export class Bots {
  constructor(engine,difficulty="normal") {
    this.e=engine;
    this.difficulty=difficulty;
    this.every=difficulty==="hard"?22:difficulty==="easy"?46:32;this.lastTick=-1;this.nextTick=this.every;
  }
  step() {
    if(this.e.timeScale===0||this.lastTick===this.e.tick)return;this.lastTick=this.e.tick;if(this.e.tick<this.nextTick)return;this.nextTick=this.e.tick+this.every;
    const easy=this.difficulty==="easy",hard=this.difficulty==="hard",actionChance=easy?.2:hard?.55:.42,reserveRatio=easy?.64:hard?.34:.42;
    for(const n of this.e.nations){
      if(!n.ai||!n.alive||this.e.random()>actionChance)continue;
      const max=RULES.popBase+n.tiles.size*RULES.popPerTile;
      if(n.troops<max*reserveRatio)continue;
      const targets=new Map, border=n.borderTiles||n.tiles;
      for(const i of border)this.e.eachNeighbor(i,t=>{const o=this.e.owner[t];if(o!==n.id&&o!==-2&&!targets.has(o))targets.set(o,t)});
      if(!targets.size)continue;
      const list=[...targets.entries()],neutral=list.find(x=>x[0]===-1);
      const pick=neutral&&this.e.random()<(easy?.86:hard?.55:.68)?neutral:list.sort((a,b)=>(a[0]<0?0:this.e.nations[a[0]].troops)-(b[0]<0?0:this.e.nations[b[0]].troops))[0];
      const percent=pick[0]===-1?(easy?10+this.e.random()*10:18+this.e.random()*15):(easy?12+this.e.random()*12:24+this.e.random()*(hard?34:26));
      this.e.issue({type:"attack",playerId:n.id,targetOwner:pick[0],percent});
    }
  }
}
