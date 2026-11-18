const roles = ['Beheerder', 'Beheerder+', 'Technische dienst', 'Manager'];
const numberedDevices = (label, count) =>
  Array.from({length:count}, (_,index)=>label+' '+(index+1));
const garageDevices = {
  Boterdiep: [...numberedDevices('Inrit',4), ...numberedDevices('Uitrit',4), ...numberedDevices('Betaalautomaat',4)],
  Damsterdiep: ['Ingang','Uitgang','Wisselstrook (in- en uitgang)', ...numberedDevices('Betaalautomaat',3)],
  Circus: [...numberedDevices('Ingang',2),'Uitrit', ...numberedDevices('Betaalautomaat',2)],
  Europapark: ['Ingang', ...numberedDevices('Uitrit',2), ...numberedDevices('Betaalautomaat',2)],
  Euroborg: []
};
const garages = Object.keys(garageDevices);
const capabilities = ['Beheer', 'Storingen', 'Inbox', 'Dagrapport', 'Rooster', 'Agenda'];
const mailStatuses = {
  unhandled: 'Onbehandeld',
  inProgress: 'In behandeling',
  completed: 'Afgerond'
};
const previousMailStatuses = new Map([
  ['Te doen', mailStatuses.unhandled],
  ['Wacht op reactie', mailStatuses.inProgress],
  ['Afgehandeld', mailStatuses.completed]
]);
const defaults = {
  users: [
    {id:'eiko', name:'Eiko', role:1, garages, last:null},
    {id:'cis', name:'Cis', role:3, garages, last:null},
    {id:'td', name:'Demo technische dienst', role:2, garages:['Boterdiep'], last:null},
    {id:'beheer', name:'Demo beheerder', role:0, garages, last:null}
  ],
  head:'eiko', transfer:null, status:mailStatuses.unhandled, incidents:[], notes:[], appointments:[], feedback:[]
};
let mail = {
  subject:'Storing betaalautomaat bij Boterdiep',
  sender:'Gemeente Groningen',
  time:'09:05',
  body:'Goedemorgen,\n\nDe betaalautomaat bij de hoofdingang van Boterdiep geeft sinds vanochtend een foutmelding. Kunnen jullie dit laten nakijken?\n\nGroet,\nGemeente Groningen',
  attachment:'Foto display (voorbeeldbijlage)',
  replies:[
    {sender:'Cis',time:'09:22',body:'Bedankt voor de melding. We gaan kijken wat er aan de hand is.'},
    {sender:'Gemeente Groningen',time:'09:41',body:'Ter aanvulling: bezoekers kunnen nog betalen bij de automaat op verdieping −1. De automaat bij de hoofdingang geeft nog steeds een foutmelding.'}
  ]
};
const key = 'ezpark-demo-v1';
const staticHosting = window.EZPARK_STATIC_HOSTING===true || location.hostname.endsWith('.github.io');
let state;
try { state = JSON.parse(localStorage.getItem(key)) || structuredClone(defaults); } catch { const damaged=localStorage.getItem(key);if(damaged)localStorage.setItem('ezpark-recovery-'+Date.now(),damaged);state = structuredClone(defaults); }
state.status = previousMailStatuses.get(state.status) ?? state.status;
state.suppliers ??= [];
// Preserve every existing supplier; earlier demo cleanup is no longer destructive.
state.supplierListUpdated = true;
if (!state.garageCatalogUpdated) {
  for (const person of state.users) {
    if (['eiko','cis'].includes(person.id)) {
      person.garages = [...new Set([...person.garages,'Damsterdiep','Circus','Europapark'])];
    }
  }
  state.garageCatalogUpdated = true;
}

for (const name of ['incidents','notes','appointments','feedback','suppliers']) state[name] ??= [];
const freshLocalDemo = !localStorage.getItem(key);
if (freshLocalDemo) {
  state.suppliers = [{name:'Parkeertechniek Noord (demo)',email:'service@parkeren.example'},{name:'Liftservice Noord (demo)',email:'service@lift.example'}];
  state.incidents = [{id:'demo-storing',garage:'Boterdiep',device:'Betaalautomaat 1',time:Date.now(),body:'Fictieve foutmelding bij kaartbetaling.',status:'Open',source:true}];
  const start = new Date(); start.setHours(10,0,0,0); const end = new Date(start);end.setHours(11);
  state.appointments = [{id:'demo-afspraak',title:'Controle betaalautomaat (demo)',when:localDatetime(start),end:localDatetime(end),garage:'Boterdiep',supplierEmail:'service@parkeren.example',supplierName:'Parkeertechniek Noord (demo)',mailId:'demo-mail',incidentId:'demo-storing',notes:'Fictieve afspraak voor het testen van EZpark.',status:'Gepland'}];
  state.users.find(p=>p.id==='eiko').rights={Inbox:true,Storingen:true,Agenda:true,Dagrapport:true};
}
state.conversations ??= [{id:'demo-mail',garage:'Boterdiep',mail:structuredClone(mail),status:state.status||mailStatuses.unhandled,archived:Boolean(state.mailArchived),replies:state.mailReplies||[]}];
for (const event of state.appointments) {event.id ??= crypto.randomUUID();event.mailId ??= 'demo-mail';event.status ??= 'Gepland';}
let selectedConversationId=state.conversations[0]?.id;
function selectedThread(){return state.conversations.find(t=>t.id===selectedConversationId);}
function mailGarage(){return selectedThread()?.garage||'Boterdiep';}
function attachMailAliases(){for(const [legacy,field] of [['status','status'],['mailArchived','archived'],['mailReplies','replies']])Object.defineProperty(state,legacy,{configurable:true,enumerable:true,get(){return selectedThread()?.[field];},set(value){if(selectedThread())selectedThread()[field]=value;}});}
attachMailAliases();
function localDatetime(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
let active = 'cis', page = 'Inbox', garage = 'Boterdiep';
let inboxStatusFilter = 'Alle statussen';
let mailSelected = false;
const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const user = () => state.users.find(person => person.id === active);
const owns = site => user().garages.includes(site);
const can = name => ({Beheer:true, Storingen:user().role>=2, Inbox:user().role>=3, Dagrapport:user().role>=3, Rooster:true, Agenda:true}[name]);
const allowed = name => name==='Agenda' ? true : (user().rights?.[name] ?? can(name));
const managesAgenda = () => user().rights?.Agenda ?? user().role>=3;
const canEditAppointment = e => owns(e.garage) && (managesAgenda() || e.createdBy===active);
const canInvite = () => allowed('Beheer') && (user().role >= 1 || state.head === active);
const id = () => crypto.randomUUID();
const date = value => new Date(value).toLocaleString('nl-NL',{dateStyle:'short',timeStyle:'short'});
const notify = message => {
  $('#notice').textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $('#notice').textContent = '', 3200);
};
function commit(message) {
  user().last = Date.now();
  try {localStorage.setItem(key, JSON.stringify(state));backupLocalState();} catch {notify('Opslaan in deze browser is mislukt. Exporteer je gegevens als back-up.');return;}
  render();
  notify(message);
}
function options(values, selected) {
  return values.map(value => '<option'+(value === selected?' selected':'')+'>'+safe(value)+'</option>').join('');
}
function heading(title, description) {
  return '<div class="intro"><h1>'+safe(title)+'</h1><p>'+safe(description)+'</p></div>';
}
const dialogViewport = window.visualViewport;
function fitDialogToViewport(keepFocusVisible = false) {
  const dialog = $('#dialog');
  if (!dialog.open || !dialogViewport) return;
  dialog.style.setProperty('--dialog-top', dialogViewport.offsetTop + 'px');
  dialog.style.setProperty('--dialog-height', dialogViewport.height + 'px');

  if (!keepFocusVisible) return;
  const focused = document.activeElement;
  if (!dialog.contains(focused) || !focused.matches('input, select, textarea')) return;
  const field = focused.getBoundingClientRect();
  const panel = dialog.getBoundingClientRect();
  if (field.bottom > panel.bottom - 12 || field.top < panel.top + 12) {
    dialog.scrollTop += field.bottom > panel.bottom - 12
      ? field.bottom - panel.bottom + 12
      : field.top - panel.top - 12;
  }
}

