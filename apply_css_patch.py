import sys,re
from pathlib import Path
INDEX=Path('/workspaces/3trevo/index.html')
html=INDEX.read_text(encoding='utf-8')
m=re.search(r'(<style>)(.*?)(</style>)',html,re.DOTALL)
backup=INDEX.with_suffix('.html.bak')
backup.write_text(html,encoding='utf-8')
patch=open('/workspaces/3trevo/css-patch.css').read()
css_novo=m.group(2)+'\n\n/* ══ PATCH v2 ══ */\n'+patch
novo=html[:m.start()]+'<style>'+css_novo+'</style>'+html[m.end():]
INDEX.write_text(novo,encoding='utf-8')
print('PRONTO.',INDEX.stat().st_size,'bytes')
