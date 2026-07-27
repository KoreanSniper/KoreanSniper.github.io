export class Renderer {
  constructor(canvas,e){
    this.canvas=canvas;this.e=e;this.ctx=canvas.getContext("2d",{alpha:false});
    this.buffer=document.createElement("canvas");this.buffer.width=e.map.width;this.buffer.height=e.map.height;
    this.bctx=this.buffer.getContext("2d",{alpha:false});this.image=this.bctx.createImageData(e.map.width,e.map.height);
    this.visible=new Uint8Array(e.owner.length);this.explored=new Uint8Array(e.owner.length);
    this.memory=new Uint8ClampedArray(this.image.data.length);this.visibleTiles=[];this.haloTiles=[];this.allyTiles=[];this.lostVisibleTiles=[];
    this.fullVisibility=false;this.visionDirty=[];this.dirtyTiles=[];this.dirtyRect=null;this.dirtyRects=[];this.camera={x:0,y:0,z:1};
    this.capturePulses=[];
    this.last=-1;this.visionTick=-1;this.wasDeployed=false;this.resize();addEventListener("resize",()=>this.resize());
  }
  resize(){const d=Math.min(devicePixelRatio||1,2),box=this.canvas.getBoundingClientRect();this.canvas.width=box.width*d;this.canvas.height=box.height*d;this.ctx.setTransform(d,0,0,d,0,0);this.w=box.width;this.h=box.height}
  point(x,y){const s=Math.min(this.w/this.e.map.width,this.h/this.e.map.height)*this.camera.z;return{x:(x-this.e.map.width/2)*s+this.w/2+this.camera.x,y:(y-this.e.map.height/2)*s+this.h/2+this.camera.y,s}}
  tile(x,y){const p=this.point(0,0),tx=Math.floor((x-p.x)/p.s),ty=Math.floor((y-p.y)/p.s);return tx>=0&&ty>=0&&tx<this.e.map.width&&ty<this.e.map.height?ty*this.e.map.width+tx:-1}
  vision(){
    const e=this.e,o=e.owner,w=e.map.width,h=e.map.height;
    if(e.nations[0].spawn<0){this.visible.fill(1);this.fullVisibility=true;this.visionTick=e.tick;return}
    const changed=new Set(this.haloTiles);for(const i of this.allyTiles)changed.add(i);
    if(this.fullVisibility||!this.visionInitialized){this.visible.fill(0);for(const i of e.nations[0].tiles){this.visible[i]=2;this.explored[i]=1}this.visionInitialized=true}
    for(const i of this.haloTiles)if(o[i]!==0)this.visible[i]=0;this.haloTiles=[];
    for(const i of this.allyTiles)if(o[i]!==0)this.visible[i]=0;this.allyTiles=[];
    for(const i of(e.changedTiles||[])){if(o[i]===0){this.visible[i]=2;this.explored[i]=1}changed.add(i)}
    for(const nation of e.nations)if(nation.id!==0&&e.relation?.(0,nation.id)===2)for(const i of nation.tiles){this.visible[i]=2;this.explored[i]=1;this.allyTiles.push(i);changed.add(i)}
    const border=[...(e.nations[0].borderTiles||e.nations[0].tiles)],mark=i=>{if(o[i]!==0){this.visible[i]=Math.max(1,this.visible[i]);this.haloTiles.push(i)}else this.visible[i]=2;this.explored[i]=1;changed.add(i)};this.fullVisibility=false;
    const range=11;this.visionStamp??=new Uint32Array(o.length);this.visionDistance??=new Uint8Array(o.length);this.visionQueue??=new Int32Array(o.length);this.visionGeneration=(this.visionGeneration||0)+1;if(this.visionGeneration===0xffffffff){this.visionStamp.fill(0);this.visionGeneration=1}let head=0,tail=0;for(const tile of border)if(this.visionStamp[tile]!==this.visionGeneration){this.visionStamp[tile]=this.visionGeneration;this.visionDistance[tile]=0;this.visionQueue[tail++]=tile}while(head<tail){const tile=this.visionQueue[head++],distance=this.visionDistance[tile];mark(tile);if(distance>=range)continue;e.eachNeighbor(tile,next=>{if(this.visionStamp[next]===this.visionGeneration)return;this.visionStamp[next]=this.visionGeneration;this.visionDistance[next]=distance+1;this.visionQueue[tail++]=next})}
    this.visibleTiles=this.haloTiles;this.visionDirty=[...changed];
    this.visionTick=e.tick;
  }
  texture(){
    const visionDue=this.visionTick<0||this.e.tick-this.visionTick>=12;if(visionDue)this.vision();
    const e=this.e,owners=e.owner,w=e.map.width,data=this.image.data,deployed=e.nations[0].spawn>=0,shown=i=>!deployed&&i>=0?-1:i;
    if(deployed)for(const i of(e.changedTiles||[]))if(owners[i]===0){this.visible[i]=2;this.explored[i]=1}
    const dirtyAll=!deployed||!this.wasDeployed;let dirty;
    if(dirtyAll){const length=owners.length;dirty={*[Symbol.iterator](){for(let i=0;i<length;i++)yield i}};if(deployed)for(let j=0;j<data.length;j+=4){data[j]=0;data[j+1]=0;data[j+2]=0;data[j+3]=255}}
    else{const mark=new Set(visionDue?this.visionDirty:[]);for(const i of(e.changedTiles||[]))if(this.visible[i]||this.explored[i])mark.add(i);dirty=[...mark]}
    let minX=w,minY=e.map.height,maxX=-1,maxY=-1;
    for(const i of dirty){
      const id=shown(owners[i]),color=id===-2?[7,17,27]:id===-1?[57,66,64]:hex(e.nations[id].color),x=i%w,y=i/w|0;
      const edge=id!==-2&&((x&&shown(owners[i-1])!==id)||(x<w-1&&shown(owners[i+1])!==id)||(i>=w&&shown(owners[i-w])!==id)||(i<owners.length-w&&shown(owners[i+w])!==id)),shade=edge?.7:1,j=i*4;
      if(this.visible[i]||!deployed){data[j]=color[0]*shade;data[j+1]=color[1]*shade;data[j+2]=color[2]*shade;data[j+3]=255;if(deployed){this.memory[j]=data[j];this.memory[j+1]=data[j+1];this.memory[j+2]=data[j+2];this.memory[j+3]=255}}
      else if(this.explored[i]){data[j]=this.memory[j]*.58+3;data[j+1]=this.memory[j+1]*.58+8;data[j+2]=this.memory[j+2]*.58+13;data[j+3]=255}
      else{data[j]=0;data[j+1]=0;data[j+2]=0;data[j+3]=255}
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    this.dirtyAll=dirtyAll;this.dirtyTiles=dirtyAll?[]:dirty;this.dirtyRect=maxX>=minX?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null;
    if(dirtyAll)this.dirtyRects=this.dirtyRect?[this.dirtyRect]:[];else{const size=48,chunks=new Set;for(const i of dirty)chunks.add(`${Math.floor(i%w/size)},${Math.floor((i/w|0)/size)}`);this.dirtyRects=[...chunks].map(key=>{const[cx,cy]=key.split(",").map(Number),x=cx*size,y=cy*size;return{x,y,w:Math.min(size,w-x),h:Math.min(size,e.map.height-y)}})}
    if(!this.terrainVisual)for(const d of this.dirtyRects)this.bctx.putImageData(this.image,0,0,d.x,d.y,d.w,d.h)
    if(deployed&&e.changedTiles?.size){const now=performance.now(),changed=[...e.changedTiles],stride=Math.max(1,Math.ceil(changed.length/28));for(let n=0;n<changed.length;n+=stride){const tile=changed[n],owner=owners[tile];if(this.visible[tile]&&owner>=0)this.capturePulses.push({tile,owner,at:now})}if(this.capturePulses.length>90)this.capturePulses.splice(0,this.capturePulses.length-90)}
    if(e.changedTiles)e.changedTiles.clear();this.visionDirty=[];this.lostVisibleTiles=[];this.wasDeployed=deployed;this.last=e.tick;
  }
  overlays(c,p,deployed){
    if(!deployed)return;const now=performance.now(),e=this.e,scale=p.s;
    c.save();c.lineCap="round";c.lineJoin="round";
    for(const attack of e.attacks){if(!attack.alive||!attack.front?.size)continue;const nation=e.nations[attack.attacker],color=nation?.color||"#fff",front=[...attack.front],stride=Math.max(1,Math.ceil(front.length/22));let sx=0,sy=0,count=0;
      for(let n=0;n<front.length;n+=stride){const tile=front[n];if(!this.visible[tile])continue;const[x,y]=e.xy(tile),q=this.point(x+.5,y+.5);sx+=q.x;sy+=q.y;count++;const flicker=.45+.35*Math.sin(now*.012+tile*.37);c.fillStyle=`${color}${Math.round(flicker*255).toString(16).padStart(2,"0")}`;c.beginPath();c.arc(q.x,q.y,Math.max(1.4,Math.min(4.5,scale*1.3)),0,Math.PI*2);c.fill();if(((tile+e.tick)%5)===0){c.strokeStyle="#ffd8a8bb";c.lineWidth=1;c.beginPath();c.moveTo(q.x-3,q.y+2);c.lineTo(q.x+3,q.y-2);c.stroke()}}
      if(count){const[tx,ty]=e.xy(attack.target),to=this.point(tx+.5,ty+.5),from={x:sx/count,y:sy/count},dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);if(length>12){const ux=dx/length,uy=dy/length,endX=from.x+dx*.72,endY=from.y+dy*.72;c.strokeStyle=`${color}b8`;c.lineWidth=Math.max(1.5,Math.min(3.5,scale*.8));c.setLineDash([7,8]);c.lineDashOffset=-now*.025;c.beginPath();c.moveTo(from.x,from.y);c.lineTo(endX,endY);c.stroke();c.setLineDash([]);c.fillStyle=`${color}dd`;c.beginPath();c.moveTo(endX,endY);c.lineTo(endX-ux*11-uy*6,endY-uy*11+ux*6);c.lineTo(endX-ux*11+uy*6,endY-uy*11-ux*6);c.closePath();c.fill()}}}
    this.capturePulses=this.capturePulses.filter(pulse=>{const age=now-pulse.at;if(age>850)return false;const[x,y]=e.xy(pulse.tile),q=this.point(x+.5,y+.5),t=age/850,r=3+t*22;c.strokeStyle=`${e.nations[pulse.owner]?.color||"#fff"}${Math.round((1-t)*170).toString(16).padStart(2,"0")}`;c.lineWidth=Math.max(1,2.5*(1-t));c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.stroke();return true});
    for(const city of e.cities?.values?.()||[]){if(!this.visible[city.tile])continue;const[x,y]=e.xy(city.tile),q=this.point(x+.5,y+.5),owner=e.owner[city.tile];c.fillStyle="#071018dd";c.strokeStyle=owner>=0?e.nations[owner].color:"#d9dfda";c.lineWidth=1.5;c.beginPath();c.rect(q.x-3.5,q.y-3.5,7,7);c.fill();c.stroke()}
    c.restore();
  }
  draw(){
    if(this.last<0||this.e.tick-this.last>=3)this.texture();
    const c=this.ctx,p=this.point(0,0),deployed=this.e.nations[0].spawn>=0;c.fillStyle="#000";c.fillRect(0,0,this.w,this.h);c.imageSmoothingEnabled=false;c.drawImage(this.buffer,p.x,p.y,this.e.map.width*p.s,this.e.map.height*p.s);
    this.overlays(c,p,deployed);
    for(const n of this.e.nations){if(!n.alive||n.spawn<0||!deployed&&n.id!==0||deployed&&n.id!==0&&!this.visible[n.spawn])continue;const[x,y]=this.e.xy(n.spawn),q=this.point(x+.5,y+.5),r=Math.max(6,Math.min(13,q.s*2));c.fillStyle="#061019dc";c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();c.fillStyle="#fff";c.font=`700 ${Math.max(7,Math.min(10,r))}px Inter`;c.textAlign="center";c.fillText(short(n.troops),q.x,q.y+3);if(q.s>1.25||n.id===0){c.font="700 8px Inter";c.fillStyle="#eef3f4d9";c.shadowColor="#000";c.shadowBlur=3;c.fillText(n.name,q.x,q.y+r+10);c.shadowBlur=0}}
  }
}
function hex(v){const n=parseInt(v.slice(1),16);return[n>>16,(n>>8)&255,n&255]}
export function short(n){return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(1)+"K":Math.floor(n)}
