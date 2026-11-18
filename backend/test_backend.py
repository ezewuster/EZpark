import json, os, tempfile, unittest, uuid
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse
from cryptography.fernet import Fernet
from app import Settings, create_app, SCOPES, GraphClient, ServiceError
T='11111111-1111-4111-8111-111111111111';A='22222222-2222-4222-8222-222222222222';U='33333333-3333-4333-8333-333333333333'
class FakeIdentity:
    def __init__(self):self.oid=A;self.tenant=T;self.last=None
    def begin(self,cache,scopes):
        self.last={'state':str(uuid.uuid4()),'scopes':scopes};return {**self.last,'auth_uri':'https://login.microsoftonline.com/'+T+'/oauth2/v2.0/authorize'},cache
    def finish(self,cache,flow,args):
        if flow['state']!=args.get('state'):raise ValueError('CSRF')
        return {'access_token':'FAKE-NOT-A-REAL-TOKEN','id_token_claims':{'oid':self.oid,'tid':self.tenant,'name':'Fictieve gebruiker','preferred_username':'test@example.test'}},json.dumps({'scopes':flow['scopes']})
    def token(self,cache,oid):
        scopes=json.loads(cache or '{}').get('scopes',[]);return ('FAKE-NOT-A-REAL-TOKEN' if set(SCOPES).issubset(scopes) else None),cache
