const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const control = require('../api/control');
const vercel = require('../vercel.json');
const { renderSitemap } = require('../lib/api-handlers/public-data/sitemap-editions');

const PUBLIC = path.join(__dirname, '..', 'public');
const SITE = 'https://kingsnewsletter.com';
const PARTIALS = new Set(['footer.html', 'navigation.html', 'admin.html']);
const NOINDEX = new Set(['404.html', 'results-12axes.html', 'subscription-status.html']);
// O canonical destas muda com ?date/?data/?slug e é definido por seo-meta.js.
const DYNAMIC = new Set(['editions.html', 'resumo-diario.html', 'weekly.html']);

const pages = fs.readdirSync(PUBLIC).filter(name => name.endsWith('.html') && !PARTIALS.has(name));
const headOf = name => fs.readFileSync(path.join(PUBLIC, name), 'utf8').split('</head>')[0].split('<head>')[1];
const meta = (head, attr, key) => head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

test('every public page has a title and a search description of sane length', () => {
  for (const name of pages) {
    const head = headOf(name);
    const title = head.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = meta(head, 'name', 'description');
    assert.ok(title && title.length <= 80, `${name}: título ausente ou longo`);
    assert.ok(description && description.length >= 50 && description.length <= 165, `${name}: descrição fora de 50–165 caracteres`);
    assert.match(head, /^\s*<meta charset="utf-8">/, `${name}: charset deve ser a primeira tag do head`);
  }
});

