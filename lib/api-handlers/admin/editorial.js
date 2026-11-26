const mongoose = require('mongoose');
const { isSessionValid } = require('../../admin-auth');
const { connectAdminDatabase } = require('../../admin-db');
const News = require('../../news');
const DailyDigest = require('../../daily-digest');
const WeeklyEdition = require('../../weekly-edition');
const { editionKey } = require('../../digest-schedule');

/* Editorial: lê e corrige o texto já publicado das notícias do site, dos
   resumos diários e das edições semanais. Só edita o que existe (sem criar,
   apagar ou reordenar) e guarda os campos internos de cada documento. */

const TYPES = ['news', 'daily', 'weekly'];
const DATE_PATTERN = /^\d{2}\/\d{2}\/\d{4}$/;
// A lista do editor é agrupada por mês no painel; um ano de edições cabe bem.
const LIST_LIMIT = 400;
const LIMITS = { short: 300, label: 120, url: 2048, text: 20000, list: 60 };

class EditorialError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function text(value, field, { max = LIMITS.text, required = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new EditorialError(`O campo “${field}” precisa ser texto.`);
  const clean = value.replace(/\r\n/g, '\n').trim();
  if (required && !clean) throw new EditorialError(`Preencha o campo “${field}”.`);
  if (clean.length > max) throw new EditorialError(`O campo “${field}” passou de ${max} caracteres.`);
  return clean;
}

// Link opcional; quando informado precisa ser http(s) (imagens: só https).
function link(value, field, { httpsOnly = false, required = false } = {}) {
  const clean = text(value, field, { max: LIMITS.url, required });
  if (!clean) return '';
  let url;
  try {
    url = new URL(clean);
  } catch {
    throw new EditorialError(`O campo “${field}” não é um link válido.`);
  }
  const allowed = httpsOnly ? ['https:'] : ['http:', 'https:'];
  if (!allowed.includes(url.protocol) || url.username || url.password) {
    throw new EditorialError(`O campo “${field}” precisa ser um link ${httpsOnly ? 'https' : 'http(s)'}.`);
  }
  return url.href;
}

function lines(value, field) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
  if (items.length > LIMITS.list) throw new EditorialError(`“${field}” aceita até ${LIMITS.list} itens.`);
  return items.map((item, index) => text(String(item ?? ''), `${field} (${index + 1})`, { max: 1000 })).filter(Boolean);
}

function storyList(value, current, label) {
  if (!Array.isArray(value)) throw new EditorialError(`Envie a lista de ${label}.`);
  if (value.length !== current.length) {
    throw new EditorialError(`A quantidade de ${label} mudou. Recarregue o editor e tente de novo.`, 409);
  }
  return value;
}

/* ---------------------------------------------------------------- */
/* Saneamento (sem banco: testável isoladamente)                      */
/* ---------------------------------------------------------------- */

function sanitizeNewsStory(input) {
  if (!isPlainObject(input)) throw new EditorialError('Dados da notícia inválidos.');
  const imageUrl = link(input.imageUrl, 'Link da imagem', { httpsOnly: true });
  const story = {
    category: text(input.category, 'Categoria', { max: LIMITS.label, required: true }),
    title: text(input.title, 'Título', { max: LIMITS.short, required: true }),
    summary: text(input.summary, 'Resumo', { required: true }),
    context: text(input.context, 'Contexto', { required: true }),
    source: text(input.source, 'Fonte', { max: LIMITS.short, required: true }),
    publishedAt: text(input.publishedAt, 'Data de publicação', { max: 40, required: true }),
    url: link(input.url, 'Link da fonte', { required: true })
  };
  const imageAlt = text(input.imageAlt, 'Texto alternativo da imagem', { max: LIMITS.short });
  return { story, image: imageUrl ? { url: imageUrl, alt: imageAlt || story.title } : null };
}

function sanitizeDigestStory(input, current, index) {
  if (!isPlainObject(input)) throw new EditorialError(`Dados da notícia ${index + 1} inválidos.`);
  const n = ` (notícia ${index + 1})`;
  const imageUrl = link(input.imageUrl, 'Link da imagem' + n, { httpsOnly: true });
  const story = {
    ...current,
    category: text(input.category, 'Categoria' + n, { max: LIMITS.label }),
    title: text(input.title, 'Título' + n, { max: LIMITS.short, required: true }),
    summary: text(input.summary, 'Resumo' + n),
    context: text(input.context, 'Contexto' + n),
    contextLabel: text(input.contextLabel, 'Rótulo do contexto' + n, { max: 80 }),
    source: text(input.source, 'Fonte' + n, { max: LIMITS.short }),
    articleUrl: link(input.articleUrl, 'Link da fonte' + n)
  };
  if (imageUrl) {
    story.image = {
      ...(isPlainObject(current.image) ? current.image : {}),
      url: imageUrl,
      alt: text(input.imageAlt, 'Texto alternativo' + n, { max: LIMITS.short }),
      caption: text(input.imageCaption, 'Legenda' + n, { max: 500 }),
      credit: text(input.imageCredit, 'Crédito' + n, { max: LIMITS.short })
    };
  } else {
    delete story.image;
  }
  return story;
}

