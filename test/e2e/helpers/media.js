// As imagens do site vêm do bucket R2 público. Nos testes elas são servidas
// localmente, para não depender de rede externa.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function stubRemoteMedia(page) {
  await page.route(/^https:\/\/[^/]+\.r2\.dev\//, route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: TINY_PNG
  }));
}

module.exports = { stubRemoteMedia };
