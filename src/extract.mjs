#!/usr/bin/env node
/**
 * extract.mjs — transporte WordPress via REST público + parse.
 *
 * REST é o caminho OFICIAL para posts, por decisão do Huxley (22/07/2026):
 *   - wordpress-mcp não expõe ability de posts (só WooCommerce/Jetpack
 *     Forms/SMTP/Akismet)
 *   - wpcom-mcp bloqueia posts.* atrás de plano Jetpack pago
 * Se um MCP com posts aparecer no futuro, ele assume o transporte e o
 * parse continua no parse-post.mjs (parser puro, contrato estável).
 *
 * Uso: node src/extract.mjs <url-do-post>
 * Saída: estrutura do parse-post.mjs.
 */

import { parsePost } from './parse-post.mjs';

const WP_BASE = 'https://punkmetrics.com/wp-json/wp/v2';

const input = process.argv.filter((a) => a.startsWith('http'))[0];
if (!input) {
  console.error('Uso: node src/extract.mjs <url-do-post>');
  process.exit(1);
}

const slug = new URL(input).pathname.replace(/\/+$/, '').split('/').pop();
if (!slug) {
  console.error(`ERRO: não consegui derivar o slug de ${input}`);
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${WP_BASE}${path}`);
  if (!res.ok) throw new Error(`WP REST ${res.status} em ${path}`);
  return res.json();
}

const posts = await get(
  `/posts?slug=${encodeURIComponent(slug)}&_fields=id,slug,link,title,excerpt,content,categories,tags`
);
if (!posts.length) {
  console.error(`ERRO: post não encontrado para slug "${slug}"`);
  process.exit(1);
}
const post = posts[0];

const [cats, tags] = await Promise.all([
  post.categories.length
    ? get(`/categories?include=${post.categories.join(',')}&_fields=id,name`)
    : [],
  post.tags.length ? get(`/tags?include=${post.tags.join(',')}&_fields=id,name`) : [],
]);

// normaliza para o contrato do parse-post.mjs
const payload = {
  title: post.title.rendered,
  contentHtml: post.content.rendered,
  excerpt: post.excerpt.rendered,
  link: post.link,
  slug: post.slug,
  categoria: cats[0]?.name ?? null,
  tags: tags.map((t) => t.name),
};

console.log(JSON.stringify(parsePost(payload), null, 2));
