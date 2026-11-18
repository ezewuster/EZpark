#!/usr/bin/env python3
"""Local EZpark test server. Standard library only; no external service calls."""
import argparse, json, os, tempfile, uuid
from pathlib import Path
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote
from threading import Lock
ROOT=Path(__file__).resolve().parent
lock=Lock()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        super().end_headers()
    def reply(self,status,data):
        body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=unquote(urlparse(self.path).path)
        if path=='/api/backup':
            with lock:
                try:data=json.loads((DATA/'state.json').read_text())
                except FileNotFoundError:data=None
            return self.reply(200,data)
        if path=='/api/health':return self.reply(200,{'ok':True,'mode':'local-demo'})
        if path.startswith(('/data/','/.','/source-demo/')):return self.reply(404,{'error':'Niet gevonden'})
        return super().do_GET()
    def do_POST(self):
        if urlparse(self.path).path!='/api/backup':return self.reply(404,{'error':'Niet gevonden'})
        origin=self.headers.get('Origin')
        if origin and origin not in ['http://'+self.headers.get('Host','')]:return self.reply(403,{'error':'Alleen vanuit EZpark opslaan'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<=0 or length>8_000_000:return self.reply(413,{'error':'Bestand is te groot'})
            data=json.loads(self.rfile.read(length))
            if not isinstance(data,dict) or not isinstance(data.get('state'),dict) or not isinstance(data['state'].get('users'),list):return self.reply(400,{'error':'Ongeldige testgegevens'})
            body=json.dumps(data,ensure_ascii=False,indent=2)
            with lock:
                DATA.mkdir(parents=True,exist_ok=True);(DATA/'backups').mkdir(exist_ok=True)
                name=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'-'+uuid.uuid4().hex[:8]+'.json'
                (DATA/'backups'/name).write_text(body)
                fd,temp=tempfile.mkstemp(dir=DATA,prefix='.state-')
                with os.fdopen(fd,'w') as f:f.write(body);f.flush();os.fsync(f.fileno())
                os.replace(temp,DATA/'state.json')
            self.reply(200,{'ok':True})
        except (ValueError,TypeError):self.reply(400,{'error':'Ongeldige JSON'})
        except OSError:self.reply(500,{'error':'Bestandsback-up mislukt'})
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--port',type=int,default=4174);ap.add_argument('--host',default='127.0.0.1');ap.add_argument('--data-dir',type=Path,default=ROOT/'data');args=ap.parse_args();DATA=args.data_dir.resolve()
    server=ThreadingHTTPServer((args.host,args.port),Handler)
    print(f'EZpark lokaal: http://localhost:{args.port}',flush=True)
    print('Alle mails, doorzetten en uitnodigingen zijn gesimuleerd. Stoppen: Ctrl+C.',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:server.server_close()
