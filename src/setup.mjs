#!/usr/bin/env node
/**
 * setup.mjs: prepara o plugin na primeira execução de cada sessão.
 *
 * Uso: node src/setup.mjs
 *   1. Node 22.12 ou mais novo (exigência do puppeteer-core).
 *   2. node_modules na raiz do plugin (npm ci --omit=dev quando falta).
 *      Fica na raiz porque import ESM resolve a partir do arquivo, não
 *      de NODE_PATH. Um update do plugin vem sem node_modules e o setup
 *      reinstala sozinho.
 *   3. Chrome ou Chromium encontrado (lib/chrome.mjs).
 * Sai 0 com três linhas "ok:" ou 1 com a causa.
 *
 * Não importa puppeteer-core: roda antes de ele existir.
 */

import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from './lib/chrome.mjs';

// puppeteer-core 25 declara engines node >=22.12.0.
const MINIMO = [22, 12];

export function nodeOk(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
  return major > MINIMO[0] || (major === MINIMO[0] && minor >= MINIMO[1]);
}

export function needsInstall(root, exists = existsSync) {
  return !exists(join(root, 'node_modules', 'puppeteer-core', 'package.json'));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  if (!nodeOk(process.version)) {
    console.error(`ERRO: o ig-post precisa de Node 22.12 ou mais novo (este é ${process.version}).`);
    process.exit(1);
  }
  console.log(`ok: node ${process.version}`);

  if (needsInstall(root)) {
    const r = spawnSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0 || needsInstall(root)) {
      const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-10).join('\n');
      console.error(`ERRO: não consegui instalar as dependências em ${root}.\n${saida || r.error?.message || ''}`);
      process.exit(1);
    }
  }
  console.log('ok: dependências');

  try {
    console.log(`ok: chrome ${resolveChrome()}`);
  } catch (e) {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  }
}

// Compara caminhos reais: o plugin pode ser chamado por um link simbólico
// (no macOS, /tmp aponta para /private/tmp) e import.meta.url já vem resolvido.
const ehEntrypoint = () => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
};
if (process.argv[1] && ehEntrypoint()) main();
