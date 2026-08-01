const KEY="pixelfront-save-v1";

function encodeOwner(owner){let out="",last=owner[0],count=1;for(let i=1;i<=owner.length;i++){const value=owner[i];if(i<owner.length&&value===last){count++;continue}out+=(last+2).toString(36)+"."+count.toString(36)+",";last=value;count=1}return out}
function decodeOwner(text,target){let at=0;for(const run of text.split(",")){if(!run)continue;const[value,count]=run.split(".").map(x=>parseInt(x,36));target.fill(value-2,at,at+count);at+=count}return at===target.length}
function hasClaimedOwner(text){return typeof text==="string"&&text.split(",").some(run=>parseInt(run.split(".")[0],36)>=2)}
function encodeTiles(tiles){let previous=0,lastDelta=null,count=0;const runs=[];for(const[index,tile]of[...tiles].sort((a,b)=>a-b).entries()){const delta=index?tile-previous:tile;previous=tile;if(delta===lastDelta){count++;continue}if(lastDelta!==null)runs.push(lastDelta.toString(36)+(count>1?`*${count.toString(36)}`:""));lastDelta=delta;count=1}if(lastDelta!==null)runs.push(lastDelta.toString(36)+(count>1?`*${count.toString(36)}`:""));return runs.join(".")}
function decodeTiles(encoded,fallback=[]){if(typeof encoded!=="string")return fallback;let previous=0;const out=[];for(const run of encoded.split(".")){if(!run)continue;const[deltaText,countText]=run.split("*"),delta=parseInt(deltaText,36),count=countText?parseInt(countText,36):1;if(!Number.isFinite(delta)||!Number.isFinite(count)||count<1)return fallback;for(let i=0;i<count;i++){previous=out.length?previous+delta:delta;out.push(previous)}}return out}
const attackData=a=>{const{front,...rest}=a;return{...rest,frontPacked:encodeTiles(front||[]),reinforcementQueue:[...(a.reinforcementQueue||[])]}};
const FILE_FORMAT="PIXELFRONT_SAVE",MAX_FILE_BYTES=25*1024*1024;

export function readGame(){try{const data=JSON.parse(localStorage.getItem(KEY));return data?.version===1&&hasClaimedOwner(data.owner)?data:null}catch{return null}}
export function hasSavedGame(){return!!readGame()}
export function clearSavedGame(){localStorage.removeItem(KEY)}
export function serializeGame(engine,opts={}){
  if((engine.nations[0]?.spawn??-1)<0)throw new Error("게임 시작 후 저장할 수 있습니다");
  engine.ensureDiplomacy?.();
  return{version:1,savedAt:Date.now(),seed:engine.map.seed,mapType:engine.map.type,opts,tick:engine.tick,running:engine.running,winner:engine.winner,owner:encodeOwner(engine.owner),nations:engine.nations.map(n=>({id:n.id,name:n.name,color:n.color,troops:n.troops,spawn:n.spawn,alive:n.alive,ai:n.ai,capitalLostAt:n.capitalLostAt??null,capitalOccupier:n.capitalOccupier??null,operationReady:n.operationReady||{},commander:n.commander||null,intel:n.intel||0,espionageReady:n.espionageReady||{}})),attacks:engine.attacks.map(attackData),surrenders:engine.surrenders.map(s=>{const{tiles,...rest}=s;return{...rest,tilesPacked:encodeTiles(tiles||[])}}),relations:engine.relations,reputation:engine.reputation?[...engine.reputation]:null,buildings:engine.nations.flatMap(n=>[...(n.buildingTiles||[])].map(tile=>[tile,engine.buildings?.[tile]||0])),missionState:engine.missionState||{completed:[]},combatFeed:(engine.combatFeed||[]).slice(0,30),achievementState:engine.achievementState||null}
}
export function saveGame(engine,opts={}){
  if((engine.nations[0]?.spawn??-1)<0)return false;
  try{
    const data=serializeGame(engine,opts);
    localStorage.setItem(KEY,JSON.stringify(data));return true;
  }catch(error){console.warn("PIXELFRONT save failed",error);return false}
}
export function exportGameFile(engine,opts={}){const payload={format:FILE_FORMAT,fileVersion:1,game:serializeGame(engine,opts)},blob=new Blob([JSON.stringify(payload)],{type:"application/x-pixelfront+json"}),url=URL.createObjectURL(blob),link=document.createElement("a"),stamp=new Date(payload.game.savedAt).toISOString().replace(/[:.]/g,"-");link.href=url;link.download=`pixelfront-${payload.game.seed}-${stamp}.pxfo`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return payload.game}
export async function importGameFile(file){if(!file||!file.name.toLowerCase().endsWith(".pxfo"))throw new Error(".pxfo 파일만 불러올 수 있습니다");if(file.size>MAX_FILE_BYTES)throw new Error("저장 파일이 너무 큽니다");let payload;try{payload=JSON.parse(await file.text())}catch{throw new Error("손상된 저장 파일입니다")}const data=payload?.format===FILE_FORMAT&&payload.fileVersion===1?payload.game:null;if(!data||data.version!==1||!Number.isInteger(data.seed)||!hasClaimedOwner(data.owner)||!Array.isArray(data.nations)||!Array.isArray(data.attacks))throw new Error("지원하지 않는 PIXELFRONT 저장 파일입니다");localStorage.setItem(KEY,JSON.stringify(data));return data}
export function restoreGame(engine,data){
  if(!data||data.seed!==engine.map.seed||data.mapType!==engine.map.type||!decodeOwner(data.owner,engine.owner))return false;
  if(!engine.owner.some(owner=>owner>=0))return false;
  for(const nation of engine.nations){nation.tiles.clear();nation.borderTiles=new Set}
  for(let i=0;i<engine.owner.length;i++){const id=engine.owner[i];if(id>=0&&engine.nations[id])engine.nations[id].tiles.add(i)}
  for(const saved of data.nations){const nation=engine.nations[saved.id];if(nation){Object.assign(nation,saved,{tiles:nation.tiles,borderTiles:nation.borderTiles,ai:nation.id>0});engine.applyDoctrine?.(nation)}}
  if(engine.buildings){engine.buildings.fill(0);for(const nation of engine.nations)nation.buildingTiles=new Set;for(const[tile,type]of(data.buildings||[]))if(type&&engine.owner[tile]>=0){engine.buildings[tile]=type;engine.nations[engine.owner[tile]]?.buildingTiles.add(tile)}}
  for(const nation of engine.nations)for(const i of nation.tiles){let edge=false;engine.eachNeighbor(i,n=>{if(engine.owner[n]!==nation.id&&engine.owner[n]!==-2)edge=true});if(edge)nation.borderTiles.add(i)}
  engine.tick=data.tick||0;engine.running=data.running!==false;engine.winner=data.winner??null;
  engine.attacks=(data.attacks||[]).map(a=>({...a,front:new Set(decodeTiles(a.frontPacked,a.front||[])),reinforcementQueue:a.reinforcementQueue||[]}));
  engine.surrenders=(data.surrenders||[]).map(s=>({...s,tiles:decodeTiles(s.tilesPacked,s.tiles||[])}));
  if(data.relations)engine.relations=data.relations;if(data.reputation)engine.reputation=Float32Array.from(data.reputation);
  if(data.missionState)engine.missionState=data.missionState;
  if(data.combatFeed)engine.combatFeed=data.combatFeed;
  if(data.achievementState)engine.achievementState=data.achievementState;
  if(data.statistics)engine.statistics=data.statistics;
  return true;
}