function mergeDigest(current, input) {
  if (!isPlainObject(input)) throw new EditorialError('Dados do resumo inválidos.');
  const stories = storyList(input.stories, current.stories || [], 'notícias');
  return {
    subject: text(input.subject, 'Assunto do e-mail', { max: LIMITS.short, required: true }),
    preheader: text(input.preheader, 'Pré-cabeçalho', { max: 500 }),
    headline: text(input.headline, 'Manchete', { max: LIMITS.short }),
    watchNext: lines(input.watchNext, 'O que acompanhar'),
    stories: stories.map((story, index) => sanitizeDigestStory(story, current.stories[index] || {}, index))
  };
}

function mergeWeekly(current, input) {
  if (!isPlainObject(input)) throw new EditorialError('Dados da edição inválidos.');
  const sections = storyList(input.sections, current.sections || [], 'seções');
  return {
    title: text(input.title, 'Título', { max: LIMITS.short, required: true }),
    subtitle: text(input.subtitle, 'Subtítulo', { max: 500 }),
    intro: text(input.intro, 'Introdução'),
    analysis: text(input.analysis, 'Análise'),
    watchNext: lines(input.watchNext, 'O que acompanhar'),
    sections: sections.map((section, s) => {
      if (!isPlainObject(section)) throw new EditorialError(`Dados da seção ${s + 1} inválidos.`);
      const currentSection = current.sections[s] || {};
      const stories = storyList(section.stories, currentSection.stories || [], `notícias da seção ${s + 1}`);
      return {
        ...currentSection,
        title: text(section.title, `Título da seção ${s + 1}`, { max: LIMITS.short, required: true }),
        intro: text(section.intro, `Introdução da seção ${s + 1}`),
        stories: stories.map((story, i) => {
          if (!isPlainObject(story)) throw new EditorialError(`Dados da notícia ${i + 1} da seção ${s + 1} inválidos.`);
          const n = ` (seção ${s + 1}, notícia ${i + 1})`;
          return {
            ...(currentSection.stories[i] || {}),
            title: text(story.title, 'Título' + n, { max: LIMITS.short, required: true }),
            summary: text(story.summary, 'Resumo' + n),
            context: text(story.context, 'Contexto' + n),
            contextLabel: text(story.contextLabel, 'Rótulo do contexto' + n, { max: 80 }),
            source: text(story.source, 'Fonte' + n, { max: LIMITS.short }),
            url: link(story.url, 'Link da fonte' + n),
            imageUrl: link(story.imageUrl, 'Link da imagem' + n, { httpsOnly: true })
          };
        })
      };
    })
  };
}

/* ---------------------------------------------------------------- */
/* Formato enviado ao editor                                         */
/* ---------------------------------------------------------------- */

const iso = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const newsForEditor = story => ({
  id: String(story._id),
  category: story.category || '',
  title: story.title || '',
  summary: story.summary || '',
  context: story.context || '',
  source: story.source || '',
  publishedAt: story.publishedAt || '',
  url: story.url || '',
  headline: Boolean(story.headline),
  imageUrl: story.image?.url || '',
  imageAlt: story.image?.alt || '',
  updatedAt: iso(story.updatedAt)
});

const digestForEditor = digest => ({
  id: String(digest._id),
  editionDate: digest.editionDate,
  status: digest.status,
  subject: digest.subject || '',
  preheader: digest.preheader || '',
  headline: digest.headline || '',
  watchNext: (Array.isArray(digest.watchNext) ? digest.watchNext : String(digest.watchNext || '').split(/\r?\n/))
    .map(item => String(item ?? '').trim()).filter(Boolean).join('\n'),
  stories: (digest.stories || []).map(story => ({
    category: story.category || '',
    title: story.title || '',
    summary: story.summary || '',
    context: story.context || '',
    contextLabel: story.contextLabel || '',
    source: story.source || '',
    articleUrl: story.articleUrl || story.url || '',
    imageUrl: story.image?.url || '',
    imageAlt: story.image?.alt || '',
    imageCaption: story.image?.caption || '',
    imageCredit: story.image?.credit || ''
  })),
  updatedAt: iso(digest.updatedAt)
});

