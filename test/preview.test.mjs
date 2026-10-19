import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function subir(out, port) {
  const p = spawn('node', ['src/preview.mjs', '--out', out, '--port', String(port)]);
  const url = await new Promise((ok, falha) => {
    const limite = setTimeout(() => { p.kill(); falha(new Error('preview não imprimiu PREVIEW_URL em 5s')); }, 5000);
    p.stdout.on('data', (d) => { const m = String(d).match(/PREVIEW_URL=(\S+)/); if (m) { clearTimeout(limite); ok(m[1]); } });
    p.on('exit', () => { clearTimeout(limite); falha(new Error('preview saiu antes de subir')); });
  });
  return { p, url };
}
async function pasta(...slugs) {
  const out = await mkdtemp(join(tmpdir(), 'igp-'));
  for (const s of slugs) { await mkdir(join(out, s)); await writeFile(join(out, s, 'deck.json'), '{"slug":"x","slides":[]}'); }
  return out;
}

test('lista decks da pasta --out e serve o template do plugin', async () => {
  const { p, url } = await subir(await pasta('meu-post'), 5310);
  try {
    assert.deepEqual(await (await fetch(url + 'api/decks')).json(), ['meu-post']);
    assert.equal((await fetch(url + 'template/punk-dark/slide.html')).status, 200);
  } finally { p.kill(); }
});

test('abre deck com slug acentuado', async () => {
  const { p, url } = await subir(await pasta('integração-ia'), 5320);
  try {
    assert.equal((await fetch(url + 'api/deck/' + encodeURIComponent('integração-ia'))).status, 200);
  } finally { p.kill(); }
});

test('porta ocupada sobe na seguinte e imprime a URL real', async () => {
  const ocupa = createServer().listen(5330);
  try {
    const { p, url } = await subir(await pasta(), 5330);
    p.kill();
    assert.equal(url, 'http://localhost:5331/');
  } finally { ocupa.close(); }
});
