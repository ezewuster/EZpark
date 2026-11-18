// Uitvoeren in de browserconsole op de bestaande Sites-demo, na aanmelding indien nodig.
// Leest alleen EZpark-testgegevens en downloadt ze als bestand. Geen verzending.
(()=>{const raw=localStorage.getItem('ezpark-demo-v1');if(!raw){alert('Geen EZpark-gegevens gevonden in deze browser.');return;}const state=JSON.parse(raw);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:1,state},null,2)],{type:'application/json'}));a.download='ezpark-sites-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);})();
