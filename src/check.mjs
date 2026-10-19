#!/usr/bin/env node
/**
 * check.mjs — confere um deck ANTES de gerar imagem e diz exatamente o
 * que encurtar.
 *
 * Uso: node src/check.mjs out/<slug>/deck.json [--json]
 * Saída: 0 se tudo cabe, 1 se algum campo estoura.
 *
 * Faz duas passagens:
 *   1. Orçamento de caracteres (template.json > limites) — barato, roda
 *      sem browser e é o que o autor do deck deve respeitar de largada.
 *   2. Medição real no slide.html — a verdade final, pega os casos em
 *      que o texto cabe no orçamento mas quebra mal.
 *
 * Para cada problema informa o campo, o excesso e QUANTOS CARACTERES
 * cortar, que é a instrução acionável.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { resolveChrome } from './lib/chrome.mjs';

let CHROME;
try {
  CHROME = resolveChrome();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const deckPath = process.argv[2];
const comoJson = process.argv.includes('--json');
if (!deckPath) {
  console.error('Uso: node src/check.mjs <caminho/deck.json> [--json]');
  process.exit(1);
}

const deck = JSON.parse(await readFile(resolve(deckPath), 'utf8'));
const tplDir = join(root, 'templates', deck.template);
const tpl = JSON.parse(await readFile(join(tplDir, 'template.json'), 'utf8'));
const lim = tpl.limites;

/**
 * Linhas que um bloco vai ocupar. Cada parágrafo (ou item de lista)
 * quebra independente, então a conta é por parte, não pelo total de
 * caracteres: 4 items curtos e 4 items longos somam alturas diferentes
 * mesmo com a mesma contagem de caracteres.
 */
const linhasDe = (partes, charsPorLinha) =>
  partes.reduce((s, p) => s + Math.max(1, Math.ceil(p.length / charsPorLinha)), 0);

/** Teto de linhas do corpo, que depende do que vem depois no layout. */
function tetoCorpo(slide) {
  if (slide.layout === 'cover') {
    return slide.logos?.length ? lim.corpo.maxLinhas.coverComLogos : lim.corpo.maxLinhas.coverSemLogos;
  }
  if (slide.layout === 'cta') return lim.corpo.maxLinhas.cta;
  return lim.corpo.maxLinhas.text;
}

const problemas = [];

// ---- passagem 1: orçamento de linhas --------------------------------
deck.slides.forEach((slide, i) => {
  const n = i + 1;
  const registra = (campo, linhas, maxLinhas, charsPorLinha) => {
    if (linhas > maxLinhas) {
      problemas.push({
        slide: n,
        layout: slide.layout,
        campo,
        tipo: 'orcamento',
        linhas,
        maxLinhas,
        cortar: Math.ceil((linhas - maxLinhas) * charsPorLinha),
      });
    }
  };

  registra(
    'title',
    linhasDe([slide.title], lim.titulo.charsPorLinha),
    lim.titulo.maxLinhas,
    lim.titulo.charsPorLinha
  );

  if (slide.body) {
    const paragrafos = slide.body.split('\n').filter(Boolean);
    registra(
      'body',
      linhasDe(paragrafos, lim.corpo.charsPorLinha),
      tetoCorpo(slide),
      lim.corpo.charsPorLinha
    );
  }

  if (slide.items?.length) {
    registra(
      'items',
      linhasDe(slide.items, lim.lista.charsPorLinha),
      lim.lista.maxLinhas,
      lim.lista.charsPorLinha
    );
  }

  if (slide.url && slide.url.length > lim.url.maxChars) {
    problemas.push({
      slide: n,
      layout: slide.layout,
      campo: 'url',
      tipo: 'orcamento',
      linhas: slide.url.length,
      maxLinhas: lim.url.maxChars,
      cortar: slide.url.length - lim.url.maxChars,
    });
  }
});

// ---- passagem 2: medição real no template ---------------------------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: tpl.width, height: tpl.height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(tplDir, 'slide.html')).href, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.load("700 60px 'Inter'");
    await document.fonts.load("400 50px 'Inter'");
    await document.fonts.ready;
  });

  const total = deck.slides.length;
  for (let i = 0; i < total; i++) {
    const slide = deck.slides[i];
    const rel = await page.evaluate((d) => window.renderSlide(d), { ...slide, index: i, total });
    for (const c of rel.campos) {
      if (c.excesso > 0) {
        // px de excesso -> caracteres a cortar, usando a densidade real
        // daquele campo (chars por px de altura).
        const texto =
          c.campo === 'items' ? (slide.items ?? []).join(' ') : (slide[c.campo] ?? slide.title ?? '');
        const alturaUsada = c.bottom - (c.top ?? 0);
        const densidade = alturaUsada > 0 ? texto.length / alturaUsada : 1;
        problemas.push({
          slide: i + 1,
          layout: slide.layout,
          campo: c.campo,
          tipo: 'render',
          excessoPx: c.excesso,
          cortar: Math.max(1, Math.ceil(c.excesso * densidade)),
        });
      }
    }
  }
} finally {
  await browser.close();
}

// ---- relatório -------------------------------------------------------
if (comoJson) {
  console.log(JSON.stringify({ ok: problemas.length === 0, problemas }, null, 2));
} else if (problemas.length === 0) {
  console.log(`ok: ${deck.slides.length} slides cabem no template ${deck.template}`);
} else {
  console.error(`${problemas.length} problema(s) de encaixe:\n`);
  for (const p of problemas) {
    if (p.tipo === 'orcamento') {
      const unidade = p.campo === 'url' ? 'chars' : 'linhas';
      console.error(
        `  slide ${p.slide} (${p.layout}) campo ${p.campo}: ${p.linhas} ${unidade}, máximo ${p.maxLinhas}. Cortar ~${p.cortar} chars.`
      );
    } else {
      console.error(
        `  slide ${p.slide} (${p.layout}) campo ${p.campo}: estoura ${p.excessoPx}px no render. Cortar ~${p.cortar} chars.`
      );
    }
  }
  console.error('\nEncurte os textos no deck.json e rode de novo. Não altere o tokens.css.');
}

process.exit(problemas.length === 0 ? 0 : 1);
