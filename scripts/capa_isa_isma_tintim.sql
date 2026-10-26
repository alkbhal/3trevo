-- ============================================================
-- Isa, Isma e Tintim: uma capa só em todo o site (Bíblia da Série v1.1)
-- Executar no SQL Editor do Supabase (projeto xfkepekffdyrtcgagwqo)
-- DEPOIS do merge e do deploy que publica assets/capas/isa-isma-tintim.jpg
-- (antes disso, a URL ainda serve a capa vetorial antiga).
--
-- A capa canônica é a ilustrada (as três crianças na porta), com as duas
-- correções da bíblia: porta em três faixas (rosa #EC7B85, verde #6FA86A,
-- amarelo #FBC913, Decisão 3) e o letreiro "TINTIM" sem acento.
-- O catálogo, a vitrine e a biblioteca passam a usar o mesmo arquivo da
-- página da obra, em vez da imagem antiga no R2 (porta toda amarela).
-- ============================================================

update public.catalogo
   set capa_url = 'https://3trevo.com.br/assets/capas/isa-isma-tintim.jpg'
 where slug = 'isa-isma-tintim';

update public.products
   set capa_url = 'https://3trevo.com.br/assets/capas/isa-isma-tintim.jpg'
 where slug = 'isa-isma-tintim';
