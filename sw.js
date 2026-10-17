const RELEASE = {"app":"guild-encrypted-app","version":"5e72b696efca01d9","label":"Guild 1.15","readSaveVersions":[1,2],"assets":[{"path":"index.html","sha256":"cc6f8527ab9c416b34e70f8f4a99986cb527e737d04f027e2a7c110b6f2d4f90"},{"path":"loader.css","sha256":"b15fac0c91c16a7f021c651b919a01410f0c782343316d4485c0ad5160b822f1"},{"path":"loader.js","sha256":"6c6846f86d0f43640a7be03938789780c0c98d4175a548a95a78f17d910d97fc"},{"path":"crypto.js","sha256":"11b91d5b7719f17e7d532c635d199a8a02367d19cfd8b11eb3da031ad5a57fdd"},{"path":"manifest.webmanifest","sha256":"0114a4bb22d9ae81ba60117fc781f98d088d6df107cb3da720019b3463ed36e2"},{"path":"package.enc.json","sha256":"e0f72bee5acc7c4f5c2fc0410474d36d6f907512b18bab5376bf3bfc9676028d"},{"path":"public-key.json","sha256":"c94fbd1d01b82b08ebc183e67c1c3ee4fc9897aec7c741dca369c40a4ffb30e7"},{"path":"icon-192.png","sha256":"709469ce12c0ccba2c1d1272fef396ce5c1d004a3faf2967fd89cd689efb8e9a"},{"path":"icon-512.png","sha256":"77227018db7611dfbc0e14fd443d87ee1b8e998e94085c3fcf2a922782a64f0e"},{"path":"touch.png","sha256":"f0e8a6b1ed458b1dafd907f4cd9f6af3a511e8406ab4ae626bbe18a1ec479194"}]};
'use strict';
const scope=new URL(self.registration.scope),prefix='guild-encrypted-app:'+encodeURIComponent(scope.href)+':',cacheName=prefix+RELEASE.version;
const assets=new Map(RELEASE.assets.map(asset=>[new URL(asset.path,scope).href,asset]));
const index=new URL('index.html',scope).href;
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');
async function ready(){const store=await caches.open(cacheName);return (await Promise.all([...assets.keys()].map(url=>store.match(url)))).every(Boolean);}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{const store=await caches.open(cacheName);for(const [url,asset] of assets){const response=await fetch(new Request(url,{cache:'reload',credentials:'omit',redirect:'error'}));if(!response.ok||response.redirected||hex(await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer()))!==asset.sha256)throw new Error('Incomplete encrypted release');await store.put(url,response);}}
  catch(error){await caches.delete(cacheName);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{if(!await ready())throw new Error('Incomplete release');for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==scope.origin)return;
  const clean=new URL(url.pathname,scope.origin).href,key=event.request.mode==='navigate'&&(clean===scope.href||clean===index)?index:clean;
  if(!assets.has(key))return;
  event.respondWith((async()=>await (await caches.open(cacheName)).match(key)||new Response('Guild offline files are incomplete. Reconnect and reopen.',{status:503}))());
});
self.addEventListener('message',event=>event.waitUntil((async()=>{
  const reply=value=>event.ports?.[0]?.postMessage(value);
  const client=event.source?.id?await self.clients.get(event.source.id):null;if(!client||!client.url.startsWith(scope.href))return;
  if(['GUILD_STATUS','SEALED_STATUS'].includes(event.data?.type))return reply({ready:await ready(),version:RELEASE.version,label:RELEASE.label,readSaveVersions:RELEASE.readSaveVersions});
  if(!['GUILD_ACTIVATE','SEALED_ACTIVATE'].includes(event.data?.type))return;
  if(!await ready())return reply({ok:false,message:'Update is incomplete. Reconnect and try again.'});
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(windows.some(other=>other.id!==client.id&&other.url.startsWith(scope.href)))return reply({ok:false,message:'Close other Guild windows, then try the update again.'});
  reply({ok:true});await self.skipWaiting();
})()));

