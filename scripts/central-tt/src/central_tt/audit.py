import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
GENESIS="0"*64
def append(path,**fields):
 p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);prev=GENESIS
 if p.exists():
  lines=[x for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
  if lines:prev=json.loads(lines[-1])["record_hash"]
 row={"timestamp":datetime.now(timezone.utc).isoformat(),**fields,"previous_hash":prev}
 raw=json.dumps(row,sort_keys=True,separators=(",",":"),ensure_ascii=False);row["record_hash"]=hashlib.sha256(raw.encode()).hexdigest()
 with p.open("a",encoding="utf-8") as f:f.write(json.dumps(row,sort_keys=True,ensure_ascii=False)+"\n")
 return row
def verify(path):
 p=Path(path);prev=GENESIS;count=0
 if not p.exists():return True,0
 for line in p.read_text(encoding="utf-8").splitlines():
  if not line.strip():continue
  row=json.loads(line);claimed=row.pop("record_hash")
  if row.get("previous_hash")!=prev:return False,count
  raw=json.dumps(row,sort_keys=True,separators=(",",":"),ensure_ascii=False)
  if hashlib.sha256(raw.encode()).hexdigest()!=claimed:return False,count
  prev=claimed;count+=1
 return True,count
