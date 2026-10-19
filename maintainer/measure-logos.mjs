#!/usr/bin/env node
/**
 * measure-logos.mjs — normaliza o tamanho ÓPTICO dos logos de tool.
 *
 * Uso: node src/measure-logos.mjs [--template punk-dark]
 *
 * Problema que resolve: os arquivos de logo vêm de fontes diferentes.
 * Uns são "app tile" (arte sangrando até a borda do arquivo, ex.: notion,
 * cursor), outros são glifo solto com margem transparente em volta
 * (ex.: figma, slack). Com todos no mesmo box CSS, o tile parece maior e
 * o glifo parece menor, mesmo o box sendo idêntico.
 *
 * O que faz: abre cada asset num canvas, mede DUAS bounding boxes e grava
 * a fração ocupada em `templates/<tpl>/logo-box.js` como `window.LOGO_BOX`.
 * O slide.html usa isso para escalar cada logo até que o CONTEÚDO ocupe
 * o mesmo box, não o arquivo.
 *
 * As duas medidas:
 * - alpha: bbox do que não é transparente.
 * - contraste: bbox do que o olho enxerga SOBRE O FUNDO do slide. Um tile
 *   preto opaco tem alpha cheio e contraste zero: some no fundo preto.
 *
 * Quando as duas divergem muito, o asset tem fundo chapado da cor do
 * slide. Nesse caso NÃO dá para escalar pelo contraste: o fundo é opaco
 * e cobriria os logos vizinhos. O script avisa e manda rodar
 * `src/trim-logo.mjs`, que apaga esse fundo e corta a moldura.
 *
 * Rodar de novo sempre que adicionar ou trocar um arquivo em
 * templates/<tpl>/logos/.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const tplIdx = process.argv.indexOf('--template');
const tpl = tplIdx > -1 ? process.argv[tplIdx + 1] : 'punk-dark';
const logosDir = join(root, 'templates', tpl, 'logos');

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const CANVAS = 256;      // resolução de medição
const ALPHA_MIN = 8;     // abaixo disso é ruído de antialiasing
const CONTRASTE_MIN = 24; // distância de cor até o fundo para "dá pra ver"
const DIVERGENCIA = 0.08; // acima disso, o asset tem fundo chapado

// Cor de fundo do slide, lida do tokens.css do template.
const tokens = await readFile(join(root, 'templates', tpl, 'tokens.css'), 'utf8');
const bgHex = (tokens.match(/--bg:\s*#([0-9a-f]{6})/i)?.[1] ?? '000000');
const bgRGB = [0, 2, 4].map((i) => parseInt(bgHex.slice(i, i + 2), 16));

// A marca PunkMetrics do rodapé não é logo de tool, não entra.
const IGNORAR = new Set(['punkmetrics-white', 'punkmetrics-balck']);

const arquivos = (await readdir(logosDir))
  .filter((f) => MIME[extname(f).toLowerCase()])
  .filter((f) => !IGNORAR.has(basename(f, extname(f))));

// O slide.html tenta .svg e cai para .png. Se existirem os dois com o
// mesmo nome, medimos o .svg, que é o que vai ser usado.
const porNome = new Map();
for (const f of arquivos.sort()) {
  const nome = basename(f, extname(f));
  const atual = porNome.get(nome);
  if (!atual || extname(f) === '.svg') porNome.set(nome, f);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');

const box = {};
for (const [nome, arquivo] of [...porNome].sort()) {
  const buf = await readFile(join(logosDir, arquivo));
  const dataUrl = `data:${MIME[extname(arquivo).toLowerCase()]};base64,${buf.toString('base64')}`;

  const medida = await page.evaluate(
    async (src, size, alphaMin, contrasteMin, bgRGB) => {
      const img = new Image();
      img.width = size;
      img.height = size;
      await new Promise((ok, erro) => {
        img.onload = ok;
        img.onerror = () => erro(new Error('load'));
        img.src = src;
      });
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      // desenha SOBRE o fundo do slide: é assim que o olho vê
      ctx.fillStyle = `rgb(${bgRGB.join(',')})`;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const composto = ctx.getImageData(0, 0, size, size).data;

      // e de novo sem fundo, para a bbox de alpha
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const solto = ctx.getImageData(0, 0, size, size).data;

      const bbox = (visivel) => {
        let x0 = size, y0 = size, x1 = -1, y1 = -1;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (visivel(x, y)) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return null;
        return Math.max(x1 - x0 + 1, y1 - y0 + 1) / size;
      };

      const alpha = bbox((x, y) => solto[(y * size + x) * 4 + 3] > alphaMin);
      const contraste = bbox((x, y) => {
        const i = (y * size + x) * 4;
        return Math.abs(composto[i] - bgRGB[0])
             + Math.abs(composto[i + 1] - bgRGB[1])
             + Math.abs(composto[i + 2] - bgRGB[2]) > contrasteMin;
      });
      return { alpha, contraste };
    },
    dataUrl, CANVAS, ALPHA_MIN, CONTRASTE_MIN, bgRGB,
  );

  if (!medida.alpha) {
    console.warn(`aviso: ${arquivo} não tem pixel visível, ignorado`);
    continue;
  }
  if (!medida.contraste) {
    console.warn(`AVISO: ${arquivo} some por completo no fundo ${'#' + bgHex}. Trocar o asset.`);
    box[nome] = Number(medida.alpha.toFixed(4));
    continue;
  }

  // Fração do box ocupada pelo lado maior do conteúdo. É por ela que o
  // slide.html divide para igualar o tamanho óptico.
  if (medida.alpha - medida.contraste > DIVERGENCIA) {
    // Fundo chapado da cor do slide: alpha cheio, contraste pequeno.
    // Escalar pelo contraste faria esse fundo OPACO cobrir os vizinhos,
    // então fica no alpha (conservador) e avisa para consertar o asset.
    const conserto = extname(arquivo).toLowerCase() === '.png'
      ? `node src/trim-logo.mjs templates/${tpl}/logos/${arquivo}`
      : `converter ${arquivo} para PNG e rodar src/trim-logo.mjs, ou trocar por um asset sem fundo`;
    console.warn(
      `AVISO: ${arquivo} tem fundo chapado (alpha ${(medida.alpha * 100).toFixed(0)}% vs ` +
      `visível ${(medida.contraste * 100).toFixed(0)}%). Vai parecer menor que os vizinhos.\n` +
      `       conserte com: ${conserto}`,
    );
    box[nome] = Number(medida.alpha.toFixed(4));
  } else {
    box[nome] = Number(medida.contraste.toFixed(4));
  }
}

await browser.close();

const saida = join(root, 'templates', tpl, 'logo-box.js');
const linhas = Object.entries(box)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${v},`)
  .join('\n');

await writeFile(
  saida,
  `/* GERADO por src/measure-logos.mjs. Não editar à mão.
 * Fração do arquivo ocupada pelo conteúdo visível (lado maior).
 * 1 = arte sangra até a borda; 0.5 = metade do arquivo é margem vazia.
 * O slide.html escala cada logo por 1/fração para igualar o tamanho óptico. */
window.LOGO_BOX = {
${linhas}
};
`,
  'utf8',
);

console.log(`ok: ${Object.keys(box).length} logos medidos → templates/${tpl}/logo-box.js`);
for (const [k, v] of Object.entries(box)) {
  const escala = (1 / v).toFixed(2);
  console.log(`  ${k.padEnd(20)} ocupa ${(v * 100).toFixed(0).padStart(3)}%  escala ${escala}x`);
}
