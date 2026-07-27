import { RULES } from "./config.js";

export function rng(seed) {
  let v = seed >>> 0;
  return () => ((v = Math.imul(v ^ (v >>> 15), 1 | v) + 0x6d2b79f5 | 0), ((v ^ (v >>> 14)) >>> 0) / 4294967296);
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = v => Math.max(0, Math.min(1, v));

function gradientField(w, h, spacing, random) {
  const gw = Math.ceil(w / spacing) + 2, gh = Math.ceil(h / spacing) + 2;
  const gx = new Float32Array(gw * gh), gy = new Float32Array(gw * gh);
  for (let i = 0; i < gx.length; i++) {
    const angle = random() * Math.PI * 2;
    gx[i] = Math.cos(angle); gy[i] = Math.sin(angle);
  }
  return (x, y) => {
    const px = Math.max(0, Math.min(gw - 1.001, x / spacing));
    const py = Math.max(0, Math.min(gh - 1.001, y / spacing));
    const x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
    const u = fade(tx), v = fade(ty);
    const dot = (xx, yy, dx, dy) => gx[yy * gw + xx] * dx + gy[yy * gw + xx] * dy;
    return lerp(lerp(dot(x0, y0, tx, ty), dot(x0 + 1, y0, tx - 1, ty), u),
      lerp(dot(x0, y0 + 1, tx, ty - 1), dot(x0 + 1, y0 + 1, tx - 1, ty - 1), u), v);
  };
}

function weather(height, land, w, h) {
  const dirs = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  for (let pass = 0; pass < 2; pass++) {
    const reverse = pass & 1;
    for (let yy = 1; yy < h - 1; yy++) {
      const y = reverse ? h - 1 - yy : yy;
      for (let xx = 1; xx < w - 1; xx++) {
        const x = reverse ? w - 1 - xx : xx, i = y * w + x;
        if (!land[i]) continue;
        let low = i, lowHeight = height[i];
        for (const d of dirs) if (land[i + d] && height[i + d] < lowHeight) { low = i + d; lowHeight = height[low]; }
        const drop = height[i] - lowHeight;
        if (low !== i && drop > .035) {
          const moved = Math.min((drop - .035) * .16, .012);
          height[i] -= moved; height[low] += moved;
        }
      }
    }
  }
}

function fillInlandWater(land, height, w, h) {
  const ocean = new Uint8Array(land.length), queue = new Int32Array(land.length);
  let head = 0, tail = 0;
  const seed = i => { if (!land[i] && !ocean[i]) { ocean[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % w;
    const visit = n => { if (!land[n] && !ocean[n]) { ocean[n] = 1; queue[tail++] = n; } };
    if (x) visit(i - 1); if (x < w - 1) visit(i + 1); if (i >= w) visit(i - w); if (i < land.length - w) visit(i + w);
  }
  for (let i = 0; i < land.length; i++) if (!land[i] && !ocean[i]) { land[i] = 1; height[i] = Math.max(.008, height[i]); }
}

function buildMountainSystems(height,land,w,h,seed){
  const random=rng(seed^0x6a09e667),distance=new Uint16Array(land.length),queue=new Int32Array(land.length);let head=0,tail=0;
  for(let i=0;i<land.length;i++)if(land[i])distance[i]=65535;else queue[tail++]=i;
  while(head<tail){const i=queue[head++],x=i%w,next=distance[i]+1,visit=n=>{if(land[n]&&distance[n]>next){distance[n]=next;queue[tail++]=n}};if(x)visit(i-1);if(x<w-1)visit(i+1);if(i>=w)visit(i-w);if(i<land.length-w)visit(i+w)}
  const wanted=Math.max(12,Math.min(17,Math.round(w*h/7200))),systems=[];
  for(let tries=0;tries<wanted*800&&systems.length<wanted;tries++){const x=8+Math.floor(random()*(w-16)),y=8+Math.floor(random()*(h-16)),i=y*w+x;if(!land[i]||distance[i]<8)continue;if(systems.some(p=>(p.x-x)**2+(p.y-y)**2<24**2))continue;const angle=random()*Math.PI,half=22+random()*30,width=7+random()*7,amplitude=.3+random()*.25,phase=random()*Math.PI*2;systems.push({x,y,dx:Math.cos(angle),dy:Math.sin(angle),half,width,amplitude,phase})}
  for(const system of systems){const radius=Math.ceil(system.half+system.width*2.5),minX=Math.max(1,Math.floor(system.x-radius)),maxX=Math.min(w-2,Math.ceil(system.x+radius)),minY=Math.max(1,Math.floor(system.y-radius)),maxY=Math.min(h-2,Math.ceil(system.y+radius));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=y*w+x;if(!land[i])continue;const ox=x-system.x,oy=y-system.y,along=ox*system.dx+oy*system.dy,across=-ox*system.dy+oy*system.dx;if(Math.abs(along)>system.half*1.15)continue;const spine=Math.exp(-Math.pow(Math.abs(across)/system.width,1.7)),ends=Math.pow(Math.max(0,1-(along/system.half)**2),1.45),peaks=.74+.26*Math.pow(.5+.5*Math.cos(along*.42+system.phase),2),coast=Math.min(1,distance[i]/10);height[i]+=system.amplitude*spine*ends*peaks*coast}}
  return systems.map(({x,y,dx,dy,amplitude})=>({x,y,dx,dy,height:amplitude}))
}

function carveRivers(height, land, w, h, seed, coarseHeight, coarseLand, cw, ch, sample) {
  const riverMask = new Uint8Array(w * h), parent = new Int32Array(cw * ch).fill(-2);
  const spill = new Float32Array(cw * ch).fill(Infinity), heapI = new Int32Array(cw * ch), heapV = new Float32Array(cw * ch);
  let heapN = 0;
  const push = (i, v) => { let p = heapN++; while (p) { const q = (p - 1) >> 1; if (heapV[q] <= v) break; heapI[p] = heapI[q]; heapV[p] = heapV[q]; p = q; } heapI[p] = i; heapV[p] = v; };
  const pop = () => { const out = heapI[0]; heapN--; const li = heapI[heapN], lv = heapV[heapN]; if (heapN) { let p = 0; while (true) { let c = p * 2 + 1; if (c >= heapN) break; if (c + 1 < heapN && heapV[c + 1] < heapV[c]) c++; if (heapV[c] >= lv) break; heapI[p] = heapI[c]; heapV[p] = heapV[c]; p = c; } heapI[p] = li; heapV[p] = lv; } return out; };
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

  // Only allow river mouths beside ocean water that is both connected to the
  // map edge and locally broad. This rejects inland holes, narrow coves and
  // one-cell channels as drainage targets.
  const ocean = new Uint8Array(cw * ch), oceanQueue = new Int32Array(cw * ch);
  let oceanHead = 0, oceanTail = 0;
  const seedOcean = i => { if (!coarseLand[i] && !ocean[i]) { ocean[i] = 1; oceanQueue[oceanTail++] = i; } };
  for (let x = 0; x < cw; x++) { seedOcean(x); seedOcean((ch - 1) * cw + x); }
  for (let y = 1; y < ch - 1; y++) { seedOcean(y * cw); seedOcean(y * cw + cw - 1); }
  while (oceanHead < oceanTail) {
    const i = oceanQueue[oceanHead++], x = i % cw, y = i / cw | 0;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      const n = ny * cw + nx;
      if (!coarseLand[n] && !ocean[n]) { ocean[n] = 1; oceanQueue[oceanTail++] = n; }
    }
  }
  const opensToWideSea = (x, y) => {
    let water = 0, samples = 0;
    const radius = 5;
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      if (ox * ox + oy * oy > radius * radius) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      samples++;
      if (ocean[ny * cw + nx]) water++;
    }
    return water >= Math.max(24, Math.ceil(samples * .38));
  };

  // Seed the priority flood at every coast. Expanding inland from here creates
  // an acyclic drainage tree: following parent[] from any peak always reaches sea.
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = y * cw + x;
    if (!coarseLand[i]) continue;
    if (dirs.some(([dx,dy]) => ocean[(y + dy) * cw + x + dx]) && opensToWideSea(x, y)) {
      parent[i] = -1; spill[i] = coarseHeight[i]; push(i, spill[i]);
    }
  }
  while (heapN) {
    const i = pop(), x = i % cw, y = i / cw | 0;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= cw - 1 || ny >= ch - 1) continue;
      const n = ny * cw + nx;
      if (!coarseLand[n] || parent[n] !== -2) continue;
      parent[n] = i;
      spill[n] = Math.max(coarseHeight[n], spill[i] + .00001);
      push(n, spill[n]);
    }
  }

  const random = rng(seed ^ 0x9e3779b9), wanted = Math.max(20, Math.min(38, Math.round(w * h / 145000)));
  const sources = [];
  for (let attempt = 0; attempt < wanted * 160 && sources.length < wanted; attempt++) {
    const x = 4 + Math.floor(random() * (cw - 8)), y = 4 + Math.floor(random() * (ch - 8)), i = y * cw + x;
    if (!coarseLand[i] || parent[i] < 0 || coarseHeight[i] < .42) continue;
    if (sources.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < 11 ** 2)) continue;
    sources.push({ x, y, i });
  }
  const draw = (x, y, radius, strength) => {
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const tx = x + ox, ty = y + oy, d = Math.hypot(ox, oy);
      if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1 || d > radius + .2) continue;
      const i = ty * w + tx;
      if (!land[i]) continue;
      const edge = Math.max(0, 1 - d / (radius + .7));
      height[i] -= (.009 + strength * .018) * edge;
      riverMask[i] = Math.max(riverMask[i], Math.round((105 + strength * 150) * edge));
    }
  };
  for (const source of sources) {
    const route=[];let cursor=source.i;
    while(cursor>=0&&route.length<cw+ch){route.push(cursor);cursor=parent[cursor]}
    for(let step=0;step<route.length;step++){
      const i=route[step],next=parent[i];
      const x0 = (i % cw) * sample, y0 = (i / cw | 0) * sample;
      if (next < 0) { draw(Math.min(w-1,x0), Math.min(h-1,y0), 10, 1); break; }
      const x1 = (next % cw) * sample, y1 = (next / cw | 0) * sample;
      const length = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      const downstream=route.length<=1?1:step/(route.length-1),radius=Math.min(10,1+Math.floor(downstream*10));
      for (let s = 0; s <= length; s++) draw(Math.round(lerp(x0, x1, s / length)), Math.round(lerp(y0, y1, s / length)), radius, .25 + downstream * .75);
    }
  }
  return riverMask;
}

