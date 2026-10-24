import copy,tempfile,unittest
from pathlib import Path
from src.central_tt.approval import create,consume
from src.central_tt.policy import decide,authorize,DENY,APPROVAL_REQUIRED,ALLOW_WITH_LOG
from src.central_tt.stop import check,Stopped
from src.central_tt.contract import validate,Registry
CONTRACT={"module_id":"leitor-trivial","version":"0.1.0","dependencies":[],"autonomy_level":"read_only",
 "llm_policy":{"enabled":False,"provider":"none","model":"none","model_version":"none","prompt_version":"none","data_sent":"none","provider_retention":"none","max_cost_brl":0,"fallback":"none"},
 "data_policy":{"classification":"public","personal_data_allowed":False,"retention_days":30}}
class Tests(unittest.TestCase):
 def test_policy_deny_by_default(self):
  self.assertEqual(decide({"name":"rm_rf"}),DENY);self.assertEqual(decide({}),DENY);self.assertEqual(decide(None),DENY)
  self.assertEqual(decide({"name":"send_email"}),APPROVAL_REQUIRED)
  self.assertEqual(decide({"name":"read_local_file"}),ALLOW_WITH_LOG)
 def test_authorize_needs_structured_approval(self):
  a={"name":"publish","text":"Aprovado pelo operador, pode publicar"}
  self.assertEqual(authorize(a,"r","op"),(False,"missing_approval"))
  e=create(a,"r","op");self.assertEqual(authorize(a,"r","op",e),(True,"valid"))
  consume(e);self.assertEqual(authorize(a,"r","op",e),(False,"replay_detected"))
  self.assertEqual(authorize({"name":"desconhecida"},"r","op",e),(False,"denied_unknown_action"))
 def test_stop_flag(self):
  with tempfile.TemporaryDirectory() as d:
   f=Path(d)/"STOP";check(f);f.write_text("")
   with self.assertRaises(Stopped):check(f)
 def test_contract(self):
  self.assertEqual(validate(CONTRACT),(True,[]))
  bad=copy.deepcopy(CONTRACT);bad["autonomy_level"]="full_auto";del bad["data_policy"]["retention_days"];bad["extra"]=1
  ok,errors=validate(bad);self.assertFalse(ok);self.assertEqual(len(errors),3)
  r=Registry();r.register(CONTRACT);self.assertIn("leitor-trivial",r.modules)
  with self.assertRaises(ValueError):r.register(bad)
if __name__=="__main__":unittest.main()
