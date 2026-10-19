#!/usr/bin/env node
/**
 * measure.mjs: mede a capacidade real de cada bloco de texto do template
 * e grava os limites em template.json.
 *
 * Uso: node maintainer/measure.mjs [template]      (default punk-dark)
 *
 * O modelo é em LINHAS, não em caracteres soltos, porque é assim que o
 * layout se comporta: cada bloco tem N linhas disponíveis e cada linha
 * comporta ~C caracteres. Um orçamento por caractere erra feio em listas
 * (4 items curtos e 4 items longos somam o mesmo total e ocupam alturas
 * bem diferentes).
 *
 * Mede duas coisas por bloco:
 *   charsPorLinha: pior caso observado, com quebra em fronteira de palavra
 *   maxLinhas    : quantas linhas cabem antes de bater no que vem depois
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from '../src/lib/chrome.mjs';

let CHROME;
try {
  CHROME = resolveChrome();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templateName = process.argv[2] ?? 'punk-dark';
const tplDir = join(root, 'templates', templateName);
const tplPath = join(tplDir, 'template.json');
const tpl = JSON.parse(await readFile(tplPath, 'utf8'));

// Vocabulário de sonda com distribuição de tamanhos parecida com
// português técnico real.
const PALAVRAS = (
  'a extensão oficial do Chrome permite capturar o estado visual de uma ' +
  'página web e converter em elementos editáveis dentro do arquivo com ' +
  'texto imagem e layout preservados para o time de produto trabalhar'
).split(' ');

function sonda(n, offset = 0) {
  const out = [];
  let len = 0;
  let i = offset;
  while (len < n) {
    const p = PALAVRAS[i++ % PALAVRAS.length];
    if (len + p.length + (out.length ? 1 : 0) > n) break;
    len += p.length + (out.length ? 1 : 0);
    out.push(p);
  }
  // Sempre devolve ao menos uma palavra: string vazia faria o bloco nem
  // ser criado no slide, e o campo sumiria do relatório.
  if (!out.length) out.push(PALAVRAS[offset % PALAVRAS.length]);
  return out.join(' ');
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: tpl.width, height: tpl.height, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(tplDir, 'slide.html')).href, { waitUntil: 'load' });
await page.evaluate(async () => {
  await document.fonts.load("700 60px 'Inter'");
  await document.fonts.load("400 50px 'Inter'");
  await document.fonts.ready;
});

const render = (slide) =>
  page.evaluate((d) => window.renderSlide(d), { ...slide, index: 0, total: 4 });

const OFFSETS = [0, 3, 7, 11, 17, 23];

/**
 * Cresce o texto até o bloco estourar e devolve a capacidade do ÚLTIMO
 * estado que ainda cabia. Medir assim (em vez de tentar construir "N
 * linhas exatas") evita depender de acertar o ponto de quebra: quem
 * conta as linhas é o próprio template.
 *
 * `monta(texto)` devolve o slide; `campo` é o bloco observado.
 * Retorna { maxChars, maxLinhas } no pior caso entre os offsets.
 */
async function capacidade(monta, campo, passo = 8, teto = 3000) {
  let piorChars = Infinity;
  let piorLinhas = Infinity;
  for (const off of OFFSETS) {
    let ultimoChars = 0;
    let ultimasLinhas = 0;
    for (let n = passo; n < teto; n += passo) {
      const texto = sonda(n, off);
      const rel = await render(monta(texto));
      const c = rel.campos.find((x) => x.campo === campo);
      if (!c) break;
      if (c.excesso > 0) break;
      ultimoChars = texto.length;
      ultimasLinhas = c.linhas;
    }
    piorChars = Math.min(piorChars, ultimoChars);
    piorLinhas = Math.min(piorLinhas, ultimasLinhas);
  }
  return { maxChars: piorChars, maxLinhas: piorLinhas };
}

/** Idem, mas para listas: cresce o NÚMERO de items de tamanho fixo. */
async function capacidadeLista(charsPorItem, teto = 12) {
  let piorLinhas = Infinity;
  let piorChars = Infinity;
  for (const off of OFFSETS.slice(0, 3)) {
    let ultimasLinhas = 0;
    let ultimosChars = 0;
    for (let qtd = 1; qtd <= teto; qtd++) {
      const items = Array.from({ length: qtd }, (_, k) => sonda(charsPorItem, off + k * 5));
      const rel = await render({ layout: 'list', tags: TAGS, title: 'Curto', items });
      const c = rel.campos.find((x) => x.campo === 'items');
      if (!c || c.excesso > 0) break;
      ultimasLinhas = c.linhas;
      ultimosChars = items.reduce((s, t) => s + t.length, 0);
    }
    piorLinhas = Math.min(piorLinhas, ultimasLinhas);
    piorChars = Math.min(piorChars, ultimosChars);
  }
  return { maxLinhas: piorLinhas, maxChars: piorChars };
}

