const fs = require('node:fs');
const path = require('node:path');
const { connectDatabase } = require('../../db');
const News = require('../../news');
const Edition = require('../../edition');
const DailyDigest = require('../../daily-digest');
const WeeklyEdition = require('../../weekly-edition');
const { securityHeaders } = require('../../security-headers');
const { editionKey, editionDateVariants } = require('../../digest-schedule');
const { calendarDateKey } = require('../../news-date');

/* Página de uma edição com as metas já no HTML.
   WhatsApp, X, Facebook, Telegram e LinkedIn montam a prévia do link sem
   executar JavaScript; por isso /resumo-diario?data=, /weekly?slug= e
   /editions?date= passam por aqui: o HTML estático da página recebe título,
   descrição, imagem, canonical e JSON-LD da edição. O resto da página é o
   mesmo arquivo de public/, e seo-meta.js continua atualizando no navegador. */

const SITE = 'https://kingsnewsletter.com';
const SITE_NAME = "King's Newsletter";
const LOGO = SITE + '/assets/icons/kings-newsletter-icon-128.png';
const CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';

const PAGES = {
  daily: { file: 'resumo-diario.html', path: '/resumo-diario', param: 'data' },
  weekly: { file: 'weekly.html', path: '/weekly', param: 'slug' },
  news: { file: 'editions.html', path: '/editions', param: 'date' }
};

const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', 'public');
const templates = new Map();

function template(kind) {
  if (!templates.has(kind)) {
    templates.set(kind, fs.readFileSync(path.join(PUBLIC_DIR, PAGES[kind].file), 'utf8'));
  }
  return templates.get(kind);
}

/* ---------------------------------------------------------------- */
/* Texto                                                             */
/* ---------------------------------------------------------------- */

const text = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

const clip = (value, max) => {
  const clean = text(value);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
};

