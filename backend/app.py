"""Microsoft 365 service. Real access is disabled until tenant, app and secrets are configured."""
from __future__ import annotations
import hashlib, hmac, json, os, secrets, sqlite3, threading, time, uuid
from dataclasses import dataclass
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse, quote, urlencode
import msal, requests
from cryptography.fernet import Fernet
from flask import Flask, request, jsonify, redirect, send_from_directory, g, make_response

ROOT=Path(__file__).resolve().parents[1]
GARAGES=['Boterdiep','Damsterdiep','Circus','Europapark','Euroborg']
# Only read scopes are requested in this first connection. Writes are not enabled.
SCOPES=['Mail.Read.Shared','Calendars.Read.Shared']
GRAPH='https://graph.microsoft.com/v1.0/'
def guid(v):
    try:return str(uuid.UUID(v))==v.lower()
    except (ValueError,TypeError,AttributeError):return False
@dataclass
class Settings:
    tenant_id:str
    client_id:str
    client_secret:str
    encryption_key:str
    app_url:str
    admin_oid:str
    database:str
    def validate(self):
        if not all(guid(v) for v in [self.tenant_id,self.client_id,self.admin_oid]):raise ValueError('Tenant, app en hoofdbeheerder moeten geldige object-ID’s zijn.')
        Fernet(self.encryption_key.encode())
        u=urlparse(self.app_url)
        if u.username or u.password or u.query or u.fragment or u.path not in ['', '/'] or not u.hostname:raise ValueError('Gebruik een vaste app-origin.')
        if u.scheme!='https' and not(u.scheme=='http' and u.hostname in ['localhost','127.0.0.1']):raise ValueError('HTTPS is verplicht buiten localhost.')
        if not self.client_secret:raise ValueError('Servercredential ontbreekt.')
        self.tenant_id=self.tenant_id.lower();self.client_id=self.client_id.lower();self.admin_oid=self.admin_oid.lower();self.app_url=self.app_url.rstrip('/')
        return self
    @classmethod
    def environment(cls):
        values=[os.getenv(k,'') for k in ['EZPARK_TENANT_ID','EZPARK_CLIENT_ID','EZPARK_CLIENT_SECRET','EZPARK_ENCRYPTION_KEY','EZPARK_APP_URL','EZPARK_ADMIN_OBJECT_ID']]
        if not all(values):return None
        return cls(*values,os.getenv('EZPARK_DATABASE',str(ROOT/'backend/private/ezpark.sqlite'))).validate()
class Store:
    def __init__(self,path,key):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True,mode=0o700);self.cipher=Fernet(key.encode());self.lock=threading.RLock()
        with self.connection() as c:c.execute('CREATE TABLE IF NOT EXISTS vault (kind TEXT NOT NULL, key TEXT NOT NULL, payload BLOB NOT NULL, expires REAL, PRIMARY KEY(kind,key))')
        os.chmod(self.path,0o600)
    @contextmanager
    def connection(self):
        connection=sqlite3.connect(self.path,timeout=30)
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback();raise
        finally:connection.close()
    def put(self,kind,key,value,expires=None):
        encrypted=self.cipher.encrypt(json.dumps(value).encode())
        with self.lock,self.connection() as c:c.execute('INSERT INTO vault VALUES(?,?,?,?) ON CONFLICT(kind,key) DO UPDATE SET payload=excluded.payload,expires=excluded.expires',(kind,key,encrypted,expires))
    def get(self,kind,key,consume=False):
        with self.lock,self.connection() as c:
            row=c.execute('SELECT payload,expires FROM vault WHERE kind=? AND key=?',(kind,key)).fetchone()
            if not row:return None
            if consume or row[1] and row[1]<time.time():c.execute('DELETE FROM vault WHERE kind=? AND key=?',(kind,key))
            if row[1] and row[1]<time.time():return None
            return json.loads(self.cipher.decrypt(row[0]))
    def delete(self,kind,key):
        with self.lock,self.connection() as c:c.execute('DELETE FROM vault WHERE kind=? AND key=?',(kind,key))
    def entries(self,kind,prefix=''):
        with self.lock,self.connection() as c:rows=c.execute('SELECT key,payload FROM vault WHERE kind=?',(kind,)).fetchall()
        return [(k,json.loads(self.cipher.decrypt(v))) for k,v in rows if k.startswith(prefix)]
