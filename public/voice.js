/* Ovozli aloqa (mikrofon): WebRTC, signal server.js orqali ("rtc" xabarlari).
   Muzeyda — yaqin atrofdagi 4 tagacha odam bilan (masofaga qarab ovoz balandligi),
   o'yin stolida — stoldagi raqib bilan. Mikrofon tugmasi bosilgunga qadar hech narsa ulanmaydi. */
(function(){
var pcs={},cool={},audios={},an={},targets={},stream=null,ctx=null,gameMode=false,gameRoom=null,unsubRoom=null,
    state="off",muted=false,subs=[],myAn=null,timer=0,mode="mic";
function ice(){
  var l=[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}];
  if(window.PM_TURN)l.push(window.PM_TURN);           /* config.js: PM_TURN={urls:"turn:...",username:"..",credential:".."} */
  return{iceServers:l};
}
function me(){return window.PMnet&&PMnet.id();}
function sig(to,k,d){PMnet.send({t:"rtc",to:to,k:k,d:d});}
function emit(){subs.forEach(function(f){try{f(state,muted,mode);}catch(_){}});}
function lvl(analyser){
  var b=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(b);
  var s=0;for(var i=0;i<b.length;i++){var v=(b[i]-128)/128;s+=v*v;}
  return Math.min(1,Math.sqrt(s/b.length)*5);
}
function tap(stm,id){
  try{if(!ctx)return;var a=ctx.createAnalyser();a.fftSize=256;ctx.createMediaStreamSource(stm).connect(a);an[id]={a:a,v:0,t:0};}catch(_){}
}
function attach(id,stm){
  var a=audios[id];if(!a){a=audios[id]=new Audio();a.autoplay=true;a.playsInline=true;}
  a.srcObject=stm;a.volume=(targets[id]&&targets[id].vol!=null)?targets[id].vol:1;
  var p=a.play();if(p&&p.catch)p.catch(function(){});
  tap(stm,id);
}
function drop(id,wait){
  var e=pcs[id];if(e){try{e.pc.close();}catch(_){}delete pcs[id];}
  var a=audios[id];if(a){try{a.pause();a.srcObject=null;}catch(_){}delete audios[id];}
  delete an[id];if(wait)cool[id]=Date.now()+wait;
}
function mkPc(id){
  var pc=new RTCPeerConnection(ice()),e={pc:pc,pend:[],ready:false,t:Date.now()};pcs[id]=e;
  pc.onicecandidate=function(ev){if(ev.candidate)sig(id,"ice",ev.candidate.toJSON());};
  pc.ontrack=function(ev){attach(id,ev.streams&&ev.streams[0]||new MediaStream([ev.track]));};
  pc.onconnectionstatechange=function(){var s=pc.connectionState;if(s==="failed"||s==="closed"||s==="disconnected"){if(pcs[id]===e)drop(id,2500);}};
  return e;
}
function addLocal(pc){if(stream)stream.getTracks().forEach(function(t){pc.addTrack(t,stream);});}
function call(id){
  var e=mkPc(id);
  if(stream)addLocal(e.pc);else e.pc.addTransceiver("audio",{direction:"recvonly"});
  e.pc.createOffer().then(function(o){return e.pc.setLocalDescription(o);}).then(function(){sig(id,"offer",e.pc.localDescription.toJSON());}).catch(function(){drop(id,3000);});
}
function onSig(m){
  if(state==="off")return;
  var id=m.from,e=pcs[id];
  if(m.k==="offer"){
    if(!targets[id])return;                          /* uzoqdagi yoki tanlanmagan odamning qo'ng'irog'i qabul qilinmaydi */
    if(e)drop(id);
    e=mkPc(id);
    e.pc.setRemoteDescription(m.d).then(function(){addLocal(e.pc);e.ready=true;
      e.pend.forEach(function(c){e.pc.addIceCandidate(c).catch(function(){});});e.pend=[];
      return e.pc.createAnswer();}).then(function(a){return e.pc.setLocalDescription(a);})
      .then(function(){sig(id,"answer",e.pc.localDescription.toJSON());}).catch(function(){drop(id,3000);});
  }else if(m.k==="answer"&&e){
    e.pc.setRemoteDescription(m.d).then(function(){e.ready=true;e.pend.forEach(function(c){e.pc.addIceCandidate(c).catch(function(){});});e.pend=[];}).catch(function(){});
  }else if(m.k==="ice"&&e){
    if(e.ready)e.pc.addIceCandidate(m.d).catch(function(){});else e.pend.push(m.d);
  }
}
function sync(){
  if(state==="off")return;
  var my=me(),now=Date.now(),id;
  if(!my)return;
  for(id in targets){
    var t=targets[id];
    if(audios[id])audios[id].volume=t.vol==null?1:t.vol;
    if(!pcs[id]&&my<id&&now>(cool[id]||0))call(id);   /* faqat id'si kichigi qo'ng'iroq qiladi — to'qnashuv bo'lmaydi */
  }
  for(id in pcs){if(!targets[id])drop(id);else if(pcs[id].pc.connectionState!=="connected"&&now-pcs[id].t>7000)drop(id,1500);}
}
function setTracks(){if(stream)stream.getAudioTracks().forEach(function(t){t.enabled=!muted;});}
window.VOICE={
  get state(){return state;},get muted(){return muted;},get mode(){return mode;},
  supported:function(){return !!(window.RTCPeerConnection&&window.WebSocket);},
  onstate:function(f){subs.push(f);},
  start:function(){
    if(state!=="off")return Promise.resolve();
    if(!VOICE.supported())return Promise.reject(new Error("unsupported"));
    try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==="suspended")ctx.resume();}catch(_){}
    var md=navigator.mediaDevices;
    var ask=(md&&md.getUserMedia)?md.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}):Promise.reject(new Error("nomic"));
    return ask.then(function(s){stream=s;mode="mic";},function(){stream=null;mode="listen";}).then(function(){
      state="on";muted=false;setTracks();
      if(stream&&ctx)tap(stream,"__me");
      clearInterval(timer);timer=setInterval(sync,900);emit();sync();
    });
  },
  stop:function(){
    state="off";clearInterval(timer);
    Object.keys(pcs).forEach(function(i){drop(i);});
    if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}
    delete an.__me;mode="mic";emit();
  },
  setMuted:function(v){muted=!!v;setTracks();emit();},
  setTargets:function(t){if(gameMode)return;targets=t||{};},
  callRoom:function(rm){
    gameMode=true;gameRoom=rm;
    function upd(){var t={};rm.peers().forEach(function(p){if(!p.isMe)t[p.peer]={vol:1};});targets=t;sync();}
    upd();unsubRoom=rm.onPeers(upd);
  },
  hangup:function(){
    if(!gameMode)return;
    gameMode=false;gameRoom=null;if(unsubRoom){try{unsubRoom();}catch(_){}unsubRoom=null;}
    targets={};sync();
  },
  level:function(id){
    var e=an[id];if(!e)return 0;var n=performance.now();
    if(n-e.t>70){e.t=n;e.v=e.v*.5+lvl(e.a)*.5;}
    return e.v;
  }
};
if(window.PMnet)PMnet.onRtc(onSig);
})();