const weeklyForEditor = edition => ({
  id: String(edition._id),
  slug: edition.slug,
  editionNumber: edition.editionNumber ?? null,
  status: edition.status,
  weekStart: iso(edition.weekStart),
  weekEnd: iso(edition.weekEnd),
  title: edition.title || '',
  subtitle: edition.subtitle || '',
  intro: edition.intro || '',
  analysis: edition.analysis || '',
  watchNext: (edition.watchNext || []).join('\n'),
  sections: (edition.sections || []).map(section => ({
    title: section.title || '',
    intro: section.intro || '',
    stories: (section.stories || []).map(story => ({
      title: story.title || '',
      summary: story.summary || '',
      context: story.context || '',
      contextLabel: story.contextLabel || '',
      source: story.source || '',
      url: story.url || '',
      imageUrl: story.imageUrl || ''
    }))
  })),
  updatedAt: iso(edition.updatedAt)
});

/* ---------------------------------------------------------------- */
/* Leitura                                                           */
/* ---------------------------------------------------------------- */

async function listNewsEditions() {
  const rows = await News.aggregate([
    { $addFields: { _sort: { $dateFromString: { dateString: '$editionDate', format: '%d/%m/%Y', onError: null, onNull: null } } } },
    { $match: { _sort: { $ne: null } } },
    { $group: { _id: '$editionDate', stories: { $sum: 1 }, _sort: { $max: '$_sort' } } },
    { $sort: { _sort: -1 } },
    { $limit: LIST_LIMIT },
    { $project: { _id: 0, date: '$_id', stories: 1 } }
  ]);
  return rows.map(row => ({ id: row.date, label: row.date, date: editionKey(row.date), count: row.stories, meta: `${row.stories} notícias` }));
}

async function getItem(type, id) {
  if (type === 'news') {
    if (!DATE_PATTERN.test(id)) throw new EditorialError('Data inválida.');
    const stories = await News.find({ editionDate: id }).sort({ headline: -1, publishedAt: -1, _id: -1 }).lean();
    if (!stories.length) throw new EditorialError('Edição não encontrada.', 404);
    return { date: id, stories: stories.map(newsForEditor) };
  }
  if (!mongoose.isValidObjectId(id)) throw new EditorialError('Item não encontrado.', 404);
  const Model = type === 'daily' ? DailyDigest : WeeklyEdition;
  const doc = await Model.findById(id).select(type === 'daily' ? '-htmlSnapshot -textSnapshot' : '').lean();
  if (!doc) throw new EditorialError('Item não encontrado.', 404);
  return type === 'daily' ? digestForEditor(doc) : weeklyForEditor(doc);
}

