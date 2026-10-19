#!/usr/bin/env node
/**
 * trim-logo.mjs — tira o fundo chapado de um asset de logo e corta a
 * moldura vazia, deixando o glifo sangrando até a borda do arquivo.
 *
 * Uso: node src/trim-logo.mjs templates/punk-dark/logos/figma.png [--bg 000000]
 *
 * Por que existe: alguns arquivos de logo vêm como "tile" com fundo
 * PRETO OPACO por baixo do glifo. No slide (fundo preto) esse fundo some
 * de vista, então o logo parece bem menor que os vizinhos, mesmo o
 * arquivo tendo o mesmo tamanho. E como o fundo é opaco, escalar o
 * arquivo para compensar faria ele COBRIR os logos ao lado.
 *
 * O que faz: pixel cuja cor é igual à do fundo (dentro da tolerância)
 * vira transparente; depois recorta na bounding box do que sobrou e
 * grava num canvas quadrado com o glifo centralizado. Sobrescreve o
 * arquivo (o original está no git).
 *
 * Depois de rodar: `node src/measure-logos.mjs` para recalcular as
 * frações.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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

const alvo = process.argv[2];
if (!alvo) {
  console.error('Uso: node src/trim-logo.mjs <caminho/logo.png> [--bg RRGGBB]');
  process.exit(1);
}
const bgIdx = process.argv.indexOf('--bg');
const BG = (bgIdx > -1 ? process.argv[bgIdx + 1] : '000000').replace('#', '');
const bgRGB = [0, 2, 4].map((i) => parseInt(BG.slice(i, i + 2), 16));

const caminho = join(root, alvo.replace(/^.*ig-carousel\//, ''));
if (!existsSync(caminho)) {
  console.error(`ERRO: não achei ${caminho}`);
  process.exit(1);
}
if (extname(caminho).toLowerCase() !== '.png') {
  console.error('ERRO: só PNG. SVG se resolve editando o viewBox.');
  process.exit(1);
}

const TOL = 24;     // distância de cor até o fundo para considerar "é fundo"
const MARGEM = 0;   // px de folga em volta do glifo, no canvas de saída

const buf = await readFile(caminho);
const src = `data:image/png;base64,${buf.toString('base64')}`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

const resultado = await page.evaluate(
  async (src, bgRGB, tol, margem) => {
    const img = new Image();
    await new Promise((ok, erro) => {
      img.onload = ok;
      img.onerror = () => erro(new Error('load'));
      img.src = src;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, W, H);
    const px = dados.data;

    // 1. pixel da cor do fundo vira transparente
    let zerados = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const d = Math.abs(px[i] - bgRGB[0]) + Math.abs(px[i + 1] - bgRGB[1]) + Math.abs(px[i + 2] - bgRGB[2]);
      if (d <= tol) { px[i + 3] = 0; zerados++; }
    }
    ctx.putImageData(dados, 0, 0);

    // 2. bounding box do que restou
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;

    // 3. canvas quadrado com o glifo centralizado
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const lado = Math.max(cw, ch) + margem * 2;
    const out = document.createElement('canvas');
    out.width = out.height = lado;
    const octx = out.getContext('2d');
    octx.drawImage(c, x0, y0, cw, ch, (lado - cw) / 2, (lado - ch) / 2, cw, ch);

    return {
      dataUrl: out.toDataURL('image/png'),
      antes: { w: W, h: H },
      conteudo: { w: cw, h: ch },
      fracaoAntes: Number((Math.max(cw, ch) / Math.max(W, H)).toFixed(4)),
      zerados,
    };
  },
  src, bgRGB, TOL, MARGEM,
);

await browser.close();

if (!resultado) {
  console.error('ERRO: depois de tirar o fundo não sobrou pixel visível. Tolerância alta demais?');
  process.exit(1);
}

const base64 = resultado.dataUrl.split(',')[1];
await writeFile(caminho, Buffer.from(base64, 'base64'));

console.log(`ok: ${alvo}`);
console.log(`  antes:   ${resultado.antes.w}x${resultado.antes.h}, conteúdo ocupava ${(resultado.fracaoAntes * 100).toFixed(0)}% do arquivo`);
console.log(`  agora:   ${resultado.conteudo.w}x${resultado.conteudo.h} sangrando até a borda`);
console.log(`  ${resultado.zerados} pixels de fundo viraram transparente`);
console.log('  rode: node src/measure-logos.mjs');
