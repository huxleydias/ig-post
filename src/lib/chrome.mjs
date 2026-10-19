/**
 * chrome.mjs: acha o executável do Chrome ou Chromium para o puppeteer-core.
 *
 * Ordem: CHROME_PATH (se definido, tem que existir) e depois os caminhos
 * padrão de cada sistema. Sem dependências além de node:*, porque o
 * setup.mjs usa este módulo antes de instalar o puppeteer-core.
 */

import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

export class ChromeNotFound extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChromeNotFound';
  }
}

const AJUDA = 'Instale o Google Chrome ou aponte o executável com CHROME_PATH=/caminho/do/chrome.';

function candidatos(platform, env) {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    const sufixo = ['Google', 'Chrome', 'Application', 'chrome.exe'];
    return [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter(Boolean)
      .map((raiz) => win32.join(raiz, ...sufixo));
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function resolveChrome({ env = process.env, platform = process.platform, exists = existsSync } = {}) {
  if (env.CHROME_PATH) {
    if (exists(env.CHROME_PATH)) return env.CHROME_PATH;
    throw new ChromeNotFound(`CHROME_PATH aponta para ${env.CHROME_PATH}, que não existe. ${AJUDA}`);
  }
  const achado = candidatos(platform, env).find((p) => exists(p));
  if (achado) return achado;
  throw new ChromeNotFound(`Chrome ou Chromium não encontrado. ${AJUDA}`);
}
