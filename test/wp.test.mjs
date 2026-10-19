import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { slugFromUrl, discoverApiBase, fetchPost, WpError } from '../src/lib/wp.mjs';

const fakeFetch = (routes) => async (url) => {
  const k = Object.keys(routes).find((r) => String(url).startsWith(r));
  if (!k) return new Response('', { status: 404 });
  const [status, body] = routes[k];
  if (body instanceof Error) throw body;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
};
const POST = { id: 1, slug: 'meu-post', link: 'https://ex.com/meu-post/', title: { rendered: 'Meu post' },
  excerpt: { rendered: '<p>Resumo</p>' }, content: { rendered: '<p>Corpo</p>' }, categories: [3], tags: [7] };
const TAXO = (base) => ({
  [`${base}/categories`]: [200, [{ id: 3, name: 'Inteligência Artificial' }]],
  [`${base}/tags`]: [200, [{ id: 7, name: 'Figma' }]],
});

test('slug sai do último segmento, sem barra e sem query', () => {
  assert.equal(slugFromUrl('https://punkmetrics.com/figma-mcp-guia-completo-pt-br/'), 'figma-mcp-guia-completo-pt-br');
  assert.equal(slugFromUrl('https://ex.com/blog/2026/10/meu-post?utm_source=x'), 'meu-post');
  assert.equal(slugFromUrl('https://ex.com/integra%C3%A7%C3%A3o-ia/'), 'integração-ia');
});

test('URL sem slug é WpError', () => {
  assert.throws(() => slugFromUrl('https://ex.com/'), WpError);
});

test('descoberta lê o link rel api.w.org', () => {
  assert.equal(discoverApiBase('<link rel="https://api.w.org/" href="https://ex.com/blog/wp-json/" />'), 'https://ex.com/blog/wp-json/wp/v2');
  assert.equal(discoverApiBase('<html></html>'), null);
});

test('post na raiz do domínio vem normalizado', async () => {
  const b = 'https://ex.com/wp-json/wp/v2';
  const p = await fetchPost('https://ex.com/meu-post/', { fetch: fakeFetch({ [`${b}/posts`]: [200, [POST]], ...TAXO(b) }) });
  assert.equal(p.title, 'Meu post');
  assert.equal(p.categoria, 'Inteligência Artificial');
  assert.deepEqual(p.tags, ['Figma']);
  assert.equal(p.slug, 'meu-post');
});

test('raiz vazia cai na descoberta (WordPress em subdiretório)', async () => {
  const raiz = 'https://ex.com/wp-json/wp/v2';
  const sub = 'https://ex.com/news/wp-json/wp/v2';
  const f = fakeFetch({
    [`${raiz}/posts`]: [200, []],
    'https://ex.com/news/meu-post/': [200, '<link rel="https://api.w.org/" href="https://ex.com/news/wp-json/">'],
    [`${sub}/posts`]: [200, [POST]], ...TAXO(sub),
  });
  const p = await fetchPost('https://ex.com/news/meu-post/', { fetch: f });
  assert.equal(p.slug, 'meu-post');
});

test('slug codificado pelo WordPress volta decodificado', async () => {
  const b = 'https://ex.com/wp-json/wp/v2';
  const f = fakeFetch({ [`${b}/posts`]: [200, [{ ...POST, slug: 'integra%c3%a7%c3%a3o-ia' }]], ...TAXO(b) });
  const p = await fetchPost('https://ex.com/integra%C3%A7%C3%A3o-ia/', { fetch: f });
  assert.equal(p.slug, 'integração-ia');
});

test('site sem WordPress dá WpError acionável', async () => {
  await assert.rejects(fetchPost('https://ex.com/meu-post/', { fetch: fakeFetch({ 'https://ex.com/meu-post/': [200, '<html></html>'] }) }),
    (e) => e instanceof WpError && /REST público/.test(e.message));
});

test('REST bloqueado dá WpError com o status', async () => {
  const f = fakeFetch({
    'https://ex.com/wp-json/wp/v2/posts': [401, { code: 'rest_forbidden' }],
    'https://ex.com/meu-post/': [200, '<link rel="https://api.w.org/" href="https://ex.com/wp-json/">'],
  });
  await assert.rejects(fetchPost('https://ex.com/meu-post/', { fetch: f }), (e) => e instanceof WpError && /401/.test(e.message));
});

test('falha de rede vira WpError', async () => {
  const f = fakeFetch({ 'https://ex.com/': [0, new TypeError('fetch failed')] });
  await assert.rejects(fetchPost('https://ex.com/meu-post/', { fetch: f }), (e) => e instanceof WpError && /acessar/.test(e.message));
});

test('CLI sai com 1 e sem stack trace quando o site não responde', () => {
  const r = spawnSync('node', ['src/extract.mjs', 'http://127.0.0.1:9/meu-post/', '--out', '/tmp/ig-post-test'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});
