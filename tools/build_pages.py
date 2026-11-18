from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
out=root/'docs'
out.mkdir(exist_ok=True)
for name in ['index.html','app.js','style.css']:
    shutil.copy2(root/name,out/name)
page=(out/'index.html').read_text().replace('<script src="./app.js"', '<script src="./host-config.js"></script><script src="./app.js"').replace('LOKALE TEST','ONLINE DEMO')
(out/'index.html').write_text(page)
(out/'host-config.js').write_text('window.EZPARK_STATIC_HOSTING = true;\n')
(out/'.nojekyll').touch()
assert sorted(p.name for p in out.iterdir())==['.nojekyll','app.js','host-config.js','index.html','style.css']
print('GitHub Pages-bestanden klaar: docs/')
