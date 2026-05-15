# Relatório de Segurança — Editora Três Trevo
**Data:** 2026-05-06  
**Repositório:** https://github.com/alkbhal/3trevo (público)  
**Escopo:** Auditoria completa de segurança + limpeza

---

## 1. Achados Críticos (já tratados)

### 1.1 MercadoPago Access Token exposto — CRITICO
| Item | Detalhe |
|------|---------|
| Arquivo | `supabase/deploy.md` |
| Dado | `APP_USR-[REVOGADO — token removido do histórico e regenerado]` |
| Risco | Token de produção do MP permite criar cobranças, processar pagamentos e acessar transações da conta |
| Ação aplicada | Token substituído por placeholder `SEU_TOKEN_MERCADOPAGO_AQUI` |
| **Acao obrigatoria** | **REVOGAR e REGENERAR o token no painel MercadoPago imediatamente, mesmo após remover do repo** |

> Como revogar: https://www.mercadopago.com.br/developers/panel → Aplicações → Credenciais → Regenerar

### 1.2 Senha admin hardcoded
| Item | Detalhe |
|------|---------|
| Arquivo | `admin.html` (linha 516) |
| Dado | Senha padrão `TresT2026!` em `btoa('TresT2026!')` |
| Risco | Qualquer pessoa pode acessar o painel administrativo |
| Ação aplicada | Arquivo adicionado ao `.gitignore` |
| **Acao obrigatoria** | **Remover `admin.html` do histórico git (ver seção 5)** |

### 1.3 Metadado interno em progresso.json
| Item | Detalhe |
|------|---------|
| Arquivo | `progresso.json` |
| Dado | Nota revelando integração Make.com + GitHub API |
| Ação aplicada | Campo `nota` removido do arquivo |

---

### 1.4 Make.com webhook URL exposta em ebook.html
| Item | Detalhe |
|------|---------|
| Arquivo | `ebook.html` (linha 121) |
| Dado | `https://hook.us2.make.com/itjax3gmav10kq0a573tnlwd4a3qbbjj` |
| Risco | URL de webhook ativa pode ser chamada por terceiros para acionar automações Make.com |
| Ação aplicada | URL removida, campo definido como string vazia com comentário |

---

## 2. Achados Moderados

### 2.1 config.json com dados de negócio sigilosos
| Campo | Valor exposto |
|-------|--------------|
| `meta.total_oculto` | R$34.000 (meta de arrecadação interna) |
| `meta.arrecadado` | R$3.400 (valor atual) |
| `formula.redes` | Pesos % de cada rede social no multiplicador |
| `catalogo.*.preco` | Preços de todos os produtos |
| `catalogo.*.cotas` | Estrutura de cotas do programa cultural |

**Arquivo adicionado ao `.gitignore`.** Dados devem viver exclusivamente no Supabase (tabela `products`, `draws`).

### 2.2 Supabase anon key no frontend
| Item | Detalhe |
|------|---------|
| Arquivo | `js/supabase-client.js` |
| Dado | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| Classificação | **OK — seguro por design** |
| Justificativa | anon key é pública por design do Supabase; segurança real vem das políticas RLS no banco |
| Verificar | Confirmar que RLS está habilitado em todas as tabelas (`products`, `payments`, `purchases`, `user_library`, `downloads`, `draw_entries`, `draws`) |

---

## 3. Arquivos a Remover do Repositório

### 3.1 Remover imediatamente (git rm)
```bash
git rm --cached admin.html
git rm --cached config.json
git rm --cached progresso.json
git rm --cached apply_css_patch.py
git rm --cached css-patch.css
```

### 3.2 Desnecessários para produção (opcional)
Os arquivos de ebook individuais podem ser mantidos se forem servidos diretamente pelo GitHub Pages, ou removidos se `checkout.html` for a única entrada:
- `ebook-guia-antifalencia.html`
- `ebook-justicamento.html`
- `ebook-terceira-guerra.html`
- `ebook-vigilante.html`
- `ebook.html`

---

## 4. Arquivos Seguros para Permanecer no Repo

