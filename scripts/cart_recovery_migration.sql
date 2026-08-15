-- ============================================================
-- Fase 2 (recuperação de carrinho): templates recovery_1/recovery_2
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo)
-- ou via MCP Supabase (execute_sql) — é dado, não schema, então NÃO
-- precisa de apply_migration.
--
-- Copy APROVADA pelo Rogério (15/08/2026) — layout adaptado dos modelos
-- de referência dele (Downloads/email1_recuperacao.html e
-- email2_ultima_chance.html), com "Rogério"/"Guia Antifalência" trocados
-- por {{nome}}/{{titulo}} pra funcionar em qualquer título do catálogo,
-- não só nesse.
--
-- Cortado de propósito em relação ao modelo original: a linha "Qualifica
-- para o Programa Cultural" foi removida — contradiz a regra G2 já
-- fechada nesta sessão (docs/specs/FASE8_FUNIL_PAGINAS_VENDA-REVISADO.md):
-- menção ao Programa Cultural só pode ser condicional a uma Rodada
-- realmente aberta, nunca afirmação fixa. Quando o bloco condicional da
-- Fase 3 existir, ele entra aqui também (mesmo helper, dois consumidores).
--
-- {{titulo}} e {{link_recuperacao}} são preenchidos por email-engine.ts
-- na hora do envio: {{link_recuperacao}} aponta direto pro checkout do
-- slug abandonado (checkout.html?slug=...), não pro catálogo genérico.
-- {{unsubscribe_link}} já vem estilizado no rodapé do próprio HTML — não
-- duplica o parágrafo genérico que os templates de nutrição usam.
-- ============================================================

