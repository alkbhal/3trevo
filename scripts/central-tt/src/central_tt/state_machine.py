from enum import Enum
class State(str,Enum):
 QUEUED="queued"; RUNNING="running"; WAITING_APPROVAL="waiting_approval"; SUCCEEDED="succeeded"; FAILED="failed"; CANCELLED="cancelled"; NEEDS_RECONCILIATION="needs_reconciliation"
T={State.QUEUED:{State.RUNNING,State.CANCELLED},State.RUNNING:{State.WAITING_APPROVAL,State.SUCCEEDED,State.FAILED,State.CANCELLED,State.NEEDS_RECONCILIATION},State.WAITING_APPROVAL:{State.RUNNING,State.CANCELLED,State.FAILED},State.NEEDS_RECONCILIATION:{State.SUCCEEDED,State.FAILED,State.CANCELLED},State.SUCCEEDED:set(),State.FAILED:set(),State.CANCELLED:set()}
def transition(current,target,confirmed=False,reconciled=False):
 current,target=State(current),State(target)
 if target not in T[current]: raise ValueError(f"Transição proibida {current.value}->{target.value}")
 if target==State.SUCCEEDED and current!=State.QUEUED and not confirmed and not reconciled: raise ValueError("sucesso exige confirmação")
 if current==State.NEEDS_RECONCILIATION and target==State.SUCCEEDED and not reconciled: raise ValueError("reconciliação obrigatória")
 return target
def reconcile(observed):
 return {"confirmed_success":State.SUCCEEDED,"confirmed_no_effect":State.FAILED}.get(observed,State.NEEDS_RECONCILIATION)