// Primeira linha com conteúdo (resumos usam uma linha por parágrafo).
const firstLine = value => String(value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';

const attr = value => String(value)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const httpsUrl = value => {
  try {
    const url = new URL(text(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

/* Prévia de link: original do Wikimedia Commons pode ter vários MB e o
   WhatsApp descarta imagens grandes; usa a miniatura de 960 px do próprio
   Commons. Outros endereços seguem como estão. */
const previewImage = url => {
  const match = url && url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#].*)?$/i);
  // Special:FilePath com width entrega a miniatura de 960 px (aceita pelas prévias, que pedem ao menos 600 px), ou o original quando ele já é menor.
  return match ? `https://commons.wikimedia.org/wiki/Special:FilePath/${match[3]}?width=960` : url;
};

const longDate = key => {
  const date = new Date(key + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? key : new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(date).replace(/^1 /, '1º ');
};

const iso = value => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const publisher = {
  '@type': 'NewsMediaOrganization',
  '@id': SITE + '/#organization',
  name: SITE_NAME,
  url: SITE + '/',
  logo: { '@type': 'ImageObject', url: LOGO, width: 128, height: 128 }
};

function newsArticle({ canonical, headline, description, datePublished, dateModified, images, section, keywords }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: clip(headline, 110),
    description: clip(description, 300),
    url: canonical,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'pt-BR',
    datePublished,
    dateModified: dateModified || datePublished,
    image: images.length ? images : [SITE + '/assets/og-image.png'],
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE + '/' },
    publisher,
    isAccessibleForFree: true,
    articleSection: section,
    keywords: keywords.length ? keywords.join(', ') : undefined
  };
}

/* ---------------------------------------------------------------- */
/* Metas de cada tipo (null = edição não encontrada)                 */
/* ---------------------------------------------------------------- */

const rankOf = story => (Number.isFinite(story.editorialRank) ? story.editorialRank : Number.MAX_SAFE_INTEGER);

async function dailyMeta(value) {
  const key = calendarDateKey(value);
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const digest = await DailyDigest.findOne({ status: 'sent', editionDate: { $in: editionDateVariants(key) } })
    .select('editionDate headline subject preheader sentAt updatedAt stories.title stories.summary stories.category stories.image stories.editorialRank')
    .sort({ sentAt: -1 }).lean();
  if (!digest) return null;
  const stories = (digest.stories || [])
    .map((story, index) => ({ story, index }))
    .sort((a, b) => rankOf(a.story) - rankOf(b.story) || a.index - b.index)
    .map(({ story }) => story)
    .filter(story => text(story.title));
  const canonical = `${SITE}/resumo-diario?data=${editionKey(digest.editionDate)}`;
  const headline = text(digest.headline) || text(digest.subject) || 'O Dia em Perspectiva';
  const description = clip(digest.preheader || firstLine(stories[0]?.summary), 158);
  const withImage = stories.filter(story => httpsUrl(story.image?.url));
  const images = withImage.map(story => httpsUrl(story.image.url));
  return {
    canonical,
    title: `${headline} | Resumo de ${longDate(key)} | ${SITE_NAME}`,
    description,
    image: images[0],
    imageAlt: text(withImage[0]?.image?.alt) || headline,
    type: 'article',
    publishedTime: iso(digest.sentAt),
    jsonld: newsArticle({
      canonical, headline, description,
      datePublished: iso(digest.sentAt) || `${key}T12:00:00.000Z`,
      dateModified: iso(digest.updatedAt),
      images: images.slice(0, 3),
      section: 'O Dia em Perspectiva',
      keywords: [...new Set(stories.map(story => text(story.category)).filter(Boolean))]
    })
  };
}

async function weeklyMeta(value) {
  const slug = text(value).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const edition = await WeeklyEdition.findOne({ slug, status: 'published' })
    .select('slug title subtitle intro publishedAt updatedAt weekEnd sections.title sections.stories.imageUrl sections.stories.title')
    .lean();
  if (!edition) return null;
  const canonical = `${SITE}/weekly?slug=${slug}`;
  const headline = text(edition.title) || 'A Semana em Foco';
  const description = clip(firstLine(edition.intro) || edition.subtitle || headline, 158);
  const stories = (edition.sections || []).flatMap(section => section.stories || []);
  const images = stories.map(story => httpsUrl(story.imageUrl)).filter(Boolean);
  return {
    canonical,
    title: /king['’]s newsletter/i.test(headline) ? headline : `${headline} | ${SITE_NAME}`,
    description,
    image: images[0],
    imageAlt: headline,
    type: 'article',
    publishedTime: iso(edition.publishedAt),
    jsonld: newsArticle({
      canonical, headline, description,
      datePublished: iso(edition.publishedAt) || iso(edition.weekEnd),
      dateModified: iso(edition.updatedAt),
      images: images.slice(0, 3),
      section: 'A Semana em Foco',
      keywords: (edition.sections || []).map(section => text(section.title)).filter(Boolean)
    })
  };
}

async function newsMeta(value) {
  const date = text(value);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return null;
  const [stories, edition] = await Promise.all([
    News.find({ editionDate: date }).select('title category headline image publishedAt').sort({ headline: -1, _id: -1 }).lean(),
    Edition.findOne({ editionDate: date }).select('issueNumber').lean()
  ]);
  if (!stories.length) return null;
  const canonical = `${SITE}/editions?date=${date}`;
  const lead = stories.find(story => story.headline) || stories[0];
  const issue = Number.isFinite(edition?.issueNumber) ? `Edição #${String(edition.issueNumber).padStart(3, '0')} • ` : '';
  const titles = stories.slice(0, 4).map(story => text(story.title)).filter(Boolean);
  const withImage = [lead, ...stories].find(story => httpsUrl(story.image?.url));
  return {
    canonical,
    title: `Notícias de ${date}: ${text(lead.title)} | ${SITE_NAME}`,
    description: clip(`${issue}${date}: ${stories.length} notícias com contexto — ${titles.join('; ')}`, 158),
    image: withImage ? httpsUrl(withImage.image.url) : null,
    imageAlt: text(withImage?.image?.alt) || text(withImage?.title),
    type: 'website',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Notícias de ${date} | ${SITE_NAME}`,
      url: canonical,
      inLanguage: 'pt-BR',
      about: [...new Set(stories.map(story => text(story.category)).filter(Boolean))].map(name => ({ '@type': 'Thing', name })),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: stories.length,
        itemListElement: stories.slice(0, 30).map((story, index) => ({
          '@type': 'ListItem', position: index + 1, name: text(story.title), url: `${canonical}#noticia-${index + 1}`
        }))
      }
    }
  };
}