INSERT INTO email_templates (id, tag, subject, html) VALUES
(
  5,
  'recovery_1',
  '{{nome}}, seu acesso a {{titulo}} ainda está aberto',
  '<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{nome}}, seu acesso a {{titulo}} ainda está aberto</title>
<style>
  body { margin: 0; padding: 0; background-color: #f5f7f4; font-family: Georgia, ''Times New Roman'', serif; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background-color: #0a1f0e; padding: 28px 40px; text-align: center; }
  .logo { color: #edf5eb; font-size: 18px; letter-spacing: 1.5px; font-weight: normal; text-decoration: none; }
  .content { padding: 48px 40px 36px; color: #1a2a1a; line-height: 1.7; font-size: 16px; }
  .greeting { font-size: 17px; margin-bottom: 24px; }
  .highlight { font-weight: bold; color: #0a1f0e; }
  .cta-wrap { text-align: center; margin: 36px 0 28px; }
  .cta { display: inline-block; background-color: #1e5c3a; color: #ffffff !important; text-decoration: none; padding: 16px 36px; font-size: 15px; letter-spacing: 0.5px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif; }
  .benefits { background: #f4f8f3; border-left: 3px solid #2d7a50; padding: 18px 22px; margin: 28px 0; font-size: 15px; color: #2a3a26; }
  .signature { margin-top: 36px; font-size: 15px; color: #1a2a1a; }
  .footer { background: #0a1f0e; padding: 24px 40px; text-align: center; }
  .footer p { color: #8a9a84; font-size: 12px; margin: 6px 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif; }
  .footer a { color: #7ab88a; text-decoration: underline; }
  .divider { height: 1px; background: #e0e8dc; margin: 32px 0; }
</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">O link continua disponível. Conclua quando quiser.</div>
  <div class="wrapper">
    <div class="header">
      <a href="https://3trevo.com.br" class="logo">EDITORA TRÊS TREVO</a>
    </div>
    <div class="content">
      <p class="greeting">{{nome}},</p>
      <p>Você iniciou a compra de <span class="highlight">{{titulo}}</span> e não concluiu.</p>
      <p>Se foi apenas falta de tempo, o acesso continua disponível.</p>
      <div class="benefits">
        Entrega imediata por e-mail e WhatsApp<br>
        Garantia de 7 dias (CDC art. 49)
      </div>
      <div class="cta-wrap">
        <a href="{{link_recuperacao}}" class="cta">Concluir minha compra →</a>
      </div>
      <p style="font-size: 15px; color: #3a4a3a;">Qualquer dúvida antes de decidir, é só responder este e-mail.</p>
      <div class="divider"></div>
      <p class="signature">
        Editora Três Trevo<br>
        <span style="font-size: 13px; color: #5a6a54;">Montauri / RS</span>
      </p>
    </div>
    <div class="footer">
      <p>CNPJ 18.928.966/0001-59</p>
      <p><a href="{{unsubscribe_link}}">Não quero mais receber e-mails</a></p>
    </div>
  </div>
</body>
</html>'
),
(
  6,
  'recovery_2',
  'Último aviso: {{titulo}} ainda está reservado para você',
  '<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Último aviso: {{titulo}} ainda está reservado para você</title>
<style>
  body { margin: 0; padding: 0; background-color: #f5f7f4; font-family: Georgia, ''Times New Roman'', serif; }
  .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
  .header { background-color: #0a1f0e; padding: 28px 40px; text-align: center; }
  .logo { color: #edf5eb; font-size: 18px; letter-spacing: 1.5px; font-weight: normal; text-decoration: none; }
  .content { padding: 48px 40px 36px; color: #1a2a1a; line-height: 1.7; font-size: 16px; }
  .greeting { font-size: 17px; margin-bottom: 24px; }
  .highlight { font-weight: bold; color: #0a1f0e; }
  .cta-wrap { text-align: center; margin: 36px 0 28px; }
  .cta { display: inline-block; background-color: #1e5c3a; color: #ffffff !important; text-decoration: none; padding: 16px 36px; font-size: 15px; letter-spacing: 0.5px; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif; }
  .note { background: #f8f6f0; border: 1px solid #e0dbd2; padding: 16px 20px; margin: 28px 0; font-size: 14px; color: #4a5a44; text-align: center; }
  .trust { font-size: 13px; color: #5a6a54; margin-top: 28px; line-height: 1.6; text-align: center; }
  .signature { margin-top: 36px; font-size: 15px; color: #1a2a1a; }
  .footer { background: #0a1f0e; padding: 24px 40px; text-align: center; }
  .footer p { color: #8a9a84; font-size: 12px; margin: 6px 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', sans-serif; }
  .footer a { color: #7ab88a; text-decoration: underline; }
  .divider { height: 1px; background: #e0e8dc; margin: 32px 0; }
</style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Depois deste e-mail não insistiremos.</div>
  <div class="wrapper">
    <div class="header">
      <a href="https://3trevo.com.br" class="logo">EDITORA TRÊS TREVO</a>
    </div>
    <div class="content">
      <p class="greeting">{{nome}},</p>
      <p>Seu acesso a <span class="highlight">{{titulo}}</span> continua disponível.</p>
      <p>Não vamos insistir depois deste e-mail — só queríamos garantir que você viu.</p>
      <div class="note">
        Este é o último lembrete. O link permanece aberto por tempo limitado.
      </div>
      <div class="cta-wrap">
        <a href="{{link_recuperacao}}" class="cta">Ver e finalizar →</a>
      </div>
      <p class="trust">Entrega imediata · Garantia de 7 dias</p>
      <div class="divider"></div>
      <p class="signature">
        Editora Três Trevo<br>
        <span style="font-size: 13px; color: #5a6a54;">Montauri / RS</span>
      </p>
    </div>
    <div class="footer">
      <p>CNPJ 18.928.966/0001-59</p>
      <p><a href="{{unsubscribe_link}}">Não quero mais receber e-mails</a></p>
    </div>
  </div>
</body>
</html>'
)
ON CONFLICT (tag) DO UPDATE SET subject = EXCLUDED.subject, html = EXCLUDED.html;

-- Verificação pós-migração:
SELECT tag, subject FROM email_templates WHERE tag IN ('recovery_1','recovery_2');
-- Resultado esperado: 2 linhas