async function listItems(type) {
  if (type === 'news') return listNewsEditions();
  if (type === 'daily') {
    const rows = await DailyDigest.find().select('editionDate status headline subject storyCount createdAt stories.title')
      .sort({ createdAt: -1 }).limit(LIST_LIMIT + 30).lean();
    // A data pode estar como DD/MM/AAAA ou AAAA-MM-DD: ordena pelo dia do resumo, mais recente primeiro.
    rows.sort((a, b) => editionKey(b.editionDate).localeCompare(editionKey(a.editionDate)) ||
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return rows.slice(0, LIST_LIMIT).map(row => ({
      id: String(row._id),
      label: row.editionDate,
      date: editionKey(row.editionDate),
      count: row.storyCount || (row.stories || []).length,
      title: row.headline || row.subject || '',
      status: row.status,
      meta: `${row.storyCount || (row.stories || []).length} notícias`
    }));
  }
  const rows = await WeeklyEdition.find().select('slug editionNumber title status weekStart sections.stories.title')
    .sort({ weekStart: -1 }).limit(LIST_LIMIT).lean();
  return rows.map(row => ({
    id: String(row._id),
    label: row.editionNumber ? `Edição nº ${String(row.editionNumber).padStart(3, '0')}` : row.slug,
    date: iso(row.weekStart)?.slice(0, 10) || '',
    count: (row.sections || []).reduce((total, section) => total + (section.stories || []).length, 0),
    title: row.title || '',
    status: row.status,
    meta: `${(row.sections || []).reduce((total, section) => total + (section.stories || []).length, 0)} notícias`
  }));
}

/* ---------------------------------------------------------------- */
/* Gravação                                                          */
/* ---------------------------------------------------------------- */

// Trava otimista: se outro editor (ou o worker) salvou depois que o editor abriu, recusa.
function assertFresh(doc, expected) {
  if (!expected) return;
  const current = iso(doc.updatedAt);
  if (current && current !== expected) {
    throw new EditorialError('Este conteúdo foi alterado depois que você abriu o editor. Recarregue antes de salvar.', 409);
  }
}

async function saveNews(id, data, expected) {
  if (!mongoose.isValidObjectId(id)) throw new EditorialError('Notícia não encontrada.', 404);
  const { story, image } = sanitizeNewsStory(data);
  const current = await News.findById(id).lean();
  if (!current) throw new EditorialError('Notícia não encontrada.', 404);
  assertFresh(current, expected);
  if (story.url !== current.url && await News.exists({ _id: { $ne: current._id }, editionDate: current.editionDate, url: story.url })) {
    throw new EditorialError('Já existe outra notícia nesta edição com o mesmo link da fonte.', 409);
  }
  const update = { $set: story };
  if (image) {
    update.$set.image = current.image?.url === image.url
      ? { ...current.image, alt: image.alt }
      : { url: image.url, alt: image.alt };
  } else {
    update.$unset = { image: '' };
  }
  const saved = await News.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
  return newsForEditor(saved);
}

async function saveDaily(id, data, expected) {
  if (!mongoose.isValidObjectId(id)) throw new EditorialError('Resumo não encontrado.', 404);
  const current = await DailyDigest.findById(id).select('-htmlSnapshot -textSnapshot').lean();
  if (!current) throw new EditorialError('Resumo não encontrado.', 404);
  if (current.status === 'sending') {
    throw new EditorialError('Este resumo está sendo enviado agora. Espere o envio terminar para editar.', 409);
  }
  assertFresh(current, expected);
  const merged = mergeDigest(current, data);
  merged.storyCount = merged.stories.length;
  const saved = await DailyDigest.findOneAndUpdate(
    { _id: current._id, status: { $ne: 'sending' } },
    { $set: merged },
    { new: true }
  ).select('-htmlSnapshot -textSnapshot').lean();
  if (!saved) throw new EditorialError('O resumo mudou de estado. Recarregue e tente novamente.', 409);
  return digestForEditor(saved);
}

async function saveWeekly(id, data, expected) {
  if (!mongoose.isValidObjectId(id)) throw new EditorialError('Edição não encontrada.', 404);
  const current = await WeeklyEdition.findById(id).lean();
  if (!current) throw new EditorialError('Edição não encontrada.', 404);
  assertFresh(current, expected);
  const merged = mergeWeekly(current, data);
  const saved = await WeeklyEdition.findByIdAndUpdate(id, { $set: merged }, { new: true, runValidators: true }).lean();
  return weeklyForEditor(saved);
}

const SAVERS = { news: saveNews, daily: saveDaily, weekly: saveWeekly };

module.exports = async function adminEditorial(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  if (!isSessionValid(req)) return res.status(401).json({ error: 'Não autorizado.' });
  if (!process.env.MONGODB_URI?.trim()) return res.status(503).json({ error: 'Configure MONGODB_URI para usar o editorial.' });

  const source = req.method === 'GET' ? req.query || {} : req.body || {};
  const type = typeof source.type === 'string' ? source.type : '';
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de conteúdo inválido.' });
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  if (req.method === 'PUT' && !id) return res.status(400).json({ error: 'Informe o item a editar.' });

  try {
    await connectAdminDatabase();
    if (req.method === 'GET') {
      if (!id) return res.status(200).json({ items: await listItems(type) });
      return res.status(200).json({ item: await getItem(type, id) });
    }
    const expected = typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : '';
    const item = await SAVERS[type](id, req.body?.data, expected);
    return res.status(200).json({ saved: true, item });
  } catch (error) {
    if (error instanceof EditorialError) return res.status(error.status).json({ error: error.message });
    console.error(JSON.stringify({ event: 'admin.editorial.failed', type, method: req.method, name: error?.name || 'Error' }));
    return res.status(500).json({ error: 'Não foi possível concluir a operação editorial.' });
  }
};

module.exports.sanitizeNewsStory = sanitizeNewsStory;
module.exports.mergeDigest = mergeDigest;
module.exports.mergeWeekly = mergeWeekly;
module.exports.EditorialError = EditorialError;
