from .approval import validate
DENY="deny"; APPROVAL_REQUIRED="approval_required"; ALLOW_WITH_LOG="allow_with_log"
# Ações conhecidas. Qualquer outra é negada (deny-by-default).
ALLOW={"read_local_file","search_public_source","analyze_public_document"}
NEEDS_APPROVAL={"send_email","submit_optout","upload_document","publish","purchase","negotiate","delete_remote","change_repository"}
def decide(action):
 name=(action or {}).get("name")
 if name in ALLOW:return ALLOW_WITH_LOG
 if name in NEEDS_APPROVAL:return APPROVAL_REQUIRED
 return DENY
def authorize(action,run_id,operator_id,approval=None,now=None):
 """Retorna (pode_executar, motivo). Texto em prompt nunca conta como aprovação: só o envelope estruturado."""
 d=decide(action)
 if d==DENY:return False,"denied_unknown_action"
 if d==ALLOW_WITH_LOG:return True,"allow_with_log"
 ok,reason=validate(approval,action,run_id,operator_id,now)
 return ok,reason