export function makeMap(seed, type = "world", progress = () => {}) {
  progress("terrain", 6);
  const { width: w, height: h } = RULES, random = rng(seed);
  const land = new Uint8Array(w * h), rawHeight = new Float32Array(w * h);
  const elevation = new Float32Array(w * h), terrain = new Uint8Array(w * h), wetness = new Float32Array(w * h);
  const flowX = gradientField(w, h, 92, random), flowY = gradientField(w, h, 92, random);
  const large = gradientField(w, h, 78, random), medium = gradientField(w, h, 34, random);
  const fine = gradientField(w, h, 15, random), moisture = gradientField(w, h, 45, random);
  const shapes = type === "pangaea" ? [[.5,.5,.43,.4],[.28,.48,.22,.26],[.74,.52,.24,.28]] : [[.2,.3,.23,.22],[.47,.54,.31,.3],[.76,.31,.23,.22],[.79,.72,.19,.16],[.16,.77,.16,.14],[.52,.15,.15,.11]];
  // The game grid stays full-sized, but expensive geological noise is sampled
  // on a 4x coarser grid and smoothly reconstructed. This removes the long
  // main-thread stall without reducing territory or movement resolution.
  const sample = 4, cw = Math.ceil((w - 1) / sample) + 1, ch = Math.ceil((h - 1) / sample) + 1;
  const coarseMask=new Float32Array(cw*ch),coarseHeight = new Float32Array(cw * ch), coarseWet = new Float32Array(cw * ch), coarseLand = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const x = Math.min(w - 1, cx * sample), y = Math.min(h - 1, cy * sample);
    let vx = flowX(x, y), vy = flowY(x + 31, y - 17), length = Math.hypot(vx, vy) || 1;
    vx /= length; vy /= length;
    const warp = 24 + Math.abs(large(x, y)) * 24, wx = x + vx * warp, wy = y + vy * warp;
    const nx = wx / w, ny = wy / h;
    let mass = -1;
    for (const [cx, cy, rx, ry] of shapes) mass = Math.max(mass, 1 - Math.hypot((nx - cx) / rx, (ny - cy) / ry));
    const mask=mass+large(wx,wy)*.24+medium(wx,wy)*.12+fine(wx,wy)*.045-.105;
    const i = cy * cw + cx;
    coarseMask[i]=mask;coarseLand[i]=mask>0?1:0;coarseHeight[i]=mask>0?.025+Math.min(.2,mask*.14)+medium(wx,wy)*.025+fine(wx,wy)*.018:mask;coarseWet[i] = moisture(wx, wy);
  }
  const mountainSystems=buildMountainSystems(coarseHeight,coarseLand,cw,ch,seed);
  progress("terrain", 38);
  weather(coarseHeight, coarseLand, cw, ch);
  progress("erosion", 52);
  for (let y = 0; y < h; y++) {
    const py = y / sample, y0 = Math.floor(py), y1 = Math.min(ch - 1, y0 + 1), ty = py - y0;
    for (let x = 0; x < w; x++) {
      const px = x / sample, x0 = Math.floor(px), x1 = Math.min(cw - 1, x0 + 1), tx = px - x0;
      const a = y0 * cw + x0, b = y0 * cw + x1, c = y1 * cw + x0, d = y1 * cw + x1, i = y * w + x;
      const maskValue=lerp(lerp(coarseMask[a],coarseMask[b],tx),lerp(coarseMask[c],coarseMask[d],tx),ty);rawHeight[i] = lerp(lerp(coarseHeight[a], coarseHeight[b], tx), lerp(coarseHeight[c], coarseHeight[d], tx), ty);
      wetness[i] = lerp(lerp(coarseWet[a], coarseWet[b], tx), lerp(coarseWet[c], coarseWet[d], tx), ty);
      land[i] = maskValue > 0 ? 1 : 0;
    }
  }
  fillInlandWater(land, rawHeight, w, h);
  progress("erosion", 68);
  progress("rivers", 70);
  const riverMask = carveRivers(rawHeight, land, w, h, seed, coarseHeight, coarseLand, cw, ch, sample);
  progress("rivers", 90);
  for (let i = 0; i < land.length; i++) {
    const e = clamp((rawHeight[i] + .18) / .72); elevation[i] = e;
    if (!land[i]) terrain[i] = 0;
    else if (e < .31) terrain[i] = 1;
    else if (e > .76) terrain[i] = 5;
    else if (e > .61) terrain[i] = 4;
    else if (wetness[i] > .08) terrain[i] = 3;
    else terrain[i] = 2;
  }
  progress("finalize", 98);
  return { width: w, height: h, land, rawHeight, elevation, terrain, riverMask, mountainSystems, seed, type };
}
