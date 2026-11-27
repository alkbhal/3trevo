-- Suspensão temporária de venda (decisão do dono, 04/11/2026), após o laudo editorial externo.
-- Efeito: o catálogo público e o checkout deixam de oferecer os títulos (checkout exige catalogo.ativo = true).
-- Quem já comprou continua com acesso: a biblioteca lê products, que não foi alterada.
-- Aplicada no banco em 04/11/2026. Reativar só depois da revisão aprovada.
update catalogo
   set ativo = false,
       motivo_inativo = 'Suspensa para revisão editorial (decisão do dono, 04/11/2026)'
 where slug in ('livre-das-dividas', 'antifalencia', 'justicamento');

-- Reversão (somente após aprovação editorial):
-- update catalogo set ativo = true, motivo_inativo = null where slug in ('livre-das-dividas', 'antifalencia', 'justicamento');
