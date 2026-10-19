import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skill = await readFile(new URL('../skills/ig-post/SKILL.md', import.meta.url), 'utf8');
const lim = JSON.parse(await readFile(new URL('../templates/punk-dark/template.json', import.meta.url), 'utf8')).limites;

test('frontmatter declara o skill ig-post', () => {
  assert.match(skill, /^---\nname: ig-post\n/);
});

test('scripts chamados pela raiz do plugin, sem caminho do repo antigo', () => {
  for (const s of ['setup', 'extract', 'check', 'preview', 'render']) assert.match(skill, new RegExp(`\\$\\{CLAUDE_PLUGIN_ROOT\\}/src/${s}\\.mjs`));
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

test('preview vem antes do render no fluxo', () => {
  assert.ok(skill.indexOf('src/preview.mjs') < skill.indexOf('src/render.mjs'));
});
