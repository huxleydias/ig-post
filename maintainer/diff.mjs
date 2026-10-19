#!/usr/bin/env node
/**
 * diff.mjs — compara os PNGs renderizados com os exports oficiais do Figma.
 * Uso: node src/diff.mjs out/<slug> out/figma-ref
 * Métrica: % de pixels com diferença perceptível (delta RGB > 32) e
 * imagem de diff (magenta) por par, salva em out/<slug>/diff-NN.png.
 */
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [dirA, dirB] = process.argv.slice(2).map((p) => resolve(p));
if (!dirB) {
  console.error('Uso: node src/diff.mjs <dir-render> <dir-ref>');
  process.exit(1);
}

const pares = [
  ['01.png', '01-cover.png'],
  ['02.png', '02-hook.png'],
  ['03.png', '03-fact.png'],
  ['04.png', '04-cta.png'],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.goto(pathToFileURL(join(dirA, '01.png')).href);

for (const [a, b] of pares) {
  const res = await page.evaluate(
    async (urlA, urlB) => {
      const load = (u) =>
        new Promise((ok, err) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = err;
          i.src = u;
        });
      const [ia, ib] = await Promise.all([load(urlA), load(urlB)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const cv = (img) => {
        const c = new OffscreenCanvas(w, h);
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const da = cv(ia), db = cv(ib);
      const out = new OffscreenCanvas(w, h);
      const ox = out.getContext('2d');
      const od = ox.createImageData(w, h);
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 96) {
          diff++;
          od.data[i] = 255; od.data[i + 2] = 255; od.data[i + 3] = 255;
        } else {
          od.data[i] = da[i]; od.data[i + 1] = da[i + 1]; od.data[i + 2] = da[i + 2]; od.data[i + 3] = 40;
        }
      }
      ox.putImageData(od, 0, 0);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const buf = await blob.arrayBuffer();
      return {
        pct: ((diff / (w * h)) * 100).toFixed(2),
        png: Array.from(new Uint8Array(buf)),
      };
    },
    pathToFileURL(join(dirA, a)).href,
    pathToFileURL(join(dirB, b)).href
  );
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dirA, `diff-${a}`), Buffer.from(res.png));
  console.log(`${a} vs ${b}: ${res.pct}% pixels diferentes`);
}
await browser.close();