class FakeGraph:
    def __init__(self):self.calls=[];self.changed=False;self.broken=False;self.removed=False
    def request(self,method,url,body=None):
        self.calls.append(url)
        if self.broken:raise ServiceError(502,'outlook_request_failed')
        if 'calendar' in url:return {'value':[{'id':'event-1','subject':'Fictieve afspraak','start':{'dateTime':'2026-11-18T10:00:00'},'end':{'dateTime':'2026-11-18T11:00:00'}}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/calendarView/delta?cursor=event'}
        if 'archive' in url:return {'value':[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/archive/messages/delta?cursor=archive'}
        if self.removed:return {'value':[{'id':'mail-1','@removed':{'reason':'deleted'}}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?cursor=removed'}
        if self.changed:return {'value':[{'id':'mail-1','isRead':True}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?cursor=second'}
        return {'value':[{'id':'mail-1','conversationId':'thread-1','subject':'Fictieve storing','body':{'contentType':'text','content':'PRIVATE-FIXTURE-BODY'},'from':{'emailAddress':{'address':'test@example.test'}}}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?cursor=first'}
class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.identity=FakeIdentity();self.graph=FakeGraph()
        self.settings=Settings(T,'44444444-4444-4444-8444-444444444444','fake-test-secret',Fernet.generate_key().decode(),'http://localhost:4176',A,str(Path(self.temp.name)/'store.sqlite')).validate()
        self.app=create_app(self.settings,self.identity,lambda token:self.graph);self.app.testing=True;self.client=self.app.test_client();self.store=self.app.extensions['ezpark_store']
    def tearDown(self):self.temp.cleanup()
    def sign_in(self,client=None,oid=A,connect=False):
        client=client or self.client;self.identity.oid=oid;r=client.get('/auth/connect-outlook' if connect else '/auth/login');self.assertEqual(r.status_code,302)
        r=client.get('/auth/callback',query_string={'state':self.identity.last['state'],'code':'fake-code'});self.assertEqual(r.status_code,302);return client
    def headers(self,client=None):return {'Origin':'http://localhost:4176','X-CSRF-Token':(client or self.client).get('/api/me').json['csrf']}
    def connect(self):self.sign_in();self.sign_in(connect=True)
    def test_unsigned_access_and_first_screen(self):
        self.assertEqual(self.client.get('/api/me').status_code,401);self.assertEqual(self.client.get('/api/outlook/items').status_code,401)
        response=self.client.get('/');self.assertIn(b'Eerst even inloggen',response.data);response.close();self.assertEqual(self.client.get('/app').status_code,302)
        with patch.dict(os.environ,{},clear=True):unconfigured=create_app().test_client()
        self.assertEqual(unconfigured.get('/auth/login').status_code,503)
    def test_valid_session_and_no_tokens_in_browser(self):
        self.sign_in();r=self.client.get('/api/me');self.assertEqual(r.json['user']['oid'],A);self.assertNotIn('access_token',r.text);response=self.client.get('/app');self.assertIn(b'Outlook-werkruimte',response.data);response.close()
        cookie=self.client.get_cookie('ezpark_dev');self.assertTrue(cookie.http_only);self.assertEqual(cookie.same_site,'Lax')
        self.assertNotIn('FAKE-NOT-A-REAL-TOKEN',cookie.value)
    def test_flow_replay_and_bad_state(self):
        self.client.get('/auth/login');state=self.identity.last['state'];self.assertEqual(self.client.get('/auth/callback?state=wrong').status_code,400)
        self.assertEqual(self.client.get('/auth/callback',query_string={'state':state}).status_code,400)
    def test_wrong_tenant_denied(self):
        self.identity.tenant=U;self.client.get('/auth/login');r=self.client.get('/auth/callback',query_string={'state':self.identity.last['state']});self.assertEqual(r.status_code,403);self.assertEqual(self.client.get('/api/me').status_code,401)
    def test_connection_cannot_change_account(self):
        self.sign_in();self.client.get('/auth/connect-outlook');self.identity.oid=U;r=self.client.get('/auth/callback',query_string={'state':self.identity.last['state']});self.assertEqual(r.status_code,403);self.assertEqual(self.client.get('/api/me').json['user']['oid'],A)
    def test_csrf_and_origin(self):
        self.connect();self.assertEqual(self.client.post('/api/outlook/sync',json={}).status_code,403)
        headers=self.headers();headers['Origin']='https://evil.example';self.assertEqual(self.client.post('/api/outlook/sync',json={},headers=headers).status_code,403)
    def test_outlook_requires_explicit_connection(self):
        self.sign_in();r=self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=self.headers());self.assertEqual(r.status_code,401);self.assertEqual(r.json['error'],'connect_outlook_required')
    def test_mail_delta_no_duplicates_partial_update_and_tombstone(self):
        self.connect();h=self.headers();self.assertEqual(self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=h).status_code,200)
        self.graph.changed=True;self.assertEqual(self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=h).status_code,200)
        items=self.client.get('/api/outlook/items').json['items'];self.assertEqual(len(items),1);self.assertEqual(items[0]['subject'],'Fictieve storing');self.assertTrue(items[0]['isRead']);self.assertTrue(any('cursor=first' in u for u in self.graph.calls))
        self.graph.removed=True;self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=h);self.assertEqual(self.client.get('/api/outlook/items').json['items'],[])
        cached=self.store.entries('item');self.assertTrue(any(v['payload'].get('body',{}).get('content')=='PRIVATE-FIXTURE-BODY' for _,v in cached))
    def test_storage_encrypted(self):
        self.connect();self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=self.headers());raw=Path(self.settings.database).read_bytes();self.assertNotIn(b'PRIVATE-FIXTURE-BODY',raw);self.assertNotIn(b'test@example.test',raw)
    def test_user_isolation_and_shared_grants(self):
        self.connect();self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=self.headers());second=self.app.test_client();self.sign_in(second,U)
        self.assertEqual(second.get('/api/outlook/items').json['items'],[]);self.assertEqual(second.get('/api/me').json['user']['garages'],[])
        self.assertEqual(second.get('/api/outlook/items?mailbox=shared@example.test').status_code,403)
        self.assertEqual(second.put('/api/admin/users/'+U,json={'garages':['Boterdiep'],'role':3},headers=self.headers(second)).status_code,403)
        self.assertEqual(self.client.put('/api/admin/users/'+U,json={'garages':['Boterdiep'],'role':0},headers=self.headers()).status_code,200)
        self.assertEqual(self.client.post('/api/admin/mailbox-grants',json={'oid':U,'mailbox':'shared@example.test','garages':['Boterdiep']},headers=self.headers()).status_code,200)
        self.assertEqual(second.get('/api/outlook/items?mailbox=shared@example.test').status_code,200)
    def test_calendar_period(self):
        self.connect();h=self.headers();self.assertEqual(self.client.post('/api/outlook/sync',json={'kind':'calendar','start':'bad','end':'bad'},headers=h).status_code,400)
        r=self.client.post('/api/outlook/sync',json={'kind':'calendar','start':'2026-11-01T00:00:00Z','end':'2026-12-01T00:00:00Z'},headers=h);self.assertEqual(r.status_code,200);self.assertEqual(len(self.client.get('/api/outlook/items?kind=calendar').json['items']),1)
    def test_failed_sync_preserves_cursor_and_items(self):
        self.connect();h=self.headers();self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=h);before=self.store.entries('cursor');self.graph.broken=True
        self.assertEqual(self.client.post('/api/outlook/sync',json={'kind':'mail'},headers=h).status_code,502);self.assertEqual(self.store.entries('cursor'),before);self.assertEqual(len(self.client.get('/api/outlook/items').json['items']),1)
    def test_logout(self):
        self.sign_in();self.assertEqual(self.client.post('/api/logout',json={},headers=self.headers()).status_code,200);self.assertEqual(self.client.get('/api/me').status_code,401)
    def test_graph_token_cannot_be_sent_to_other_host(self):
        class NoNetwork:
            def request(self,*a,**k):raise AssertionError('No external request allowed')
        c=GraphClient('FAKE',NoNetwork())
        for url in ['https://evil.example/test','https://graph.microsoft.com@evil.example/v1.0/me','https://graph.microsoft.com/v2.0/me']:
            with self.assertRaises(ServiceError):c.request('GET',url)
    def test_insecure_production_settings_rejected(self):
        self.settings.app_url='http://example.test'
        with self.assertRaises(ValueError):self.settings.validate()
if __name__=='__main__':unittest.main(verbosity=2)
