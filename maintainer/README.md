# Manutenção do template punk-dark

Esta pasta é para quem mantém o visual do template. Quem só gera
carrossel com o `/ig-post` não precisa de nada daqui, nem de Figma.

Rode os comandos a partir da raiz do repositório, com as dependências de
desenvolvimento instaladas (`npm install`, que traz o
`@figma/code-connect`).

## Fonte da verdade

- Tokens em `templates/punk-dark/tokens.css`, extraídos do arquivo Figma
  `social-ai` (nodes em `templates/punk-dark/template.json` > `figma`).
  Não alterar sem re-extrair do Figma.
- O HTML (`slide.html` + `tokens.css`) é o que renderiza. O Figma é a
  referência visual congelada.

## Figma

- Caminho oficial: MCP `figma` do Claude Code, com os skills `figma-*`
  (`get_design_context`, `get_screenshot`, `get_variable_defs`). O MCP
  autentica pelo OAuth do Claude Code (`/mcp`, figma, Authenticate).
- Fallback só com o MCP comprovadamente fora:
  `node maintainer/fetch-figma.mjs --fallback-rest`, com
  `FIGMA_ACCESS_TOKEN` no ambiente. O script recusa rodar sem a flag de
  propósito.

### Design mudou no Figma

1. Reler os frames via MCP `figma` (`get_design_context` nos nodes 1:5,
   1:31, 1:54 e 1:76).
2. Atualizar `tokens.css` e baixar novos refs com `get_screenshot` para
   uma pasta de referência (ex.: `ig-post/figma-ref/`).
3. Recalcular os orçamentos de texto: `node maintainer/measure.mjs`. Isso
   reescreve `template.json` > `limites`. O teste `test/skill.test.mjs`
   falha até a tabela do `skills/ig-post/SKILL.md` acompanhar os números
   novos.
4. Validar: `node maintainer/diff.mjs <pasta-render> <pasta-figma-ref>`
   (meta: menos de 5% por slide, só antialiasing de fonte). O `diff.mjs`
   compara pares com os nomes da referência do Figma (`01-cover.png` e
   afins), não render contra render. Para render contra render, compare
   os hashes dos PNGs.

### Code Connect

`maintainer/punk-dark.figma.ts` mapeia os components do Figma.
`figma connect publish` (rodado de dentro de `maintainer/`) exige token
com escopo Code Connect Write.

## Fluxo vertical

- **Corpo**: começa 100px abaixo da **base do título** (margin-bottom do
  título), não numa coordenada fixa. Título de 1 ou 2 linhas produz o
  mesmo respiro. Constante `GAP_TITULO` no `slide.html`.
- **Logos da capa e card do CTA: posição FIXA**, ancorados a **430px do
  bottom do canvas**. Não seguem o fluxo do texto. O card do CTA cresce
  para cima se a URL quebrar em mais linhas.
- `--y-body`, `--y-logos` e `--cta-card-y` no `tokens.css` são referência
  histórica do Figma e não são usados.

## Vidro e tipografia

- **Vidro**: branco **10%** com efeito GLASS nativo, **sem NOISE**.
  `footer-bar` e `cta-card` usam o MESMO fundo, então os dois são só
  `.glass`: `--surface-glass` 0.10, rim de refração em `--glass-rim` e
  backdrop-blur. Fonte da verdade: as INSTÂNCIAS 16:11 e 16:12 nos frames
  (os main components 6:20 e 6:32 carregam 16% desatualizado).
- **Títulos**: Inter Bold 60/68.4 (`fonts/inter-700.woff2`). Corpo em
  Inter 400, pills em Roboto 400.

## Logos de ferramenta da capa: tamanho óptico igual

Todos os logos da capa têm que **parecer** do mesmo tamanho. Box CSS igual
não basta: os arquivos vêm de fontes diferentes e ocupam frações
diferentes da própria arte.

- `maintainer/measure-logos.mjs` mede, para cada asset, quanto do arquivo
  o conteúdo visível ocupa, e grava em `templates/punk-dark/logo-box.js`
  (`window.LOGO_BOX`).
- `slide.html` põe cada logo num `.logo-slot` de tamanho fixo e escala a
  imagem por `1/LOGO_BOX[nome]`, então o **conteúdo** fica com o mesmo
  tamanho, não o arquivo.
- **Rode `node maintainer/measure-logos.mjs` sempre que adicionar ou
  trocar um arquivo em `templates/punk-dark/logos/`.**

Duas medidas, porque uma só engana:
- **alpha**: bbox do que não é transparente.
- **contraste**: bbox do que aparece SOBRE o fundo preto do slide.

Um asset com **fundo preto opaco** por baixo do glifo tem alpha cheio e
contraste pequeno: no slide o fundo some e o logo parece minúsculo. Foi o
caso do `figma.png` (glifo ocupava 37% do arquivo). Escalar não resolve,
porque o fundo é opaco e cobriria os logos vizinhos. Conserta-se o asset:

```
node maintainer/trim-logo.mjs templates/punk-dark/logos/<arquivo>.png
node maintainer/measure-logos.mjs
```

`measure-logos` avisa sozinho quando alpha e contraste divergem mais de 8
pontos, e nesse caso fica no valor conservador em vez de escalar.
