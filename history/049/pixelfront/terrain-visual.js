import{Renderer}from"./renderer.js";
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
function capVectorField(map){if(map.capVectorField)return map.capVectorField;const{width:w,height:h,seed}=map,spacing=28,gw=Math.ceil(w/spacing)+2,gh=Math.ceil(h/spacing)+2,gx=new Float32Array(gw*gh),gy=new Float32Array(gw*gh),out=new Float32Array(w*h),fade=t=>t*t*t*(t*(t*6-15)+10),lerp=(a,b,t)=>a+(b-a)*t,hash=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return(n^(n>>>16))>>>0};for(let i=0;i<gx.length;i++){const angle=hash(i+seed)*2.3283064365386963e-10*Math.PI*2;gx[i]=Math.cos(angle);gy[i]=Math.sin(angle)}for(let y=0;y<h;y++)for(let x=0;x<w;x++){const px=x/spacing,py=y/spacing,x0=px|0,y0=py|0,tx=px-x0,ty=py-y0,u=fade(tx),v=fade(ty),dot=(xx,yy,dx,dy)=>gx[yy*gw+xx]*dx+gy[yy*gw+xx]*dy;out[y*w+x]=lerp(lerp(dot(x0,y0,tx,ty),dot(x0+1,y0,tx-1,ty),u),lerp(dot(x0,y0+1,tx,ty-1),dot(x0+1,y0+1,tx-1,ty-1),u),v)}map.capVectorField=out;return out}
function coastDistances(map){
  if(map.coastDistance)return map.coastDistance;
  const{width:w,land}=map,d=new Uint8Array(land.length).fill(255),q=[];
  for(let i=0;i<land.length;i++){if(!land[i])continue;const x=i%w;if((x&&!land[i-1])||(x<w-1&&!land[i+1])||(i>=w&&!land[i-w])||(i<land.length-w&&!land[i+w])){d[i]=1;q.push(i)}}
  for(let p=0;p<q.length;p++){const i=q[p],next=d[i]+1;if(next>9)continue;const x=i%w,visit=n=>{if(land[n]&&d[n]>next){d[n]=next;q.push(n)}};if(x)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<land.length-w)visit(i+w)}
  map.coastDistance=d;return d
}
export function restoredElevation(map){
  if(map.restoredElevation)return map.restoredElevation;const{width:w,height:h,elevation}=map,out=new Float32Array(elevation),distance=new Float32Array(elevation.length),inf=1e6,diag=Math.SQRT2;
  for(let i=0;i<distance.length;i++)distance[i]=elevation[i]>=.999999?inf:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!distance[i])continue;let d=distance[i];if(x)d=Math.min(d,distance[i-1]+1);if(y)d=Math.min(d,distance[i-w]+1);if(x&&y)d=Math.min(d,distance[i-w-1]+diag);if(x<w-1&&y)d=Math.min(d,distance[i-w+1]+diag);distance[i]=d}
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!distance[i])continue;let d=distance[i];if(x<w-1)d=Math.min(d,distance[i+1]+1);if(y<h-1)d=Math.min(d,distance[i+w]+1);if(x<w-1&&y<h-1)d=Math.min(d,distance[i+w+1]+diag);if(x&&y<h-1)d=Math.min(d,distance[i+w-1]+diag);distance[i]=d}
  const vector=capVectorField(map);let cap=new Float32Array(out.length);for(let i=0;i<out.length;i++)if(distance[i]>1&&distance[i]<inf){const interior=distance[i]-1,flowed=Math.max(0,interior*(1+vector[i]*.38));cap[i]=.045*Math.pow(flowed,.68)}for(let pass=0;pass<6;pass++){const next=new Float32Array(cap);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(distance[i]<=1||distance[i]>=inf)continue;let sum=0,count=0;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){if(!xx&&!yy)continue;const n=i+yy*w+xx;if(distance[n]>0&&distance[n]<inf){sum+=cap[n];count++}}if(count)next[i]=cap[i]*.28+sum/count*.72}cap=next}for(let i=0;i<out.length;i++)if(cap[i]>0)out[i]=elevation[i]+cap[i];map.restoredElevation=out;map.capDistance=distance;return out
}
function terrainColor(height,coast){
  const low=[57,76,49],upland=[78,78,61],rock=[107,105,96],peak=[139,140,136],sand=[113,101,70];
  let color=height<.65?mix(low,upland,smooth(.42,.65,height)):height<.84?mix(upland,rock,smooth(.65,.84,height)):mix(rock,peak,smooth(.84,.98,height));
  return mix(color,sand,coast*.82)
}
export function installTerrainVisual(){
  if(Renderer.prototype.terrainVisual)return;Renderer.prototype.terrainVisual=true;const baseTexture=Renderer.prototype.texture;
  Renderer.prototype.texture=function(){
    baseTexture.call(this);const e=this.e,data=this.image.data,baseElevation=e.map.elevation,elevation=restoredElevation(e.map),deployed=e.nations[0].spawn>=0;if(!baseElevation)return;const w=e.map.width,coast=coastDistances(e.map);
    const flow=capVectorField(e.map),h=e.map.height,sample=(x,y)=>elevation[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))];
    const dirty=this.dirtyAll?{*[Symbol.iterator](){for(let i=0;i<e.owner.length;i++)yield i}}:this.dirtyTiles;for(const i of dirty){
      const visibility=this.visible[i];if(deployed&&!visibility&&this.explored[i])continue;
      const j=i*4,height=baseElevation[i],x=i%w,y=i/w|0,left=sample(x-1,y),right=sample(x+1,y),up=sample(x,y-1),down=sample(x,y+1),
        nw=sample(x-1,y-1),ne=sample(x+1,y-1),sw=sample(x-1,y+1),se=sample(x+1,y+1),
        dx=(ne+right*2+se-nw-left*2-sw)/4,dy=(sw+down*2+se-nw-up*2-ne)/4,
        wideDx=(sample(x+6,y-2)+sample(x+6,y+2)-sample(x-6,y-2)-sample(x-6,y+2))/12,
        wideDy=(sample(x-2,y+6)+sample(x+2,y+6)-sample(x-2,y-6)-sample(x+2,y-6))/12,
        slope=Math.min(1,Math.hypot(dx,dy)*8),mountain=smooth(.48,.9,height),
        broad=Math.max(.5,Math.min(1.22,1-dx*3.25-dy*2.2-wideDx*1.75-wideDy*1.18)),
        flowShade=1+flow[i]*.19*mountain,foldShade=1-slope*.035,
        diagonal=((x+y)&3)===0?.968:1.007,striation=1+Math.sin(x*.46+y*.23+flow[i]*12)*(.016+.023*slope),
        grain=.987+(((i*1103515245+e.map.seed)>>>16)&255)/10600,hill=Math.max(.48,Math.min(1.22,broad*flowShade*foldShade*striation*(1-mountain+mountain*diagonal)));
      if(deployed&&!visibility){
        if(e.map.land[i]){const color=terrainColor(height,0),relief=Math.max(.32,Math.min(.58,.43*hill*grain));data[j]=color[0]*relief*.72;data[j+1]=color[1]*relief*.78;data[j+2]=color[2]*relief*.84}
        else{const depth=.72+height*.18;data[j]=2*depth;data[j+1]=8*depth;data[j+2]=15*depth}
      }
      else if(e.owner[i]===-2){const depth=.55+height*.5;data[j]*=depth*grain;data[j+1]*=depth*grain;data[j+2]=Math.min(255,data[j+2]*depth*grain+8)}
      else if(!deployed||e.owner[i]===-1){const beach=coast[i]===255?0:1-smooth(1,9,coast[i]),color=terrainColor(height,beach),light=hill*grain;data[j]=color[0]*light;data[j+1]=color[1]*light;data[j+2]=color[2]*light}
      else{const high=smooth(.72,.96,height)*7,light=(.88+height*.17)*hill*grain,ground=terrainColor(height,0),nationAlpha=.62;data[j]=Math.min(238,(data[j]*nationAlpha+ground[0]*(1-nationAlpha))*light+high);data[j+1]=Math.min(238,(data[j+1]*nationAlpha+ground[1]*(1-nationAlpha))*light+high);data[j+2]=Math.min(238,(data[j+2]*nationAlpha+ground[2]*(1-nationAlpha))*light+high)}
      const river=e.map.riverMask?.[i]||0;if(visibility&&river&&e.owner[i]!==-2){const mix=.48+river/255*.28;data[j]=data[j]*(1-mix)+18*mix;data[j+1]=data[j+1]*(1-mix)+70*mix;data[j+2]=data[j+2]*(1-mix)+91*mix}
      if(deployed&&visibility){this.memory[j]=data[j];this.memory[j+1]=data[j+1];this.memory[j+2]=data[j+2]}
    }
    for(const d of this.dirtyRects||[])this.bctx.putImageData(this.image,0,0,d.x,d.y,d.w,d.h)
  }
}
