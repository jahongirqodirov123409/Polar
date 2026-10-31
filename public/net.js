/* Onlayn qatlam: server.js bilan WebSocket orqali gaplashadi.
   Delta protokol: server faqat o'zgarganlarni yuboradi, mijoz to'liq ro'yxatni o'zi yig'adi. */
(function(){
var APP=/PingvinApp/.test(navigator.userAgent);   /* APK ichida fayllar allaqachon telefonda — service worker kerak emas */
if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol)&&!APP)navigator.serviceWorker.register("sw.js").catch(function(){});
var mh=[],ch=[],rh=[];
window.PMnet={send:function(o){send(o);},on:function(h){mh.push(h);},onChat:function(h){ch.push(h);},onRtc:function(h){rh.push(h);},
  id:function(){return myId;},connected:function(){return !!ws&&ws.readyState===1;},rtt:0};
if(!window.WebSocket)return;
var ws=null,myId=null,rooms={},tries=0,queue=[],pingT=0;
/* APK uchun: config.js ichida PM_WS="wss://sizning-server/ws" yoziladi */
function wsUrl(){
  if(window.PM_WS)return window.PM_WS;
  if(APP&&window.console)console.warn("config.js ichida PM_WS (server manzili) yozilmagan");
  return (location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws";
}
function send(o){
  var s=JSON.stringify(o);
  if(ws&&ws.readyState===1)ws.send(s);
  else if(o.t==="rtc"||o.t==="chat"||o.t.slice(0,3)==="mf_"){if(queue.length<20)queue.push(s);}
}
function mk(name){
  var map={},pres={},hs=[],res=[],peers=[],
  r={name:name,ok:false,
    presence:function(p){for(var k in p){if(p[k]===null)delete pres[k];else pres[k]=p[k];}send({t:"pres",r:name,p:p});build();return Promise.resolve();},
    peers:function(){return peers;},
    onPeers:function(h){hs.push(h);return function(){hs=hs.filter(function(x){return x!==h;});};},
    connected:function(){return !!ws&&ws.readyState===1;},
    join:function(n){return joinRoom(n);},
    chat:function(text,nick){send({t:"chat",r:name,text:text,nick:nick});},
    leave:function(){send({t:"leave",r:name});delete rooms[name];hs=[];return Promise.resolve();},
    _snap:function(list){map={};list.forEach(function(p){map[p.id]=p.p;});r.ok=true;r.joining=false;build();var w=res;res=[];w.forEach(function(f){f(r);});},
    _delta:function(m){
      (m.u||[]).forEach(function(p){map[p.id]=p.p;});
      (m.l||[]).forEach(function(id){delete map[id];});
      build();},
    _open:function(){r.joining=true;send({t:"join",r:name});if(Object.keys(pres).length)send({t:"pres",r:name,p:pres});},
    _wait:function(ms){return new Promise(function(ok,no){res.push(ok);setTimeout(function(){var i=res.indexOf(ok);if(i>=0){res.splice(i,1);no(new Error("timeout"));}},ms||8000);});}
  };
  function build(){
    peers=[];
    for(var id in map)if(id!==myId)peers.push({peer:id,isMe:false,kind:"viewer",presence:map[id]});
    if(myId)peers.push({peer:myId,isMe:true,kind:"viewer",presence:pres});
    for(var i=0;i<hs.length;i++)hs[i]({peers:peers,joined:[],updated:[],left:[]});
  }
  r._build=build;
  return r;
}
function joinRoom(n){
  var r=rooms[n]||(rooms[n]=mk(n));
  if(r.ok)return Promise.resolve(r);
  var w=r._wait();if(!r.joining)r._open();return w;   /* allaqachon so'ralgan bo'lsa ikkinchi marta join yuborilmaydi */
}
function connect(){
  ws=new WebSocket(wsUrl());
  ws.onopen=function(){tries=0;for(var n in rooms)rooms[n]._open();
    var q=queue;queue=[];q.forEach(function(s){try{ws.send(s);}catch(_){}});
    clearInterval(pingT);pingT=setInterval(function(){if(ws&&ws.readyState===1)ws.send('{"t":"ping","c":'+Date.now()+'}');},5000);
    };
  ws.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(_){return;}
    var t=m.t;
    if(t==="pd"){var rr=rooms[m.r];if(rr)rr._delta(m);}
    else if(t==="peers"){var r2=rooms[m.r];if(r2){r2._snap(m.peers);if(m.chat)ch.forEach(function(h){h({r:m.r,hist:m.chat});});}}
    else if(t==="you"){myId=m.id;for(var n in rooms)rooms[n]._build();}
    else if(t==="chat")ch.forEach(function(h){h({r:m.r,m:m.m});});
    else if(t==="rtc")rh.forEach(function(h){h(m);});
    else if(t==="pong"){window.PMnet.rtt=Date.now()-m.c;}
    else mh.forEach(function(h){h(m);});};
  ws.onclose=function(){clearInterval(pingT);mh.forEach(function(h){h({t:"mf_out"});});for(var n in rooms){rooms[n].ok=false;rooms[n].joining=false;}setTimeout(connect,Math.min(3000,300*(++tries)));};
  ws.onerror=function(){};
}
rooms.lobby=mk("lobby");connect();
/* sahifa qayta ko'rinsa (telefon uyg'onsa) darhol qayta ulanish */
document.addEventListener("visibilitychange",function(){if(!document.hidden&&(!ws||ws.readyState>1)){tries=0;connect();}});
window.addEventListener("online",function(){if(!ws||ws.readyState>1){tries=0;connect();}});
window.claude={use:function(n){return n==="room"?joinRoom("lobby").catch(function(){return null;}):Promise.resolve(null);}};
})();
