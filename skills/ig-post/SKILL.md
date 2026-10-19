---
name: ig-post
description: Gera carrossel de Instagram (3 a 5 imagens 1080x1440 e legenda) a partir da URL de um post WordPress, no template punk-dark da PunkMetrics. Use quando pedirem /ig-post <url>, carrossel de um artigo, ou desdobrar post de blog para Instagram.
---

# ig-post: carrossel de Instagram a partir de post de blog

Os scripts moram no plugin, em `${CLAUDE_PLUGIN_ROOT}/src/`. A saída mora no
diretório de trabalho do usuário, em `./ig-post/<slug>/`. Nunca grave nada
dentro de `${CLAUDE_PLUGIN_ROOT}`.

O template define SÓ o visual (dimensões, cores, fontes, posições, logo e
rodapé da PunkMetrics). Todo conteúdo é variável por post, inclusive o texto
do CTA. Nenhum slide tem texto fixo.

Fonte do conteúdo: qualquer blog WordPress com REST público
(`/wp-json/wp/v2`). Site que não é WordPress, ou com REST bloqueado, o
extract recusa com mensagem clara: repasse a mensagem e pare.

## Guardrail de texto: leia isto antes de escrever qualquer slide

**O detrator principal é texto longo.** O corpo é Inter 50px numa coluna
de 771px: cabe muito menos do que a intuição sugere. Escrever um
parágrafo de blog e colar no slide estoura o frame, sempre.

Orçamento por bloco (medido contra o `slide.html` real, fonte:
`${CLAUDE_PLUGIN_ROOT}/templates/punk-dark/template.json` > `limites`):

| Bloco | Cabe | Na prática |
|---|---|---|
| `title` (todos os layouts) | 3 linhas de ~27 chars | **até ~59 caracteres** |
| `body` do `cover` | 4 linhas | **até ~103 caracteres** |
| `body` do `text` | 7 linhas | **até ~191 caracteres** |
| `body` do `cta` | 4 linhas | **até ~103 caracteres** |
| `items` do `list` (soma) | 7 linhas | **até ~165 caracteres no total** |
| `url` do `cta` | 2 linhas | **até ~112 caracteres** |

Tetos do template, que valem acima da geometria:
- **Descrição: 7 linhas no máximo.** Acima disso conflita com o rodapé.
- **Capa: 4 linhas no máximo**, porque logo abaixo entram os logos.

Regras de escrita que decorrem disso:

- Título da capa: **título exato do post**, ver "Fidelidade ao texto".
- Título do miolo: **o H2 do post**, literal se couber. Se não couber,
  encurtar SEM mudar o sentido, ver "Fidelidade ao texto".
- Corpo **não é** o parágrafo do post. Extraia a ideia em 1 ou 2 frases.
- Item de lista: uma ação por item, sem subordinada. Com 4 items, cada um
  tem ~40 caracteres de orçamento.
- A capa com logos é o bloco mais apertado do carrossel. Se o lead não
  couber, tire os logos ou encurte mais.

## Fidelidade ao texto do post

O carrossel é desdobramento do artigo, não uma releitura. O texto do post
é a fonte. Inventar frase nova descaracteriza o artigo.

**Capa: o título é o título do post, sempre.** Sem reescrita, sem
"melhoria", sem encurtar por gosto. Só encurta se estourar 59 caracteres,
e nesse caso cortando palavras do próprio título (preservando o sentido),
avisando o usuário do corte na entrega.

**Miolo: o título sai do H2 da seção.** Ordem de preferência:
1. H2 literal, se couber nos 59 caracteres.
2. H2 com palavras removidas do começo ou do fim, sentido intacto.
3. Só em último caso, reescrita própria, e avisar o usuário que reescreveu.

**Encurtar não pode inverter nem enfraquecer a afirmação.** Antes de
aceitar um corte, releia a versão curta sozinha e pergunte: ela afirma a
mesma coisa que o H2 afirma?

Exemplo real de erro:

| | Texto | Afirma |
|---|---|---|
| H2 do post | "O trabalho mudou de forma, não só de velocidade" | mudou de forma **e também** de velocidade |
| Corte errado | "Mudou a forma, não a velocidade" | mudou de forma **e não** de velocidade |

O corte tirou o "só" e inverteu a frase. Cabia, passou no check, e estava
errado. **O check mede geometria, não sentido. Sentido é sua
responsabilidade.**

Vale para body e items também: corte de item de lista mantém a pergunta
ou a afirmação original, só remove a subordinada e a alternativa.

## Fluxo obrigatório

0. **Preparar** (uma vez por sessão):

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/setup.mjs
   ```

   Saída 0 com três linhas `ok:` segue. Saída 1: mostre a mensagem ao
   usuário (Node antigo, falha no npm ou Chrome ausente) e pare.

1. **Extrair**:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/extract.mjs <url> --out ./ig-post
   ```

   Devolve title, lead, sections, categoria, tags, temVideo, url, slug e
   grava `./ig-post/<slug>/extract.json`. Use o `slug` que ele devolve para
   nomear tudo daqui em diante.

