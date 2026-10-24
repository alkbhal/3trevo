import hashlib,json,secrets
from datetime import datetime,timezone,timedelta
def canonical(payload): return json.dumps(payload,sort_keys=True,separators=(",",":"),ensure_ascii=False)
def digest(payload): return hashlib.sha256(canonical(payload).encode()).hexdigest()
def create(payload,run_id,operator_id,ttl=300,now=None):
 now=now or datetime.now(timezone.utc)
 return {"approval_id":secrets.token_hex(16),"nonce":secrets.token_hex(16),"run_id":run_id,"operator_id":operator_id,"payload_sha256":digest(payload),"issued_at":now.isoformat(),"expires_at":(now+timedelta(seconds=ttl)).isoformat(),"consumed":False}
def validate(env,payload,run_id,operator_id,now=None):
 now=now or datetime.now(timezone.utc)
 if not env:return False,"missing_approval"
 if env.get("consumed"):return False,"replay_detected"
 if env.get("run_id")!=run_id:return False,"run_mismatch"
 if env.get("operator_id")!=operator_id:return False,"operator_mismatch"
 if env.get("payload_sha256")!=digest(payload):return False,"payload_mismatch"
 try: expiry=datetime.fromisoformat(env["expires_at"])
 except Exception:return False,"invalid_expiry"
 if expiry.tzinfo is None:return False,"invalid_expiry_timezone"
 if now>=expiry:return False,"expired"
 if not env.get("approval_id") or not env.get("nonce"):return False,"missing_nonce_or_id"
 return True,"valid"
def consume(env): env["consumed"]=True; return env
