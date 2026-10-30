// Pingvin Muzeyi — statik fayllar + WebSocket (kutubxonasiz, faqat Node 18+)
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const PORT=process.env.PORT||3000,PUB0=path.join(__dirname,"public"),FLAT=!fs.existsSync(PUB0),PUB=FLAT?__dirname:PUB0,MAXCONN=500;
const FILES=["/index.html","/net.js","/sw.js","/manifest.webmanifest","/icon-192.png","/icon-512.png"]; // fayllar bitta papkada tursa faqat shular beriladi
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".ico":"image/x-icon",".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json"};
const server=http.createServer((req,res)=>{
  let u;try{u=decodeURIComponent(req.url.split("?")[0]);}catch{res.writeHead(400);return res.end();}
  if(u==="/healthz")return res.end("ok");
  if(u==="/")u="/index.html";
  if(FLAT&&!FILES.includes(u)){res.writeHead(404);return res.end("404");}
  const f=path.join(PUB,path.normalize(u));
  if(!f.startsWith(PUB+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(f,(e,d)=>{
    if(e){res.writeHead(404);return res.end("404");}
    res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(d);
  });
});

/* ---- minimal WebSocket ---- */
function frame(op,data){const n=data.length;let h;
  if(n<126)h=Buffer.from([128|op,n]);
  else if(n<65536){h=Buffer.alloc(4);h[0]=128|op;h[1]=126;h.writeUInt16BE(n,2);}
  else{h=Buffer.alloc(10);h[0]=128|op;h[1]=127;h.writeBigUInt64BE(BigInt(n),2);}
  return Buffer.concat([h,data]);}
function send(s,obj){if(s.writable)s.write(frame(1,Buffer.from(JSON.stringify(obj))));}
function parse(s,chunk){
  s.buf=Buffer.concat([s.buf,chunk]);
  for(;;){
    const b=s.buf;if(b.length<2)return;
    const op=b[0]&15;let len=b[1]&127,off=2;
    if(!(b[1]&128)){s.destroy();return;}
    if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4;}
    else if(len===127){if(b.length<10)return;len=Number(b.readBigUInt64BE(2));off=10;}
    if(len>8192){s.destroy();return;}
    if(b.length<off+4+len)return;
    const mask=b.subarray(off,off+4),data=Buffer.from(b.subarray(off+4,off+4+len));
    for(let i=0;i<len;i++)data[i]^=mask[i&3];
    s.buf=b.subarray(off+4+len);
    if(op===8){s.end(frame(8,Buffer.alloc(0)));return;}
    if(op===9)s.write(frame(10,data));
    else if(op===10)s.alive=true;
    else if(op===1)onMsg(s,data.toString());
  }
}

/* ---- xonalar va presence ---- */
const rooms=new Map();let nid=1,conns=0;
const NAME=/^[a-z0-9][a-z0-9_.-]{0,47}$/;
function flush(n){const r=rooms.get(n);if(!r)return;r.dirty=false;
  const msg={t:"peers",r:n,peers:[...r.m.values()].map(v=>({id:v.id,p:v.p}))};
  for(const s of r.m.keys())send(s,msg);}
function mark(n){const r=rooms.get(n);if(r&&!r.dirty){r.dirty=true;setTimeout(()=>flush(n),40);}}
function leave(s,n){const r=rooms.get(n);if(!r||!r.m.delete(s))return;s.rooms.delete(n);if(r.m.size)mark(n);else rooms.delete(n);}
function onMsg(s,raw){
  let m;try{m=JSON.parse(raw);}catch{return;}
  if(m&&typeof m.t==="string"&&m.t.slice(0,3)==="mf_")return mfMsg(s,m);
  const n=m&&m.r;if(typeof n!=="string"||!NAME.test(n))return;
  if(m.t==="join"){
    if(s.rooms.has(n))return mark(n);
    if(s.rooms.size>=8)return;
    let r=rooms.get(n);if(!r)rooms.set(n,r={m:new Map(),dirty:false});
    r.m.set(s,{id:s.id,p:{}});s.rooms.add(n);mark(n);
  }else if(m.t==="pres"){
    const r=rooms.get(n),v=r&&r.m.get(s);
    if(!v||!m.p||typeof m.p!=="object"||Array.isArray(m.p))return;
    const np={...v.p};
    for(const k of Object.keys(m.p)){if(k==="__proto__")continue;if(m.p[k]===null)delete np[k];else np[k]=m.p[k];}
    if(JSON.stringify(np).length>4096)return;
    v.p=np;mark(n);
  }else if(m.t==="leave")leave(s,n);
}
/* ---- Mafiya (server hakam: rollar faqat serverda, mijozga faqat o'ziniki yuboriladi) ---- */
const MF=new Map(),ROLE={mafia:"Mafiya",doc:"Doktor",det:"Komissar",civ:"Tinch aholi"};
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return a;};
const mfErr=(s,e)=>send(s,{t:"mf_err",e});
const hpw=(pw,salt)=>crypto.scryptSync(pw,salt,32,{N:4096});
const live=r=>[...r.pl.values()].filter(p=>!p.left);
function mfView(r,me){
  const end=r.ph==="end",cnt={};
  if(r.ph==="day")for(const p of r.pl.values())if(p.pick)cnt[p.pick]=(cnt[p.pick]||0)+1;
  return{n:r.name,ph:r.ph,d:r.d,w:r.w,host:me.id===r.host,left:Math.max(0,Math.ceil((r.dl-Date.now())/1000)),
    me:{id:me.id,role:me.role,alive:me.alive,pick:me.pick,priv:me.priv},
    pl:live(r).concat([...r.pl.values()].filter(p=>p.left)).map(p=>({id:p.id,nick:p.nick,alive:p.alive,votes:cnt[p.id]||0,
      role:(end||p===me||!p.alive||(me.role==="mafia"&&p.role==="mafia"))?p.role:null})),
    log:r.log.slice(-10),chat:r.chat.slice(-12)};}