/**
 * Caracteres que cabem em UMA linha do bloco, na média entre várias
 * combinações de palavras.
 *
 * Média e não mínimo de propósito: quem estima linhas usa
 * ceil(chars / charsPorLinha) por parágrafo, e o ceil já absorve a borda
 * irregular. Usar o pior caso aqui somaria pessimismo duas vezes e
 * reprovaria layout que na prática cabe.
 */
async function charsPorLinha(monta, campo) {
  const medidas = [];
  for (const off of OFFSETS) {
    let n = 12;
    while (n < 200) {
      const rel = await render(monta(sonda(n, off)));
      const c = rel.campos.find((x) => x.campo === campo);
      if (!c || c.linhas >= 2) break;
      n++;
    }
    medidas.push(n - 1);
  }
  return Math.round(medidas.reduce((a, b) => a + b, 0) / medidas.length);
}

const TAGS = ['FIGMA', 'CHROME'];
const L = {};

// ---- título -----------------------------------------------------------
const tituloBase = (t) => ({ layout: 'text', tags: TAGS, title: t, body: 'x' });
L.titulo = {
  charsPorLinha: await charsPorLinha(tituloBase, 'title'),
  ...(await capacidade(tituloBase, 'title', 4)),
};

// ---- corpo (mesma coluna e fonte em cover/text/cta) --------------------
const textoBase = (b) => ({ layout: 'text', tags: TAGS, title: 'Curto', body: b });
L.corpoCharsPorLinha = await charsPorLinha(textoBase, 'body');
L.corpo = {
  charsPorLinha: L.corpoCharsPorLinha,
  text: await capacidade(textoBase, 'body'),
  coverComLogos: await capacidade(
    (b) => ({ layout: 'cover', tags: TAGS, title: 'Curto', body: b, logos: ['figma'] }),
    'body'
  ),
  coverSemLogos: await capacidade(
    (b) => ({ layout: 'cover', tags: TAGS, title: 'Curto', body: b }),
    'body'
  ),
  cta: await capacidade(
    (b) => ({ layout: 'cta', tags: TAGS, title: 'Curto', body: b, url: 'https://punkmetrics.com/p/' }),
    'body',
    4
  ),
};

// ---- lista: a coluna é recuada pelo marcador, cabe menos por linha -----
const listaBase = (t) => ({ layout: 'list', tags: TAGS, title: 'Curto', items: [t] });
L.lista = {
  charsPorLinha: await charsPorLinha(listaBase, 'items'),
  ...(await capacidadeLista(60)),
};

// ---- URL do cta (token longo, quebra por break-word) ------------------
L.url = await capacidade(
  (t) => ({
    layout: 'cta',
    tags: TAGS,
    title: 'Curto',
    body: 'x',
    url: 'https://punkmetrics.com/' + t.replace(/ /g, '-') + '/',
  }),
  'url',
  4,
  300
);

await browser.close();

tpl.limites = {
  _nota:
    'Capacidade medida por src/measure.mjs contra o slide.html real. Modelo em linhas: ' +
    'linhas de um bloco = soma de ceil(caracteres / charsPorLinha) por parágrafo ou item. ' +
    'Rode de novo se o design ou a tipografia mudarem.',
  // charsPorLinha = pior caso garantido em UMA linha.
  // charsPorLinhaMedio = densidade real (maxChars/maxLinhas), que é o
  // divisor certo para estimar quantas linhas um texto vai ocupar.
  titulo: {
    charsPorLinha: L.titulo.charsPorLinha,
    maxLinhas: L.titulo.maxLinhas,
    maxChars: L.titulo.maxChars,
  },
  corpo: {
    charsPorLinha: L.corpo.charsPorLinha,
    maxLinhas: {
      text: L.corpo.text.maxLinhas,
      coverComLogos: L.corpo.coverComLogos.maxLinhas,
      coverSemLogos: L.corpo.coverSemLogos.maxLinhas,
      cta: L.corpo.cta.maxLinhas,
    },
    maxChars: {
      text: L.corpo.text.maxChars,
      coverComLogos: L.corpo.coverComLogos.maxChars,
      coverSemLogos: L.corpo.coverSemLogos.maxChars,
      cta: L.corpo.cta.maxChars,
    },
  },
  lista: {
    charsPorLinha: L.lista.charsPorLinha,
    maxLinhas: L.lista.maxLinhas,
    maxChars: L.lista.maxChars,
  },
  url: { maxChars: L.url.maxChars },
};

await writeFile(tplPath, JSON.stringify(tpl, null, 2) + '\n');
console.log(JSON.stringify(tpl.limites, null, 2));
