/* Onlayn qatlam: server.js bilan WebSocket orqali gaplashadi (o'yin kodi o'zgarmaydi) */
(function(){
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){});
var mh=[];window.PMnet={send:function(o){send(o);},on:function(h){mh.push(h);}};
if(!window.WebSocket)return;
var ws=null,myId=null,rooms={},tries=0;
function send(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));}
function mk(name){
  var peers=[],hs=[],pres={},res=null,r={name:name,ok:false,
    presence:function(p){for(var k in p){if(p[k]===null)delete pres[k];else pres[k]=p[k];}send({t:"pres",r:name,p:p});return Promise.resolve();},
    peers:function(){return peers;},
    onPeers:function(h){hs.push(h);return function(){hs=hs.filter(function(x){return x!==h;});};},
    connected:function(){return !!ws&&ws.readyState===1;},
    join:function(n){return joinRoom(n);},
    leave:function(){send({t:"leave",r:name});delete rooms[name];hs=[];return Promise.resolve();},
    _in:function(list){
      peers=list.map(function(p){return{peer:p.id,isMe:p.id===myId,kind:"viewer",presence:p.p};});r.ok=true;
      if(res){res(r);res=null;}
      hs.forEach(function(h){h({peers:peers,joined:[],updated:[],left:[]});});},
    _open:function(){send({t:"join",r:name});if(Object.keys(pres).length)send({t:"pres",r:name,p:pres});},
    _wait:function(){return new Promise(function(ok,no){res=ok;setTimeout(function(){if(res){res=null;no(new Error("timeout"));}},10000);});}
  };
  return r;
}
function joinRoom(n){
  var r=rooms[n]||(rooms[n]=mk(n));
  if(r.ok)return Promise.resolve(r);
  var w=r._wait();r._open();return w;
}
function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/ws");
  ws.onopen=function(){tries=0;for(var n in rooms)rooms[n]._open();};
  ws.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(_){return;}
    if(m.t==="you")myId=m.id;else if(/^mf/.test(m.t))mh.forEach(function(h){h(m);});else if(m.t==="peers"&&rooms[m.r])rooms[m.r]._in(m.peers);};
  ws.onclose=function(){mh.forEach(function(h){h({t:"mf_out"});});for(var n in rooms)rooms[n].ok=false;setTimeout(connect,Math.min(5000,500*(++tries)));};
  ws.onerror=function(){};
}
rooms.lobby=mk("lobby");connect();
window.claude={use:function(n){return n==="room"?joinRoom("lobby").catch(function(){return null;}):Promise.resolve(null);}};
})();
