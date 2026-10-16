# Plano de medição de desempenho

Entrega 6 da auditoria. Define o que medir, como medir e o que conta como regressão, antes de qualquer alteração. Separa o que já foi medido, o que falta e o que não pode ser medido neste ambiente.

## 1. Ferramentas disponíveis

| Ferramenta | Disponível aqui | Usada | Observação |
|---|---|---|---|
| Chromium (Playwright) | Sim | Sim | Renderização por software, sem GPU |
| Protocolo do Chrome (CDP): `Performance.getMetrics` | Sim | Sim | Contagens de estilo, layout, script |
| `requestAnimationFrame` medido no navegador | Sim | Sim | Intervalo entre quadros |
| axe-core 4.10.2 | Sim (instalado no laboratório) | Sim | Acessibilidade, não desempenho |
| Lighthouse | Pode ser instalado por npm; **não executado** | Não | Precisa de rede real para ser útil; CDNs bloqueados distorceriam LCP e CLS |
| Chrome DevTools (gravação de Performance) | Só manual | Não | Necessita de sessão interativa |
| Web Vitals em produção (RUM) | **Não existe no site** | — | O rastreamento atual (`js/beacon.js`) envia eventos de funil, não métricas de carregamento |
| PageSpeed Insights | Exige URL pública; site real | Não | Útil para campo (dados CrUX) quando houver tráfego |

## 2. O que já foi medido (laboratório)

Detalhes e reprodução em `evidencias/`.

| Medida | Padrão | Reduzido | Fonte |
|---|---|---|---|
| Quadros acima de 20 ms (3 execuções, ~330 quadros) | 38, 43, 44 | 1, 3, 1 | `evidencias/scripts/movimento.mjs` |
| p95 do intervalo entre quadros | 33,4 ms | 16,8 ms | idem |
| Recalcular estilo (contagem) | 456–466 | 235–251 | idem |
| Tempo de script na rolagem | 76–77 ms | 19–21 ms | idem |
| Tempo até `load` (computador / celular) | 3,0 s / 2,6 s | — | `run.mjs` (CDNs bloqueados) |
| Tamanho do vídeo do herói | 7,48 MB | — | leitura do arquivo |
| Dados de cinco cenas da abertura | ~197 KB | — | `ls` |
| `will-change` no carregamento | 27 elementos | — | `run.mjs` |

**Limite:** tudo isso é laboratório, com renderização por software. Os valores absolutos não valem para aparelho real. A diferença relativa entre os dois modos é o sinal, e já se repetiu nas três execuções.

## 3. O que falta medir

| Métrica | Por que importa | Como medir | Status |
|---|---|---|---|
| LCP (maior elemento visível) | Primeira impressão do herói | Lighthouse com rede simulada e aparelho real | Não medido |
| INP (resposta a interação) | Cliques em filtros, menu, FAQ | Lighthouse e DevTools; interação real | Não medido |
| CLS (deslocamento de layout) | Capas e fontes podem empurrar o layout | Lighthouse; trace de layout shift | Não medido (P-04) |
| TBT (tempo bloqueado) | Scripts de rolagem na thread principal | Lighthouse | Não medido |
| Quadros perdidos em aparelho real | Confirmar F-03 | DevTools remoto, aparelho intermediário | Não medido (P-03) |
| Bytes transferidos por página | Vídeo de 7,5 MB | DevTools, aba Rede, cache frio | Não medido |
| Tempo até o catálogo | Espera real do usuário (ver `ESPECIFICACAO_CARREGAMENTO_EDITORIAL.md`) | Marcas `performance.mark` no código de teste | Não medido |

## 4. Condições do teste

### 4.1 Aparelhos

- **Referência de desktop:** computador de trabalho, Chrome estável, sem extensões.
- **Celular intermediário:** um Android de faixa média, com 4 GB de RAM ou mais, Chrome estável. Escolher um modelo com cinco ou mais anos.
- **Celular de referência iOS:** um iPhone com Safari atual, para comparar o comportamento do vídeo e dos scripts.

### 4.2 Redes

| Perfil | Descrição | Uso |
|---|---|---|
| Sem limite | Rede local | Medição de CPU e de quadros |
| Rápida (4G) | Latência 40 ms, 9 Mbps | Medição padrão |
| Lenta (3G) | Latência 300 ms, 1,6 Mbps | Medição de carregamento e de vídeo |

### 4.3 Cache

- **Frio:** perfil limpo, sem cache, a cada execução.
- **Aquecido:** segunda visita no mesmo perfil, após o `load`.

### 4.4 Páginas

| Página | Por quê |
|---|---|
| `index.html` | Página de entrada; herói, abertura, rolagem guiada e vídeo |
| `catalogo.html` | Grade de cartões e filtros |
| `checkout.html?slug=livre-das-dividas` | Fluxo de compra |
| `area-cliente.html` | Painel pós-login (após sessão de teste) |
| `minha-biblioteca.html` | Leitor de livro (após sessão de teste) |

### 4.5 Execuções

- Cinco execuções por combinação de página, perfil de rede, cache e preferência de movimento.
- Reportar **mediana** e **p75**, nunca só a melhor execução.
- Descartar a primeira execução de cada sessão de navegador (aquecimento).

## 5. Comparação antes e depois

1. Medir a linha de base na branch atual, sem alterações, com o mesmo roteiro e a mesma API simulada.
2. Aplicar cada mudança isolada (uma por vez), e medir de novo.
3. Registrar as condições (aparelho, rede, cache, versão do navegador, data) junto de cada valor.
4. Os dados de laboratório e os de campo ficam em tabelas separadas. Nunca somar ou comparar um com o outro.

## 6. Critérios de regressão

Uma mudança é **regressão** se qualquer um destes ocorrer, na mediana de cinco execuções:

| Métrica | Limite para regressão |
|---|---|
| LCP | Aumento acima de 200 ms |
| INP | Aumento acima de 50 ms |
| CLS | Aumento acima de 0,02 |
| Quadros acima de 20 ms durante rolagem | Aumento acima de 2 pontos percentuais |
| Recalcular estilo na rolagem | Aumento acima de 10% |
| Bytes transferidos na primeira visita | Aumento acima de 100 KB, sem justificativa escrita |
| Erros de console (página em operação normal) | Qualquer erro novo |

Os limites são **propostos**. Validar com o primeiro conjunto de linhas de base.

## 7. Instrumentação recomendada

Para medir em campo (não implementado):

- Coletar LCP, INP e CLS com `PerformanceObserver` na página, e enviar ao endpoint de rastreamento já existente (`POST /api/track`), com um tipo de evento próprio.
- Amostrar, por exemplo, 10% das visitas, para limitar o volume.
- Não coletar dados pessoais junto das métricas. Só valores numéricos, a página e o tipo de dispositivo.

## 8. O que este plano não cobre

- Desempenho do Worker e do banco (fora do escopo de interface).
- Carga de tráfego (teste de carga).
- Medição dentro das páginas de pagamento do Mercado Pago (fora do controle do site).
