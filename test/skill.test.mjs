import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skill = await readFile(new URL('../skills/ig-post/SKILL.md', import.meta.url), 'utf8');
const lim = JSON.parse(await readFile(new URL('../templates/punkmetrics-ds/template.json', import.meta.url), 'utf8')).limites;

test('frontmatter declara o skill ig-post', () => {
  assert.match(skill, /^---\nname: ig-post\n/);
});

test('scripts chamados pela raiz do plugin, entre aspas, sem caminho do repo antigo', () => {
  // O Claude Code troca ${CLAUDE_PLUGIN_ROOT} por texto puro: sem aspas, um
  // caminho com espaço (Application Support, usuário "João Silva") quebra.
  for (const s of ['setup', 'extract', 'check', 'preview', 'render']) assert.match(skill, new RegExp(`node "\\$\\{CLAUDE_PLUGIN_ROOT\\}/src/${s}\\.mjs"`));
  assert.doesNotMatch(skill, /node \$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(skill, /projects\/ig-carousel|launch\.json|ig-carousel-preview/);
});

test('sem dependência de pessoas ou skills da PunkMetrics', () => {
  for (const s of ['Huxley', 'huxley-voice', 'copywriter-punkmetrics']) assert.ok(!skill.includes(s), s);
});

test('tabela de orçamento bate com template.json', () => {
  const nums = [lim.titulo.maxChars, lim.corpo.maxChars.coverComLogos, lim.corpo.maxChars.text,
    lim.corpo.maxChars.cta, lim.lista.maxChars, lim.url.maxChars];
  for (const n of nums) assert.match(skill, new RegExp(`~${n} caracteres`), String(n));
});

test('punkmetrics-ds é o template padrão do deck', () => {
  assert.match(skill, /template: "punkmetrics-ds"/);
  assert.doesNotMatch(skill, /template: "punk-dark"/);
});

test('URL do preview descrita como o script imprime', () => {
  assert.match(skill, /PREVIEW_URL=http:\/\/127\.0\.0\.1:<porta>\//);
});

test('preview vem antes do render no fluxo', () => {
  assert.ok(skill.indexOf('src/preview.mjs') < skill.indexOf('src/render.mjs'));
});