dialogViewport?.addEventListener('resize', () => fitDialogToViewport(true));
dialogViewport?.addEventListener('scroll', () => fitDialogToViewport());

function openForm(title, fields, submit, onSubmit) {
  const dialog = $('#dialog');
  dialog.innerHTML = '<h2 id="dialog-title">'+safe(title)+'</h2><form>'+fields+'<div class="actions"><button class="primary">'+safe(submit)+'</button><button type="button" id="cancel">Annuleren</button></div></form>';
  dialog.setAttribute('aria-labelledby','dialog-title');
  $('#cancel').onclick = () => dialog.close();
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget), dialog);
  };
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  fitDialogToViewport();
}
function finish(dialog, message) {
  dialog.close();
  commit(message);
}
function inbox(){
 const archive=page==='Archief';const visible=state.conversations.filter(t=>owns(t.garage)&&Boolean(t.archived)===archive&& (archive||inboxStatusFilter==='Alle statussen'||t.status===inboxStatusFilter));
 const filters=archive?'':'<div class="actions inbox-filters" role="group" aria-label="Inbox filteren op status">'+['Alle statussen',...Object.values(mailStatuses)].map(status=>'<button type="button" data-inbox-filter="'+safe(status)+'" aria-pressed="'+(status===inboxStatusFilter)+'">'+safe(status)+'</button>').join('')+'</div>';
 const rows=visible.map(t=>'<div class="mail-row"><button class="mail" data-thread="'+safe(t.id)+'" aria-expanded="'+(mailSelected&&t.id===selectedConversationId)+'"><small>'+safe(t.mail.sender)+' · '+safe(t.garage)+'</small><strong>'+safe(t.mail.subject)+'</strong><small>'+((t.mail.replies||[]).length+(t.replies||[]).length+1)+' berichten · '+safe(t.status)+'</small></button><button type="button" class="mail-archive-quick" data-mail-archive="'+safe(t.id)+'" aria-label="'+(archive?'Terug naar inbox':'Gesprek archiveren')+'">'+(archive?'↶':'×')+'</button></div>').join('');
 const t=selectedThread();let detail='';if(mailSelected&&t&&visible.includes(t)){mail=t.mail;const messages=[mail,...(mail.replies||[]),...(t.replies||[])];detail='<article class="card" id="message"><div class="row"><span class="pill">'+messages.length+' berichten</span><label>Status <select id="mail-status">'+options(Object.values(mailStatuses),t.status)+'</select></label></div><h2 id="thread-title" tabindex="-1">'+safe(mail.subject)+'</h2><div class="mail-thread">'+messages.map((m,i)=>'<details class="thread-message"'+(i===messages.length-1?' open':'')+'><summary><strong>'+safe(m.sender)+'</strong> <small>'+safe(m.sentAt?date(m.sentAt):m.time)+'</small></summary><div class="mailbody">'+safe(m.body)+'</div>'+(m.attachment?'<p>'+safe(m.attachment)+'</p>':'')+'</details>').join('')+'</div><div class="actions"><button type="button" data-mail-archive="'+safe(t.id)+'">'+(archive?'Terug naar inbox':'Archiveren')+'</button><button class="primary" id="reply">Beantwoorden</button>'+(allowed('Storingen')?'<button id="forward">Doorzetten naar leverancier</button>':'')+(allowed('Agenda')?'<button id="plan">Plan afspraak</button>':'')+'</div></article>';}
 return heading(page,archive?'Gearchiveerde gesprekken; terugzetten kan zonder gegevensverlies.':'Gebundelde gesprekken per garage. Alle verzendingen worden gesimuleerd.')+filters+'<div class="grid"><div class="card"><h2>'+ (archive?'Archief':'Postvak in')+'</h2>'+ (rows||'<p>Geen gesprekken voor deze selectie.</p>')+'</div>'+detail+'</div>';
}
function replyToMail() {
  if (!allowed('Inbox') || !owns(mailGarage())) return;
  openForm('Mail beantwoorden',
    '<div><strong>Aan</strong> '+safe(mail.sender)+'<br><strong>Onderwerp</strong> '+safe('Re: '+mail.subject)+'</div>'+
    '<label>Antwoord<textarea name="reply" required></textarea></label>'+
    '<small>Je antwoord verschijnt in dit gesprek als testbericht.</small>',
    'Antwoord simuleren',(data,dialog)=>{
      if (!allowed('Inbox') || !owns(mailGarage())) return;
      const body = data.get('reply').trim();
      if (!body) {
        const field = dialog.querySelector('[name="reply"]');
        field.setCustomValidity('Vul een antwoord in.');
        field.reportValidity();
        field.setCustomValidity('');
        return;
      }
      (state.mailReplies ??= []).push({sender:user().name,body,sentAt:Date.now()});
      finish(dialog,'Testantwoord toegevoegd aan het gesprek.');
      $('#message .thread-message[open] summary').focus();
    });
}
function bindSupplierPicker(previousEmail) {
  const picker = $('#supplier');
  const toggle = $('#supplier-toggle');
  const remove = $('#supplier-remove');
  const fields = $('#supplier-fields');
  const name = $('#supplier-name');
  const email = $('#supplier-email');
  const status = $('#supplier-status');
  function showSuppliers(selectedEmail) {
    picker.innerHTML = '<option value="">Kies een leverancier</option>'+state.suppliers.map(supplier=>
      '<option value="'+safe(supplier.email)+'">'+safe(supplier.name+' · '+supplier.email)+'</option>').join('');
    if ([...picker.options].some(option=>option.value===selectedEmail)) picker.value = selectedEmail;
    remove.hidden = !picker.value;
  }
  function showFields(open) {
    fields.hidden = !open;
    name.disabled = email.disabled = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open?'Toevoegen annuleren':'Leverancier toevoegen';
    if (open) {
      status.textContent = '';
      name.focus();
    }
  }
  showSuppliers(previousEmail);
  picker.onchange = ()=>{
    remove.hidden = !picker.value;
    status.textContent = '';
  };
  remove.onclick = ()=>{
    if (!allowed('Storingen') && !allowed('Agenda')) return;
    const selected = state.suppliers.find(supplier=>supplier.email===picker.value);
    if (!selected || !window.confirm(selected.name+' uit de leverancierslijst verwijderen?')) return;
    state.suppliers = state.suppliers.filter(supplier=>supplier !== selected);
    commit('');
    showSuppliers();
    picker.focus();
    status.textContent = 'Leverancier verwijderd.';
  };
  toggle.onclick = ()=>showFields(fields.hidden);
  $('#supplier-save').onclick = ()=>{
    if (!allowed('Storingen') && !allowed('Agenda')) return;
    name.value = name.value.trim();
    email.value = email.value.trim();
    if (!name.reportValidity() || !email.reportValidity()) return;
    const suppliers = state.suppliers;
    const existing = suppliers.find(supplier=>supplier.email.toLowerCase()===email.value.toLowerCase());
    if (!existing) {
      state.suppliers = [...suppliers,{name:name.value,email:email.value}];
      commit('');
    }
    showSuppliers(existing?.email ?? email.value);
    showFields(false);
    name.value = email.value = '';
    picker.focus();
    status.textContent = existing?'Deze leverancier stond al in de lijst en is geselecteerd.':'Leverancier opgeslagen en geselecteerd.';
  };
}
function compose(fromMail=false, incident=null) {
  if (!allowed('Storingen')) return;
  const locations = user().garages;
  if (!locations.length) return notify('Geen garage toegewezen.');
  const selected = incident?.garage || (fromMail?mailGarage():garage);
  const editable = !incident;
  const existing = state.incidents.filter(item => owns(item.garage));
  const fields = editable
    ? '<label>Garage<select name="garage">'+options(locations,selected)+'</select></label>'+
      (fromMail?'<label>Bestaande storing koppelen<select name="existing"></select></label>':'')+
      '<div id="device-fields"></div>'
    : '<p>'+safe(incident.garage+' · '+incident.device)+'</p>';
  const send = fromMail || Boolean(incident);
  let attachments = [];
  openForm(send?'Doorzetten naar leverancier':'Storing registreren', fields+
    (send?'<label>Leverancier<select name="recipient" id="supplier" required></select></label>'+
      '<div class="actions"><button type="button" id="supplier-toggle" aria-expanded="false" aria-controls="supplier-fields">Leverancier toevoegen</button>'+
      '<button type="button" id="supplier-remove" hidden>Leverancier verwijderen</button></div>'+
      '<div id="supplier-fields" hidden><fieldset><legend>Nieuwe leverancier</legend>'+
      '<label>Naam<input id="supplier-name" required disabled></label>'+
      '<label>E-mailadres<input id="supplier-email" type="email" required disabled></label>'+
      '<button type="button" id="supplier-save">Leverancier opslaan</button></fieldset></div>'+
      '<small id="supplier-status" role="status"></small>'+
      '<label>Onderwerp<input name="subject" required></label>':'')+
    '<label>Omschrijving<textarea name="body" required></textarea></label>'+
    (fromMail?'<label><span><input type="checkbox" name="attachment"> '+safe(mail.attachment)+' meesturen</span></label>':'')+
    (send?'<div class="attachment-picker"><label for="attachments">Bijlagen toevoegen</label><input id="attachments" type="file" multiple aria-describedby="attachment-help"><small id="attachment-help">Kies foto’s of bestanden. De demo bewaart de bestandsnamen.</small><ul id="attachment-list"></ul></div>':''),
    send?'Verzending simuleren':'Storing opslaan',(data,dialog)=>{
      if (send && !$('#supplier-fields').hidden) {
        $('#supplier-save').click();
        return;
      }
      const linked = incident || existing.find(item=>item.id===data.get('existing') && item.garage===data.get('garage'));
      const device = (data.get('customDevice') ?? data.get('device') ?? '').trim();
      if (!linked && !device) return notify('Kies of vul een apparaat in.');
      const item = linked || {id:id(), garage:data.get('garage'),device,time:Date.now(),body:data.get('body')};
      if (!owns(item.garage)) return;
      const subject = data.get('subject')?.trim();
      if (send && !subject) {
        const field = dialog.querySelector('[name="subject"]');
        field.setCustomValidity('Vul een onderwerp in.');
        field.reportValidity();
        field.setCustomValidity('');
        return;
      }
      item.status = send?'Wacht op leverancier':'Open';
      if (send) item.concept = {recipient:data.get('recipient'),subject,body:data.get('body'),attachment:data.has('attachment'),files:attachments.map(file=>file.name)};
      if (fromMail) {item.source = true;item.mailId=selectedConversationId; state.status=mailStatuses.inProgress;}
      if (!linked) state.incidents.unshift(item);
      finish(dialog,send?'Verzending gesimuleerd. De storing staat in het dagrapport.':'Storing opgeslagen.');
    });
  if (editable) {
    const locationField = $('#dialog [name="garage"]');
    const existingField = $('#dialog [name="existing"]');
    const deviceFields = $('#device-fields');
    function showDevices() {
      const devices = garageDevices[locationField.value] || [];
      if (!devices.length) {
        deviceFields.innerHTML = '<label>Apparaat<input name="customDevice" required></label>';
        return;
      }
      deviceFields.innerHTML = '<label>Apparaat<select name="device" required>'+
        '<option value="">Kies een apparaat</option>'+options(devices)+
        '<option value="other">Ander apparaat</option></select></label>'+
        '<div hidden><label>Naam apparaat<input name="customDevice" disabled></label></div>';
      const deviceField = deviceFields.querySelector('select');
      const customField = deviceFields.querySelector('input');
      deviceField.onchange = ()=>{
        const custom = deviceField.value==='other';
        customField.closest('div').hidden = !custom;
        customField.disabled = !custom;
        customField.required = custom;
      };
    }
    function updateGarage() {
      if (existingField) {
        existingField.innerHTML = '<option value="">Nieuwe storing</option>'+
          existing.filter(item=>item.garage===locationField.value).map(item=>
            '<option value="'+safe(item.id)+'">'+safe(item.device)+'</option>').join('');
      }
      showDevices();
    }
    if (existingField) existingField.onchange = ()=>{
      deviceFields.hidden = Boolean(existingField.value);
      for (const field of deviceFields.querySelectorAll('select, input')) {
        field.disabled = deviceFields.hidden || (field.name==='customDevice' && field.closest('div').hidden);
      }
    };
    locationField.onchange = ()=>{
      deviceFields.hidden = false;
      updateGarage();
    };
    updateGarage();
  }
  if (!send) return;

  bindSupplierPicker(incident?.concept?.recipient);
  const picker = $('#attachments');
  const list = $('#attachment-list');
  function showAttachments() {
    list.replaceChildren(...attachments.map((file,index)=>{
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Verwijderen';
      remove.setAttribute('aria-label','Verwijder '+file.name);
      remove.onclick = ()=>{
        attachments.splice(index,1);
        showAttachments();
        (list.querySelectorAll('button')[index] || list.lastElementChild?.querySelector('button') || picker).focus();
      };
      row.append(name,remove);
      return row;
    }));
  }
  picker.onchange = ()=>{
    attachments.push(...picker.files);
    picker.value = '';
    showAttachments();
  };
}
const agendaModes = {day:'Dag', week:'Week', month:'Maand'};
let agendaMode = 'week';
let agendaDate = new Date();
const agendaDay = (date, offset=0) => new Date(date.getFullYear(),date.getMonth(),date.getDate()+offset);
function agendaPeriod() {
  if (agendaMode==='month') {
    return [new Date(agendaDate.getFullYear(),agendaDate.getMonth(),1),new Date(agendaDate.getFullYear(),agendaDate.getMonth()+1,1)];
  }
  if (agendaMode==='week') {
    const monday = agendaDay(agendaDate,-((agendaDate.getDay()+6)%7));
    return [monday,agendaDay(monday,7)];
  }
  return [agendaDay(agendaDate),agendaDay(agendaDate,1)];
}
function operational(report) {
  const person = user();
  if (!person.garages.length) return heading(page,'Geen garage toegewezen.');
  if (!owns(garage)) garage = person.garages[0];
  const incidents = state.incidents.filter(item=>item.garage===garage);
  const cards = incidents.map(item=>'<article class="card"><div class="row"><h3>'+safe(item.device)+'</h3><span class="pill">'+safe(item.status)+'</span></div><p>'+safe(item.body)+'</p><small>'+date(item.time)+(item.source?' · Gemeentemail':'')+'</small>'+
   (report?'<p>Overdracht · '+safe(item.update || (item.status==='Wacht op leverancier'?'Reactie leverancier opvolgen.':item.status==='Opgelost'?'Afgehandeld.':'Storing opvolgen.'))+'</p>':'<div class="actions"><button data-update="'+item.id+'">Update toevoegen</button><button data-send="'+item.id+'">Doorzetten naar leverancier</button></div>')+
   (item.concept?'<details><summary>Gesimuleerde leveranciersmail</summary><p>'+safe(item.concept.recipient)+' · '+safe(item.concept.subject)+'</p><p>'+safe(item.concept.body)+'</p>'+(item.concept.attachment?'<p>'+safe(mail.attachment)+'</p>':'')+((item.concept.files || []).length?'<ul>'+item.concept.files.map(name=>'<li class="attachment-name">'+safe(name)+'</li>').join('')+'</ul>':'')+'</details>':'')+'</article>').join('');
  const notes = report?state.notes.filter(note=>note.garage===garage).map(note=>'<article class="card">'+safe(note.text)+' <small>· '+date(note.time)+'</small></article>').join(''):'';
  return heading(page,report?'Bijzonderheden en openstaande acties voor de volgende ploeg.':'Meld, behandel en volg apparatuurstoringen op.')+
  '<div class="card row"><label>Garage <select id="garage">'+options(person.garages,garage)+'</select></label><button class="primary" id="new-entry">'+(report?'Bijzonderheid toevoegen':'Storing registreren')+'</button></div>'+
  (cards || '<p>Er zijn nog geen storingen voor deze garage.</p>')+notes;
}
function editor(person) {
  if (!person && !canInvite()) return;
  const target = person || {name:'',email:'',role:0,garages:[],rights:{}};
  const manageRoles = user().role>=1 || state.head===active;
  const roleOptions = (manageRoles?roles.slice(0,user().role+1):roles.slice(0,1)).map((role,index)=>'<option value="'+index+'"'+(index===target.role?' selected':'')+'>'+role+'</option>').join('');
  openForm(person?'Collega bewerken':'Collega toevoegen',
    '<label>Naam<input name="name" required value="'+safe(target.name)+'"></label><label>Zakelijk e-mailadres<input name="email" type="email" required value="'+safe(target.email || (person?person.id+'@ezpark.example':''))+'"></label>'+
    '<label>Rol<select name="role">'+roleOptions+'</select></label><fieldset><legend>Garages</legend>'+user().garages.map(site=>'<label><span><input name="garage" type="checkbox" value="'+site+'" '+(target.garages.includes(site)?'checked':'')+'> '+site+'</span></label>').join('')+'</fieldset>'+
    '<p>Iedereen kan afspraken toevoegen. Het agendarecht hieronder bepaalt beheer van andermans afspraken.</p><fieldset><legend>Rechten per functie</legend>'+capabilities.map(cap=>'<label>'+cap+'<select name="'+cap+'">'+options(['Standaard','Toestaan','Intrekken'],target.rights?.[cap]===true?'Toestaan':target.rights?.[cap]===false?'Intrekken':'Standaard')+'</select></label>').join('')+'</fieldset>',
    person?'Opslaan':'Uitnodiging simuleren',(data,dialog)=>{
      if (!person && !canInvite()) return;
      if (state.users.some(entry=>entry.id!==person?.id && (entry.email || entry.id+'@ezpark.example').toLowerCase()===data.get('email').toLowerCase())) return notify('Dit e-mailadres bestaat al.');
      const entry = person || {id:id(),last:null};
      const rights = {};
      for (const cap of capabilities) if (data.get(cap)!=='Standaard' && (allowed(cap) || data.get(cap)==='Intrekken')) rights[cap]=data.get(cap)==='Toestaan';
      Object.assign(entry,{name:data.get('name'),email:data.get('email'),role:Number(data.get('role')),garages:[...target.garages.filter(site=>!owns(site)),...data.getAll('garage')],rights});
      if (!person) state.users.push(entry);
      finish(dialog,person?'Collega bijgewerkt.':'Uitnodiging gesimuleerd.');
    });
}
function management() {
  const activeCount = state.users.filter(person=>person.last && Date.now()-person.last<30*86400000).length;
  const people = state.users.map(person=>'<div class="row"><p><strong>'+safe(person.name)+'</strong> · '+roles[person.role]+(state.head===person.id?' · Hoofdbeheer':'')+'<br><small>'+safe(person.garages.join(', ') || 'Geen garage')+'</small></p>'+
    (person.id!==active && person.id!==state.head && (user().role>=1 || person.role===0) && person.role<=user().role && person.garages.every(owns)?'<button data-person="'+person.id+'">Bewerken</button>':'')+'</div>').join('');
  const feedback = state.feedback.map(item=>'<div class="row"><p><strong>'+safe(item.kind)+'</strong><br>'+safe(item.text)+'</p><select aria-label="Feedbackstatus" data-feedback="'+item.id+'">'+options(['Ontvangen','In behandeling','Afgehandeld'],item.status)+'</select></div>').join('');
  return heading('Beheer','Gebruikers, toegang en feedback over EZpark.')+
    '<div class="card row"><div><strong>'+state.users.length+'</strong> accounts</div><div><strong>'+activeCount+'</strong> actief in de afgelopen 30 dagen</div></div>'+
    '<article class="card"><div class="row"><h2>Gebruikers</h2>'+(canInvite()?'<button class="primary" id="invite">Collega toevoegen</button>':'')+'</div>'+people+
    (state.head===active?'<button id="transfer">Hoofdbeheer overdragen</button>':'')+
    (state.transfer===active?'<button id="accept">Overdracht accepteren</button>':'')+
    (state.transfer && state.head===active?'<p>Wacht op acceptatie door '+safe(state.users.find(person=>person.id===state.transfer)?.name)+'</p>':'')+'</article>'+
    '<article class="card"><h2>Softwarefeedback</h2>'+(feedback||'<p>Er is nog geen feedback.</p>')+'</article>';
}
function showFeedback() {
  openForm('Feedback over EZpark','<label>Type<select name="kind">'+options(['Softwarefout melden','Verbetering voorstellen'])+'</select></label><label>Omschrijving<textarea name="text" required></textarea></label><p>Huidig scherm: '+safe(page)+'</p>','Feedback insturen',(data,dialog)=>{
    state.feedback.unshift({id:id(),kind:data.get('kind'),text:data.get('text'),status:'Ontvangen',by:active,page,time:Date.now()});
    finish(dialog,'Feedback ontvangen.');
  });
}
function rosterUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol==='https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
function roster() {
  const url = rosterUrl(state.rosterUrl);
  return heading('Rooster','Open jullie rooster in MijnRooster.')+
    '<section class="card"><h2>MijnRooster</h2>'+
    (url?'':'<p>Sla het webadres op waarmee je normaal bij jullie werkrooster inlogt.</p>')+
    '<div class="actions">'+
    (url?'<a class="primary roster-link" href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">Open MijnRooster <span aria-hidden="true">↗</span></a>':'')+
    '<button id="roster-settings"'+(url?'':' class="primary"')+'>'+(url?'Link wijzigen':'Link instellen')+'</button></div></section>';
}
function configureRoster() {
  if (!allowed('Rooster')) return;
  openForm('MijnRooster-link',
    '<label>Webadres<input name="rosterUrl" type="url" inputmode="url" autocomplete="off" required value="'+safe(rosterUrl(state.rosterUrl))+'"></label>'+
    '<small>Gebruik de gebruikelijke inlogpagina van je werkgever. EZpark bewaart de link in deze browser.</small>',
    'Link opslaan',(data,dialog)=>{
      if (!allowed('Rooster')) return;
      const url = rosterUrl(data.get('rosterUrl'));
      if (!url) {
        const field = dialog.querySelector('[name="rosterUrl"]');
        field.setCustomValidity('Vul een geldig webadres in dat begint met https://.');
        field.reportValidity();
        field.setCustomValidity('');
        return;
      }
      state.rosterUrl = url;
      finish(dialog,'MijnRooster-link opgeslagen.');
      $('.roster-link').focus();
    });
}
function render() {
  const pages = ['Inbox','Archief','Storingen','Dagrapport','Rooster','Agenda','Beheer'].filter(name=>allowed(name==='Archief'?'Inbox':name));
  if (!pages.includes(page)) page = pages[0];
  const navButton = name=>'<button data-page="'+name+'" '+(name===page?'class="active" aria-current="page"':'')+'>'+name+'</button>';
  $('nav').innerHTML = (pages.includes('Inbox')?'<div class="mail-nav">'+navButton('Inbox')+navButton('Archief')+'</div>':'')+
    pages.filter(name=>name!=='Inbox' && name!=='Archief').map(navButton).join('');
  $('#account').innerHTML = state.users.map(person=>'<option value="'+person.id+'" '+(person.id===active?'selected':'')+'>'+safe(person.name)+' · '+roles[person.role]+'</option>').join('');
  const content = {
    Inbox:inbox,
    Archief:inbox,
    Storingen:()=>operational(false),
    Dagrapport:()=>operational(true),
    Rooster:roster,
    Beheer:management,
    Agenda:agenda
  };
  if(selectedThread())mail=selectedThread().mail;
  $('#view').innerHTML = content[page]?.() || heading('EZpark','Dit account heeft geen werkonderdelen toegewezen.');
  bind();bindLocalEnhancements();
}
function bind() {
  const on = (selector, event, handler) => { const element = $(selector); if (element) element[event]=handler; };
  document.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{
    page=button.dataset.page;
    mailSelected = false;
    if (button.hasAttribute('data-linked-mail')) {
      inboxStatusFilter = 'Alle statussen';
      page = state.mailArchived?'Archief':'Inbox';
      mailSelected = true;
    }
    render();
  });
  on('#account','onchange',event=>{active=event.target.value;render();});
  on('#feedback','onclick',showFeedback);
  on('#mail','onclick',()=>{
    mailSelected = !mailSelected;
    render();
    $(mailSelected?'#thread-title':'#mail').focus();
  });
  document.querySelectorAll('[data-mail-archive]').forEach(button=>button.onclick=()=>{
    const target=state.conversations.find(t=>t.id===(button.dataset.mailArchive||selectedConversationId));if(!allowed('Inbox')||!target||!owns(target.garage))return;
    selectedConversationId=target.id;
    state.mailArchived = page==='Inbox';
    mailSelected = false;
    commit(state.mailArchived?'Gesprek gearchiveerd.':'Gesprek teruggezet in de inbox.');
    $('nav [aria-current="page"]').focus();
  });
  document.querySelectorAll('[data-inbox-filter]').forEach(button=>button.onclick=()=>{
    inboxStatusFilter=button.dataset.inboxFilter;
    render();
    $('[data-inbox-filter][aria-pressed="true"]').focus();
  });
  on('#mail-status','onchange',event=>{
    state.status=event.target.value;
    commit('Mailstatus bijgewerkt.');
    ($('#mail-status') || $('[data-inbox-filter][aria-pressed="true"]')).focus();
  });
  on('#reply','onclick',replyToMail);
  on('#forward','onclick',()=>compose(true));
  on('#plan','onclick',()=>plan({mailId:selectedConversationId}));
  document.querySelectorAll('[data-agenda-mode]').forEach(button=>button.onclick=()=>{
    agendaMode = button.dataset.agendaMode;
    render();
    $('[data-agenda-mode="'+agendaMode+'"]').focus();
  });
  document.querySelectorAll('[data-agenda-step]').forEach(button=>button.onclick=()=>{
    const step = Number(button.dataset.agendaStep);
    const [start] = agendaPeriod();
    agendaDate = agendaMode==='month' ? new Date(start.getFullYear(),start.getMonth()+step,1)
      : agendaDay(start,step*(agendaMode==='week'?7:1));
    render();
    $('[data-agenda-step="'+step+'"]').focus();
  });
  document.querySelectorAll('[data-agenda-date]').forEach(button=>button.onclick=()=>{
    agendaDate = new Date(Number(button.dataset.agendaDate));
    agendaMode = 'day';
    render();
    $('#agenda-period').focus();
  });
  on('#agenda-today','onclick',()=>{
    agendaDate = new Date();
    render();
    $('#agenda-today').focus();
  });
  on('#roster-settings','onclick',configureRoster);
  on('#garage','onchange',event=>{garage=event.target.value;render();});
  on('#new-entry','onclick',()=>page==='Storingen'?compose():openForm('Bijzonderheid toevoegen','<label>Notitie<textarea name="note" required></textarea></label>','Opslaan',(data,dialog)=>{
    state.notes.unshift({garage,text:data.get('note'),time:Date.now()});
    finish(dialog,'Bijzonderheid opgeslagen.');
  }));
  document.querySelectorAll('[data-update]').forEach(button=>button.onclick=()=>{
    const item=state.incidents.find(entry=>entry.id===button.dataset.update);
    openForm('Storing bijwerken','<label>Status<select name="status">'+options(['Open','Wacht op leverancier','Opgelost'],item.status)+'</select></label><label>Toelichting<textarea name="update">'+safe(item.update)+'</textarea></label>','Opslaan',(data,dialog)=>{
      item.status=data.get('status');item.update=data.get('update');finish(dialog,'Storing bijgewerkt.');
    });
  });
  document.querySelectorAll('[data-send]').forEach(button=>button.onclick=()=>compose(false,state.incidents.find(item=>item.id===button.dataset.send)));
  on('#invite','onclick',()=>editor());
  document.querySelectorAll('[data-person]').forEach(button=>button.onclick=()=>editor(state.users.find(person=>person.id===button.dataset.person)));
  document.querySelectorAll('[data-feedback]').forEach(select=>select.onchange=()=>{
    state.feedback.find(item=>item.id===select.dataset.feedback).status=select.value;
    commit('Feedbackstatus bijgewerkt.');
  });
  on('#transfer','onclick',()=>openForm('Hoofdbeheer overdragen','<label>Opvolger<select name="target">'+state.users.filter(person=>person.id!==active && allowed('Beheer') && person.rights?.Beheer!==false).map(person=>'<option value="'+person.id+'">'+safe(person.name)+'</option>').join('')+'</select></label>','Overdracht aanvragen',(data,dialog)=>{
    if (!data.get('target')) return notify('Geen opvolger beschikbaar.');
    state.transfer=data.get('target');finish(dialog,'Overdracht aangevraagd.');
  }));
  on('#accept','onclick',()=>{state.head=active;state.transfer=null;commit('Hoofdbeheer overgedragen.');});
}

