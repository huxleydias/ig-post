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

// O requisito é a URL impressa abrir o preview, qualquer que seja o ocupante.
// No macOS o bind em 127.0.0.1 convive com um ocupante curinga e recebe as
// conexões de 127.0.0.1; no Linux dá EADDRINUSE e o preview pula de porta.
for (const [host, porta] of [[undefined, 5330], ['127.0.0.1', 5340], ['::1', 5350]]) {
  test(`porta ocupada (${host ?? 'curinga'}): a URL impressa chega no preview, não no outro servidor`, async () => {
    const ocupa = createServer((s) => s.end('HTTP/1.1 200 OK\r\ncontent-length: 5\r\n\r\noutro')).listen(porta, host);
    await new Promise((ok) => ocupa.once('listening', ok));
    try {
      const { p, url } = await subir(await pasta('meu-post'), porta);
      try {
        assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
        assert.deepEqual(await (await fetch(url + 'api/decks')).json(), ['meu-post']);
      } finally { p.kill(); }
    } finally { ocupa.close(); }
  });
}

test('porta ocupada em 127.0.0.1 faz o preview pular para a seguinte', async () => {
  const ocupa = createServer().listen(5380, '127.0.0.1');
  await new Promise((ok) => ocupa.once('listening', ok));
  try {
    const { p, url } = await subir(await pasta(), 5380);
    p.kill();
    assert.equal(url, 'http://127.0.0.1:5381/');
  } finally { ocupa.close(); }
});

test('URL malformada responde 400 e o preview continua no ar', async () => {
  const { p, url } = await subir(await pasta('meu-post'), 5360);
  try {
    assert.equal((await fetch(url + '%E0%A4%A')).status, 400);
    assert.equal((await fetch(url + 'api/decks')).status, 200);
  } finally { p.kill(); }
});

test('deck inexistente responde 404 sem expor caminho da máquina', async () => {
  const out = await pasta();
  const { p, url } = await subir(out, 5370);
  try {
    const r = await fetch(url + 'api/deck/nao-existe');
    assert.equal(r.status, 404);
    assert.ok(!(await r.text()).includes(out));
  } finally { p.kill(); }
});
