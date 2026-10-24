import json
from pathlib import Path
SCHEMA=Path(__file__).resolve().parents[2]/"schemas"/"module-contract.schema.json"
def _check(value,spec,path,errors):
 if "enum" in spec and value not in spec["enum"]:errors.append(f"{path}: valor fora de {spec['enum']}")
 t=spec.get("type")
 if t=="object":
  if not isinstance(value,dict):errors.append(f"{path}: deve ser objeto");return
  for k in spec.get("required",[]):
   if k not in value:errors.append(f"{path}.{k}: obrigatório")
  props=spec.get("properties",{})
  if spec.get("additionalProperties") is False:
   for k in value:
    if k not in props:errors.append(f"{path}.{k}: campo não permitido")
  for k,sub in props.items():
   if k in value:_check(value[k],sub,f"{path}.{k}",errors)
 elif t=="array":
  if not isinstance(value,list):errors.append(f"{path}: deve ser lista");return
  for i,item in enumerate(value):_check(item,spec.get("items",{}),f"{path}[{i}]",errors)
 elif t=="string" and not isinstance(value,str):errors.append(f"{path}: deve ser texto")
def validate(contract,schema_path=SCHEMA):
 """Validação mínima do subconjunto de JSON Schema usado no contrato (sem dependências externas)."""
 errors=[];_check(contract,json.loads(Path(schema_path).read_text(encoding="utf-8")),"$",errors)
 return not errors,errors
class Registry:
 def __init__(self):self.modules={}
 def register(self,contract):
  ok,errors=validate(contract)
  if not ok:raise ValueError("contrato inválido: "+"; ".join(errors))
  self.modules[contract["module_id"]]=contract
