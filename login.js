'use strict';
(async function(){
 const button=document.getElementById('microsoft-login');const status=document.getElementById('login-status');
 const raw=window.EZPARK_MICROSOFT?.backendUrl;
 if(!raw){status.textContent='Microsoft-aanmelding wordt ingericht. Je kunt nog niet inloggen.';return;}
 let backend;
 try{backend=new URL(raw);const local=['localhost','127.0.0.1'].includes(backend.hostname)&&['localhost','127.0.0.1'].includes(location.hostname);if(backend.username||backend.password||backend.search||backend.hash||backend.pathname!=='/'||backend.protocol!=='https:'&&!(local&&backend.protocol==='http:'))throw Error();}
 catch{status.textContent='De aanmeldconfiguratie is ongeldig. Neem contact op met de beheerder.';return;}
 button.disabled=false;status.textContent='';
 button.addEventListener('click',()=>{button.disabled=true;status.textContent='Je wordt doorgestuurd naar Microsoft…';location.assign(new URL('/auth/login',backend).href);});
 // No demo-account fallback, no passwords, no mailbox reads and no tokens in localStorage.
})();
