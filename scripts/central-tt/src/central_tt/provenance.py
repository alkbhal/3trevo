import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlparse
def snapshot(url,status,body,archive_dir,extractor_version,allow_domains,fetched_at=None):
 u=urlparse(url)
 if u.scheme!="https" or not u.hostname:raise ValueError("URL HTTPS obrigatória")
 if not any(u.hostname==d or u.hostname.endswith("."+d) for d in allow_domains):raise PermissionError("Domínio fora da allowlist")
 digest=hashlib.sha256(body).hexdigest();p=Path(archive_dir);p.mkdir(parents=True,exist_ok=True);(p/(digest+".bin")).write_bytes(body)
 rec={"url":url,"fetched_at_utc":fetched_at or datetime.now(timezone.utc).isoformat(),"http_status":int(status),"sha256":digest,"archive_file":digest+".bin","extractor_version":extractor_version,"content_bytes":len(body)}
 with (p/"provenance.jsonl").open("a",encoding="utf-8") as f:f.write(json.dumps(rec,sort_keys=True)+"\n")
 return rec