class Identity:
    def __init__(self,settings):self.settings=settings
    def client(self,serialized=''):
        cache=msal.SerializableTokenCache()
        if serialized:cache.deserialize(serialized)
        client=msal.ConfidentialClientApplication(self.settings.client_id,authority='https://login.microsoftonline.com/'+self.settings.tenant_id,client_credential=self.settings.client_secret,token_cache=cache,enable_pii_log=False)
        return client,cache
    def begin(self,serialized,scopes):
        client,cache=self.client(serialized)
        flow=client.initiate_auth_code_flow(scopes=scopes,redirect_uri=self.settings.app_url+'/auth/callback',prompt='select_account')
        return flow,cache.serialize()
    def finish(self,serialized,flow,args):
        client,cache=self.client(serialized)
        result=client.acquire_token_by_auth_code_flow(flow,args)
        return result,cache.serialize()
    def token(self,serialized,oid):
        client,cache=self.client(serialized);accounts=client.get_accounts()
        account=next((a for a in accounts if a.get('local_account_id')==oid and a.get('realm','').lower()==self.settings.tenant_id.lower()),None)
        result=client.acquire_token_silent(SCOPES,account=account) if account else None
        return (result or {}).get('access_token'),cache.serialize()
class ServiceError(Exception):
    def __init__(self,status,code):self.status=status;self.code=code
class GraphClient:
    def __init__(self,token,http=None):self.token=token;self.http=http or requests.Session()
    def request(self,method,url,body=None):
        if not url.startswith('https://'):url=GRAPH+url.lstrip('/')
        p=urlparse(url)
        if p.scheme!='https' or p.netloc!='graph.microsoft.com' or p.username or p.password or p.fragment or not p.path.startswith('/v1.0/'):raise ServiceError(400,'invalid_graph_link')
        r=self.http.request(method,url,headers={'Authorization':'Bearer '+self.token,'Prefer':'IdType="ImmutableId", outlook.body-content-type="text"','Accept':'application/json'},json=body,timeout=20,allow_redirects=False)
        if r.status_code==429:raise ServiceError(429,'outlook_rate_limited')
        if r.status_code in [401,403]:raise ServiceError(r.status_code,'outlook_access_denied')
        if r.status_code>=300:raise ServiceError(502,'outlook_request_failed')
        return r.json() if r.content else {}

