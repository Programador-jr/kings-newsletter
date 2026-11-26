/* Compartilhar notícia — botão por matéria e painel (<dialog>) com destino
   e formato. Usado pelas edições, pelo resumo diário e pelas semanais.

     const button = window.KingsShare.button({
       title, summary, context, contextLabel, source, sourceUrl,
       category, kicker, url   // url = permalink da notícia na newsletter
     });

   Formatos: só o link; título + link; título, resumo e link (texto pronto
   para colar); e um cartão em PNG desenhado no <canvas>, sem dependências. */
(() => {
  if (window.KingsShare) return;

  const SITE_NAME = "King's Newsletter";
  const SITE_HOST = 'kingsnewsletter.com';
  const FORMAT_KEY = 'kn-share-format';
  const FORMATS = [
    ['link', 'Só o link'],
    ['title', 'Título + link'],
    ['full', 'Título, resumo e link'],
    ['image', 'Imagem']
  ];

  /* Ícones SVG (Font Awesome Free, CC BY 4.0): o subset de fontes do site
     não traz os logotipos das redes. */
  const ICONS = {
    share: ['0 0 448 512', 'M352 224c53 0 96-43 96-96s-43-96-96-96s-96 43-96 96c0 4 .2 8 .7 11.9l-94.1 47C145.4 170.2 121.9 160 96 160c-53 0-96 43-96 96s43 96 96 96c25.9 0 49.4-10.2 66.6-26.9l94.1 47c-.5 3.9-.7 7.8-.7 11.9c0 53 43 96 96 96s96-43 96-96s-43-96-96-96c-25.9 0-49.4 10.2-66.6 26.9l-94.1-47c.5-3.9 .7-7.8 .7-11.9s-.2-8-.7-11.9l94.1-47C302.6 213.8 326.1 224 352 224z'],
    whatsapp: ['0 0 448 512', 'M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z'],
    x: ['0 0 512 512', 'M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z'],
    facebook: ['0 0 320 512', 'M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z'],
    telegram: ['0 0 496 512', 'M248,8C111.033,8,0,119.033,0,256S111.033,504,248,504,496,392.967,496,256,384.967,8,248,8ZM362.952,176.66c-3.732,39.215-19.881,134.378-28.1,178.3-3.476,18.584-10.322,24.816-16.948,25.425-14.4,1.326-25.338-9.517-39.287-18.661-21.827-14.308-34.158-23.215-55.346-37.177-24.485-16.135-8.612-25,5.342-39.5,3.652-3.793,67.107-61.51,68.335-66.746.153-.655.3-3.1-1.154-4.384s-3.59-.849-5.135-.5q-3.283.746-104.608,69.142-14.845,10.194-26.894,9.934c-8.855-.191-25.888-5.006-38.551-9.123-15.531-5.048-27.875-7.717-26.8-16.291q.84-6.7,18.45-13.7,108.446-47.248,144.628-62.3c68.872-28.647,83.183-33.623,92.511-33.789,2.052-.034,6.639.474,9.61,2.885a10.452,10.452,0,0,1,3.53,6.716A43.765,43.765,0,0,1,362.952,176.66Z'],
    linkedin: ['0 0 448 512', 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z'],
    email: ['0 0 512 512', 'M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z'],
    copy: ['0 0 640 512', 'M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z'],
    native: ['0 0 448 512', 'M246.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 109.3V320c0 17.7 14.3 32 32 32s32-14.3 32-32V109.3l73.4 73.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-128-128zM64 352c0-17.7-14.3-32-32-32s-32 14.3-32 32v64c0 53 43 96 96 96H352c53 0 96-43 96-96V352c0-17.7-14.3-32-32-32s-32 14.3-32 32v64c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V352z'],
    download: ['0 0 512 512', 'M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z'],
    check: ['0 0 448 512', 'M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z'],
    close: ['0 0 384 512', 'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z']
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svgIcon = name => {
    const [viewBox, d] = ICONS[name];
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('share-icon');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  };

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  /* Texto corrido sem marcadores de lista nem a pergunta de abertura. */
  const prose = value => String(value ?? '')
    .split(/\r?\n/)
    .map(line => line.trim().replace(/^[*•\-–]\s+/, ''))
    .filter(line => line && !(line.length <= 90 && /\?$/.test(line)))
    .join(' ');

  const truncate = (text, max) => {
    const value = clean(text);
    if (value.length <= max) return value;
    const cut = value.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '') + '…';
  };

  const readFormat = () => {
    try {
      const saved = localStorage.getItem(FORMAT_KEY);
      return FORMATS.some(([key]) => key === saved) ? saved : 'title';
    } catch {
      return 'title';
    }
  };

  const saveFormat = value => {
    try { localStorage.setItem(FORMAT_KEY, value); } catch { /* armazenamento indisponível */ }
  };

  const slugify = value => clean(value).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'noticia';

  /* ---------------------------------------------------------------- */
  /* Textos por formato e URLs de cada destino                          */
  /* ---------------------------------------------------------------- */

  // Corpo sem o link (para destinos que recebem o link em campo próprio).
  const bodyOf = (story, format) => {
    if (format === 'title') return story.title;
    if (format !== 'full') return '';
    const parts = [story.title];
    const summary = truncate(prose(story.summary), 420);
    if (summary) parts.push(summary);
    const context = truncate(prose(story.context), 320);
    if (context) parts.push((story.contextLabel || 'Contexto') .replace(/[?:]\s*$/, '') + ': ' + context);
    if (story.source) parts.push('Fonte: ' + story.source);
    return parts.join('\n\n');
  };

  const fullText = (story, format) => {
    const body = bodyOf(story, format);
    if (!body) return story.url;
    return body + (format === 'full' ? '\n\nLeia no ' + SITE_NAME + ': ' : '\n') + story.url;
  };

  // Texto para o X: título (e, no formato completo, o começo do resumo) dentro de 280 caracteres.
  const tweetText = (story, format) => {
    if (format === 'link') return '';
    if (format === 'title') return truncate(story.title, 250);
    const summary = prose(story.summary);
    const base = clean(story.title);
    const room = 250 - base.length - 2;
    return room > 40 && summary ? base + '\n\n' + truncate(summary, room) : truncate(base, 250);
  };

  const q = params => Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => key + '=' + encodeURIComponent(value))
    .join('&');

  const targetsFor = (story, format) => {
    const text = fullText(story, format);
    const body = bodyOf(story, format);
    return {
      whatsapp: 'https://wa.me/?' + q({ text }),
      x: 'https://twitter.com/intent/tweet?' + q({ text: tweetText(story, format), url: story.url }),
      facebook: 'https://www.facebook.com/sharer/sharer.php?' + q({ u: story.url }),
      telegram: 'https://t.me/share/url?' + q({ url: story.url, text: body }),
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?' + q({ url: story.url }),
      email: 'mailto:?' + q({ subject: story.title + ' | ' + SITE_NAME, body: text }).replace(/\+/g, '%20')
    };
  };

  /* ---------------------------------------------------------------- */
  /* Cartão em imagem (canvas)                                          */
  /* ---------------------------------------------------------------- */

  const CARD_W = 1080;
  const CARD_H = 1350;

  const token = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };

  const wrapLines = (ctx, text, maxWidth, maxLines) => {
    const words = clean(text).split(' ').filter(Boolean);
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i += 1) {
      const attempt = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(attempt).width <= maxWidth || !line) {
        line = attempt;
        continue;
      }
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) {
        line = '';
        break;
      }
    }
    if (line) lines.push(line);
    const truncated = lines.length > maxLines || lines.join(' ').length < clean(text).length;
    const result = lines.slice(0, maxLines);
    if (truncated && result.length) {
      let last = result[result.length - 1];
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.replace(/\s*\S+$/, '');
      result[result.length - 1] = last.replace(/[,;:.\s]+$/, '') + '…';
    }
    return result;
  };

  const loadFonts = async () => {
    if (!document.fonts?.load) return;
    await Promise.all([
      document.fonts.load('700 76px "Playfair Display"'),
      document.fonts.load('400 34px "Inter"'),
      document.fonts.load('700 26px "Inter"')
    ]).catch(() => {});
  };

  /* Foto da notícia. Só entra no cartão se o servidor de origem liberar CORS
     (Wikimedia e a maioria dos bancos de imagem liberam); senão o canvas
     ficaria "contaminado" e não exportaria o PNG, então o cartão sai sem foto. */
  const imageCache = new Map();

  const loadImage = src => {
    if (!src) return Promise.resolve(null);
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'strict-origin-when-cross-origin';
      const timer = window.setTimeout(() => resolve(null), 8000);
      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const probe = document.createElement('canvas');
          probe.width = 1;
          probe.height = 1;
          const pctx = probe.getContext('2d');
          pctx.drawImage(img, 0, 0, 1, 1);
          pctx.getImageData(0, 0, 1, 1);
          resolve(img.naturalWidth ? img : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };
      img.src = src;
    });
    imageCache.set(src, promise);
    // Falha ou demora não fica em cache: a próxima abertura tenta de novo.
    promise.then(img => { if (!img) imageCache.delete(src); });
    return promise;
  };

  // Desenha a foto cobrindo a área (corte central), com cantos arredondados.
  const drawCover = (ctx, img, x, y, w, h, radius) => {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
    else ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    ctx.restore();
  };

  const drawCard = async story => {
    const [photo] = await Promise.all([loadImage(story.image?.url), loadFonts()]);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    const bg = token('--card-bg', '#ffffff');
    const text = token('--text-main', '#1c2d2a');
    const muted = token('--text-muted', '#536762');
    const primary = token('--primary', '#0b766b');
    const border = token('--border', '#d8e5e1');
    const pad = 96;
    const width = CARD_W - pad * 2;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, CARD_W, 18);

    let y = photo ? 110 : pad + 40;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = primary;
    ctx.font = '700 28px "Inter", system-ui, sans-serif';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText(SITE_NAME.toUpperCase(), pad, y);
    if (story.kicker) {
      ctx.fillStyle = muted;
      ctx.font = '600 24px "Inter", system-ui, sans-serif';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
      const kicker = truncate(story.kicker, 40);
      ctx.fillText(kicker, CARD_W - pad - ctx.measureText(kicker).width, y);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    if (photo) {
      const photoTop = y + 30;
      const photoH = 420;
      drawCover(ctx, photo, pad, photoTop, width, photoH, 18);
      y = photoTop + photoH;
      if (story.image.credit) {
        ctx.fillStyle = muted;
        ctx.font = '400 20px "Inter", system-ui, sans-serif';
        const credit = 'Foto: ' + truncate(story.image.credit, 70);
        ctx.fillText(credit, CARD_W - pad - ctx.measureText(credit).width, y + 32);
        y += 32;
      }
      y += 60;
    } else {
      y += 120;
    }
    if (story.category) {
      ctx.font = '700 26px "Inter", system-ui, sans-serif';
      const label = clean(story.category).toUpperCase();
      const labelW = ctx.measureText(label).width + 40;
      ctx.fillStyle = primary;
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pad, y - 38, labelW, 54, 27);
      else ctx.rect(pad, y - 38, labelW, 54);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillText(label, pad + 20, y - 1);
      y += photo ? 66 : 100;
    }

    // Com foto, o título fica menor e com menos linhas para caber o resumo.
    const titleMax = photo ? 58 : 76;
    const titleMin = photo ? 46 : 58;
    const titleFit = photo ? 3 : 4;
    ctx.fillStyle = text;
    let titleSize = titleMax;
    let titleLines;
    do {
      ctx.font = '700 ' + titleSize + 'px "Playfair Display", Georgia, serif';
      titleLines = wrapLines(ctx, story.title, width, photo ? 4 : 6);
      if (titleLines.length <= titleFit || titleSize <= titleMin) break;
      titleSize -= 6;
    } while (titleSize > titleMin);
    const titleLead = Math.round(titleSize * 1.18);
    titleLines.forEach(line => {
      y += titleLead;
      ctx.fillText(line, pad, y);
    });

    y += photo ? 34 : 56;
    ctx.fillStyle = primary;
    ctx.fillRect(pad, y, 120, 8);
    y += photo ? 16 : 30;

    const footerTop = CARD_H - (photo ? 72 : pad) - 110;
    const summary = prose(story.summary);
    if (summary) {
      ctx.fillStyle = muted;
      ctx.font = (photo ? '400 30px' : '400 34px') + ' "Inter", system-ui, sans-serif';
      const lead = photo ? 46 : 52;
      const room = Math.max(0, Math.floor((footerTop - 40 - y) / lead));
      wrapLines(ctx, summary, width, Math.min(room, 9)).forEach(line => {
        y += lead;
        ctx.fillText(line, pad, y);
      });
    }

    ctx.fillStyle = border;
    ctx.fillRect(pad, footerTop, width, 2);
    ctx.fillStyle = text;
    ctx.font = '700 30px "Inter", system-ui, sans-serif';
    ctx.fillText('Leia a notícia completa', pad, footerTop + 62);
    ctx.fillStyle = primary;
    ctx.font = '600 28px "Inter", system-ui, sans-serif';
    let host = SITE_HOST;
    try { host = new URL(story.url).host.replace(/^www\./, '') || SITE_HOST; } catch { /* mantém o domínio */ }
    ctx.fillText(host, pad, footerTop + 106);
    if (story.source) {
      ctx.fillStyle = muted;
      ctx.font = '400 24px "Inter", system-ui, sans-serif';
      const source = 'Fonte: ' + truncate(story.source, 36);
      ctx.fillText(source, CARD_W - pad - ctx.measureText(source).width, footerTop + 106);
    }

    const blob = await new Promise(resolve => {
      try {
        canvas.toBlob(result => resolve(result), 'image/png');
      } catch {
        resolve(null);
      }
    });
    return { blob, photo: Boolean(photo) };
  };

  /* ---------------------------------------------------------------- */
  /* Painel                                                            */
  /* ---------------------------------------------------------------- */

  let dialog = null;
  let ui = null;
  let current = null;
  let opener = null;
  let format = readFormat();
  let imageBlob = null;
  let imageUrl = null;
  let imageToken = 0;
  let statusTimer = 0;

  const canNativeShare = () => typeof navigator.share === 'function';

  const canShareFiles = blob => {
    if (!blob || typeof navigator.canShare !== 'function' || typeof File !== 'function') return false;
    try {
      return navigator.canShare({ files: [new File([blob], 'noticia.png', { type: 'image/png' })] });
    } catch {
      return false;
    }
  };

  const setStatus = (message, isError = false, duration = 4000) => {
    window.clearTimeout(statusTimer);
    ui.status.textContent = message;
    ui.status.classList.toggle('is-error', isError);
    if (message) statusTimer = window.setTimeout(() => { ui.status.textContent = ''; }, duration);
  };

  /* Imagem para as redes: links de compartilhamento não aceitam anexo, então
     no celular (toque) usamos a folha de compartilhamento do sistema com o
     PNG anexado; no computador, copiamos a imagem (ou baixamos, se não der)
     e abrimos a rede com título e link para o leitor colar a imagem. */
  // Redes cujo compartilhamento web aceita só o link (sem onde colar a imagem).
  const LINK_ONLY_TARGETS = ['facebook', 'linkedin'];
  const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
  const canCopyImage = () => Boolean(window.ClipboardItem && navigator.clipboard?.write);
  const imageFile = () => new File([imageBlob], slugify(current.title) + '.png', { type: 'image/png' });
  const useSystemSheet = () => isTouch() && canShareFiles(imageBlob);

  const imageHint = () => {
    if (useSystemSheet()) return 'Ao tocar numa rede, abre a lista de compartilhamento do aparelho com a imagem anexada: escolha o app.';
    if (canCopyImage()) return 'Ao escolher a rede, a imagem é copiada e a rede abre com título e link: cole a imagem na mensagem (Ctrl+V ou ⌘V).';
    return 'Ao escolher a rede, a imagem é baixada e a rede abre com título e link: anexe o arquivo na mensagem.';
  };

  const downloadImage = () => {
    const link = el('a');
    link.href = imageUrl;
    link.download = slugify(current.title) + '.png';
    document.body.append(link);
    link.click();
    link.remove();
  };

  const openTarget = (href, sameTab) => {
    if (sameTab) {
      window.location.href = href;
      return true;
    }
    const win = window.open(href, '_blank');
    if (!win) return false;
    win.opener = null;
    return true;
  };

  const sendImageTo = async link => {
    const name = link.querySelector('.share-target-label').textContent;
    if (!imageBlob) {
      setStatus('Aguarde: a imagem ainda está sendo gerada.');
      return;
    }
    if (useSystemSheet()) {
      try {
        await navigator.share({ files: [imageFile()], title: current.title, text: fullText(current, 'title') });
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('Não foi possível compartilhar a imagem.', true);
      }
      return;
    }
    let copied = false;
    if (canCopyImage()) {
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': imageBlob })]);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) downloadImage();
    const opened = openTarget(link.href, link.dataset.target === 'email');
    const done = copied
      ? 'Imagem copiada. No ' + name + ', cole-a na mensagem (Ctrl+V ou ⌘V).'
      : 'Imagem baixada. No ' + name + ', anexe o arquivo na mensagem.';
    if (opened) setStatus(done, false, 9000);
    else setStatus(done + ' O navegador bloqueou a nova aba: permita pop-ups ou tente de novo.', true, 9000);
  };

  const flash = (button, label) => {
    const text = button.querySelector('.share-target-label');
    if (!text) return;
    const original = button.dataset.label || text.textContent;
    button.dataset.label = original;
    text.textContent = label;
    button.classList.add('is-done');
    window.setTimeout(() => {
      text.textContent = original;
      button.classList.remove('is-done');
    }, 2000);
  };

  const copyText = async value => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const area = el('textarea', 'share-copy-buffer');
      area.value = value;
      area.setAttribute('readonly', '');
      dialog.append(area);
      area.select();
      let ok;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      return ok;
    }
  };

  const targetLink = (key, label, icon) => {
    const link = el('a', 'share-target share-target-' + key);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.target = key;
    link.append(svgIcon(icon), el('span', 'share-target-label', label));
    return link;
  };

  const targetButton = (key, label, icon) => {
    const button = el('button', 'share-target share-target-' + key);
    button.type = 'button';
    button.dataset.target = key;
    button.append(svgIcon(icon), el('span', 'share-target-label', label));
    return button;
  };

  const releaseImage = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    imageBlob = null;
  };

  const renderImage = async () => {
    const tokenNow = ++imageToken;
    releaseImage();
    ui.imagePreview.removeAttribute('src');
    ui.imageWrap.classList.add('is-loading');
    ui.imageActions.forEach(button => { button.disabled = true; });
    const { blob, photo } = await drawCard(current);
    if (tokenNow !== imageToken || !dialog.open) return;
    ui.imageWrap.classList.remove('is-loading');
    if (!blob) {
      setStatus('Não foi possível gerar a imagem neste navegador.', true);
      return;
    }
    imageBlob = blob;
    imageUrl = URL.createObjectURL(blob);
    ui.imagePreview.src = imageUrl;
    ui.download.disabled = false;
    ui.shareImage.disabled = false;
    ui.shareImage.hidden = !canShareFiles(blob);
    ui.copyImage.disabled = false;
    ui.copyImage.hidden = !canCopyImage();
    ui.links.querySelectorAll('a[data-target]').forEach(link => link.removeAttribute('aria-disabled'));
    ui.hint.textContent = imageHint() + (current.image && !photo
      ? ' A foto desta notícia não pôde entrar no cartão (o site de origem não a libera ou demorou a responder).'
      : '');
  };

  const update = () => {
    if (!current) return;
    const isImage = format === 'image';
    ui.radios.forEach(radio => { radio.checked = radio.value === format; });
    ui.formats.hidden = isImage;
    ui.textWrap.hidden = isImage;
    ui.imageWrap.hidden = !isImage;
    ui.linksTitle.hidden = isImage;
    ui.links.hidden = isImage;
    ui.imageBar.hidden = !isImage;
    // No modo imagem, exibe somente as ações diretas do PNG.
    const hrefs = targetsFor(current, isImage ? 'title' : format);
    ui.links.querySelectorAll('a[data-target]').forEach(link => {
      link.href = hrefs[link.dataset.target];
      link.hidden = isImage && LINK_ONLY_TARGETS.includes(link.dataset.target);
      if (isImage) link.setAttribute('aria-disabled', 'true');
      else link.removeAttribute('aria-disabled');
    });
    ui.copy.hidden = isImage;
    ui.native.hidden = isImage || !canNativeShare();
    if (isImage) {
      ui.hint.textContent = 'Gerando o cartão…';
      void renderImage();
      return;
    }
    ui.hint.textContent = 'Facebook e LinkedIn recebem só o link; os demais levam o texto do formato escolhido.';
    ui.preview.value = fullText(current, format);
  };

  const build = () => {
    dialog = el('dialog', 'share-dialog');
    dialog.setAttribute('aria-labelledby', 'share-dialog-title');
    dialog.setAttribute('aria-describedby', 'share-dialog-story');

    const head = el('div', 'share-dialog-head');
    const heading = el('div', 'share-dialog-heading');
    heading.append(el('h2', 'share-dialog-title', 'Compartilhar notícia'));
    heading.firstChild.id = 'share-dialog-title';
    const storyTitle = el('p', 'share-dialog-story');
    storyTitle.id = 'share-dialog-story';
    heading.append(storyTitle);
    const close = el('button', 'accordion-close share-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar');
    close.append(svgIcon('close'));
    close.addEventListener('click', () => dialog.close());
    head.append(heading, close);

    const formats = el('fieldset', 'share-formats');
    formats.append(el('legend', 'share-legend', 'Formato'));
    const options = el('div', 'share-format-options');
    const radios = FORMATS.map(([value, label]) => {
      const option = el('label', 'share-format');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'share-format';
      radio.value = value;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        format = value;
        saveFormat(value);
        update();
      });
      option.append(radio, el('span', '', label));
      options.append(option);
      return radio;
    });
    formats.append(options);

    const textWrap = el('div', 'share-text');
    const previewLabel = el('label', 'share-legend', 'Prévia do texto');
    previewLabel.htmlFor = 'share-preview';
    const preview = el('textarea', 'share-preview');
    preview.id = 'share-preview';
    preview.readOnly = true;
    preview.rows = 5;
    textWrap.append(previewLabel, preview);

    const imageWrap = el('div', 'share-image');
    const imagePreview = el('img', 'share-image-preview');
    imagePreview.alt = 'Prévia do cartão da notícia';
    imageWrap.append(imagePreview);

    const linksTitle = el('p', 'share-legend', 'Onde compartilhar');
    linksTitle.id = 'share-targets-title';
    const links = el('div', 'share-targets');
    links.setAttribute('role', 'group');
    links.setAttribute('aria-labelledby', 'share-targets-title');
    const native = targetButton('native', 'Mais opções', 'native');
    const copy = targetButton('copy', 'Copiar', 'copy');
    links.append(
      targetLink('whatsapp', 'WhatsApp', 'whatsapp'),
      targetLink('x', 'X', 'x'),
      targetLink('facebook', 'Facebook', 'facebook'),
      targetLink('telegram', 'Telegram', 'telegram'),
      targetLink('linkedin', 'LinkedIn', 'linkedin'),
      targetLink('email', 'E-mail', 'email'),
      copy,
      native
    );
    // mailto não abre aba nova.
    links.querySelector('[data-target="email"]').removeAttribute('target');

    const imageBar = el('div', 'share-targets share-image-actions');
    imageBar.setAttribute('role', 'group');
    imageBar.setAttribute('aria-labelledby', 'share-targets-title');
    const download = targetButton('download', 'Baixar PNG', 'download');
    const shareImage = targetButton('share-image', 'Compartilhar imagem', 'native');
    const copyImage = targetButton('copy-image', 'Copiar imagem', 'copy');
    imageBar.append(download, shareImage, copyImage);

    const hint = el('p', 'share-hint');
    const status = el('p', 'share-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    dialog.append(head, formats, textWrap, imageWrap, linksTitle, links, imageBar, hint, status);
    document.body.append(dialog);

    ui = {
      storyTitle, radios, formats, textWrap, preview, imageWrap, imagePreview, linksTitle, links, native, copy, imageBar,
      download, shareImage, copyImage, imageActions: [download, shareImage, copyImage], hint, status
    };

    copy.addEventListener('click', async () => {
      const ok = await copyText(fullText(current, format));
      if (ok) {
        flash(copy, 'Copiado!');
        setStatus(format === 'link' ? 'Link copiado.' : 'Texto copiado para a área de transferência.');
      } else {
        ui.preview.focus();
        ui.preview.select();
        setStatus('Não foi possível copiar. O texto foi selecionado: use Ctrl+C.', true);
      }
    });

    native.addEventListener('click', async () => {
      const body = bodyOf(current, format);
      const data = { title: current.title, url: current.url };
      if (body) data.text = body;
      try {
        await navigator.share(data);
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('O compartilhamento do sistema não está disponível.', true);
      }
    });

    download.addEventListener('click', () => {
      if (!imageUrl) return;
      downloadImage();
      flash(download, 'Baixado!');
      setStatus('Imagem salva.');
    });

    shareImage.addEventListener('click', async () => {
      if (!imageBlob) return;
      try {
        await navigator.share({ files: [imageFile()], title: current.title, text: current.title + '\n' + current.url });
      } catch (error) {
        if (error?.name !== 'AbortError') setStatus('Não foi possível compartilhar a imagem.', true);
      }
    });

    copyImage.addEventListener('click', async () => {
      if (!imageBlob) return;
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': imageBlob })]);
        flash(copyImage, 'Copiada!');
        setStatus('Imagem copiada para a área de transferência.');
      } catch {
        setStatus('Este navegador não permite copiar imagens. Use “Baixar PNG”.', true);
      }
    });

    links.addEventListener('click', event => {
      const link = event.target.closest('a[data-target]');
      if (!link) return;
      if (format === 'image') {
        event.preventDefault();
        void sendImageTo(link);
        return;
      }
      setStatus('Abrindo ' + link.textContent.trim() + '…');
    });

    // Foco preso no painel (showModal já torna o resto inerte; isto fecha o ciclo do Tab).
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.disabled && node.offsetParent !== null && !(node.type === 'radio' && !node.checked));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    // Clique no fundo fecha.
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      imageToken += 1;
      releaseImage();
      setStatus('');
      if (opener) {
        opener.setAttribute('aria-expanded', 'false');
        if (opener.isConnected) opener.focus();
      }
      opener = null;
    });
  };

  const open = (story, trigger) => {
    if (!dialog) build();
    current = story;
    opener = trigger || null;
    ui.storyTitle.textContent = story.title;
    setStatus('');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('modal-open');
    if (opener) opener.setAttribute('aria-expanded', 'true');
    update();
    const checked = ui.radios.find(radio => radio.checked);
    (checked || ui.radios[0]).focus();
  };

  const imageOf = image => {
    const src = typeof image === 'string' ? image : image?.url;
    if (typeof src !== 'string') return null;
    try {
      const url = new URL(src.trim(), window.location.origin);
      if (url.protocol !== 'https:' && url.origin !== window.location.origin) return null;
      return { url: url.href, credit: clean(image?.credit) };
    } catch {
      return null;
    }
  };

  const normalize = data => {
    const url = clean(data.url) || window.location.href;
    return {
      title: clean(data.title) || SITE_NAME,
      summary: data.summary || '',
      context: data.context || '',
      contextLabel: clean(data.contextLabel),
      source: clean(data.source),
      category: clean(data.category),
      kicker: clean(data.kicker),
      image: imageOf(data.image),
      url
    };
  };

  const button = (data, options = {}) => {
    const story = normalize(data);
    const trigger = el('button', 'share-trigger' + (options.className ? ' ' + options.className : ''));
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Compartilhar: ' + story.title);
    trigger.append(svgIcon('share'), el('span', 'share-trigger-label', 'Compartilhar'));
    trigger.addEventListener('click', () => open(story, trigger));
    return trigger;
  };

  /* Permalink: endereço da página + âncora da notícia, sem outros parâmetros. */
  const permalink = (path, params, anchor) => {
    const url = new URL(path, window.location.origin);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
    if (anchor) url.hash = anchor;
    // Mantém as barras da data (dd/mm/aaaa) legíveis no link compartilhado.
    return url.href.replace(/%2F/gi, '/');
  };

  window.KingsShare = { button, open: (data, trigger) => open(normalize(data), trigger), permalink };
})();
