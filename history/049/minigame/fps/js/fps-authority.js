export class FpsAuthority {
  constructor(){this.roomId=null;this.seq=0;this.pending=false;this.lastSend=0;this.connected=false;this.lastState=null;this.fireQueued=false}
  async request(path,options={}){void path;void options;throw new Error("MAINTENANCE")}
  async connect(roomId=null){if(auth.authStateReady)await auth.authStateReady();const result=roomId?await this.request(`/fps/${encodeURIComponent(roomId)}/join`,{method:"POST",body:"{}"}):await this.request("/fps",{method:"POST",body:"{}"});this.roomId=roomId||result.roomId;this.connected=true;this.lastState=result.state;return result}
  queueFire(){this.fireQueued=true}
  sync(now,state){if(!this.connected||this.pending||now-this.lastSend<100)return;this.lastSend=now;this.pending=true;const fire=this.fireQueued;this.fireQueued=false;const body={seq:++this.seq,x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:state.pitch,weapon:state.weapon,rate:state.rate,fire};this.request(`/fps/${encodeURIComponent(this.roomId)}/input`,{method:"POST",body:JSON.stringify(body)}).then(result=>{this.lastState=result.state}).catch(()=>{this.connected=false}).finally(()=>{this.pending=false})}
  leave(){if(!this.connected)return;this.connected=false;this.request(`/fps/${encodeURIComponent(this.roomId)}/leave`,{method:"POST",body:"{}",keepalive:true}).catch(()=>{})}
}
