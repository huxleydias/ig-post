import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChrome, ChromeNotFound } from '../src/lib/chrome.mjs';

const only = (alvo) => (p) => p === alvo;

test('CHROME_PATH tem prioridade', () => {
  assert.equal(resolveChrome({ env: { CHROME_PATH: '/opt/c' }, platform: 'linux', exists: only('/opt/c') }), '/opt/c');
});

test('CHROME_PATH inexistente falha em vez de cair no padrão', () => {
  assert.throws(() => resolveChrome({ env: { CHROME_PATH: '/x' }, platform: 'darwin', exists: (p) => p !== '/x' }),
    (e) => e instanceof ChromeNotFound && /CHROME_PATH/.test(e.message));
});

test('macOS acha o Chrome padrão', () => {
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(resolveChrome({ env: {}, platform: 'darwin', exists: only(mac) }), mac);
});

test('Linux aceita Chromium', () => {
  assert.equal(resolveChrome({ env: {}, platform: 'linux', exists: only('/usr/bin/chromium') }), '/usr/bin/chromium');
});

test('Windows usa PROGRAMFILES', () => {
  const win = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.equal(resolveChrome({ env: { PROGRAMFILES: 'C:\\Program Files' }, platform: 'win32', exists: only(win) }), win);
});

test('sem Chrome a mensagem diz como resolver', () => {
  assert.throws(() => resolveChrome({ env: {}, platform: 'linux', exists: () => false }),
    (e) => e instanceof ChromeNotFound && /CHROME_PATH/.test(e.message));
});
