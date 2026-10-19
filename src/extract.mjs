#!/usr/bin/env node
/**
 * extract.mjs: busca um post WordPress pelo REST público e devolve a
 * estrutura do parse-post.mjs. Transporte em lib/wp.mjs.
 *
 * Uso: node src/extract.mjs <url-do-post> --out <dir>
 * Imprime o JSON e, com --out, grava <dir>/<slug>/extract.json.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePost } from './parse-post.mjs';
import { fetchPost, WpError } from './lib/wp.mjs';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:\/\//.test(a));
const outIdx = args.indexOf('--out');
const out = outIdx > -1 ? args[outIdx + 1] : null;

if (!url) {
  console.error('Uso: node src/extract.mjs <url-do-post> --out <dir>');
  process.exit(1);
}

try {
  const extraido = parsePost(await fetchPost(url));
  const json = JSON.stringify(extraido, null, 2);
  if (out) {
    const dir = join(out, extraido.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'extract.json'), json + '\n');
  }
  console.log(json);
} catch (e) {
  if (!(e instanceof WpError)) throw e;
  console.error(`ERRO: ${e.message}`);
  process.exit(1);
}