def create_app(settings=None,identity=None,graph_factory=None):
    app=Flask(__name__,static_folder=None);app.config.update(MAX_CONTENT_LENGTH=2*1024*1024)
    settings=settings or Settings.environment();store=Store(settings.database,settings.encryption_key) if settings else None
    identity=identity or (Identity(settings) if settings else None)
    secure=bool(settings and settings.app_url.startswith('https:'));cookie='__Host-ezpark' if secure else 'ezpark_dev';flowcookie='__Host-ezpark_flow' if secure else 'ezpark_flow_dev'
    app.extensions.update(ezpark_store=store,ezpark_settings=settings)
    def digest(s):return hashlib.sha256(s.encode()).hexdigest()
    def current():
        sid=request.cookies.get(cookie,'');return store.get('session',digest(sid)) if store and sid else None
    def set_cookie(response,name,value,max_age):response.set_cookie(name,value,max_age=max_age,secure=secure,httponly=True,samesite='Lax',path='/')
    def error(status,code):return jsonify(error=code),status
    @app.before_request
    def protect():
        g.session=current()
        if request.path.startswith('/api/') and request.path!='/api/health':
            if not g.session:return error(401,'sign_in_required')
            if request.method not in ['GET','HEAD','OPTIONS']:
                if request.headers.get('Origin')!=settings.app_url:return error(403,'invalid_origin')
                if not hmac.compare_digest(request.headers.get('X-CSRF-Token',''),g.session['csrf']):return error(403,'csrf_required')
                if not request.is_json:return error(415,'json_required')
                if not isinstance(request.get_json(silent=True),dict):return error(400,'json_object_required')
    @app.after_request
    def headers(r):
        r.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"})
        if secure:r.headers['Strict-Transport-Security']='max-age=31536000'
        return r
    @app.errorhandler(ServiceError)
    def service_error(e):return error(e.status,e.code)
    @app.errorhandler(requests.RequestException)
    def network_error(e):return error(502,'outlook_unavailable')
    @app.route('/api/health')
    def health():return jsonify(ok=True,microsoft_configured=settings is not None)
    @app.route('/')
    def index():return redirect('/app') if g.session else send_from_directory(ROOT,'login.html')
    @app.route('/login.css')
    def css():return send_from_directory(ROOT,'login.css')
    @app.route('/login.js')
    def login_js():return send_from_directory(ROOT,'login.js')
    @app.route('/microsoft-config.js')
    def public_config():return app.response_class('window.EZPARK_MICROSOFT='+json.dumps({'backendUrl':settings.app_url if settings else ''})+';',mimetype='application/javascript')
    @app.route('/auth/login')
    @app.route('/auth/connect-outlook')
    def login():
        if not settings:return error(503,'microsoft_not_configured')
        connect=request.path.endswith('connect-outlook')
        if connect and not g.session:return redirect('/auth/login')
        owner=g.session['oid'] if g.session else None;cached=store.get('cache',owner) if owner else None
        flow,cache=identity.begin((cached or {}).get('value',''),SCOPES if connect else ['User.Read'])
        auth=urlparse(flow.get('auth_uri',''))
        if auth.scheme!='https' or auth.netloc!='login.microsoftonline.com':return error(502,'invalid_identity_response')
        handle=secrets.token_urlsafe(32);store.put('flow',digest(handle),{'flow':flow,'cache':cache,'owner':owner},time.time()+600)
        response=redirect(flow['auth_uri']);set_cookie(response,flowcookie,handle,600);return response
    @app.route('/auth/callback')
    def callback():
        if not settings:return error(503,'microsoft_not_configured')
        handle=request.cookies.get(flowcookie,'');pending=store.get('flow',digest(handle),consume=True) if handle else None
        if not pending:return error(400,'sign_in_expired')
        try:result,cache=identity.finish(pending['cache'],pending['flow'],request.args.to_dict())
        except ValueError:return error(400,'invalid_sign_in_state')
        claims=result.get('id_token_claims',{});oid=claims.get('oid','')
        if not result.get('access_token') or claims.get('tid','').lower()!=settings.tenant_id.lower() or not guid(oid) or pending['owner'] and pending['owner']!=oid:return error(403,'sign_in_not_allowed')
        profile=store.get('user',oid) or {'oid':oid,'role':3 if oid==settings.admin_oid else 0,'garages':GARAGES if oid==settings.admin_oid else []}
        profile.update(name=claims.get('name',''),email=claims.get('preferred_username',''));store.put('user',oid,profile);store.put('cache',oid,{'value':cache})
        old=request.cookies.get(cookie)
        if old:store.delete('session',digest(old))
        sid=secrets.token_urlsafe(32);store.put('session',digest(sid),{'oid':oid,'tid':settings.tenant_id,'csrf':secrets.token_urlsafe(32)},time.time()+8*3600)
        response=redirect('/app');set_cookie(response,cookie,sid,8*3600);response.delete_cookie(flowcookie,path='/',secure=secure,httponly=True,samesite='Lax');return response
    @app.route('/api/me')
    def me():return jsonify(user=store.get('user',g.session['oid']),csrf=g.session['csrf'])
    @app.route('/api/logout',methods=['POST'])
    def logout():
        store.delete('session',digest(request.cookies.get(cookie,'')));r=jsonify(ok=True);r.delete_cookie(cookie,path='/',secure=secure,httponly=True,samesite='Lax');return r
    @app.route('/app')
    def workspace():return send_from_directory(ROOT/'backend','workspace.html') if g.session else redirect('/')
    @app.route('/workspace.js')
    def workspace_js():return send_from_directory(ROOT/'backend','workspace.js')
    @app.route('/workspace.css')
    def workspace_css():return send_from_directory(ROOT/'backend','workspace.css')
    def profile():return store.get('user',g.session['oid'])
    def mailbox(value):
        value=value or 'me'
        if not isinstance(value,str) or len(value)>254:raise ServiceError(400,'invalid_mailbox')
        if value=='me':return 'me'
        grant=store.get('grant',g.session['oid']+'|'+value.lower())
        if not grant or not set(grant['garages']).intersection(profile()['garages']):raise ServiceError(403,'mailbox_not_assigned')
        return 'users/'+quote(grant['mailbox'],safe='')
    def graph():
        owner=g.session['oid'];cached=store.get('cache',owner) or {};token,serialized=identity.token(cached.get('value',''),owner)
        if not token:raise ServiceError(401,'connect_outlook_required')
        store.put('cache',owner,{'value':serialized})
        return graph_factory(token) if graph_factory else GraphClient(token)
    @app.route('/api/outlook/mailboxes')
    def mailboxes():
        grants=[v for _,v in store.entries('grant',g.session['oid']+'|') if set(v['garages']).intersection(profile()['garages'])]
        return jsonify(mailboxes=[{'id':'me','label':'Mijn Outlook'}]+[{'id':v['mailbox'],'label':v['mailbox']} for v in grants])
    def delta_items(client,url,owner,scope):
        # Stage a complete round before committing items or the cursor.
        cursor_key=owner+'|'+scope;url=(store.get('cursor',cursor_key) or {}).get('url') or url;staged=[];checkpoint=None;seen=set()
        for _ in range(100):
            if url in seen:raise ServiceError(502,'outlook_paging_loop')
            seen.add(url);data=client.request('GET',url);staged.extend(data.get('value',[]))
            if data.get('@odata.nextLink'):url=data['@odata.nextLink'];continue
            checkpoint=data.get('@odata.deltaLink');break
        else:raise ServiceError(502,'outlook_sync_too_large')
        for item in staged:
            if not isinstance(item.get('id'),str):continue
            key=cursor_key+'|'+item['id'];old=store.get('item',key) or {'payload':{},'history':[]}
            before=dict(old['payload'])
            if '@removed' in item:old['removed']=True
            else:old['payload'].update(item);old['removed']=False
            if before and before!=old['payload']:old['history'].append(before)
            old.update(scope=scope,owner=owner,updated_at=time.time());store.put('item',key,old)
        if checkpoint:store.put('cursor',cursor_key,{'url':checkpoint})
        return len(staged)
    @app.route('/api/outlook/sync',methods=['POST'])
    def sync():
        data=request.get_json();target=data.get('mailbox','me');base=mailbox(target);client=graph();owner=g.session['oid'];result={}
        kind=data.get('kind','mail')
        if kind=='mail':
            for folder in ['inbox','archive']:
                scope=base+'|mail|'+folder
                url=GRAPH+base+'/mailFolders/'+folder+'/messages/delta?$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,body,isRead,hasAttachments,webLink'
                result[folder]=delta_items(client,url,owner,scope)
        elif kind=='calendar':
            try:
                if not isinstance(data.get('start'),str) or not isinstance(data.get('end'),str):raise ValueError()
                start=datetime.fromisoformat(data['start'].replace('Z','+00:00'));end=datetime.fromisoformat(data['end'].replace('Z','+00:00'))
                if not start.tzinfo or not end.tzinfo or not timedelta(0)<end-start<=timedelta(days=93):raise ValueError()
            except (ValueError,KeyError,TypeError):raise ServiceError(400,'invalid_calendar_period')
            scope=base+'|calendar|'+data['start']+'|'+data['end'];url=GRAPH+base+'/calendarView/delta?'+urlencode({'startDateTime':data['start'],'endDateTime':data['end']})
            result['calendar']=delta_items(client,url,owner,scope)
            store.put('view',owner+'|'+base+'|calendar',{'scope':scope})
        else:raise ServiceError(400,'invalid_sync_kind')
        return jsonify(changes=result)
    @app.route('/api/outlook/items')
    def items():
        base=mailbox(request.args.get('mailbox','me'));kind=request.args.get('kind','mail')
        if kind not in ['mail','calendar']:raise ServiceError(400,'invalid_sync_kind')
        rows=[v for _,v in store.entries('item',g.session['oid']+'|'+base+'|'+kind+'|')]
        if kind=='calendar':
            selected=store.get('view',g.session['oid']+'|'+base+'|calendar')
            rows=[v for v in rows if selected and v['scope']==selected['scope']]
        active={}
        for row in rows:
            if not row.get('removed'):
                value=row['payload'];identifier=value.get('id');previous=active.get(identifier)
                if not previous or row['updated_at']>previous['updated_at']:active[identifier]=row
        return jsonify(items=[v['payload'] for v in active.values()])
    @app.route('/api/admin/users/<oid>',methods=['PUT'])
    def manage_user(oid):
        if g.session['oid']!=settings.admin_oid:raise ServiceError(403,'administrator_required')
        data=request.get_json();person=store.get('user',oid)
        if not person:raise ServiceError(404,'user_must_sign_in_first')
        garages=data.get('garages');role=data.get('role')
        if not isinstance(garages,list) or any(s not in GARAGES for s in garages) or type(role) is not int or role not in range(4):raise ServiceError(400,'invalid_user_permissions')
        person.update(garages=garages,role=role);store.put('user',oid,person);return jsonify(ok=True)
    @app.route('/api/admin/mailbox-grants',methods=['POST'])
    def manage_grant():
        if g.session['oid']!=settings.admin_oid:raise ServiceError(403,'administrator_required')
        data=request.get_json();oid=data.get('oid');address=data.get('mailbox','');garages=data.get('garages',[])
        if not isinstance(address,str):raise ServiceError(400,'invalid_mailbox_grant')
        address=address.strip().lower()
        if not guid(oid) or not store.get('user',oid) or len(address)>254 or address.count('@')!=1 or any(c in address for c in '/?#|\r\n') or not isinstance(garages,list) or not garages or any(s not in GARAGES for s in garages):raise ServiceError(400,'invalid_mailbox_grant')
        store.put('grant',oid+'|'+address,{'mailbox':address,'garages':garages});return jsonify(ok=True)
    return app

if __name__=='__main__':
    import logging
    logging.getLogger('werkzeug').setLevel(logging.ERROR)  # Never log callback codes/query parameters.
    create_app().run(host='127.0.0.1',port=int(os.getenv('PORT','4176')),debug=False)