const mfSend=r=>{for(const p of r.pl.values())if(!p.left)send(p.s,{t:"mf",s:mfView(r,p)});};
function mfPhase(r,ph,sec,fn){clearTimeout(r.t);r.ph=ph;r.t=null;if(sec){r.dl=Date.now()+sec*1000;r.t=setTimeout(()=>fn(r),sec*1000);}mfSend(r);}
function mfStart(r){
  for(const [id,p] of r.pl)if(p.left)r.pl.delete(id);
  if(r.pl.size<5||r.pl.size>10)return;
  const ps=shuf([...r.pl.values()]),n=ps.length,nm=Math.max(1,Math.floor(n/3));
  ps.forEach((p,i)=>{p.role=i<nm?"mafia":i===nm?"doc":i===nm+1?"det":"civ";p.alive=true;p.pick=null;p.priv=[];});
  r.d=0;r.w=null;r.log=["O'yin boshlandi: "+nm+" mafiya, 1 doktor, 1 komissar, "+(n-nm-2)+" tinch aholi"];
  mfNight(r);}
function mfNight(r){r.d++;for(const p of r.pl.values())p.pick=null;r.log.push("🌙 "+r.d+"-tun. Shahar uxlaydi");mfPhase(r,"night",45,mfDawn);}
function mfTally(ps,rnd){const c={};ps.forEach(p=>{if(p.pick)c[p.pick]=(c[p.pick]||0)+1;});
  const mx=Math.max(0,...Object.values(c)),top=Object.keys(c).filter(k=>c[k]===mx);return mx&&(top.length===1||rnd)?shuf(top)[0]:null;}
function mfDawn(r){
  if(r.ph!=="night")return;
  const al=[...r.pl.values()].filter(p=>p.alive),v=r.pl.get(mfTally(al.filter(p=>p.role==="mafia"),true)),
    doc=al.find(p=>p.role==="doc"),det=al.find(p=>p.role==="det");
  if(det&&det.pick){const t=r.pl.get(det.pick);if(t)det.priv.push(r.d+"-tun: "+t.nick+" — "+(t.role==="mafia"?"MAFIYA":"mafiya emas"));}
  if(v&&!(doc&&doc.pick===v.id)){v.alive=false;r.log.push("☀️ Tong otdi. "+v.nick+" o'ldirildi ("+ROLE[v.role]+")");}
  else r.log.push("☀️ Tong otdi. Bu tunda hech kim o'lmadi");
  if(mfWin(r))return;
  for(const p of r.pl.values())p.pick=null;
  mfPhase(r,"day",75,mfDusk);}
function mfDusk(r){
  if(r.ph!=="day")return;
  const v=r.pl.get(mfTally([...r.pl.values()].filter(p=>p.alive),false));
  if(v){v.alive=false;r.log.push("⚖️ "+v.nick+" chiqarib yuborildi ("+ROLE[v.role]+")");}else r.log.push("⚖️ Ovozlar teng — hech kim chiqarilmadi");
  if(mfWin(r))return;mfNight(r);}
function mfWin(r){
  const al=[...r.pl.values()].filter(p=>p.alive),m=al.filter(p=>p.role==="mafia").length,w=!m?"city":m>=al.length-m?"mafia":null;
  if(!w)return false;
  r.w=w;r.log.push(w==="city"?"🏆 Tinch aholi yutdi!":"🔪 Mafiya yutdi!");mfPhase(r,"end",0);return true;}
