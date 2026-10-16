'use strict';
(() => {
  const $=selector=>document.querySelector(selector),input=$('#private-key'),events=new AbortController();
  let epoch=0,busy=false,applying=false,mounted=false,registration,prompt,reloadTimer;
  const sessionKey='guild:encrypted-session:'+new URL('./',document.baseURI).pathname+':v1';
  function clearSession(){try{window.sessionStorage.removeItem(sessionKey);return true;}catch{return false;}}
  window.GuildClearUnlockSession=clearSession;
  const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:events.signal});
  function status(text,error=false){if(mounted)return;$('#unlock-status').textContent=text;$('#unlock-status').classList.toggle('error',error);}
  function controls(){if(mounted)return;input.disabled=busy||applying;$('#cancel-unlock').hidden=!busy;$('#check-update').disabled=!registration||busy||applying;$('#apply-update').hidden=!registration?.waiting;$('#apply-update').disabled=busy||applying;$('#update-notice').hidden=!registration?.waiting;$('#install').hidden=!prompt;}
  function cancel(){epoch++;busy=false;input.value='';clearSession();status('Unlocking cancelled. Your local saves are unchanged.');controls();}
  async function hash(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));return 'sha256-'+btoa(String.fromCharCode(...bytes));}
  async function unlock(file,savedSession){
    if((!file&&!savedSession)||busy||applying||mounted)return;
    const job=++epoch;busy=true;controls();status('Unlocking Guild on this device…');
    try{
      let key;
      if(file){
        if(file.size>GuildEncryptedCrypto.maxKey)throw new Error('Choose your Guild private key JSON file (up to 16 KB).');
        try{key=JSON.parse(await file.text());}catch{throw new Error('This is not a readable private key JSON file.');}
      }
      if(job!==epoch)return;
      const response=await fetch('package.enc.json',{cache:'no-store',credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('The encrypted package is unavailable. Reconnect and wait for Offline ready.');
      const text=await response.text();if(text.length>750000)throw new Error('The encrypted app is larger than this loader supports.');
      const envelope=JSON.parse(text),unlocked=savedSession?{app:await GuildEncryptedCrypto.resume(envelope,savedSession),session:savedSession}:await GuildEncryptedCrypto.openForSession(envelope,key);key=null;
      const app=unlocked.app;
      if(job!==epoch)return;
      const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
      if(!csp.includes(await hash(app.js))||!csp.includes(await hash(app.css)))throw new Error('App files do not match this release. Check for updates before unlocking.');
      if(job!==epoch)return;
      try{window.sessionStorage.setItem(sessionKey,JSON.stringify(unlocked.session));}catch{/* Storage restrictions must not prevent a manual unlock. */}
      const template=document.createElement('template');template.innerHTML=app.html;
      input.value='';mounted=true;events.abort();
      for(const link of document.querySelectorAll('link[rel="stylesheet"]'))link.remove();
      const style=document.createElement('style');style.textContent=app.css;document.head.append(style);
      document.body.replaceChildren(template.content.cloneNode(true));document.title='Guild · Adventure Ledger';
      const script=document.createElement('script');script.textContent=app.js;document.body.append(script);
      if(!window.GuildEncryptedStarted){const error=document.createElement('p');error.textContent='Guild could not finish loading. Your local data is preserved. Reload to return to the unlock screen.';error.setAttribute('role','alert');document.body.prepend(error);}
    }catch(error){if(job===epoch){if(savedSession)clearSession();status(error.message||'Could not unlock Guild.',true);}}
    finally{if(!mounted&&job===epoch){busy=false;input.value='';controls();}}
  }
  function message(worker,type){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(new Error('The offline worker did not respond. Reopen Guild and try again.'));},6000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type},[channel.port2]);});}
  async function readiness(){controls();if(!registration?.active||mounted)return;try{const result=await message(registration.active,'GUILD_STATUS');if(!mounted)$('#offline-status').textContent=result.ready?'Offline ready · '+result.label+'. Refresh stays unlocked for this session; Lock Guild clears access.':'Offline files are incomplete. Reconnect before relying on offline use.';}catch(error){if(!mounted)$('#offline-status').textContent=error.message;}}
  listen(input,'change',()=>unlock(input.files?.[0]));listen($('#cancel-unlock'),'click',cancel);
  listen($('#check-update'),'click',async()=>{try{await registration.update();await readiness();}catch{if(!mounted)$('#offline-status').textContent='Could not check for updates. Existing files and saves are preserved.';}});
  listen($('#apply-update'),'click',async()=>{if(!registration?.waiting||busy||applying)return;applying=true;controls();try{const result=await message(registration.waiting,'GUILD_ACTIVATE');if(!result.ok)throw new Error(result.message);reloadTimer=setTimeout(()=>{applying=false;controls();status('The update has not reloaded yet. Close other Guild windows and reopen.',true);},12000);}catch(error){applying=false;status(error.message,true);controls();}});
  listen(window,'beforeinstallprompt',event=>{event.preventDefault();prompt=event;controls();});listen($('#install'),'click',async()=>{if(!prompt)return;const install=prompt;prompt=null;controls();try{await install.prompt();await install.userChoice;}catch{status('Use your browser installation menu or Safari Add to Home Screen.');}});
  listen(window,'pagehide',()=>{epoch++;input.value='';});
  if(!window.isSecureContext||!crypto.subtle){input.disabled=true;status('Unlocking needs HTTPS or a localhost preview with browser encryption support.',true);return;}
  try{const stored=window.sessionStorage.getItem(sessionKey);if(stored){if(stored.length>1024)throw new Error('Invalid session');const remembered=JSON.parse(stored);if(!remembered||typeof remembered!=='object')throw new Error('Invalid session');unlock(null,remembered);}}catch{clearSession();}
  if(!navigator.serviceWorker){$('#offline-status').textContent='Offline installation is unavailable in this browser.';return;}
  listen(navigator.serviceWorker,'controllerchange',()=>{if(applying){clearTimeout(reloadTimer);location.reload();}else readiness();});
  navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:'./',updateViaCache:'none'}).then(async reg=>{registration=reg;if(mounted)return;controls();listen(reg,'updatefound',()=>{const worker=reg.installing;if(worker)listen(worker,'statechange',()=>{if(worker.state==='installed')readiness();if(worker.state==='redundant'&&!mounted)$('#offline-status').textContent='Offline download did not finish. Existing files are preserved.';controls();});});await navigator.serviceWorker.ready;if(!mounted)await readiness();}).catch(()=>{if(!mounted)$('#offline-status').textContent='Offline setup could not finish. Reconnect and reopen Guild to retry.';});
})();
