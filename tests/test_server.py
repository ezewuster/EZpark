import importlib.util, io, json, tempfile, unittest
from pathlib import Path
from email.message import Message
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('ezpark_server',ROOT/'server.py');server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class FakeHandler(server.Handler):
    def __init__(self,path='/',body=None,origin='http://localhost:4174'):
        self.path=path;self.headers=Message();self.headers['Host']='localhost:4174';self.headers['Origin']=origin
        content=json.dumps(body).encode() if body is not None else b'';self.headers['Content-Length']=str(len(content));self.rfile=io.BytesIO(content);self.result=None
    def reply(self,status,data):self.result=(status,data)
class BackupTests(unittest.TestCase):
    def test_backup_preserves_previous_versions(self):
        with tempfile.TemporaryDirectory() as d:
            server.DATA=Path(d)
            for value in ['eerste','tweede']:
                request=FakeHandler('/api/backup',{'state':{'users':[{'id':'eiko'}],'notes':[value]}});request.do_POST();self.assertEqual(request.result[0],200)
            files=list((server.DATA/'backups').glob('*.json'));self.assertEqual(len(files),2)
            self.assertEqual({json.loads(p.read_text())['state']['notes'][0] for p in files},{'eerste','tweede'})
            request=FakeHandler('/api/backup');request.do_GET();self.assertEqual(request.result[1]['state']['notes'],['tweede'])
    def test_invalid_and_cross_origin_requests_rejected(self):
        request=FakeHandler('/api/backup',{'invalid':True});request.do_POST();self.assertEqual(request.result[0],400)
        request=FakeHandler('/api/backup',{'state':{'users':[]}},origin='https://example.test');request.do_POST();self.assertEqual(request.result[0],403)
    def test_backups_not_public_static_files(self):
        for path in ['/data/state.json','/%64ata/state.json','/.git/config']:
            request=FakeHandler(path);request.do_GET();self.assertEqual(request.result[0],404)
if __name__=='__main__':unittest.main()