2. **Escrever o deck** respeitando o orçamento acima. Salvar em
   `./ig-post/<slug>/deck.json` com `template: "punk-dark"`,
   `source: <url do post>`, `slug`, `slides`, `caption` e `hashtags`
   (contrato em `${CLAUDE_PLUGIN_ROOT}/src/deck.schema.json`).
   Se o projeto do usuário define um skill de voz ou de copy (por exemplo,
   no CLAUDE.md), aplique-o por cima das regras de legenda abaixo.

3. **AUTO-CHECAGEM (obrigatória, em loop até passar)**:

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/check.mjs ./ig-post/<slug>/deck.json
   ```

   Saída 0 = tudo cabe, segue. Saída 1 = lista campo a campo o que
   estoura e **quantos caracteres cortar**. Nesse caso:
   - reescreva o campo apontado, cortando pelo menos o indicado;
   - corte conteúdo, não qualidade: tire subordinada, adjetivo e repetição
     antes de tirar informação;
   - **nunca** mexa no template ou nos limites para fazer caber. O design
     é fixo e não se ajusta ao texto;
   - rode o check de novo. Repita até sair 0.

   Só avance com saída 0. Um deck que não passa no check gera imagem com
   texto cortado.

4. **Preview: REGRA INEGOCIÁVEL, NUNCA PULAR.** Suba o servidor em
   background (Bash com `run_in_background`):

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/preview.mjs --out ./ig-post
   ```

   Leia a linha `PREVIEW_URL=http://localhost:<porta>/` da saída (a porta
   pode não ser 5210 se ela estiver ocupada) e abra
   `<PREVIEW_URL>?deck=<slug>`:
   - no app desktop, com a ferramenta `preview_start` passando `{url}`;
   - no terminal, mostrando a URL para o usuário abrir no navegador.

   Mostre os slides e a legenda. **Pare e aguarde aprovação do usuário.
   Proibido renderizar PNG sem exibir o preview antes, em qualquer
   circunstância.** Ajuste de texto = editar o `deck.json`, rodar o check
   de novo e clicar "Recarregar deck", sem gerar PNG. Cada slide mostra um
   badge de encaixe no topo.

5. **Renderizar** (só depois da aprovação):

   ```
   node ${CLAUDE_PLUGIN_ROOT}/src/render.mjs ./ig-post/<slug>/deck.json
   ```

   Recusa e sai com código 2 se algo estourar (rede de segurança; o check
   já deveria ter pego).

6. **Entregar** os PNGs e o `caption.md` de `./ig-post/<slug>/`. Publicação
   no Instagram é manual. NUNCA postar sem confirmação explícita.

## Como o check funciona (duas passagens)

- **Passagem 1, orçamento de linhas**: estima
  `ceil(caracteres / charsPorLinha)` por parágrafo e por item. Barata,
  roda antes do browser, é o que você deve respeitar de largada.
- **Passagem 2, medição real**: renderiza no `slide.html` de verdade e
  mede cada bloco. **É a autoridade final.** A passagem 1 é calibrada
  para nunca reprovar layout válido, então às vezes ela passa e a 2 pega.
  Confie na 2.

## Regras de corte (3 a 5 slides)

1. **Capa** (obrigatória): título = H1 do post, literal (ver "Fidelidade
   ao texto"); lead reescrito curto; logos = ferramentas citadas no post
   que existam em `${CLAUDE_PLUGIN_ROOT}/templates/punk-dark/logos/`
   (nome do arquivo sem extensão, até 4). Logo que não existe ali não
   entra; logo novo entra por pull request no repositório do plugin.
2. **Miolo, 1 a 3 slides**: cada H2 forte vira um slide, com o próprio H2
   como título (ver "Fidelidade ao texto"). Parágrafo denso vira `text`.
   Passo a passo vira `list` (2 a 6 items). FAQ pode virar slide se for o
   melhor corte. Blocos comerciais nunca.
3. **CTA** (obrigatório): título e corpo escritos por post, url do post.

## Regras de pill (derivam do WordPress, nunca inventar)

- **Capa**: [categoria abreviada] + [BLOG] + [VÍDEO se temVideo].
  Abreviações em `${CLAUDE_PLUGIN_ROOT}/config/abreviacoes.json`. Se
  existir `./ig-post/abreviacoes.json` no diretório do usuário, ele tem
  prioridade. Categoria sem abreviação e longa: avisar o usuário e
  sugerir, não decidir sozinho. Sugira também gravar a escolha em
  `./ig-post/abreviacoes.json`.
- **Demais slides**: até 3 tags do WordPress que aparecem na seção do
  slide. Nenhuma casa? Repetir pills da capa a partir da 2a posição.

## Legenda (caption)

Direta, prática, sem hipérbole e sem travessão. O gancho vem de um fato
concreto do post, nunca de apelo à suposta ignorância do leitor. Estrutura: gancho
de 1 linha, 2 a 3 linhas de valor, CTA "link na bio". Hashtags: 3 a 6,
minúsculas, ligadas às tags do post.
