import{Engine}from"./engine.js";
import{Renderer}from"./renderer.js";
import{rng}from"./map.js";
import{RULES}from"./config.js";

const NAMES=["아르카","벨로스","카이른","도르반","에스텔","프라임","가르다","하이븐","이오나","제니스","칼데라","루멘","메리디안","노바","오르비스","펄서","퀸타","로엔","솔라","테라","우르사","베가","웨스트","자이온"];

export function installStrategicCities(engine,renderer,notify=()=>{}){
  if(!engine.cities){engine.cities=new Map;const random=rng(engine.map.seed^0x51c17e5),wanted=18;for(let tries=0;tries<24000&&engine.cities.size<wanted;tries++){const x=30+Math.floor(random()*(engine.map.width-60)),y=30+Math.floor(random()*(engine.map.height-60)),tile=y*engine.map.width+x,height=engine.map.elevation[tile];if(!engine.map.land[tile]||height<.2||height>.68)continue;let nearCoast=false;for(let oy=-5;oy<=5&&!nearCoast;oy++)for(let ox=-5;ox<=5;ox++)if(!engine.map.land[(y+oy)*engine.map.width+x+ox]){nearCoast=true;break}if(nearCoast)continue;let spaced=true;for(const city of engine.cities.values()){const[cx,cy]=engine.xy(city.tile);if((cx-x)**2+(cy-y)**2<115**2){spaced=false;break}}if(spaced)engine.cities.set(tile,{tile,name:NAMES[engine.cities.size%NAMES.length],owner:-1,production:7})}}
  const oldTransfer=Engine.prototype.transfer;Engine.prototype.transfer=function(tile,to){const city=this.cities?.get(tile),from=this.owner[tile];oldTransfer.call(this,tile,to);if(city&&from!==to){city.owner=to;if(this.running&&(from===0||to===0))notify(to===0?`${city.name} 전략 도시 점령`:`${city.name} 전략 도시 상실`)}};
  const oldStep=Engine.prototype.step;Engine.prototype.step=function(){oldStep.call(this);for(const city of(this.cities?.values()||[])){const owner=this.owner[city.tile];city.owner=owner;if(owner<0||!this.nations[owner]?.alive)continue;const nation=this.nations[owner],cap=RULES.popBase+nation.tiles.size*RULES.popPerTile;if(nation.troops<cap)nation.troops=Math.min(cap,nation.troops+city.production)}};
  const oldDraw=Renderer.prototype.draw;Renderer.prototype.draw=function(){oldDraw.call(this);if(!this.e.cities)return;const c=this.ctx;for(const city of this.e.cities.values()){if(!this.visible[city.tile]&&this.e.nations[0].spawn>=0)continue;const[x,y]=this.e.xy(city.tile),p=this.point(x+.5,y+.5),owner=this.e.owner[city.tile];c.fillStyle=owner>=0?this.e.nations[owner].color:"#f4efe1";c.strokeStyle="#07111a";c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,Math.max(3,Math.min(6,p.s*2)),0,Math.PI*2);c.fill();c.stroke();if(p.s>1.8){c.font="800 8px Inter";c.textAlign="center";c.fillStyle="#fff";c.fillText(city.name,p.x,p.y-9)}}};
  if(typeof document!=="undefined"){const hud=document.querySelector("#hud");if(hud&&!document.querySelector("#cityCount")){const item=document.createElement("div");item.innerHTML='<small>CITIES</small><strong id="cityCount">0</strong>';hud.append(item)}}
}
export function updateCityUI(engine){if(typeof document==="undefined")return;const el=document.querySelector("#cityCount");if(el)el.textContent=[...engine.cities.values()].filter(city=>engine.owner[city.tile]===0).length}
