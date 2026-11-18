const {Window}=await import(process.env.EZPARK_TEST_DOM_MODULE||'happy-dom');
import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));const html=(await readFile(root+'/login.html','utf8')).replace(/<script[^>]*src=[^>]*><\/script>/g,'');const source=await readFile(root+'/login.js','utf8');
for(const [backend,url,enabled] of [
 ['', 'https://ezewuster.github.io/EZpark/',false],
 ['http://example.test/','https://ezewuster.github.io/EZpark/',false],
 ['javascript:alert(1)','https://ezewuster.github.io/EZpark/',false],
 ['https://example.test/unsafe-path','https://ezewuster.github.io/EZpark/',false],
 ['https://example.test/?next=https://evil.test','https://ezewuster.github.io/EZpark/',false],
 ['https://app.example.test/','https://ezewuster.github.io/EZpark/',true],
 ['http://localhost:4176/','http://localhost:4175/login.html',true],
 ['http://localhost:4176/','https://ezewuster.github.io/EZpark/',false]
]){const w=new Window({url});let calls=0;w.fetch=async()=>{calls++;throw Error('Unexpected request')};w.document.write(html);w.EZPARK_MICROSOFT={backendUrl:backend};w.eval(source);assert.equal(!w.document.querySelector('#microsoft-login').disabled,enabled);assert.equal(calls,0);assert.equal(w.localStorage.length,0);assert.equal(w.document.querySelectorAll('input[type=password]').length,0);assert.equal(w.document.querySelectorAll('[data-page]').length,0);await w.happyDOM.close();}
console.log('PASS Microsoft login screen: no fake login or data load, missing/invalid config fails closed, HTTPS backend and loopback validation');
