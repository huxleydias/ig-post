#!/usr/bin/env node
/**
 * fetch-figma.mjs: lê propriedades e variáveis dos frames do template
 * direto da Figma REST API e salva o JSON bruto para auditoria de tokens.
 *
 * Uso:
 *   set -a; source ../../.env; set +a
 *   node maintainer/fetch-figma.mjs
 *
 * Requer FIGMA_ACCESS_TOKEN no .env (escopo: File content read).
 * Saída: out/figma-nodes.json e out/figma-variables.json
 */

const FILE_KEY = '6sDOmSDlX549cPK9dnEH54';
const NODE_IDS = ['1:5', '1:31', '1:54', '1:76']; // cover, hook, fact, cta

// FALLBACK REST: o caminho padrão para ler o design é o MCP `figma`
// (mcp.figma.com, OAuth do Claude Code). Este script existe para
// emergência/headless e exige a flag explícita para rodar.
if (!process.argv.includes('--fallback-rest')) {
  console.error('Este script é FALLBACK. O caminho padrão é o MCP `figma` (get_design_context / get_screenshot).');
  console.error('Se o MCP estiver indisponível, rode com: node maintainer/fetch-figma.mjs --fallback-rest');
  process.exit(1);
}
console.warn('AVISO: usando fallback REST do Figma. Prefira o MCP `figma` quando disponível.');

const token = process.env.FIGMA_ACCESS_TOKEN;
if (!token) {
  console.error('ERRO: FIGMA_ACCESS_TOKEN ausente no ambiente.');
  console.error('Crie em figma.com > Settings > Security > Personal access tokens');
  console.error('e adicione ao .env do projeto. Depois: set -a; source .env; set +a');
  process.exit(1);
}

const headers = { 'X-Figma-Token': token };

async function get(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(root, 'out'), { recursive: true });

// 1. Árvore completa dos 4 frames (geometria, fills, tipografia, auto layout)
const nodes = await get(
  `/files/${FILE_KEY}/nodes?ids=${NODE_IDS.join(',')}&geometry=paths`
);
await writeFile(join(root, 'out', 'figma-nodes.json'), JSON.stringify(nodes, null, 2));
console.log('ok: out/figma-nodes.json');

// 2. Variáveis locais (tokens: --surface-tag, --radius-card, etc.)
// Endpoint exige plano Enterprise; em plano menor devolve 403 e seguimos sem.
try {
  const vars = await get(`/files/${FILE_KEY}/variables/local`);
  await writeFile(join(root, 'out', 'figma-variables.json'), JSON.stringify(vars, null, 2));
  console.log('ok: out/figma-variables.json');
} catch (e) {
  console.warn(`variables/local indisponível (${e.message.slice(0, 80)}...)`);
  console.warn('Tokens de variável serão lidos dos defaults embutidos nos nodes (boundVariables/resolved).');
}

// 3. Resumo legível: um bloco por frame com os valores que interessam ao template
function walk(node, depth, lines, origin) {
  const pad = '  '.repeat(depth);
  const bits = [`${pad}${node.type} "${node.name}"`];
  if (node.absoluteBoundingBox) {
    const b = node.absoluteBoundingBox;
    if (depth === 0) origin = { x: b.x, y: b.y };
    const rel = origin ? ` @ ${Math.round(b.x - origin.x)},${Math.round(b.y - origin.y)}` : '';
    bits.push(`${pad}  box: ${Math.round(b.width)}x${Math.round(b.height)}${rel}`);
  }
  if (node.fills?.length) {
    for (const f of node.fills) {
      if (f.type === 'SOLID' && f.visible !== false) {
        const { r, g, b } = f.color;
        const hex = '#' + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
        bits.push(`${pad}  fill: ${hex} a=${f.opacity ?? 1}`);
      }
      if (f.type === 'IMAGE') bits.push(`${pad}  fill: IMAGE ref=${f.imageRef}`);
    }
  }
  if (node.cornerRadius != null) bits.push(`${pad}  radius: ${node.cornerRadius}`);
  if (node.style) {
    const s = node.style;
    bits.push(`${pad}  font: ${s.fontFamily} ${s.fontWeight} ${s.fontSize}px lh=${s.lineHeightPx}px ls=${s.letterSpacing}`);
  }
  if (node.layoutMode) {
    bits.push(
      `${pad}  layout: ${node.layoutMode} gap=${node.itemSpacing} pad=${node.paddingTop}/${node.paddingRight}/${node.paddingBottom}/${node.paddingLeft}`
    );
  }
  if (node.characters) bits.push(`${pad}  text: ${JSON.stringify(node.characters.slice(0, 60))}`);
  lines.push(bits.join('\n'));
  for (const child of node.children ?? []) walk(child, depth + 1, lines, origin);
}

const lines = [];
for (const id of NODE_IDS) {
  const doc = nodes.nodes[id]?.document;
  if (!doc) continue;
  lines.push(`\n===== ${id} =====`);
  walk(doc, 0, lines);
}
await writeFile(join(root, 'out', 'figma-summary.txt'), lines.join('\n'));
console.log('ok: out/figma-summary.txt');
