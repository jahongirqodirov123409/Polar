/* Tez ochilish: asosiy fayllar telefonda saqlanadi (offline ham ochiladi), yangilari fonda yuklanadi */
const V="pm4",CORE=["./","index.html","config.js","net.js","voice.js","three.min.js","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET"||u.origin!==location.origin)return;          /* shriftlar va boshqa tashqi so'rovlar to'g'ridan-to'g'ri */
  e.respondWith(caches.open(V).then(c=>c.match(r,{ignoreSearch:true}).then(hit=>{
    const net=fetch(r).then(x=>{if(x&&x.ok)c.put(r,x.clone());return x;}).catch(()=>hit);
    return hit||net;                                                /* keshda bor — darhol; fonda yangilanadi */
  })));
});