// Local agenda: interaction and garage filtering adapted from the original P1 supplier agenda.
let agendaGarage='',agendaSearch='',showDeletedAppointments=false;
const appointmentStatuses=['Gepland','Langs geweest','Niet gekomen','Geannuleerd'];
const appointmentStart=e=>new Date(e.when);
const appointmentEnd=e=>e.end?new Date(e.end):new Date(appointmentStart(e).getTime()+3600000);
const activeAppointments=()=>state.appointments.filter(e=>!e.deletedAt&&owns(e.garage));
const appointmentSupplier=e=>e.supplierName||state.suppliers.find(s=>s.email===e.supplierEmail)?.name||'Geen leverancier';
function agenda(){
 const [start,end]=agendaPeriod();const today=agendaDay(new Date()).getTime();
 const selected=user().garages.includes(agendaGarage)?agendaGarage:'';agendaGarage=selected;
 const matches=e=>(!selected||e.garage===selected)&&[e.title,e.garage,appointmentSupplier(e)].some(v=>String(v||'').toLowerCase().includes(agendaSearch.toLowerCase()));
 const events=activeAppointments().filter(matches).sort((a,b)=>appointmentStart(a)-appointmentStart(b));
 const visible=events.filter(e=>appointmentStart(e)<end&&appointmentEnd(e)>start);
 const deleted=state.appointments.filter(e=>e.deletedAt&&owns(e.garage)&&matches(e));
 const period=agendaMode==='month'?start.toLocaleDateString('nl-NL',{month:'long',year:'numeric'}):agendaMode==='week'?start.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})+' – '+agendaDay(end,-1).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}):start.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const eventButton=(e,day)=>'<button class="calendar-event '+(e.status==='Langs geweest'?'visited':e.status==='Geannuleerd'?'cancelled':'')+'" data-event="'+safe(e.id)+'" aria-label="'+safe(e.title+' · '+e.garage+' · '+date(e.when))+'"><time>'+ (agendaDay(appointmentStart(e)).getTime()===day.getTime()?appointmentStart(e).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}):'Loopt door')+'</time><strong>'+safe(e.title)+'</strong><small>'+safe(e.garage)+' · '+safe(appointmentSupplier(e))+'</small></button>';
 let grid='';const gridStart=agendaMode==='month'?agendaDay(start,-((start.getDay()+6)%7)):start;
 const gridEnd=agendaMode==='month'?agendaDay(gridStart,42):end;
 for(let day=gridStart;day<gridEnd;day=agendaDay(day,1)){
  const entries=events.filter(e=>appointmentStart(e)<agendaDay(day,1)&&appointmentEnd(e)>day);
  const label=day.toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});
  grid+='<section class="calendar-day '+(day.getMonth()!==start.getMonth()&&agendaMode==='month'?'outside ':'')+(day.getTime()===today?'is-today':'')+'"><div class="calendar-date"><button data-day-plan="'+localDatetime(day).slice(0,10)+'" aria-label="Afspraak toevoegen op '+safe(label)+'">'+(agendaMode==='month'?day.getDate():safe(label))+'</button><small>'+entries.length+'</small></div>'+entries.map(e=>eventButton(e,day)).join('')+(agendaMode==='day'&&!entries.length?'<p class="empty-state">Geen afspraken. Plan hier een nieuw bezoek.</p>':'')+'</section>';
 }
 const upcoming=events.filter(e=>appointmentEnd(e)>=new Date()&&e.status!=='Geannuleerd').slice(0,5);
 const trash=showDeletedAppointments?'<section class="card"><h2>Verwijderde afspraken</h2>'+ (deleted.map(e=>'<div class="row"><p><strong>'+safe(e.title)+'</strong><br><small>'+safe(e.garage)+' · '+date(e.when)+'</small></p><button data-restore-event="'+safe(e.id)+'">Terugzetten</button></div>').join('')||'<p>Geen verwijderde afspraken voor deze selectie.</p>')+'</section>':'';
 return heading('Leveranciersagenda','Plan bezoeken en werkzaamheden per garage. Koppel een mail, leverancier of storing.')+'<div class="row"><div class="agenda-summary"><strong>'+visible.length+'</strong> afspraken in deze periode</div><button class="primary" id="agenda-new">＋ Afspraak toevoegen</button></div><div class="card agenda-panel"><div class="row agenda-toolbar"><h2 id="agenda-period" tabindex="-1">'+safe(period)+'</h2><div class="actions"><button data-agenda-step="-1" aria-label="Vorige periode">‹</button><button id="agenda-today">Vandaag</button><button data-agenda-step="1" aria-label="Volgende periode">›</button></div></div><div class="row agenda-filters"><div class="actions" role="group" aria-label="Agendaweergave">'+Object.entries(agendaModes).map(([mode,label])=>'<button data-agenda-mode="'+mode+'" aria-pressed="'+(mode===agendaMode)+'">'+label+'</button>').join('')+'</div><label>Garage<select id="agenda-garage"><option value="">Alle garages</option>'+options(user().garages,selected)+'</select></label><label>Zoeken<input id="agenda-search" type="search" value="'+safe(agendaSearch)+'" placeholder="Leverancier of afspraak"></label></div><div class="calendar-layout"><div class="calendar-main">'+(agendaMode==='month'?'<div class="calendar-weekdays">'+['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d=>'<span>'+d+'</span>').join('')+'</div>':'')+'<div class="calendar-grid '+agendaMode+'">'+grid+'</div></div><section class="agenda-upcoming"><h3>Binnenkort</h3>'+ (upcoming.map(e=>'<button data-event="'+safe(e.id)+'"><small>'+date(e.when)+'</small><strong>'+safe(e.title)+'</strong><small>'+safe(e.garage)+' · '+safe(appointmentSupplier(e))+'</small></button>').join('')||'<p>Geen aankomende afspraken.</p>')+'</section></div></div><button id="agenda-trash">'+(showDeletedAppointments?'Verberg verwijderde afspraken':'Verwijderde afspraken ('+deleted.length+')')+'</button>'+trash;
}
function appointmentAccess(e){return allowed('Agenda')&&e&&owns(e.garage);}
function showAppointment(eventId){
 const e=state.appointments.find(e=>e.id===eventId);if(!appointmentAccess(e))return;
 const thread=state.conversations.find(t=>t.id===e.mailId);const incident=state.incidents.find(i=>i.id===e.incidentId&&owns(i.garage));
 const dialog=$('#dialog');dialog.innerHTML='<h2 id="dialog-title">'+safe(e.title)+'</h2><dl class="appointment-details"><dt>Garage</dt><dd>'+safe(e.garage)+'</dd><dt>Leverancier</dt><dd>'+safe(appointmentSupplier(e))+'</dd><dt>Begin</dt><dd>'+date(e.when)+'</dd><dt>Einde</dt><dd>'+date(appointmentEnd(e))+'</dd><dt>Status</dt><dd>'+safe(e.status||'Gepland')+'</dd><dt>Werkzaamheden / verslag</dt><dd class="preserve-lines">'+safe(e.notes||'Geen toelichting')+'</dd></dl><div class="actions">'+(thread&&owns(thread.garage)&&allowed('Inbox')?'<button id="appointment-mail">Open gekoppelde mail</button>':'')+(incident&&allowed('Storingen')?'<button id="appointment-incident">Open gekoppelde storing</button>':'')+'</div><div class="actions dialog-actions">'+(canEditAppointment(e)?'<button class="primary" id="appointment-edit">Bewerken</button><button id="appointment-delete" class="danger">Verwijderen</button>':'')+'<button id="cancel">Sluiten</button></div>';
 dialog.setAttribute('aria-labelledby','dialog-title');$('#cancel').onclick=()=>dialog.close();if($('#appointment-edit'))$('#appointment-edit').onclick=()=>plan({eventId:e.id});if($('#appointment-delete'))$('#appointment-delete').onclick=()=>{if(!appointmentAccess(e)||!canEditAppointment(e))return;e.deletedAt=Date.now();finish(dialog,'Afspraak verwijderd. Je kunt deze terugzetten via Verwijderde afspraken.');};
 if($('#appointment-mail'))$('#appointment-mail').onclick=()=>{dialog.close();selectedConversationId=e.mailId;mail=selectedThread().mail;page=thread.archived?'Archief':'Inbox';inboxStatusFilter='Alle statussen';mailSelected=true;render();};
 if($('#appointment-incident'))$('#appointment-incident').onclick=()=>{dialog.close();page='Storingen';garage=e.garage;render();const card=[...document.querySelectorAll('[data-update]')].find(b=>b.dataset.update===e.incidentId)?.closest('.card');card?.scrollIntoView({block:'center'});card?.classList.add('linked-highlight');};
 if(!dialog.open)dialog.showModal();dialog.scrollTop=0;fitDialogToViewport();
}
function plan({eventId=null,mailId=null,day=null}={}){
 if(!allowed('Agenda'))return;const existing=state.appointments.find(e=>e.id===eventId);if(eventId&&(!appointmentAccess(existing)||!canEditAppointment(existing)))return;
 const linkedThread=state.conversations.find(t=>t.id===(existing?.mailId||mailId)&&owns(t.garage));
 let start=existing?appointmentStart(existing):day?new Date(day+'T09:00'):agendaDay(agendaDate);if(!existing&&!day)start.setHours(9,0,0,0);
 const end=existing?appointmentEnd(existing):new Date(start.getTime()+3600000);
 const chosenGarage=existing?.garage||linkedThread?.garage||agendaGarage||user().garages[0];if(!chosenGarage)return notify('Geen garage toegewezen.');
 openForm(existing?'Afspraak bewerken':'Afspraak toevoegen',
  '<label>Onderwerp *<input name="title" required maxlength="200" value="'+safe(existing?.title||linkedThread?.mail.subject||'')+'"></label><div class="form-grid"><label>Garage *<select name="garage" id="appointment-garage">'+options(user().garages,chosenGarage)+'</select></label><label>Status<select name="status">'+options(appointmentStatuses,existing?.status||'Gepland')+'</select></label><label>Begin *<input name="when" type="datetime-local" required value="'+localDatetime(start)+'"></label><label>Einde *<input name="end" type="datetime-local" required value="'+localDatetime(end)+'"></label></div>'+
  '<label>Leverancier (optioneel)<select name="supplierEmail" id="supplier"></select></label><div class="actions"><button type="button" id="supplier-toggle" aria-expanded="false">Leverancier toevoegen</button><button type="button" id="supplier-remove" hidden>Leverancier verwijderen</button></div><div id="supplier-fields" hidden><fieldset><legend>Nieuwe leverancier</legend><label>Naam<input id="supplier-name" required disabled></label><label>E-mailadres<input id="supplier-email" type="email" required disabled></label><button type="button" id="supplier-save">Leverancier opslaan</button></fieldset></div><small id="supplier-status" role="status"></small>'+
  '<label>Mailgesprek (optioneel)<select name="mailId" id="appointment-mail-picker"></select></label><label>Storing (optioneel)<select name="incidentId" id="appointment-incident-picker"></select></label><label>Werkzaamheden / verslag<textarea name="notes" maxlength="6000">'+safe(existing?.notes||'')+'</textarea></label><p id="appointment-error" class="form-error" role="alert"></p>',
  'Afspraak opslaan',(data,dialog)=>{
   if(!allowed('Agenda')||!owns(data.get('garage'))||existing&&(!appointmentAccess(existing)||!canEditAppointment(existing)))return;
   if(!$('#supplier-fields').hidden){$('#supplier-save').click();return;}
   const when=data.get('when'),end=data.get('end'),title=data.get('title').trim();if(!title||!Number.isFinite(new Date(when).getTime())||!Number.isFinite(new Date(end).getTime())||new Date(end)<=new Date(when)){$('#appointment-error').textContent='Vul een onderwerp in en kies een eindtijd na het begin.';return;}
   const mailLink=state.conversations.find(t=>t.id===data.get('mailId')&&t.garage===data.get('garage')&&owns(t.garage));const incidentLink=state.incidents.find(i=>i.id===data.get('incidentId')&&i.garage===data.get('garage')&&owns(i.garage));
   const supplier=state.suppliers.find(s=>s.email===data.get('supplierEmail'));
   const values={title,when,end,garage:data.get('garage'),status:data.get('status'),notes:data.get('notes').trim(),supplierEmail:data.get('supplierEmail')||'',supplierName:supplier?.name||(existing?.supplierEmail===data.get('supplierEmail')?existing.supplierName:'')||'',mailId:mailLink?.id||(!allowed('Inbox')&&existing?.garage===data.get('garage')?existing?.mailId||'':''),incidentId:incidentLink?.id||(!allowed('Storingen')&&existing?.garage===data.get('garage')?existing?.incidentId||'':''),updatedAt:Date.now()};
   if(existing)Object.assign(existing,values);else state.appointments.push({id:id(),createdBy:active,...values});
   agendaDate=new Date(when);page='Agenda';finish(dialog,existing?'Afspraak bijgewerkt.':'Afspraak toegevoegd.');
  });
 bindSupplierPicker(existing?.supplierEmail);
 if(existing?.supplierEmail&&!state.suppliers.some(s=>s.email===existing.supplierEmail)){const option=document.createElement('option');option.value=existing.supplierEmail;option.textContent=(existing.supplierName||existing.supplierEmail)+' (bestaande koppeling)';$('#supplier').append(option);$('#supplier').value=option.value;}
 function linkedPickers(first=false){const site=$('#appointment-garage').value;const chosenMail=first?existing?.mailId||mailId:$('#appointment-mail-picker').value;const chosenIncident=first?existing?.incidentId:$('#appointment-incident-picker').value;
 const threads=allowed('Inbox')?state.conversations.filter(t=>t.garage===site&&owns(t.garage)):[];const incidents=allowed('Storingen')?state.incidents.filter(i=>i.garage===site&&owns(i.garage)):[];
 $('#appointment-mail-picker').innerHTML='<option value="">Geen mailgesprek</option>'+threads.map(t=>'<option value="'+safe(t.id)+'"'+(t.id===chosenMail?' selected':'')+'>'+safe(t.mail.subject)+(t.archived?' (archief)':'')+'</option>').join('');
 $('#appointment-incident-picker').innerHTML='<option value="">Geen storing</option>'+incidents.map(i=>'<option value="'+safe(i.id)+'"'+(i.id===chosenIncident?' selected':'')+'>'+safe(i.device+' · '+i.body)+'</option>').join('');}
 $('#appointment-garage').onchange=()=>linkedPickers();linkedPickers(true);
}
function bindLocalEnhancements(){
 document.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>{selectedConversationId=b.dataset.thread;mail=selectedThread().mail;mailSelected=true;render();$('#thread-title')?.focus();});
 document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>showAppointment(b.dataset.event));
 document.querySelectorAll('[data-day-plan]').forEach(b=>b.onclick=()=>plan({day:b.dataset.dayPlan}));
 document.querySelectorAll('[data-restore-event]').forEach(b=>b.onclick=()=>{const e=state.appointments.find(e=>e.id===b.dataset.restoreEvent);if(!appointmentAccess(e)||!canEditAppointment(e))return;delete e.deletedAt;commit('Afspraak teruggezet.');});
 if($('#agenda-new'))$('#agenda-new').onclick=()=>plan();
 if($('#agenda-garage'))$('#agenda-garage').onchange=e=>{agendaGarage=e.target.value;render();};
 if($('#agenda-search'))$('#agenda-search').onchange=e=>{agendaSearch=e.target.value;render();};
 if($('#agenda-trash'))$('#agenda-trash').onclick=()=>{showDeletedAppointments=!showDeletedAppointments;render();};
 if($('#data-tools'))$('#data-tools').onclick=showDataTools;
}
function serializeState(){return JSON.parse(JSON.stringify(state));}
async function backupLocalState(){if(staticHosting)return;try{const r=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:serializeState()})});if(!r.ok)throw Error();}catch{notify('Opgeslagen in deze browser; de lokale bestandsback-up is niet beschikbaar.');}}
function downloadState(){const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),state:serializeState()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ezpark-backup-'+localDatetime(new Date()).replace(/:/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function mergeImportedState(incoming){
 const next=serializeState();const listNames=['users','incidents','notes','appointments','feedback','suppliers','conversations'];
 for(const name of listNames){if(incoming[name]!==undefined&&!Array.isArray(incoming[name]))throw Error('Ongeldige lijst: '+name);for(const entry of incoming[name]||[]){if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('Ongeldig record in '+name);
 const strings=(...keys)=>keys.every(k=>typeof entry[k]==='string');
 if(name==='users'&&(!strings('id','name')||!Array.isArray(entry.garages)||!entry.garages.every(g=>typeof g==='string')||!Number.isInteger(entry.role)||entry.role<0||entry.role>3))throw Error('Ongeldige gebruiker');
 if(name==='conversations'&&(!strings('id','garage')||!entry.mail||typeof entry.mail.subject!=='string'||typeof entry.mail.sender!=='string'||typeof entry.mail.body!=='string'||entry.replies&&!Array.isArray(entry.replies)))throw Error('Ongeldig mailgesprek');
 if(name==='appointments'&&(!strings('title','garage','when')||!Number.isFinite(new Date(entry.when).getTime())))throw Error('Ongeldige afspraak');
 if(name==='suppliers'&&!strings('name','email'))throw Error('Ongeldige leverancier');
 if(name==='incidents'&&!strings('garage','device','body'))throw Error('Ongeldige storing');
 if(name==='notes'&&!strings('garage','text'))throw Error('Ongeldige dagrapportnotitie');
 if(name==='feedback'&&!strings('kind','text'))throw Error('Ongeldige feedback');
 }}
 const signature=(name,e)=>e.id||(name==='suppliers'?String(e.email).toLowerCase():name==='appointments'?[e.when,e.garage,e.title].join('|'):JSON.stringify(e));
 for(const name of listNames){const target=next[name]??=[];for(const entry of incoming[name]||[]){const duplicate=target.find(e=>entry.id?e.id===entry.id:name==='appointments'?e.when===entry.when&&e.garage===entry.garage&&e.title===entry.title:signature(name,e)===signature(name,entry));
  if(!duplicate){target.push(structuredClone(entry));continue;}
  if(name==='conversations'){duplicate.replies??=[];for(const reply of entry.replies||[])if(!duplicate.replies.some(r=>JSON.stringify(r)===JSON.stringify(reply)))duplicate.replies.push(structuredClone(reply));if(entry.mail?.replies){duplicate.mail.replies??=[];for(const reply of entry.mail.replies)if(!duplicate.mail.replies.some(r=>JSON.stringify(r)===JSON.stringify(reply)))duplicate.mail.replies.push(structuredClone(reply));}}
  if(JSON.stringify(duplicate)!==JSON.stringify(entry)){next.importConflicts??=[];if(!next.importConflicts.some(c=>c.list===name&&JSON.stringify(c.record)===JSON.stringify(entry)))next.importConflicts.push({list:name,record:structuredClone(entry)});}
 }}
 if(!incoming.conversations&&incoming.mailReplies?.length){next.conversations[0].replies??=[];for(const r of incoming.mailReplies)if(!next.conversations[0].replies.some(e=>JSON.stringify(e)===JSON.stringify(r)))next.conversations[0].replies.push(structuredClone(r));}
 if(!next.rosterUrl&&incoming.rosterUrl)next.rosterUrl=incoming.rosterUrl;
 for(const [k,v] of Object.entries(incoming))if(!(k in next)&&!listNames.includes(k))next[k]=structuredClone(v);
 for(const e of next.appointments){e.id??=id();e.status??='Gepland';}
 return next;
}

