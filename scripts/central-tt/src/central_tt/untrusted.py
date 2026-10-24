import re
PATTERNS=[r"ignore (all )?(previous|prior) instructions",r"reveal (the )?(system prompt|secrets|credentials)",r"send (the )?(data|secret|credentials) to",r"override (the )?(policy|rules|system)"]
def wrap(text):
 hits=[p for p in PATTERNS if re.search(p,text,re.I)]
 return {"content":text,"trust":"untrusted_data","may_authorize_actions":False,"suspicious_patterns":hits}