test('indexable pages declare canonical, Open Graph, Twitter and valid JSON-LD', () => {
  for (const name of pages.filter(page => !NOINDEX.has(page))) {
    const head = headOf(name);
    if (DYNAMIC.has(name)) assert.match(head, /src="\/js\/seo-meta\.js"/, `${name}: falta seo-meta.js`);
    else assert.match(head, new RegExp(`<link rel="canonical" href="${SITE}/`), `${name}: falta canonical`);
    for (const key of ['og:title', 'og:description', 'og:image', 'og:image:alt']) {
      assert.ok(meta(head, 'property', key), `${name}: falta ${key}`);
    }
    for (const key of ['twitter:card', 'twitter:title', 'twitter:image']) {
      assert.ok(meta(head, 'name', key), `${name}: falta ${key}`);
    }
    const blocks = [...head.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
    assert.ok(blocks.length, `${name}: falta JSON-LD`);
    blocks.forEach(block => assert.doesNotThrow(() => JSON.parse(block[1]), `${name}: JSON-LD inválido`));
  }
});

test('noindex pages stay out of search', () => {
  for (const name of NOINDEX) {
    assert.equal(meta(headOf(name), 'name', 'robots'), 'noindex,follow', name);
  }
});

test('robots.txt lets crawlers render public data but keeps admin APIs blocked', () => {
  const robots = fs.readFileSync(path.join(PUBLIC, 'robots.txt'), 'utf8');
  for (const api of ['/api/news', '/api/daily-digests', '/api/weekly-editions']) {
    assert.match(robots, new RegExp(`^Allow: ${api}$`, 'm'));
  }
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.doesNotMatch(robots, /^Allow: \/api\/admin/m);
  assert.match(robots, /^Sitemap: https:\/\/kingsnewsletter\.com\/sitemap-edicoes\.xml$/m);
});

test('static sitemap lists every indexable page', () => {
  const sitemap = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
  for (const name of pages.filter(page => !NOINDEX.has(page))) {
    const canonical = name === 'index.html' ? `${SITE}/` : `${SITE}/${name.replace(/\.html$/, '')}`;
    assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${name} fora do sitemap.xml`);
  }
});

test('editions sitemap escapes URLs and is routed on Vercel and in the control router', () => {
  const xml = renderSitemap([{ loc: `${SITE}/weekly?slug=a&b`, lastmod: '2026-11-25' }]);
  assert.match(xml, /<loc>https:\/\/kingsnewsletter\.com\/weekly\?slug=a&amp;b<\/loc>/);
  assert.match(xml, /<lastmod>2026-11-25<\/lastmod>/);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/sitemap-edicoes.xml' &&
    rule.destination === '/api/control?route=sitemap/editions'));
  const response = { statusCode: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, end() { return this; } };
  control({ query: { route: 'sitemap/editions' }, method: 'POST' }, response);
  assert.equal(response.statusCode, 405);
});

const editionPage = require('../lib/api-handlers/public-data/edition-page');

const pageResponse = () => ({
  statusCode: null, headers: {}, body: null,
  setHeader(key, value) { this.headers[key] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  send(body) { this.body = body; return this; }
});

test('edition pages get title, description, image, canonical and JSON-LD in the raw HTML', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'resumo-diario.html'), 'utf8');
  const out = editionPage.applyMeta(html, {
    canonical: `${SITE}/resumo-diario?data=2026-11-25`,
    title: 'Promessas & tarifas | Resumo de 25 de novembro de 2026 | King\'s Newsletter',
    description: 'Do subsídio ao diesel aos "lixões" fora do prazo.',
    image: 'https://upload.wikimedia.org/foto.jpg',
    imageAlt: 'Porto de Benghazi',
    type: 'article',
    publishedTime: '2026-11-25T22:15:13.574Z',
    jsonld: { '@type': 'NewsArticle', headline: 'a</script><b>' }
  });
  const head = out.split('</head>')[0];
  assert.match(head, /<title>Promessas &amp; tarifas \| Resumo de 25 de novembro de 2026/);
  assert.match(head, /<meta name="description" content="Do subsídio ao diesel aos &quot;lixões&quot; fora do prazo.">/);
  assert.match(head, /<link rel="canonical" href="https:\/\/kingsnewsletter\.com\/resumo-diario\?data=2026-11-25">/);
  assert.match(head, /<meta property="og:url" content="https:\/\/kingsnewsletter\.com\/resumo-diario\?data=2026-11-25">/);
  assert.match(head, /<meta property="og:image" content="https:\/\/upload\.wikimedia\.org\/foto\.jpg">/);
  assert.match(head, /<meta name="twitter:image" content="https:\/\/upload\.wikimedia\.org\/foto\.jpg">/);
  assert.match(head, /<meta property="og:type" content="article">/);
  assert.match(head, /<meta property="article:published_time" content="2026-11-25T22:15:13.574Z">/);
  assert.doesNotMatch(head, /og:image:width/);
  assert.equal((head.match(/rel="canonical"/g) || []).length, 1);
  // JSON-LD não pode fechar a tag <script> antes da hora.
  assert.doesNotMatch(head, /a<\/script><b>/);
  assert.match(head, /data-seo="edition">\{"@type":"NewsArticle"/);
});

test('missing editions are served as noindex', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'weekly.html'), 'utf8');
  assert.match(editionPage.markNotFound(html), /<meta name="robots" content="noindex,follow">/);
});

test('edition page without a parameter serves the static page unchanged', async () => {
  const response = pageResponse();
  await editionPage.daily({ query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, fs.readFileSync(path.join(PUBLIC, 'resumo-diario.html'), 'utf8'));
  assert.match(response.headers['Content-Type'], /text\/html/);
  assert.ok(response.headers['Content-Security-Policy']);
});

test('Vercel sends edition URLs with a parameter to the meta function and bundles the templates', () => {
  const routes = { '/editions': ['date', 'page/news'], '/weekly': ['slug', 'page/weekly'], '/resumo-diario': ['data', 'page/daily'] };
  for (const [source, [key, route]] of Object.entries(routes)) {
    const rules = vercel.rewrites.filter(rule => rule.source === source);
    assert.deepEqual(rules[0].has, [{ type: 'query', key }], `${source}: regra com parâmetro deve vir primeiro`);
    assert.equal(rules[0].destination, `/api/control?route=${route}`);
    assert.equal(rules[1].destination, `${source}.html`);
  }
  const include = vercel.functions['api/control.js'].includeFiles;
  for (const file of ['editions', 'resumo-diario', 'weekly']) assert.ok(include.includes(file));
});

test('link previews use a 960px Wikimedia thumbnail instead of the original file', () => {
  assert.equal(
    editionPage.previewImage('https://upload.wikimedia.org/wikipedia/commons/6/6c/Port_of_Benghazi_2.jpg?utm_campaign=index'),
    'https://commons.wikimedia.org/wiki/Special:FilePath/Port_of_Benghazi_2.jpg?width=960'
  );
  assert.equal(editionPage.previewImage('https://example.com/foto.jpg'), 'https://example.com/foto.jpg');
  assert.equal(editionPage.previewImage('https://upload.wikimedia.org/wikipedia/commons/a/ab/Mapa.svg'), 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Mapa.svg');
});
