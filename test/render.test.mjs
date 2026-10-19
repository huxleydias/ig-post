import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveChrome } from '../src/lib/chrome.mjs';

let semChrome = false;
try { resolveChrome(); } catch { semChrome = 'sem Chrome nesta máquina'; }

test('render apaga PNG de slide que saiu do deck', { skip: semChrome }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'igp-render-'));
  const deck = JSON.parse(readFileSync(new URL('../examples/figma-mcp-guia-completo-pt-br/deck.json', import.meta.url), 'utf8'));
  deck.slides = [deck.slides[0], deck.slides[1], deck.slides.at(-1)];
  writeFileSync(join(dir, 'deck.json'), JSON.stringify(deck));
  for (const n of ['04', '05']) writeFileSync(join(dir, `${n}.png`), 'velho');
  const r = spawnSync('node', ['src/render.mjs', join(dir, 'deck.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, '03.png')));
  assert.ok(!existsSync(join(dir, '04.png')), '04.png velho continua na pasta');
  assert.ok(!existsSync(join(dir, '05.png')), '05.png velho continua na pasta');
});