| Arquivo | Status | Observação |
|---------|--------|-----------|
| `index.html` | Seguro | Frontend público |
| `area-cliente.html` | Seguro | anon key OK por design |
| `checkout.html` | Seguro | Sem secrets |
| `participacao-cultural.html` | Seguro | Conteúdo público |
| `regras-programa-cultural.html` | Seguro | Conteúdo público |
| `js/supabase-client.js` | Seguro | anon key é pública |
| `js/auth.js` | Seguro | Sem secrets |
| `supabase/functions/*.ts` | Seguro | Secrets via env vars |
| `supabase/schema.sql` | Seguro | Sem dados sensíveis |
| `supabase/deploy.md` | Seguro* | *Após limpeza do token |
| `supabase/deploy.sh` | Seguro | Sem secrets hardcoded |
| `google30c9f03c7a0ccca5.html` | Seguro | Verificação Google |
| `CNAME` | Seguro | Domínio público |
| `robots.txt` | Seguro | Configuração pública |
| `sitemap.xml` | Seguro | Mapa público |
| `.gitignore` | Seguro | Criado nesta auditoria |

---

## 5. Limpeza do Histórico Git (IMPORTANTE)

O arquivo `admin.html` com a senha `TresT2026!` e o `deploy.md` com o token MP **já foram commitados** e estão no histórico. Apenas adicionar ao `.gitignore` e fazer `git rm --cached` **não remove do histórico**.

### Opção A — Tornar o repositório PRIVADO (recomendado, mais simples)
```
GitHub → Settings → Danger Zone → Change repository visibility → Private
```
Isso bloqueia acesso público ao histórico. Solução imediata enquanto decide sobre limpeza.

### Opção B — Limpar histórico com BFG Repo Cleaner
```bash
# 1. Instalar BFG: https://rtyley.github.io/bfg-repo-cleaner/
# 2. Clonar mirror
git clone --mirror https://github.com/alkbhal/3trevo.git 3trevo-mirror

# 3. Remover arquivos sensíveis do histórico
java -jar bfg.jar --delete-files admin.html 3trevo-mirror
java -jar bfg.jar --delete-files config.json 3trevo-mirror

# 4. Limpar e forçar push (DESTRUCTIVO — avise colaboradores antes)
cd 3trevo-mirror
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

### Opção C — git filter-branch (alternativa nativa, mais lento)
```bash
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch admin.html config.json progresso.json' \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```

**Após qualquer limpeza de histórico:** revogar e regenerar TODOS os credentials expostos (MP token, qualquer senha).

---

## 6. Dados a Migrar para Supabase

| Dado atual (arquivo) | Destino no Supabase | Status |
|---------------------|--------------------|----- |
| `config.json` → `catalogo` | Tabela `products` | Já existe |
| `config.json` → `meta.arrecadado` | `SELECT SUM(valor) FROM payments WHERE status='approved'` | Calcular dinamicamente |
| `config.json` → `meta.total_oculto` | Campo `meta_valor` em `draws` | Já existe no schema |
| `config.json` → `formula.redes` | Campo `config` em `draws` (JSONB) | Adicionar se necessário |
| `progresso.json` | Calculado via Supabase | Remover arquivo |

---

## 7. Checklist de Ações Obrigatórias

- [ ] **URGENTE:** Revogar e regenerar o MP Access Token no painel MercadoPago
- [ ] **URGENTE:** Desativar/regenerar o webhook Make.com `itjax3gmav10kq0a573tnlwd4a3qbbjj` (URL já estava pública)
- [ ] Tornar o repositório privado OU limpar histórico com BFG
- [ ] Executar `git rm --cached` para os arquivos listados na seção 3.1
- [ ] Commitar o `.gitignore` criado
- [ ] Verificar RLS ativo em todas as tabelas Supabase
- [ ] Confirmar que nenhum outro arquivo contém o MP token (já verificado: nenhum)
- [ ] Atualizar integração Make.com para usar Supabase diretamente (sem `progresso.json`)

---

## 8. Resumo Executivo

| Categoria | Qtd | Severidade |
|-----------|-----|-----------|
| Token de pagamento exposto | 1 | CRITICO |
| Senha admin exposta | 1 | ALTO |
| Dados de negócio internos | 1 arquivo | MEDIO |
| Metadado de infraestrutura | 1 campo | BAIXO |
| anon key Supabase | 1 | Aceitável (design) |
