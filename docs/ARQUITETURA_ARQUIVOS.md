# Onde Ficam os Arquivos dos Ebooks — Mapa de Dependências

> Escrito pra alguém sem contexto da conversa assumir o sistema sem precisar caçar cada peça.
> Confirmado direto contra produção (Supabase real, código real do worker) em 2026-08-16.

## Visão geral — são 2 sistemas de armazenamento, não confunda

1. **Supabase Storage, bucket `ebooks`** — arquivo completo dos produtos PAGOS (catálogo `products`).
   Privado, só sai via link assinado.
2. **Cloudflare R2, bucket `tt-biblioteca`** (binding `BIBLIOTECA_R2`, `worker/wrangler.toml:26`) —
   usado por 2 coisas diferentes dentro do mesmo bucket:
   - Biblioteca gratuita de clássicos de domínio público (`biblioteca_acervo.epub_url`).
   - Upload administrativo de capa/vídeo/epub (`admin-upload.ts`), prefixos `capas/`, `videos/`,
     `epubs/`.

Essas duas coisas **não se falam automaticamente** — um EPUB subido pelo painel admin cai no R2,
mas o download de produto pago só sabe ler do Supabase Storage. Ver seção 4.

---

## 1. Produto pago (o que o cliente compra e recebe)

**Tabela:** `products` (Supabase, schema `public`).
**Campo:** `arquivo_url` — hoje é **1 único arquivo por produto**, sem coluna separada pra EPUB vs
PDF (é a limitação que motivou a Fase 3 do funil de venda — ver `docs/specs/
ARCO_PERSUASAO_ANTIFALENCIA.md`, decisão em aberto #2).

**Onde o arquivo físico mora:** Supabase Storage, bucket `ebooks`, nome = valor de `arquivo_url`
(ex: `antifalencia.pdf`).

**Como o cliente baixa:** `area-cliente.html` → função JS `baixar()` (linha ~1235) → chama a Edge
Function `get-download` (`supabase/functions/get-download/index.ts`) → confere JWT do usuário +
linha em `user_library` (prova que ele comprou) → gera URL assinada de 72h no bucket `ebooks` →
abre em nova aba. **Nunca** deve apontar direto pro arquivo público — sempre passa pela function.

### Estado real por título (conferido em produção, 2026-08-16)

| Título | `arquivo_url` no banco | Existe no bucket `ebooks`? |
|---|---|---|
| O Guia Antifalência | `antifalencia.pdf` | ✅ sim (516 KB) |
| Justiça(mento) para Orelha | `justicamento.pdf` | ✅ sim (8,3 MB) |
| O Nascimento Silencioso da 3ª GM | `3a-guerra.epub` | ❌ **não existe** — comprar hoje dá erro na entrega |

## 2. Biblioteca gratuita (clássicos de domínio público)

**Tabela:** `biblioteca_acervo` (Supabase). **Campo:** `epub_url` — pode ser link externo completo
(Gutenberg, ex: `https://www.gutenberg.org/...`) OU nome de arquivo dentro do R2 privado.

**Como é servido:** rota do Worker `GET /api/biblioteca/stream?t=TOKEN`
(`worker/src/routes/biblioteca.ts` ~L317-335) — token de 24 bytes, TTL de 1h, guardado no KV
(`TT_KV`), gerado só depois de confirmar e-mail. Se `epub_url` começa com `http`, redireciona
direto pro site externo; senão, lê do R2 (`BIBLIOTECA_R2`).

## 3. Degustação/amostra — não é o arquivo completo, cuidado pra não confundir

Vive só como texto fixo dentro de `biblioteca.html` (objeto JS inline, chave por slug), ~1-2
parágrafos por título, hardcoded direto no HTML — **não vem de banco nem de storage nenhum**.
Existe hoje pra 5 slugs: `atico`, `ultima-coisa`, `3a-guerra`, `justicamento`, `antifalencia`.

**É aqui que "ler no site" normalmente acontece hoje** (botão "Ler amostra") — é só a amostra,
nunca o livro inteiro. Ficou confirmado nesta sessão que isso é o que gerou a confusão sobre o
arquivo da 3ª Guerra Mundial: a amostra existe e funciona, o arquivo completo não existe em
lugar nenhum.

## 4. Upload administrativo — pra onde cada tipo de arquivo cai

Rotas em `worker/src/routes/admin-upload.ts` (todas exigem token admin, `verificarToken`):

| Endpoint | Aceita | Vai pra | Limite |
|---|---|---|---|
| `POST /api/admin/upload/capa` | jpg/png/webp | R2 `tt-biblioteca/capas/` | 1 MB |
| `POST /api/admin/upload/epub` | `.epub` | R2 `tt-biblioteca/epubs/` | 50 MB |
| `POST /api/admin/upload/video` | vídeo | R2 `tt-biblioteca/videos/` | 30 MB |

**Atenção:** o upload de EPUB aqui cai no R2 — mas o download de produto PAGO (`get-download`) só
lê do Supabase Storage (`ebooks`). Um EPUB subido por aqui pra um produto pago fica "perdido" (R2
em vez de Storage) até alguém copiar manualmente pro bucket certo, ou até o `get-download` ser
estendido pra saber ler dos dois lugares (Fase 3, ainda não construída).

## 5. Arquivos-fonte locais — fora do site, só no computador do Rogério

`C:\Users\User\Downloads\` guarda os manuscritos/rascunhos originais antes de virarem produto —
**não versionados no git, sem backup automático**:

- **Antifalência — 3 candidatos, não confirmado qual é o canônico:**
  - `vol1-guia-antifalencia-FINAL.html` (livro completo, 954 linhas, com calculadora embutida —
    fonte usada pra escrever `docs/specs/ARCO_PERSUASAO_ANTIFALENCIA.md`)
  - `Guia Antifalência do Empreendedor de Rogerio Dias.pdf`
  - `O GUIA ANTIFALENCIA DO EMPREEND - Rogerio Dias.pdf`
  - `guia-antifalencia.docx`
- **Justicamento / 3ª Guerra Mundial:** nenhum arquivo-fonte encontrado em Downloads nesta sessão.
  O produto de Justicamento já está no Storage (funcional); o da 3ª Guerra Mundial não existe em
  lugar nenhum que foi possível localizar.

## Ferramentas disponíveis nesta máquina

- **Calibre CLI** instalado — `C:\Program Files\Calibre2\ebook-convert.exe`. Converte PDF↔EPUB por
  linha de comando, sem precisar abrir a interface gráfica. Confirmado disponível em 2026-08-16.
