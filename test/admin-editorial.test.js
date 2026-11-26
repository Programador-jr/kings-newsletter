const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createSessionToken } = require('../lib/admin-auth');
const editorial = require('../lib/api-handlers/admin/editorial');
const control = require('../api/control');
const vercel = require('../vercel.json');

const { sanitizeNewsStory, mergeDigest, mergeWeekly, EditorialError } = editorial;

function mockResponse() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

const envNames = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'MONGODB_URI'];
function setTestEnvironment(t) {
  const previous = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    ADMIN_USERNAME: 'dashboard-admin',
    ADMIN_PASSWORD: 'Testing-Password-1',
    ADMIN_SESSION_SECRET: 'testing-session-secret-with-at-least-32-characters',
    MONGODB_URI: 'mongodb://localhost/kings_newsletter_test'
  });
  t.after(() => envNames.forEach(name => {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }));
}

const newsInput = (overrides = {}) => ({
  category: 'Política', title: 'Título', summary: 'Resumo', context: 'Contexto',
  source: 'Reuters', publishedAt: '25/11/2026', url: 'https://example.com/a',
  imageUrl: '', imageAlt: '', ...overrides
});

test('editorial API requires an administrator session', async () => {
  const response = mockResponse();
  await editorial({ method: 'GET', headers: {}, query: { type: 'news' } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('editorial API only accepts GET and PUT', async () => {
  const response = mockResponse();
  await editorial({ method: 'DELETE', headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'GET, PUT');
});

test('editorial API validates type and target before database access', async t => {
  setTestEnvironment(t);
  const cookie = `kings_admin_session=${createSessionToken()}`;

  const badType = mockResponse();
  await editorial({ method: 'GET', headers: { cookie }, query: { type: 'subscribers' } }, badType);
  assert.equal(badType.statusCode, 400);

  const missingId = mockResponse();
  await editorial({ method: 'PUT', headers: { cookie }, body: { type: 'daily', data: {} } }, missingId);
  assert.equal(missingId.statusCode, 400);
});

test('editorial route is wired for local server, control router and Vercel', () => {
  const response = mockResponse();
  control({ query: { route: 'admin/editorial' }, method: 'DELETE', headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.ok(vercel.rewrites.some(rule => rule.source === '/api/admin/editorial' &&
    rule.destination === '/api/control?route=admin/editorial'));
});

test('news story sanitizer trims text and builds the image', () => {
  const { story, image } = sanitizeNewsStory(newsInput({ title: '  Novo título  ', imageUrl: 'https://img.example.com/a.jpg' }));
  assert.equal(story.title, 'Novo título');
  assert.deepEqual(image, { url: 'https://img.example.com/a.jpg', alt: 'Novo título' });
  assert.equal(sanitizeNewsStory(newsInput()).image, null);
});

test('news story sanitizer rejects unsafe links and missing fields', () => {
  assert.throws(() => sanitizeNewsStory(newsInput({ url: 'javascript:alert(1)' })), EditorialError);
  assert.throws(() => sanitizeNewsStory(newsInput({ imageUrl: 'http://img.example.com/a.jpg' })), /https/);
  assert.throws(() => sanitizeNewsStory(newsInput({ title: '   ' })), /Título/);
  assert.throws(() => sanitizeNewsStory(newsInput({ summary: 42 })), /texto/);
});

test('digest merge keeps internal story fields and edits the public ones', () => {
  const current = {
    stories: [{ newsId: 'n1', editorialRank: 2, title: 'Antigo', image: { url: 'https://a/x.jpg', alt: 'x', width: 800 } }]
  };
  const merged = mergeDigest(current, {
    subject: 'Assunto', preheader: '', headline: 'Manchete', watchNext: 'Um\n\n- Dois',
    stories: [{ title: 'Novo', summary: 'S', context: 'C', category: 'Economia', contextLabel: '', source: 'Fonte',
      articleUrl: 'https://example.com', imageUrl: 'https://a/y.jpg', imageAlt: 'y', imageCaption: '', imageCredit: 'Foto' }]
  });
  assert.equal(merged.stories[0].newsId, 'n1');
  assert.equal(merged.stories[0].editorialRank, 2);
  assert.equal(merged.stories[0].title, 'Novo');
  assert.equal(merged.stories[0].image.url, 'https://a/y.jpg');
  assert.equal(merged.stories[0].image.width, 800);
  assert.deepEqual(merged.watchNext, ['Um', '- Dois']);
});

test('digest merge removes the image when the link is cleared', () => {
  const merged = mergeDigest({ stories: [{ title: 'A', image: { url: 'https://a/x.jpg' } }] }, {
    subject: 'Assunto', stories: [{ title: 'A', imageUrl: '' }]
  });
  assert.equal('image' in merged.stories[0], false);
});

test('digest merge refuses a different number of stories', () => {
  assert.throws(
    () => mergeDigest({ stories: [{ title: 'A' }, { title: 'B' }] }, { subject: 'Assunto', stories: [{ title: 'A' }] }),
    error => error instanceof EditorialError && error.status === 409
  );
});

test('weekly merge edits sections and stories in place', () => {
  const current = { sections: [{ title: 'Seção', intro: '', stories: [{ title: 'A', url: '' }] }] };
  const merged = mergeWeekly(current, {
    title: 'Semana', subtitle: '', intro: '', analysis: '', watchNext: [],
    sections: [{ title: 'Política', intro: 'Intro', stories: [{ title: 'B', url: 'https://example.com', imageUrl: 'https://img/x.png' }] }]
  });
  assert.equal(merged.sections[0].title, 'Política');
  assert.equal(merged.sections[0].stories[0].title, 'B');
  assert.equal(merged.sections[0].stories[0].imageUrl, 'https://img/x.png');
  assert.throws(() => mergeWeekly(current, { title: 'Semana', sections: [] }), /seções mudou/);
});
