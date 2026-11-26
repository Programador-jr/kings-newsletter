/* SEO das páginas de edição (Edições, Resumo diário, Semanal).
   Carregado no <head> sem defer: define já o canonical da edição aberta
   (?date=, ?data= ou ?slug=) e expõe KingsSeo.update() para os scripts da
   página trocarem título, descrição, imagem e dados estruturados quando a
   edição carrega. */
(() => {
  const SITE = 'https://kingsnewsletter.com';
  const SITE_NAME = "King's Newsletter";
  const LOGO = SITE + '/assets/icons/kings-newsletter-icon-128.png';
  // Só estes parâmetros identificam conteúdo; o resto (utm, fbclid…) fica fora do canonical.
  const KEYS = { '/editions': 'date', '/resumo-diario': 'data', '/weekly': 'slug' };

  const path = (window.location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/');
  const key = KEYS[path];
  const value = key ? new URLSearchParams(window.location.search).get(key) : null;
  const canonical = SITE + path + (value ? '?' + key + '=' + encodeURIComponent(value).replace(/%2F/gi, '/') : '');

  const head = document.head;

  const setLink = (rel, href) => {
    let node = head.querySelector(`link[rel="${rel}"]`);
    if (!node) {
      node = document.createElement('link');
      node.rel = rel;
      head.append(node);
    }
    node.href = href;
  };

  const setMeta = (attr, name, content) => {
    if (!content) return;
    let node = head.querySelector(`meta[${attr}="${name}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attr, name);
      head.append(node);
    }
    node.setAttribute('content', content);
  };

  setLink('canonical', canonical);
  setMeta('property', 'og:url', canonical);

  const clip = (text, max) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
  };

  const absolute = url => {
    try {
      const parsed = new URL(url, SITE);
      return parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
      return null;
    }
  };

  const publisher = {
    '@type': 'NewsMediaOrganization',
    '@id': SITE + '/#organization',
    name: SITE_NAME,
    url: SITE + '/',
    logo: { '@type': 'ImageObject', url: LOGO, width: 128, height: 128 }
  };

  /* Artigo da edição: resumo diário e semanal são textos próprios da
     King's Newsletter, publicados numa data — NewsArticle. */
  const newsArticle = ({ headline, description, datePublished, dateModified, images, section, keywords }) => ({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: clip(headline, 110),
    description: clip(description, 300),
    url: canonical,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    inLanguage: 'pt-BR',
    datePublished,
    dateModified: dateModified || datePublished,
    image: images && images.length ? images : [SITE + '/assets/og-image.png'],
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE + '/' },
    publisher,
    isAccessibleForFree: true,
    articleSection: section,
    keywords: keywords && keywords.length ? keywords.join(', ') : undefined
  });

  const update = ({ title, description, image, imageAlt, type, jsonld }) => {
    if (title) {
      document.title = title;
      setMeta('property', 'og:title', title);
      setMeta('name', 'twitter:title', title);
    }
    if (description) {
      const text = clip(description, 158);
      setMeta('name', 'description', text);
      setMeta('property', 'og:description', text);
      setMeta('name', 'twitter:description', text);
    }
    const img = image && absolute(image);
    if (img) {
      setMeta('property', 'og:image', img);
      setMeta('name', 'twitter:image', img);
      // A foto da notícia não tem as medidas do og-image padrão.
      head.querySelectorAll('meta[property="og:image:width"], meta[property="og:image:height"]').forEach(node => node.remove());
      setMeta('property', 'og:image:alt', imageAlt || title);
      setMeta('name', 'twitter:image:alt', imageAlt || title);
    }
    if (type) setMeta('property', 'og:type', type);
    if (jsonld) {
      let node = head.querySelector('script[data-seo="edition"]');
      if (!node) {
        node = document.createElement('script');
        node.type = 'application/ld+json';
        node.dataset.seo = 'edition';
        head.append(node);
      }
      node.textContent = JSON.stringify(jsonld);
    }
  };

  window.KingsSeo = { canonical, update, newsArticle, clip, absolute, SITE, SITE_NAME };
})();
