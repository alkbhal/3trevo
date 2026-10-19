-- estante_intl.sql — 18/out/2026
-- Estantes de clássicos em domínio público dos sites EN e ES (área de membro grátis).
-- Tabela própria, separada de biblioteca_acervo: o Worker da Biblioteca TT lista tudo o que
-- está ativo em biblioteca_acervo, e as obras em inglês e espanhol não podem aparecer no site PT.
-- Cada obra foi conferida abrindo o EPUB no Gutenberg (workflow "Estante — conferir obras"):
-- título, autor e idioma reais; autores mortos até 1945 (domínio público também no Brasil e na
-- Espanha). EPUBs pesados usam a versão sem imagens (todos abaixo de 1 MB).
-- Aditivo: requer scripts/leitura_livre_membros.sql aplicado antes.

create table if not exists public.estante_intl (
  slug              text primary key,
  idioma            text not null check (idioma in ('en', 'es')),
  titulo            text not null,
  autor             text not null,
  ano_publicacao    integer,
  genero            text,
  paginas_estimadas integer,
  sinopse           text,
  epub_url          text not null,
  fonte_url         text,
  featured          boolean not null default false,
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);
alter table public.estante_intl enable row level security;
create policy "estante_intl: leitura publica" on public.estante_intl for select to anon, authenticated using (ativo);

