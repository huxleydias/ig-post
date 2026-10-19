#!/usr/bin/env node
/**
 * preview.mjs — servidor de preview do carrossel no browser.
 *
 * Uso: node src/preview.mjs [porta]   (default 5210)
 * Depois abrir http://localhost:5210/?deck=<slug>
 *
 * Renderiza os slides com o MESMO slide.html usado pelo render.mjs,
 * dentro de iframes em escala reduzida. O que aparece aqui é
 * exatamente o que sai no PNG.
 */

import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? 5210);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const PAGE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Preview do carrossel</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #141414; color: #eee;
         font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  header { padding: 16px 24px; border-bottom: 1px solid #2a2a2a;
           display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  header h1 { font-size: 15px; font-weight: 600; margin: 0; }
  header .meta { color: #888; font-size: 13px; }
  select, button { background: #222; color: #eee; border: 1px solid #3a3a3a;
                   border-radius: 6px; padding: 6px 10px; font: inherit; }
  .strip { display: flex; gap: 24px; padding: 24px; overflow-x: auto; align-items: flex-start; }
  .slot { flex: 0 0 auto; }
  .frame { width: 1080px; height: 1440px; transform-origin: top left;
           border: 1px solid #2a2a2a; border-radius: 4px; overflow: hidden; background: #000; }
  .frame iframe { width: 1080px; height: 1440px; border: 0; display: block; }
  .cap { display: flex; justify-content: space-between; align-items: baseline;
         margin-bottom: 8px; font-size: 12px; color: #888; }
  .cap b { color: #eee; font-weight: 600; }
  .ok { color: #7ec87e; }
  .bad { color: #ff6b6b; font-weight: 600; }
  .caption { margin: 0 24px 40px; padding: 16px 20px; background: #1c1c1c;
             border: 1px solid #2a2a2a; border-radius: 8px; white-space: pre-wrap;
             max-width: 720px; }
  .caption h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase;
                letter-spacing: .08em; color: #888; font-weight: 600; }
  .err { margin: 24px; padding: 16px; background: #2a1414; border: 1px solid #5a2020;
         border-radius: 8px; color: #ff9b9b; }
</style></head><body>
<header>
  <h1>Preview do carrossel</h1>
  <select id="deck"></select>
  <label class="meta">zoom
    <input id="zoom" type="range" min="15" max="100" value="34" style="vertical-align:middle">
    <span id="zoomv">34%</span>
  </label>
  <button id="reload">Recarregar deck</button>
  <span class="meta" id="status"></span>
</header>
<div class="strip" id="strip"></div>
<div class="caption" id="caption" hidden></div>
<script>
const qs = new URLSearchParams(location.search);
const strip = document.getElementById('strip');
const sel = document.getElementById('deck');
const zoom = document.getElementById('zoom');

async function listDecks() {
  const decks = await (await fetch('/api/decks')).json();
  sel.innerHTML = decks.map(d => '<option>' + d + '</option>').join('');
  const want = qs.get('deck');
  if (want && decks.includes(want)) sel.value = want;
  return sel.value;
}

function applyZoom() {
  const s = zoom.value / 100;
  document.getElementById('zoomv').textContent = zoom.value + '%';
  for (const f of document.querySelectorAll('.frame')) {
    f.style.transform = 'scale(' + s + ')';
    f.parentElement.style.width = (1080 * s) + 'px';
    f.parentElement.style.height = (1440 * s + 26) + 'px';
  }
}

async function load() {
  const slug = sel.value;
  if (!slug) return;
  strip.innerHTML = '';
  document.getElementById('caption').hidden = true;
  history.replaceState(null, '', '?deck=' + encodeURIComponent(slug));

  let deck;
  try {
    deck = await (await fetch('/api/deck/' + slug)).json();
  } catch (e) {
    strip.innerHTML = '<div class="err">Nao consegui ler o deck: ' + e.message + '</div>';
    return;
  }
  if (deck.error) {
    strip.innerHTML = '<div class="err">' + deck.error + '</div>';
    return;
  }

  const total = deck.slides.length;
  document.getElementById('status').textContent = total + ' slides | template ' + deck.template;

  deck.slides.forEach((slide, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML =
      '<div class="cap"><b>' + (i + 1) + '. ' + slide.layout + '</b><span data-fit></span></div>' +
      '<div class="frame"><iframe src="/template/' + deck.template + '/slide.html"></iframe></div>';
    strip.appendChild(slot);

    const iframe = slot.querySelector('iframe');
    iframe.onload = async () => {
      // Mesma espera de fontes do render.mjs: medir antes disso usa a
      // fonte de fallback e o aviso de estouro sai errado.
      const doc = iframe.contentWindow.document;
      await doc.fonts.load("700 60px 'Inter'");
      await doc.fonts.load("400 50px 'Inter'");
      await doc.fonts.ready;
      const rel = iframe.contentWindow.renderSlide({ ...slide, index: i, total });
      const fit = slot.querySelector('[data-fit]');
      if (!rel.cabe) {
        fit.className = 'bad';
        fit.textContent = rel.campos
          .filter(c => c.excesso > 0)
          .map(c => c.campo + ' +' + c.excesso + 'px')
          .join(', ');
      } else {
        fit.className = 'ok';
        fit.textContent = 'cabe';
      }
    };
  });
  applyZoom();

  const cap = document.getElementById('caption');
  cap.hidden = false;
  cap.innerHTML = '<h2>Legenda</h2>';
  cap.append(deck.caption + (deck.hashtags?.length ? '\\n\\n' + deck.hashtags.join(' ') : ''));
}

zoom.addEventListener('input', applyZoom);
sel.addEventListener('change', load);
document.getElementById('reload').addEventListener('click', load);
listDecks().then(load);
</script></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      return res.end(PAGE);
    }

    // lista de decks disponíveis
    if (path === '/api/decks') {
      const dirs = await readdir(join(root, 'out'), { withFileTypes: true });
      const decks = [];
      for (const d of dirs.filter((d) => d.isDirectory())) {
        try {
          await readFile(join(root, 'out', d.name, 'deck.json'));
          decks.push(d.name);
        } catch {}
      }
      res.writeHead(200, { 'content-type': MIME['.json'] });
      return res.end(JSON.stringify(decks));
    }

    // conteúdo de um deck
    if (path.startsWith('/api/deck/')) {
      const slug = path.slice('/api/deck/'.length);
      if (slug.includes('/') || slug.includes('..')) throw new Error('slug inválido');
      const raw = await readFile(join(root, 'out', slug, 'deck.json'), 'utf8');
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      return res.end(raw);
    }

    // arquivos do template (slide.html, tokens.css, fonts, logos)
    if (path.startsWith('/template/')) {
      const rel = normalize(path.slice('/template/'.length));
      if (rel.startsWith('..')) throw new Error('caminho inválido');
      const file = join(root, 'templates', rel);
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      return res.end(body);
    }

    res.writeHead(404).end('não encontrado');
  } catch (e) {
    res.writeHead(500, { 'content-type': MIME['.json'] });
    res.end(JSON.stringify({ error: e.message }));
  }
}).listen(port, () => {
  console.log(`preview do carrossel em http://localhost:${port}/`);
});
