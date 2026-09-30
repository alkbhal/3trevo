/**
 * guardiao/engine.ts — Três Trevo Worker
 *
 * O motor do Guardião NÃO vive mais aqui: é o núcleo comum a todos os projetos TT
 * (repositório `guardiao`), vendido em ./vendor com lock de hash. Este arquivo só
 * reexporta, para o resto do worker não depender do caminho da cópia.
 *
 * NÃO edite ./vendor. Melhoria vai para o repositório `guardiao` (nova versão) e
 * volta com `guardiao sync worker/src/guardiao/vendor`. tests/guardiao-deriva.test.ts
 * falha se a cópia for editada.
 */
export * from './vendor/guardiao-core';