const LOADERS = { daily: dailyMeta, weekly: weeklyMeta, news: newsMeta };

/* ---------------------------------------------------------------- */
/* Troca das metas no HTML                                           */
/* ---------------------------------------------------------------- */

function setMeta(html, attrName, key, value) {
  const tag = `<meta ${attrName}="${key}" content="${attr(value)}">`;
  const pattern = new RegExp(`<meta ${attrName}="${key.replace(/[:]/g, '\\:')}" content="[^"]*">`);
  return pattern.test(html) ? html.replace(pattern, () => tag) : html.replace('</head>', () => `  ${tag}\n</head>`);
}

function applyMeta(html, meta) {
  let out = html.replace(/<title>[^<]*<\/title>/, () => `<title>${attr(meta.title)}</title>`);
  out = setMeta(out, 'name', 'description', meta.description);
  out = setMeta(out, 'property', 'og:title', meta.title);
  out = setMeta(out, 'property', 'og:description', meta.description);
  out = setMeta(out, 'property', 'og:url', meta.canonical);
  out = setMeta(out, 'property', 'og:type', meta.type);
  out = setMeta(out, 'name', 'twitter:title', meta.title);
  out = setMeta(out, 'name', 'twitter:description', meta.description);
  if (meta.image) {
    const image = previewImage(meta.image);
    out = setMeta(out, 'property', 'og:image', image);
    out = setMeta(out, 'name', 'twitter:image', image);
    out = setMeta(out, 'property', 'og:image:alt', meta.imageAlt || meta.title);
    out = setMeta(out, 'name', 'twitter:image:alt', meta.imageAlt || meta.title);
    // As medidas declaradas são as do og-image padrão, não as da foto.
    out = out.replace(/[ \t]*<meta property="og:image:(?:width|height)" content="[^"]*">\r?\n?/g, '');
  }
  if (meta.publishedTime) out = setMeta(out, 'property', 'article:published_time', meta.publishedTime);
  const canonical = `<link rel="canonical" href="${attr(meta.canonical)}">`;
  out = /<link rel="canonical"[^>]*>/.test(out)
    ? out.replace(/<link rel="canonical"[^>]*>/, () => canonical)
    : out.replace(/(<meta name="robots"[^>]*>)/, (match) => `${match}\n  ${canonical}`);
  if (meta.jsonld) {
    const json = JSON.stringify(meta.jsonld).replace(/</g, '\\u003c');
    out = out.replace('<script src="/js/seo-meta.js"></script>',
      () => `<script type="application/ld+json" data-seo="edition">${json}</script>\n  <script src="/js/seo-meta.js"></script>`);
  }
  return out;
}

// Edição inexistente: a página mostra a mensagem de erro e não deve ser indexada.
const markNotFound = html => html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,follow">');

function createEditionPage(kind) {
  const page = PAGES[kind];
  return async function editionPage(req, res) {
    securityHeaders(req, res, () => {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const html = template(kind);
    const value = typeof req.query?.[page.param] === 'string' ? req.query[page.param] : '';
    if (!value) {
      res.setHeader('Cache-Control', CACHE);
      return res.status(200).send(html);
    }
    try {
      await connectDatabase();
      const meta = await LOADERS[kind](value);
      if (!meta) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
        return res.status(404).send(markNotFound(html));
      }
      res.setHeader('Cache-Control', CACHE);
      return res.status(200).send(applyMeta(html, meta));
    } catch (error) {
      // Sem banco a página ainda funciona: o navegador busca a edição pela API.
      console.error(JSON.stringify({ event: 'edition_page.failed', kind, name: error?.name || 'Error' }));
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(html);
    }
  };
}

module.exports = {
  daily: createEditionPage('daily'),
  weekly: createEditionPage('weekly'),
  news: createEditionPage('news'),
  applyMeta,
  previewImage,
  markNotFound,
  PAGES
};