insert into public.estante_intl (slug, idioma, titulo, autor, ano_publicacao, genero, paginas_estimadas, sinopse, epub_url, fonte_url, featured) values
  ('pride-and-prejudice', 'en', 'Pride and Prejudice', 'Jane Austen', 1813, 'Love and Society', 432, 'Elizabeth Bennet has a quick mind and a sharper tongue; Mr. Darcy has a fortune and a pride to match. A comedy of first impressions, family pressure and second thoughts that still reads like it was written yesterday.', 'https://www.gutenberg.org/ebooks/1342.epub.noimages', 'https://www.gutenberg.org/ebooks/1342', true),
  ('jane-eyre', 'en', 'Jane Eyre', 'Charlotte Brontë', 1847, 'Love and Society', 530, 'An orphan who refuses to be small grows into a governess who refuses to be owned. At Thornfield Hall she meets the brooding Mr. Rochester — and the secret locked in the attic.', 'https://www.gutenberg.org/ebooks/1260.epub.noimages', 'https://www.gutenberg.org/ebooks/1260', false),
  ('wuthering-heights', 'en', 'Wuthering Heights', 'Emily Brontë', 1847, 'Love and Society', 400, 'On the Yorkshire moors, the foundling Heathcliff and Catherine Earnshaw share a love so fierce it outlives them both — and poisons two generations.', 'https://www.gutenberg.org/ebooks/768.epub3.images', 'https://www.gutenberg.org/ebooks/768', false),
  ('frankenstein', 'en', 'Frankenstein', 'Mary Shelley', 1818, 'Gothic and Horror', 280, 'A young scientist gives life to a creature and then abandons it. The book that invented science fiction asks who the real monster is.', 'https://www.gutenberg.org/ebooks/84.epub3.images', 'https://www.gutenberg.org/ebooks/84', false),
  ('dracula', 'en', 'Dracula', 'Bram Stoker', 1897, 'Gothic and Horror', 420, 'Told through diaries, letters and telegrams, the story of a Transylvanian count who sails to England — and the small band of friends who set out to stop him.', 'https://www.gutenberg.org/ebooks/345.epub3.images', 'https://www.gutenberg.org/ebooks/345', false),
  ('the-picture-of-dorian-gray', 'en', 'The Picture of Dorian Gray', 'Oscar Wilde', 1890, 'Gothic and Horror', 250, 'A beautiful young man wishes that his portrait would age instead of him. The wish comes true, and every sin he commits leaves its mark on the canvas.', 'https://www.gutenberg.org/ebooks/174.epub3.images', 'https://www.gutenberg.org/ebooks/174', false),
  ('moby-dick', 'en', 'Moby-Dick', 'Herman Melville', 1851, 'Adventure', 640, '“Call me Ishmael.” A sailor joins the whaler Pequod and discovers that Captain Ahab has one purpose only: to hunt down the white whale that took his leg.', 'https://www.gutenberg.org/ebooks/2701.epub.noimages', 'https://www.gutenberg.org/ebooks/2701', false),
  ('huckleberry-finn', 'en', 'Adventures of Huckleberry Finn', 'Mark Twain', 1884, 'Adventure', 360, 'Huck runs away from his drunken father and drifts down the Mississippi on a raft with Jim, a man escaping slavery. A journey that is funny, dangerous and deeply humane.', 'https://www.gutenberg.org/ebooks/76.epub.noimages', 'https://www.gutenberg.org/ebooks/76', false),
  ('a-tale-of-two-cities', 'en', 'A Tale of Two Cities', 'Charles Dickens', 1859, 'Victorian Novels', 450, '“It was the best of times, it was the worst of times.” London and Paris on the eve of the French Revolution, and a sacrifice that changes everything.', 'https://www.gutenberg.org/ebooks/98.epub.noimages', 'https://www.gutenberg.org/ebooks/98', false),
  ('great-expectations', 'en', 'Great Expectations', 'Charles Dickens', 1861, 'Victorian Novels', 520, 'Pip, a poor orphan, suddenly receives a fortune from a mysterious benefactor. Growing up means finding out who he owes it to — and who he has become.', 'https://www.gutenberg.org/ebooks/1400.epub.noimages', 'https://www.gutenberg.org/ebooks/1400', false),
  ('adventures-of-sherlock-holmes', 'en', 'The Adventures of Sherlock Holmes', 'Arthur Conan Doyle', 1892, 'Mystery', 300, 'Twelve cases for the world’s most famous detective and his loyal friend Dr. Watson, from a scandal in Bohemia to the speckled band.', 'https://www.gutenberg.org/ebooks/1661.epub3.images', 'https://www.gutenberg.org/ebooks/1661', true),
  ('alice-in-wonderland', 'en', 'Alice’s Adventures in Wonderland', 'Lewis Carroll', 1865, 'Fantasy', 120, 'Alice follows a white rabbit down a hole and lands in a world where cats grin, queens shout “Off with their heads!” and nothing means quite what it says.', 'https://www.gutenberg.org/ebooks/11.epub3.images', 'https://www.gutenberg.org/ebooks/11', false),
  ('don-quijote', 'es', 'Don Quijote de la Mancha', 'Miguel de Cervantes', 1605, 'Novela', 1100, 'Un hidalgo que ha leído demasiados libros de caballerías decide hacerse caballero andante. Junto a Sancho Panza recorre La Mancha y confunde molinos con gigantes en la novela que lo cambió todo.', 'https://www.gutenberg.org/ebooks/2000.epub3.images', 'https://www.gutenberg.org/ebooks/2000', true),
  ('niebla', 'es', 'Niebla', 'Miguel de Unamuno', 1914, 'Novela', 250, 'Augusto Pérez se enamora, duda y, desesperado, decide visitar a su autor para discutir su destino. Una “nivola” que juega con los límites entre personaje y creador.', 'https://www.gutenberg.org/ebooks/49836.epub3.images', 'https://www.gutenberg.org/ebooks/49836', true),
  ('marianela', 'es', 'Marianela', 'Benito Pérez Galdós', 1878, 'Novela', 200, 'Nela, una muchacha pobre y poco agraciada, es los ojos de Pablo, un joven ciego. Cuando la ciencia promete devolverle la vista, el amor de ambos queda en peligro.', 'https://www.gutenberg.org/ebooks/17340.epub3.images', 'https://www.gutenberg.org/ebooks/17340', false),
  ('lazarillo-de-tormes', 'es', 'Lazarillo de Tormes', 'Anónimo', 1554, 'Novela picaresca', 90, 'Lázaro cuenta su vida de mozo al servicio de un ciego, un clérigo y un escudero hambriento. La obra que inauguró la picaresca, con humor y una crítica feroz.', 'https://www.gutenberg.org/ebooks/320.epub3.images', 'https://www.gutenberg.org/ebooks/320', false),
  ('la-celestina', 'es', 'La Celestina', 'Fernando de Rojas', 1499, 'Tragicomedia', 300, 'Calisto se enamora de Melibea y recurre a Celestina, una vieja alcahueta. Pasión, codicia y tragedia en una obra clave entre la Edad Media y el Renacimiento.', 'https://www.gutenberg.org/ebooks/1619.epub3.images', 'https://www.gutenberg.org/ebooks/1619', false)
