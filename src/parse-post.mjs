#!/usr/bin/env node
/**
 * parse-post.mjs: parser puro do post do blog. SEM rede.
 *
 * O transporte é responsabilidade de quem chama: extract.mjs busca o post
 * pelo REST público (lib/wp.mjs) e passa o payload normalizado para cá.
 *
 * Entrada (arquivo JSON ou stdin), formato normalizado:
 *   { title, contentHtml, excerpt?, link, slug, categoria?, tags? }
 *
 * Saída (stdout): { title, lead, sections, categoria, tags, temVideo, url, slug }
 */

import { readFile } from 'node:fs/promises';

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8220;|&#8221;/g, '"');

const strip = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

const isComercial = (txt) =>
  /courses\/|\bcupom\b|banner|posts? relacionad|related posts/i.test(txt);

const paragrafo = (bloco) =>
  [...bloco.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => strip(m[1]))
    .filter((t) => t.length > 40 && !isComercial(t));

const listas = (bloco) =>
  [...bloco.matchAll(/<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi)].flatMap((m) =>
    [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((li) => strip(li[1]))
  );

/** Transforma o payload normalizado na estrutura que alimenta o deck. */
export function parsePost(input) {
  const html = input.contentHtml;
  if (!html) throw new Error('payload sem contentHtml');

  const temVideo = /youtube\.com|youtu\.be|vimeo\.com|wp-block-embed/i.test(html);

  const parts = html.split(/<h2[^>]*>/i);
  const abertura = parts.shift() ?? '';

  const sections = parts
    .map((raw) => {
      const heading = strip(raw.slice(0, raw.indexOf('</h2>')));
      const corpo = raw.slice(raw.indexOf('</h2>') + 5);
      const comercialNoHtml = /href="[^"]*\/courses\//i.test(corpo) && paragrafo(corpo).length <= 1;
      return {
        heading,
        comercialNoHtml,
        paragraphs: paragrafo(corpo),
        listItems: listas(corpo).filter((t) => !isComercial(t)),
      };
    })
    .filter((s) => s.heading && !isComercial(s.heading) && !s.comercialNoHtml)
    .map(({ comercialNoHtml, ...s }) => s)
    .filter((s) => s.paragraphs.length || s.listItems.length);

  return {
    title: strip(input.title ?? ''),
    lead: paragrafo(abertura)[0] ?? strip(input.excerpt ?? ''),
    sections,
    categoria: input.categoria ? decode(input.categoria) : null,
    tags: (input.tags ?? []).map(decode),
    temVideo,
    url: input.link,
    slug: input.slug,
  };
}

// ---- CLI: node src/parse-post.mjs <post.json>  (ou stdin) -------------
const ehCli = import.meta.url.endsWith(process.argv[1]?.split('/').pop() ?? '\0');
if (ehCli) {
  const src = process.argv[2];
  const raw = src
    ? await readFile(src, 'utf8')
    : await new Promise((ok) => {
        let s = '';
        process.stdin.on('data', (d) => (s += d)).on('end', () => ok(s));
      });
  console.log(JSON.stringify(parsePost(JSON.parse(raw)), null, 2));
}
