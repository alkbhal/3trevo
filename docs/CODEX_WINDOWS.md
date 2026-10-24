# Codex no notebook — Windows 10, 12 GB de RAM

> Criado em 24/10/2026. Pasta `docs/` não é publicada no site (ver `_config.yml`).
> Antes de cada passo, confira na documentação oficial da OpenAI se o comando mudou.

**Papel do Codex:** escrever, mudar e revisar código do repositório `3trevo`.
Ele não fica rodando sozinho: a produção (livros, posts, vídeos) passa sempre por você aprovar.

---

## 1. Conferir o Windows (5 min)

1. `Win + R` → digite `winver` → Enter.
2. Precisa ser **versão 2004 (build 19041) ou mais nova**. Se for mais antiga, rode o Windows Update antes.
3. Deixe pelo menos **15 GB livres** no disco C:.

## 2. Instalar o WSL2 com Ubuntu (20 min)

O Codex funciona melhor no Linux de dentro do Windows (WSL2) do que direto no Windows.

1. Clique com o botão direito no Menu Iniciar → **Windows PowerShell (Admin)**.
2. Rode:
   ```powershell
   wsl --install -d Ubuntu
   ```
3. Reinicie o notebook quando pedir.
4. O Ubuntu abre sozinho: crie um usuário e uma senha (anote a senha — não aparece enquanto digita).

## 3. Limitar a memória do WSL (2 min)

Com 12 GB, se o WSL pegar tudo o Windows trava. No PowerShell normal:

```powershell
notepad "$env:USERPROFILE\.wslconfig"
```

Cole, salve e feche:

```ini
[wsl2]
memory=6GB
processors=2
swap=4GB
```

Depois: `wsl --shutdown` e abra o Ubuntu de novo.

## 4. Instalar Git e Node.js no Ubuntu (10 min)

Tudo daqui em diante é **dentro do Ubuntu**:

```bash
sudo apt update && sudo apt install -y git curl python3
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
node -v   # deve mostrar v22.x
```

## 5. Instalar e entrar no Codex (5 min)

```bash
npm install -g @openai/codex
codex
```

Na primeira vez ele pede login: escolha entrar com a conta do ChatGPT (plano pago) ou usar uma chave de API.
**Nunca cole a chave de API em arquivo do repositório** — o repo é público.

## 6. Baixar o repositório (5 min)

Guarde o projeto **dentro do Ubuntu** (`~/`), não em `C:\` — é bem mais rápido.

```bash
cd ~
git config --global user.name "Seu Nome"
git config --global user.email "seu-email"
git clone https://github.com/alkbhal/3trevo.git
cd 3trevo
```

## 7. Primeiro teste (prova de que está tudo certo)

```bash
cd ~/3trevo/scripts/central-tt
python3 -m unittest discover -s tests -t . -v
```

Tem que terminar com `OK`. Depois, abra o Codex na raiz do repo e peça algo pequeno e verificável:

```bash
cd ~/3trevo
codex "Leia scripts/central-tt/README.md e me explique em 5 linhas o que o protótipo faz. Não altere nada."
```

## 8. Regras de uso no dia a dia

- Uma tarefa pequena por vez; leia o que ele mudou (`git diff`) antes de aceitar.
- Trabalhe em branch, nunca direto na `main`: `git checkout -b minha-tarefa`.
- Segredos (chaves, senhas, tokens) ficam fora do repo — `.env` já está no `.gitignore`.
- Não rode modelo de IA local: com 12 GB fica lento demais. Use o Codex na nuvem.
- Se o notebook travar: `wsl --shutdown` no PowerShell e abra o Ubuntu de novo.

## 9. O que o Codex faz pela produção de *Isa, Isma e Tintim*

Ele acelera a parte técnica — não substitui sua revisão:

| Tarefa | Exemplo de pedido ao Codex |
|---|---|
| Página da obra | "Revise `obra/isa-isma-tintim.html` e rode `node scripts/site-check.mjs`." |
| Calendário de posts | "Transforme `docs/PLANO_POSTS_ISA_ISMA_TINTIM.md` numa planilha CSV com data, rede, texto e link." |
| Links rastreáveis | "Gere os links com `utm_source` para cada post do plano." |
| Automação futura | "Implemente um módulo da Central TT seguindo o contrato em `scripts/central-tt/schemas/`." |

Publicar post, enviar e-mail ou gastar dinheiro: **sempre você aprova antes**.
