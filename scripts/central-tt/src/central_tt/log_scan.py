import re
PATTERNS={"possible_email":r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b","possible_cpf":r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b","possible_api_key":r"\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b","private_key_marker":r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"}
def scan(text):return [{"type":k,"count":len(re.findall(v,text,re.I))} for k,v in PATTERNS.items() if re.search(v,text,re.I)]
