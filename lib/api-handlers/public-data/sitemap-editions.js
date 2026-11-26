const { connectDatabase } = require('../../db');
const News = require('../../news');
const DailyDigest = require('../../daily-digest');
const WeeklyEdition = require('../../weekly-edition');
const { editionKey } = require('../../digest-schedule');

/* Sitemap das edições publicadas: cada edição do site, cada resumo diário
   enviado e cada semanal publicada tem endereço próprio (?date=, ?data=,
   ?slug=) e precisa ser descoberta pelos buscadores. O sitemap.xml estático
   lista as páginas fixas; este é servido em /sitemap-edicoes.xml. */

const SITE = 'https://kingsnewsletter.com';
const LIMIT = 5000;
const CACHE = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';

const xml = value => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const day = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

function renderSitemap(entries) {
  const urls = entries.map(({ loc, lastmod }) =>
    `  <url>\n    <loc>${xml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

async function collectEntries() {
  const [editions, digests, weeklies] = await Promise.all([
    News.aggregate([
      { $addFields: { _sort: { $dateFromString: { dateString: '$editionDate', format: '%d/%m/%Y', onError: null, onNull: null } } } },
      { $match: { _sort: { $ne: null } } },
      { $group: { _id: '$editionDate', updatedAt: { $max: '$updatedAt' }, _sort: { $max: '$_sort' } } },
      { $sort: { _sort: -1 } },
      { $limit: LIMIT }
    ]),
    DailyDigest.find({ status: 'sent' }).select('editionDate sentAt updatedAt').sort({ sentAt: -1 }).limit(LIMIT).lean(),
    WeeklyEdition.find({ status: 'published' }).select('slug publishedAt updatedAt').sort({ weekStart: -1 }).limit(LIMIT).lean()
  ]);

  const entries = editions.map(row => ({
    loc: `${SITE}/editions?date=${row._id}`,
    lastmod: day(row.updatedAt) || day(row._sort)
  }));

  // Um resumo por dia (o mais recente enviado), como na página pública.
  const seen = new Set();
  digests.forEach(digest => {
    const key = editionKey(digest.editionDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || seen.has(key)) return;
    seen.add(key);
    entries.push({ loc: `${SITE}/resumo-diario?data=${key}`, lastmod: day(digest.updatedAt) || day(digest.sentAt) });
  });

  weeklies.forEach(edition => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edition.slug || '')) return;
    entries.push({ loc: `${SITE}/weekly?slug=${edition.slug}`, lastmod: day(edition.updatedAt) || day(edition.publishedAt) });
  });

  return entries;
}

module.exports = async function sitemapEditions(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  try {
    await connectDatabase();
    const body = renderSitemap(await collectEntries());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', CACHE);
    return res.status(200).send(body);
  } catch (error) {
    console.error(JSON.stringify({ event: 'sitemap.editions.failed', name: error?.name || 'Error' }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end();
  }
};

module.exports.renderSitemap = renderSitemap;