on conflict (slug) do nothing;

-- O espaço de leitura do membro aceita obras das duas estantes.
create or replace function public.leitura_livre_obra_valida(p_slug text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from biblioteca_acervo a where a.slug = p_slug and a.ativo and a.acesso = 'bonus')
      or exists (select 1 from estante_intl e where e.slug = p_slug and e.ativo);
$$;

-- Estante PT organizada por movimento literário (antes: tudo "Romance", uma prateleira só).
update public.biblioteca_acervo set genero = 'Realismo'    where slug in ('dom-casmurro', 'memorias-postumas') and acesso = 'bonus';
update public.biblioteca_acervo set genero = 'Naturalismo' where slug = 'o-cortico' and acesso = 'bonus';
update public.biblioteca_acervo set genero = 'Romantismo'  where slug in ('iracema', 'o-guarani') and acesso = 'bonus';

-- Sinopses PT que perderam os acentos (caractere U+FFFD gravado no lugar), restauradas.
update public.biblioteca_acervo set sinopse = 'Um analista de logística percebe padrões nos dados que ninguém quer ver. A reorganização silenciosa das cadeias globais revela algo que não será anunciado como guerra — mas funciona como uma.' where slug = '3a-guerra';
update public.biblioteca_acervo set sinopse = 'O método Ático de gestão financeira pessoal. Cinco estados, oito grupos, um ciclo mensal. Antes de qualquer app, entenda seu dinheiro.' where slug = 'antes-do-app';
update public.biblioteca_acervo set sinopse = 'A conta que ninguém te obriga a fazer. Custos, precificação e ponto de equilíbrio para sobreviver os primeiros 2 anos.' where slug = 'antifalencia';
update public.biblioteca_acervo set sinopse = 'Como regimes autoritários são construídos por dentro. O mapa antes da jornada. Volume 1 da trilogia.' where slug = 'caminho-rubro-vol1';
update public.biblioteca_acervo set sinopse = 'Sete mecanismos que todo regime autoritário opera — do monopólio da narrativa à autopreservação sistêmica. Volume 2 da trilogia.' where slug = 'caminho-rubro-vol2';
update public.biblioteca_acervo set sinopse = 'Superricos, testes globais e a corrida pelo último refúgio. Como bilionários constroem bunkers de luxo enquanto o mundo assiste.' where slug = 'habitaculos';
update public.biblioteca_acervo set sinopse = 'Coração, vitalidade e alegria. Três irmãos, uma porta colorida e aventuras que ensinam sem sermão.' where slug = 'isa-isma-tintim';
update public.biblioteca_acervo set sinopse = 'O que acontece quando a justiça fala mas não escuta? Um ensaio sobre punição, escuta e os limites do sistema penal brasileiro.' where slug = 'justicamento';
update public.biblioteca_acervo set sinopse = '70 milhões de brasileiros negativados. Este guia mostra o caminho de volta — com scripts, direitos e um plano que funciona.' where slug = 'livre-das-dividas';
update public.biblioteca_acervo set sinopse = 'Laura descobre uma caixa no porão da mãe falecida. Dentro, escritos em sete idiomas — sete vidas nunca contadas.' where slug = 'ultima-coisa';

-- Reverter: drop table public.estante_intl; recriar leitura_livre_obra_valida como em leitura_livre_membros.sql.