function showDataTools(){
 const dialog=$('#dialog');dialog.innerHTML='<h2>Testgegevens en back-up</h2><p>Gegevens blijven na verversen bewaard. '+(staticHosting?'Op deze online testsite worden gegevens alleen in deze browser bewaard. Download zelf regelmatig een back-up.':'Elke opslag maakt ook een lokale bestandsback-up.')+' Importeren voegt ontbrekende gegevens toe; bestaande records worden niet vervangen.</p><div class="actions"><button id="export-data" class="primary">Back-up downloaden</button></div><label class="import-label">Back-up importeren<input id="import-data" type="file" accept="application/json,.json"></label><p id="import-status" role="status"></p><p>Gegevens uit de Sites-demo kun je via de exporthulp in de projectmap meenemen.</p><button id="cancel">Sluiten</button>';
 $('#export-data').onclick=downloadState;$('#cancel').onclick=()=>dialog.close();$('#import-data').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const raw=JSON.parse(await file.text());const incoming=raw.state||raw;if(!Array.isArray(incoming.users)||!incoming.users.length||incoming.users.some(u=>typeof u.id!=='string'||typeof u.name!=='string'||!Number.isInteger(u.role)||u.role<0||u.role>3||!Array.isArray(u.garages)))throw Error('Dit is geen geldige EZpark-back-up.');
 const before=serializeState();const merged=mergeImportedState(incoming);localStorage.setItem('ezpark-before-import-'+Date.now(),JSON.stringify(before));state=merged;attachMailAliases();if(!state.users.some(u=>u.id===active))active=state.users[0].id;commit('Back-up samengevoegd. Bestaande records zijn behouden.');$('#import-status').textContent='Import voltooid.';
 }catch(err){$('#import-status').textContent='Import niet uitgevoerd: '+err.message;}};
 if(!dialog.open)dialog.showModal();fitDialogToViewport();
}
window.addEventListener('storage',e=>{if(e.key!==key||!e.newValue)return;if($('#dialog').open){notify('Testgegevens zijn in een ander venster gewijzigd. Exporteer zo nodig je werk voor je verdergaat.');return;}location.reload();});
async function startLocalDemo(){
 if(freshLocalDemo&&!staticHosting){try{const r=await fetch('/api/backup');if(r.ok){const result=await r.json();if(result?.state?.users?.length){localStorage.setItem(key,JSON.stringify(result.state));location.reload();return;}}}catch{}}
 // Persist migrations immediately; no existing record is removed.
 localStorage.setItem(key,JSON.stringify(state));render();if(staticHosting){const badge=document.querySelector('.demo');if(badge)badge.textContent='ONLINE DEMO';}backupLocalState();
}
startLocalDemo();
