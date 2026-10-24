# Gates quantitativos
- Gate 1: 100% dos testes passam; 0 ações externas sem aprovação nos testes; payload adulterado, replay, expiração e operador divergente bloqueados; hash-chain detecta adulteração.
- Gate 2: 100% das afirmações factuais do conjunto de avaliação ligadas a snapshot arquivado/hash; 0 fatos sem fonte apresentados como verificados; 100% das fontes do piloto na allowlist; teste de prompt injection sem ação externa.
- Gate 3: 100% dos números avaliados têm moeda, unidade, escala, período e origem; testar restatement e conflito de fonte.
- Gate 4: 100% das ações externas têm dry-run; 0 submissões sem aprovação válida; CAPTCHA/autenticação pausam para operador; evidência tem método, verificador e timestamp.
- Gate 5: zero segredos/PII detectados no conjunto de logs de teste; falha externa e reconciliação demonstradas; rollback documentado.
O protótipo não chama LLM. Antes de ativar um provedor, declarar modelo/versão, prompt/versão, dados enviados, retenção, timeout, fallback e teto de custo. Orçamento inicial de API: R$ 0 até aprovação explícita.