function mfAct(r,p,to){
  const t=r.pl.get(to);if(!t||!t.alive||!p.alive)return;
  if(r.ph==="night"){
    const ok=p.role==="mafia"?t.role!=="mafia":p.role==="doc"?true:p.role==="det"?t!==p:false;if(!ok)return;p.pick=to;
    if([...r.pl.values()].filter(x=>x.alive&&x.role!=="civ").every(x=>x.pick))return mfDawn(r);
  }else if(r.ph==="day"){
    if(t===p)return;p.pick=to;
    if([...r.pl.values()].filter(x=>x.alive).every(x=>x.pick))return mfDusk(r);
  }else return;
  mfSend(r);}
function mfLeave(s,quiet){
  const p=s.mf;if(!p)return;const r=p.r;s.mf=null;
  if(r.ph==="lobby"||r.ph==="end")r.pl.delete(p.id);else{p.alive=false;p.left=true;r.log.push("🚪 "+p.nick+" o'yindan chiqib ketdi");}
  const L=live(r);
  if(!L.length){clearTimeout(r.t);MF.delete(r.name);}
  else{if(r.host===p.id)r.host=L[0].id;if(!((r.ph==="night"||r.ph==="day")&&mfWin(r)))mfSend(r);}
  if(!quiet)send(s,{t:"mf_out"});}
function mfMsg(s,m){
  if(m.t==="mf_create"||m.t==="mf_join"){
    if(s.mf)return;
    const name=String(m.name||"").trim().slice(0,24),pw=String(m.pw||"").slice(0,64),nick=String(m.nick||"").trim().slice(0,16)||"Mehmon";
    if(!name||pw.length<3)return mfErr(s,"Xona nomi va kamida 3 belgili parol kerak");
    let r=MF.get(name);
    if(m.t==="mf_create"){
      if(r)return mfErr(s,"Bu nomli xona allaqachon bor");
      if(MF.size>=50)return mfErr(s,"Serverda xonalar to'lib ketgan");
      const salt=crypto.randomBytes(16);
      r={name,salt,hash:hpw(pw,salt),pl:new Map(),host:null,ph:"lobby",d:0,chat:[],log:[],t:null,dl:0,w:null};MF.set(name,r);
    }else{
      if(!r)return mfErr(s,"Bunday xona yo'q");
      if((s.bad||0)>=8)return mfErr(s,"Juda ko'p noto'g'ri urinish");
      if(!crypto.timingSafeEqual(hpw(pw,r.salt),r.hash)){s.bad=(s.bad||0)+1;return mfErr(s,"Parol noto'g'ri");}
      if(r.ph!=="lobby"&&r.ph!=="end")return mfErr(s,"O'yin allaqachon boshlangan");
      if(live(r).length>=10)return mfErr(s,"Xona to'la (10/10)");
    }
    const p={id:s.id,s,r,nick,role:null,alive:true,pick:null,priv:[]};
    r.pl.set(s.id,p);if(!r.host)r.host=s.id;s.mf=p;mfSend(r);return;
  }
  const p=s.mf;if(!p)return;const r=p.r;
  if(m.t==="mf_leave")return mfLeave(s);
  if(m.t==="mf_act")return mfAct(r,p,String(m.to));
  if(m.t==="mf_start"){
    if(s.id!==r.host||(r.ph!=="lobby"&&r.ph!=="end"))return;
    if(live(r).length<5)return mfErr(s,"Mafiya kamida 5 kishi bilan o'ynaladi");
    return mfStart(r);}
  if(m.t==="mf_chat"){
    const t=String(m.text||"").trim().slice(0,140),now=Date.now();
    if(!t||now-(s.ct||0)<700||r.ph==="night"||(r.ph==="day"&&!p.alive))return;
    s.ct=now;r.chat.push({n:p.nick,t});if(r.chat.length>40)r.chat.shift();mfSend(r);}
}
server.on("upgrade",(req,s)=>{
  const key=req.headers["sec-websocket-key"];
  if(req.url.split("?")[0]!=="/ws"||String(req.headers.upgrade).toLowerCase()!=="websocket"||!key||conns>=MAXCONN){s.destroy();return;}
  s.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+
    crypto.createHash("sha1").update(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")+"\r\n\r\n");
  s.id="p"+(nid++).toString(36)+Math.random().toString(36).slice(2,6);
  s.rooms=new Set();s.buf=Buffer.alloc(0);s.alive=true;conns++;
  s.on("data",d=>parse(s,d));
  s.on("error",()=>{});
  s.on("close",()=>{conns--;mfLeave(s,true);[...s.rooms].forEach(n=>leave(s,n));});
  send(s,{t:"you",id:s.id});
});
setInterval(()=>{ // o'lik ulanishlarni tozalash + proksi uzib qo'ymasligi uchun ping
  for(const r of rooms.values())for(const s of r.m.keys()){
    if(!s.alive){s.destroy();continue;}s.alive=false;if(s.writable)s.write(frame(9,Buffer.alloc(0)));}
},25000);
server.listen(PORT,()=>console.log("Pingvin Muzeyi: http://localhost:"+PORT));
