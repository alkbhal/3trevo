# Central de Agentes TT — protótipo v0.3
Codex é ferramenta de desenvolvimento, não runtime. Este protótipo não chama LLM nem envia dados a provedores.

Controles demonstrados:
- Aprovação vinculada ao hash SHA-256 do payload canônico, run_id, operador, nonce e expiração.
- Rejeição de payload alterado, aprovação expirada, operador divergente e replay no estado do envelope.
- Máquina de estados e reconciliação.
- Auditoria JSONL com hash-chain.
- Proveniência de fonte com URL, UTC, status HTTP, hash, cópia arquivada e versão do extrator.
- Conteúdo recuperado marcado como dado não confiável.
- Scanner heurístico de logs para e-mail, CPF e padrões comuns de chaves.
- Política deny-by-default (`policy.py`): deny / approval_required / allow_with_log; aprovação só por envelope estruturado.
- Sinalizador STOP (`stop.py`) checado antes de iniciar e antes de cada ação controlada.
- Contrato de módulo validado no registro (`contract.py`); módulo com contrato inválido não entra.
- Testes automatizados.

Python 3.10+:
Rodar dentro desta pasta (`scripts/central-tt`):
`python -m unittest discover -s tests -t . -v`
`python -m src.central_tt.demo`

Limites: protótipo, não produção. A aprovação ainda não tem assinatura criptográfica nem consumo transacional; identidade do operador é declarada pelo chamador. Hash-chain detecta adulteração apenas se a raiz de confiança não for reescrita. Scanner de PII é heurístico. Detector de prompt injection não é defesa suficiente sozinho: a defesa principal é que fontes nunca recebem autoridade, ferramentas são allowlisted e conteúdo não pode autorizar ações.

O estado de execução (`runtime/`) é local e não vai para o Git.
