import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (p) => JSON.parse(await readFile(new URL(`../${p}`, import.meta.url), 'utf8'));

test('plugin.json identifica o plugin ig-post', async () => {
  const p = await read('.claude-plugin/plugin.json');
  assert.equal(p.name, 'ig-post');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
});

test('marketplace punkmetrics aponta o plugin para a raiz do repo', async () => {
  const m = await read('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'punkmetrics');
  assert.equal(m.plugins.find((x) => x.name === 'ig-post').source, './');
});

test('runtime depende só de puppeteer-core e exige Node 20', async () => {
  const pkg = await read('package.json');
  assert.deepEqual(Object.keys(pkg.dependencies), ['puppeteer-core']);
  assert.equal(pkg.engines.node, '>=20');
  assert.equal(pkg.type, 'module');
});
