#!/usr/bin/env node
/**
 * render.mjs: deck.json → PNGs 1080x1440.
 *
 * Uso: node src/render.mjs out/<slug>/deck.json
 *
 * Deliberadamente burro: não interpreta conteúdo, não chama LLM.
 * Valida o deck contra deck.schema.json, injeta cada slide no
 * slide.html do template e tira screenshot com o Chrome instalado.
 *
 * Guarda de overflow: se o conteúdo de um slide estourar a altura
 * do frame, falha alto com o índice do slide.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
if (!deckPath) {
  console.error('Uso: node src/render.mjs <caminho/deck.json>');
  process.exit(1);
}
const deck = JSON.parse(await readFile(deckPath, 'utf8'));

// ---- validação de schema (sem dependência: checagens diretas) --------
function fail(msg) {
  console.error(`ERRO de schema: ${msg}`);
  process.exit(1);
}
const LAYOUTS = new Set(['cover', 'text', 'list', 'cta']);
if (!deck.template) fail('template ausente');
if (!deck.slug) fail('slug ausente');
if (!deck.caption) fail('caption ausente');
if (!Array.isArray(deck.slides)) fail('slides ausente');
if (deck.slides.length < 3 || deck.slides.length > 5)
  fail(`slides deve ter 3 a 5 itens, tem ${deck.slides.length}`);
deck.slides.forEach((s, i) => {
  if (!LAYOUTS.has(s.layout)) fail(`slide ${i + 1}: layout inválido "${s.layout}"`);
  if (!s.title) fail(`slide ${i + 1}: title ausente`);
  if (s.layout === 'list' && !(s.items?.length >= 2)) fail(`slide ${i + 1}: list exige items>=2`);
  if (s.layout === 'cta' && !s.url) fail(`slide ${i + 1}: cta exige url`);
  if ((s.tags?.length ?? 0) > 3) fail(`slide ${i + 1}: máximo 3 tags`);
});

// ---- template ---------------------------------------------------------
const tplDir = join(root, 'templates', deck.template);
const tplJson = JSON.parse(await readFile(join(tplDir, 'template.json'), 'utf8'));
const { width, height } = tplJson;
const slideUrl = pathToFileURL(join(tplDir, 'slide.html')).href;

const outDir = dirname(resolve(deckPath));
await mkdir(outDir, { recursive: true });

// ---- render -----------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(slideUrl, { waitUntil: 'load' });
  // As fontes precisam estar carregadas ANTES da primeira medição, senão
  // o texto é medido com a fonte de fallback e o overflow sai errado.
  await page.evaluate(async () => {
    await document.fonts.load("700 60px 'Inter'");
    await document.fonts.load("400 50px 'Inter'");
    await document.fonts.ready;
  });

  const total = deck.slides.length;
  for (let i = 0; i < total; i++) {
    const slide = deck.slides[i];
    // renderSlide é definida pelo slide.html; devolve a altura real do conteúdo
    const rel = await page.evaluate(
      (data) => window.renderSlide(data),
      { ...slide, index: i, total }
    );

    if (!rel.cabe) {
      const detalhe = rel.campos
        .filter((c) => c.excesso > 0)
        .map((c) => `${c.campo} estoura ${c.excesso}px`)
        .join(', ');
      console.error(`ERRO overflow: slide ${i + 1} (${slide.layout}): ${detalhe}.`);
      console.error('Rode `node src/check.mjs ' + deckPath + '` para ver quantos caracteres cortar.');
      process.exit(2);
    }

    const file = join(outDir, `${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
    console.log(`ok: ${file}`);
  }

  // caption.md ao lado dos PNGs
  const caption = [deck.caption, '', (deck.hashtags ?? []).join(' ')].join('\n').trim();
  await writeFile(join(outDir, 'caption.md'), caption + '\n');
  console.log(`ok: ${join(outDir, 'caption.md')}`);
} finally {
  await browser.close();
}
