'use strict';
((root)=>{
  const maxPackage=512*1024,maxKey=16*1024;
  function decode(value,max){
    if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw new Error('Invalid package encoding.');
    const padding=value.endsWith('==')?2:value.endsWith('=')?1:0;if(value.slice(0,value.length-padding).includes('='))throw new Error('Invalid package encoding.');
    const bytes=Uint8Array.from(atob(value),character=>character.charCodeAt(0));if(bytes.length>max)throw new Error('Package exceeds its size limit.');return bytes;
  }
  const header=value=>JSON.stringify({format:value.format,version:value.version,release:value.release,keyId:value.keyId,encryption:value.encryption,wrapping:value.wrapping});
  function checkEnvelope(value){
    if(!value||value.format!=='guild-sealed-package'||value.version!==1||value.encryption!=='AES-256-GCM'||value.wrapping!=='RSA-OAEP-SHA256'||typeof value.release!=='string'||!/^[-\w .]{1,32}$/.test(value.release)||typeof value.keyId!=='string'||!/^[a-f0-9]{64}$/.test(value.keyId))throw new Error('This is not a supported encrypted Guild package.');
    if(decode(value.iv,12).length!==12||decode(value.wrappedKey,384).length!==384||decode(value.ciphertext,maxPackage).length<17)throw new Error('The encrypted Guild package is incomplete.');return value;
  }
  async function open(envelope,keyFile,webCrypto=root.crypto){
    checkEnvelope(envelope);
    if(keyFile?.format!=='guild-prototype-private-key'||keyFile.version!==1||keyFile.algorithm!=='RSA-OAEP-SHA256'||keyFile.keyId!==envelope.keyId)throw new Error('Select your existing Guild private key file.');
    let keyBytes,plaintext;
    try{
      keyBytes=decode(keyFile.pkcs8,maxKey);const privateKey=await webCrypto.subtle.importKey('pkcs8',keyBytes,{name:'RSA-OAEP',hash:'SHA-256'},false,['unwrapKey']);keyBytes.fill(0);
      if(privateKey.algorithm.modulusLength!==3072)throw new Error('Unsupported key');
      const contentKey=await webCrypto.subtle.unwrapKey('raw',decode(envelope.wrappedKey,384),privateKey,{name:'RSA-OAEP'},{name:'AES-GCM',length:256},false,['decrypt']);
      plaintext=new Uint8Array(await webCrypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv,12),additionalData:new TextEncoder().encode(header(envelope)),tagLength:128},contentKey,decode(envelope.ciphertext,maxPackage)));
      const app=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));
      if(app?.format!=='guild-encrypted-app'||app.version!==1||app.release!==envelope.release||!['html','css','js'].every(field=>typeof app[field]==='string'&&app[field].length<=maxPackage)||!Array.isArray(app.readSaveVersions))throw new Error('Invalid Guild app');
      return app;
    }catch{throw new Error('Could not unlock Guild. Check the private key file; the package may also be damaged.');}
    finally{keyBytes?.fill(0);plaintext?.fill(0);}
  }
  const api={open,header,checkEnvelope,maxPackage,maxKey};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GuildEncryptedCrypto=api;
})(globalThis);
