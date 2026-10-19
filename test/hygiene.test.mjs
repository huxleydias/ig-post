import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const texto = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' })
  .split('\n').filter((f) => /\.(md|mjs|js|json|html|css|ts|txt)$/.test(f) && !f.startsWith('test/'));
const ler = (f) => readFileSync(f, 'utf8');
const PODE_HUXLEY = new Set(['README.md', 'NOTICE.md', 'LICENSE', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']);

test('nenhum travessão em arquivo publicado', () => {
  const sujos = texto.filter((f) => /[—–]/.test(ler(f)));
  assert.deepEqual(sujos, []);
});

test('nenhum caminho de máquina nem segredo', () => {
  const sujos = texto.filter((f) => /\/Users\/|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|figd_[\w-]{20,}/.test(ler(f)));
  assert.deepEqual(sujos, []);
});

test('nome pessoal só nos créditos', () => {
  const sujos = texto.filter((f) => !PODE_HUXLEY.has(f) && ler(f).includes('Huxley'));
  assert.deepEqual(sujos, []);
});

test('README sem clichê de escassez', () => {
  assert.doesNotMatch(ler('README.md'), /ninguém|muita gente|a maioria|poucos sabem/i);
});
