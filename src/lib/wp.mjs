/**
 * wp.mjs: transporte de posts WordPress pelo REST público.
 *
 * A base da API sai da própria URL do post (origem + /wp-json/wp/v2).
 * Se a raiz não tiver o post (WordPress em subdiretório, ou outro site
 * na raiz do domínio), a base é descoberta pelo cabeçalho Link ou pelo
 * <link rel="https://api.w.org/"> que todo WordPress publica no HTML.
 *
 * Devolve o payload normalizado que o parse-post.mjs consome:
 *   { title, contentHtml, excerpt, link, slug, categoria, tags }
 */

export class WpError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WpError';
  }
}

const REL_API = 'https://api.w.org/';
const CAMPOS = 'id,slug,link,title,excerpt,content,categories,tags';

const decodificar = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// O slug vira nome de pasta e aparece no HTML do preview: nada que saia da
// pasta de saída nem que vire tag.
const SLUG_PROIBIDO = /[\/\\<>\0]|\.\./;
const slugSeguro = (slug, origem) => {
  if (!slug || SLUG_PROIBIDO.test(slug)) throw new WpError(`Slug inválido vindo de ${origem}: ${JSON.stringify(slug)}.`);
  return slug;
};

const decodificarUrl = (u) => {
  try {
    return decodeURI(u);
  } catch {
    return u;
  }
};

const baseDeHref = (href) => (href && !href.includes('?') ? href.replace(/\/+$/, '') + '/wp/v2' : null);

export function slugFromUrl(url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    throw new WpError(`URL inválida: ${url}`);
  }
  const ultimo = path.replace(/\/+$/, '').split('/').pop();
  if (!ultimo) throw new WpError(`Não consegui tirar o slug de ${url}. Use a URL completa do post.`);
  return slugSeguro(decodificar(ultimo), url);
}

export function discoverApiBase(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel=["']([^"']*)["']/i)?.[1];
    if (rel !== REL_API) continue;
    return baseDeHref(tag.match(/\bhref=["']([^"']*)["']/i)?.[1]);
  }
  return null;
}

function baseDoCabecalho(link) {
  for (const parte of (link ?? '').split(',')) {
    const m = parte.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (m && m[2] === REL_API) return baseDeHref(m[1]);
  }
  return null;
}

export async function fetchPost(url, { fetch = globalThis.fetch } = {}) {
  const slug = slugFromUrl(url);
  const { origin, host } = new URL(url);

  const get = async (u) => {
    try {
      return await fetch(u);
    } catch (e) {
      throw new WpError(`Não consegui acessar ${host}: ${e.cause?.message ?? e.message}.`);
    }
  };

  const buscar = async (base) => {
    const res = await get(`${base}/posts?slug=${encodeURIComponent(slug)}&_fields=${CAMPOS}`);
    if (!res.ok) return { status: res.status, post: null };
    const lista = await res.json().catch(() => null);
    return { status: res.status, post: Array.isArray(lista) ? (lista[0] ?? null) : null };
  };

  const raiz = `${origin}/wp-json/wp/v2`;
  let base = raiz;
  let achado = await buscar(raiz);
  let descoberta = null;

  if (!achado.post) {
    const pagina = await get(url);
    const html = pagina.ok ? await pagina.text() : '';
    descoberta = baseDoCabecalho(pagina.headers.get('link')) ?? discoverApiBase(html);
    if (descoberta && descoberta !== raiz) {
      base = descoberta;
      achado = await buscar(base);
    }
  }

  if (!achado.post) {
    if (!descoberta) {
      throw new WpError(`Não parece um WordPress com REST público. Tentei ${raiz} e o HTML da página.`);
    }
    if (achado.status === 401 || achado.status === 403) {
      throw new WpError(`O WordPress deste site bloqueia o REST público (HTTP ${achado.status}).`);
    }
    if (achado.status >= 400) {
      throw new WpError(`O REST do WordPress respondeu HTTP ${achado.status} em ${base}.`);
    }
    throw new WpError(`Post não encontrado para o slug ${slug}.`);
  }

  const post = achado.post;
  const taxonomia = async (rota, ids) => {
    if (!ids?.length) return [];
    const res = await get(`${base}/${rota}?include=${ids.join(',')}&_fields=id,name`);
    return res.ok ? res.json().catch(() => []) : [];
  };
  const [cats, tags] = await Promise.all([taxonomia('categories', post.categories), taxonomia('tags', post.tags)]);

  return {
    title: post.title?.rendered ?? '',
    contentHtml: post.content?.rendered ?? '',
    excerpt: post.excerpt?.rendered ?? '',
    link: decodificarUrl(post.link),
    slug: slugSeguro(decodificar(post.slug), host),
    categoria: cats[0]?.name ?? null,
    tags: tags.map((t) => t.name),
  };
}
