import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { nodeOk, needsInstall } from '../src/setup.mjs';

test('CLI roda quando o plugin é chamado por um caminho com link simbólico', () => {
  const link = join(mkdtempSync(join(tmpdir(), 'igp-link-')), 'plugin');
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), link);
  const r = spawnSync('node', [join(link, 'src', 'setup.mjs')], { encoding: 'utf8' });
  assert.match(r.stdout, /ok: node/);
});

test('Node 20 em diante passa', () => {
  assert.equal(nodeOk('v20.0.0'), true);
  assert.equal(nodeOk('v26.10.0'), true);
  assert.equal(nodeOk('v18.19.0'), false);
});

test('instala quando puppeteer-core falta, inclusive depois de update do plugin', () => {
  assert.equal(needsInstall('/plugin', () => false), true);
  const pronto = join('/plugin', 'node_modules', 'puppeteer-core', 'package.json');
  assert.equal(needsInstall('/plugin', (p) => p === pronto), false);
});
