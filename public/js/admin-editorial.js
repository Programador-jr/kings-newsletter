/* Editorial do painel: corrige texto, fonte, links e imagens das notícias do
   site, dos resumos diários e das edições semanais já gravadas no banco.
   Usa /api/admin/editorial (GET lista/item, PUT salva). Depende de admin.js
   para showToast e showLogin. */
(() => {
  const root = document.querySelector('.editorial-page');
  if (!root) return;

  const $ = selector => root.querySelector(selector);
  const listNode = $('#editorial-list');
  const editorNode = $('#editorial-editor');
  const titleNode = $('#editorial-editor-title');
  const metaNode = $('#editorial-editor-meta');
  const statusNode = $('#editorial-status');
  const viewLink = $('#editorial-view-link');
  const toggleAll = $('#editorial-toggle-all');
  const searchInput = $('#editorial-search');
  const tabs = [...root.querySelectorAll('[data-editorial-type]')];

  const TYPE_INFO = {
    news: { eyebrow: 'EDIÇÕES DO SITE', heading: 'Escolha uma edição', empty: 'Nenhuma edição de notícias encontrada.', unit: ['edição', 'edições'] },
    daily: { eyebrow: 'RESUMOS DIÁRIOS', heading: 'Escolha um resumo', empty: 'Nenhum resumo diário encontrado.', unit: ['resumo', 'resumos'] },
    weekly: { eyebrow: 'EDIÇÕES SEMANAIS', heading: 'Escolha uma edição', empty: 'Nenhuma edição semanal encontrada.', unit: ['edição', 'edições'] }
  };
  const STATUS_LABELS = { draft: 'Rascunho', approved: 'Aprovado', sending: 'Enviando', sent: 'Enviado', failed: 'Falha', published: 'Publicada' };
  const STATUS_CLASS = { sent: 'delivered', published: 'delivered', draft: 'pending', approved: 'sending', sending: 'sending', failed: 'failed' };
  const PLACEHOLDER = 'Edite textos, fontes, links e imagens do que já foi publicado. As mudanças aparecem no site em até 5 minutos.';

  const state = {
    type: 'news', items: [], loadedType: null, selectedId: null, item: null,
    dirty: new Set(), saving: false, openMonths: new Set()
  };
  let fieldCounter = 0;

  /* ---------------------------------------------------------------- */
  /* Utilidades                                                        */
  /* ---------------------------------------------------------------- */

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
    return node;
  };

  const plural = (count, [one, many]) => `${count} ${count === 1 ? one : many}`;
  const pad = number => String(number).padStart(2, '0');

  const toast = (title, message, type) => {
    if (typeof window.showToast === 'function') window.showToast(title, message, type);
  };

  async function api(method, params) {
    const options = { method, headers: { Accept: 'application/json' }, cache: 'no-store' };
    let url = '/api/admin/editorial';
    if (method === 'GET') {
      url += '?' + new URLSearchParams(params).toString();
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(params);
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
      if (typeof window.showLogin === 'function') window.showLogin('Sua sessão expirou. Entre novamente.');
      throw new Error('Sessão expirada.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
    return payload;
  }

  const isDirty = () => state.dirty.size > 0;

  const confirmLeave = () => !isDirty() || window.confirm('Há alterações não salvas no editorial. Descartar e sair?');

  window.addEventListener('beforeunload', event => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // AAAA-MM-DD a partir de DD/MM/AAAA ou AAAA-MM-DD.
  const dateKey = value => {
    const text = String(value || '');
    const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
  };

  const utcDate = key => (key ? new Date(key + 'T00:00:00Z') : null);

  const formatDay = (key, options) => {
    const date = utcDate(key);
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(date)
      : '';
  };

  const monthLabel = key => {
    const label = formatDay(key, { month: 'long', year: 'numeric' });
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Sem data';
  };

  const brDate = key => formatDay(key, { day: '2-digit', month: '2-digit', year: 'numeric' });

  /* ---------------------------------------------------------------- */
  /* Campos                                                            */
  /* ---------------------------------------------------------------- */

  /* Campo ligado a um caminho do objeto editado (ex.: "stories.2.title").
     form = grupo que controla "não salvo" (o documento inteiro ou uma notícia). */
  function field(form, label, path, value, options = {}) {
    const { type = 'text', rows = 4, max, required = false, hint = '', wide = false, placeholder = '' } = options;
    const id = `editorial-field-${++fieldCounter}`;
    const wrap = el('div', 'editorial-field' + (wide || type === 'textarea' ? ' is-wide' : ''));
    const labelNode = el('label', 'editorial-label', label);
    labelNode.htmlFor = id;
    if (required) labelNode.append(el('span', 'editorial-required', '*'));
    const input = type === 'textarea' ? el('textarea', 'editorial-input editorial-textarea') : el('input', 'editorial-input');
    input.id = id;
    if (type === 'textarea') input.rows = rows;
    else input.type = type;
    if (max) input.maxLength = max;
    if (required) input.required = true;
    if (placeholder) input.placeholder = placeholder;
    input.value = value ?? '';
    input.dataset.path = path;
    input.dataset.form = form;
    wrap.append(labelNode, input);
    if (hint) {
      const hintNode = el('small', 'editorial-hint', hint);
      hintNode.id = id + '-hint';
      input.setAttribute('aria-describedby', hintNode.id);
      wrap.append(hintNode);
    }
    return wrap;
  }

  // Grupo de campos com título ("Texto", "Fonte", "Imagem").
  function group(title, ...nodes) {
    const node = el('fieldset', 'editorial-group');
    node.append(el('legend', 'editorial-group-title', title));
    const grid = el('div', 'editorial-grid');
    grid.append(...nodes.filter(Boolean));
    node.append(grid);
    return node;
  }

  // Link de imagem com prévia ao lado.
  function imageField(form, path, value, extra = []) {
    const box = el('div', 'editorial-image is-wide');
    const linkField = field(form, 'Link da imagem', path, value, {
      type: 'url', max: 2048, placeholder: 'https://…/foto.jpg',
      hint: 'Endereço https (jpg, png ou webp). Deixe vazio para tirar a imagem.'
    });
    const input = linkField.querySelector('input');
    const preview = el('div', 'editorial-image-preview');
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    const note = el('span', 'editorial-image-note');
    preview.append(img, note);
    const refresh = () => {
      const url = input.value.trim();
      preview.classList.remove('is-broken', 'is-empty');
      if (!url) {
        img.removeAttribute('src');
        preview.classList.add('is-empty');
        note.textContent = 'Sem imagem';
        return;
      }
      if (!/^https:\/\//i.test(url)) {
        img.removeAttribute('src');
        preview.classList.add('is-broken');
        note.textContent = 'Use um link https';
        return;
      }
      note.textContent = '';
      img.src = url;
    };
    img.addEventListener('error', () => {
      preview.classList.add('is-broken');
      note.textContent = 'A imagem não carregou';
    });
    let timer = 0;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    });
    refresh();
    const fields = el('div', 'editorial-image-fields');
    fields.append(linkField, ...extra);
    box.append(preview, fields);
    return box;
  }

  /* Lê os campos de um grupo para dentro de uma cópia do objeto original. */
  function collect(container, base) {
    const data = JSON.parse(JSON.stringify(base));
    container.querySelectorAll('[data-path]').forEach(input => {
      const parts = input.dataset.path.split('.');
      let target = data;
      parts.slice(0, -1).forEach(part => { target = target[part]; });
      target[parts[parts.length - 1]] = input.value;
    });
    return data;
  }

  function trackDirty(container, form, onChange) {
    container.addEventListener('input', event => {
      const input = event.target.closest('[data-form]');
      if (!input || input.dataset.form !== form) return;
      state.dirty.add(form);
      input.closest('details.editorial-story')?.classList.add('is-edited');
      onChange?.(true);
    });
  }

  /* Cabeçalho do acordeão de uma notícia: número, miniatura, etiquetas e título. */
  function storySummary(summary, { number, image, tags = [], title }) {
    summary.replaceChildren();
    if (number) summary.append(el('span', 'editorial-num', number));
    if (image && /^https:\/\//i.test(image)) {
      const thumb = el('img', 'editorial-thumb');
      thumb.src = image;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      thumb.addEventListener('error', () => thumb.remove(), { once: true });
      summary.append(thumb);
    }
    const main = el('span', 'editorial-sum-main');
    const tagRow = el('span', 'editorial-sum-tags');
    tags.filter(Boolean).forEach(([text, variant]) => tagRow.append(el('span', 'editorial-tag' + (variant ? ' is-' + variant : ''), text)));
    if (tagRow.childElementCount) main.append(tagRow);
    main.append(el('span', 'editorial-sum-title', title || 'Sem título'));
    summary.append(main, el('span', 'editorial-edited', 'editado'), el('span', 'editorial-chevron'));
  }

  function storyAccordion(summaryData, ...body) {
    const details = el('details', 'editorial-story');
    const summary = el('summary');
    storySummary(summary, summaryData);
    const content = el('div', 'editorial-story-body');
    content.append(...body);
    details.append(summary, content);
    return { details, summary, content };
  }

  /* ---------------------------------------------------------------- */
  /* Lista agrupada por mês                                            */
  /* ---------------------------------------------------------------- */

  function listButton(item) {
    const button = el('button', 'editorial-item');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(item.id === state.selectedId));
    const day = el('span', 'editorial-item-day');
    const key = item.date || dateKey(item.label);
    day.append(
      el('strong', '', key ? key.slice(8, 10) : '—'),
      el('small', '', key ? formatDay(key, { weekday: 'short' }).replace('.', '') : '')
    );
    const main = el('span', 'editorial-item-main');
    const title = state.type === 'news' ? `Edição de ${brDate(key) || item.label}` : (item.title || item.label);
    main.append(el('span', 'editorial-item-title', title));
    const meta = state.type === 'weekly' ? `${item.label} · ${item.meta}` : item.meta;
    main.append(el('span', 'editorial-item-meta', meta));
    button.append(day, main);
    if (item.status) button.append(el('span', `status ${STATUS_CLASS[item.status] || ''}`, STATUS_LABELS[item.status] || item.status));
    button.addEventListener('click', () => select(item.id));
    return button;
  }

  function renderList() {
    const query = searchInput.value.trim().toLocaleLowerCase('pt-BR');
    const items = state.items.filter(item => !query ||
      [item.label, item.title, item.meta, brDate(item.date)].join(' ').toLocaleLowerCase('pt-BR').includes(query));
    if (!items.length) {
      listNode.replaceChildren(el('div', 'empty', state.items.length ? 'Nada encontrado com esse filtro.' : TYPE_INFO[state.type].empty));
      return;
    }
    const groups = new Map();
    items.forEach(item => {
      const key = (item.date || dateKey(item.label)).slice(0, 7) || 'sem-data';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const selectedMonth = (() => {
      const selected = state.items.find(item => item.id === state.selectedId);
      return selected ? (selected.date || dateKey(selected.label)).slice(0, 7) : '';
    })();
    if (!state.openMonths.size) state.openMonths.add(selectedMonth || groups.keys().next().value);

    listNode.replaceChildren(...[...groups.entries()].map(([month, monthItems]) => {
      const details = el('details', 'editorial-month');
      details.open = Boolean(query) || state.openMonths.has(month) || month === selectedMonth;
      const summary = el('summary');
      summary.append(
        el('span', 'editorial-month-name', month === 'sem-data' ? 'Sem data' : monthLabel(month + '-01')),
        el('span', 'editorial-month-count', plural(monthItems.length, TYPE_INFO[state.type].unit)),
        el('span', 'editorial-chevron')
      );
      const body = el('div', 'editorial-month-items');
      body.append(...monthItems.map(listButton));
      details.append(summary, body);
      details.addEventListener('toggle', () => {
        if (query) return;
        if (details.open) state.openMonths.add(month);
        else state.openMonths.delete(month);
      });
      return details;
    }));
  }

  async function loadList(force = false) {
    if (!force && state.loadedType === state.type) return;
    const type = state.type;
    listNode.replaceChildren(el('div', 'empty', 'Carregando…'));
    try {
      const { items } = await api('GET', { type });
      if (type !== state.type) return;
      state.items = Array.isArray(items) ? items : [];
      state.loadedType = type;
      const count = root.querySelector(`[data-editorial-count="${type}"]`);
      if (count) count.textContent = String(state.items.length);
      renderList();
    } catch (error) {
      listNode.replaceChildren(el('div', 'empty', error.message));
      toast('Falha ao carregar o editorial', error.message, 'error');
    }
  }

  function setType(type) {
    if (type === state.type || !TYPE_INFO[type]) return;
    if (!confirmLeave()) return;
    state.type = type;
    state.dirty.clear();
    state.selectedId = null;
    state.item = null;
    state.loadedType = null;
    state.openMonths.clear();
    tabs.forEach(tab => {
      const active = tab.dataset.editorialType === type;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active) $('#editorial-workspace').setAttribute('aria-labelledby', tab.id);
    });
    $('#editorial-list-eyebrow').textContent = TYPE_INFO[type].eyebrow;
    $('#editorial-list-title').textContent = TYPE_INFO[type].heading;
    searchInput.value = '';
    clearEditor();
    void loadList();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setType(tab.dataset.editorialType));
    tab.addEventListener('keydown', event => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      setType(next.dataset.editorialType);
    });
  });

  searchInput.addEventListener('input', renderList);
  $('#editorial-refresh').addEventListener('click', () => {
    if (!confirmLeave()) return;
    state.dirty.clear();
    void loadList(true).then(() => state.selectedId && select(state.selectedId, { force: true }));
  });

  /* ---------------------------------------------------------------- */
  /* Editor                                                            */
  /* ---------------------------------------------------------------- */

  function placeholder(title, text) {
    const box = el('div', 'editorial-placeholder');
    const iconNode = el('span', '', '✎');
    iconNode.setAttribute('aria-hidden', 'true');
    box.append(iconNode, el('strong', '', title));
    if (text) box.append(el('p', '', text));
    return box;
  }

  function clearEditor() {
    titleNode.textContent = 'Nada selecionado';
    metaNode.textContent = '';
    statusNode.className = 'status hidden';
    viewLink.classList.add('hidden');
    toggleAll.classList.add('hidden');
    editorNode.replaceChildren(placeholder('Escolha um item na lista', PLACEHOLDER));
  }

  function setHeader(title, meta, status, href) {
    titleNode.textContent = title;
    metaNode.textContent = meta;
    if (status) {
      statusNode.className = `status ${STATUS_CLASS[status] || ''}`;
      statusNode.textContent = STATUS_LABELS[status] || status;
    } else {
      statusNode.className = 'status hidden';
    }
    viewLink.classList.toggle('hidden', !href);
    if (href) viewLink.href = href;
    toggleAll.classList.remove('hidden');
    syncToggleAll();
  }

  const storyDetails = () => [...editorNode.querySelectorAll('details.editorial-story')];

  function syncToggleAll() {
    const all = storyDetails();
    const anyClosed = all.some(details => !details.open);
    toggleAll.textContent = anyClosed ? 'Abrir todas' : 'Fechar todas';
    toggleAll.disabled = !all.length;
  }

  toggleAll.addEventListener('click', () => {
    const all = storyDetails();
    const open = all.some(details => !details.open);
    all.forEach(details => { details.open = open; });
    syncToggleAll();
  });
  editorNode.addEventListener('toggle', syncToggleAll, true);

  async function select(id, { force = false } = {}) {
    if (!force && id === state.selectedId) return;
    if (!force && !confirmLeave()) return;
    state.dirty.clear();
    state.selectedId = id;
    renderList();
    editorNode.replaceChildren(placeholder('Carregando…'));
    const type = state.type;
    try {
      const { item } = await api('GET', { type, id });
      if (type !== state.type || id !== state.selectedId) return;
      state.item = item;
      ({ news: renderNews, daily: renderDaily, weekly: renderWeekly })[type](item);
      syncToggleAll();
      if (window.matchMedia('(max-width: 1100px)').matches) {
        root.querySelector('.editorial-editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (error) {
      editorNode.replaceChildren(placeholder('Não foi possível abrir', error.message));
      toast('Falha ao abrir o item', error.message, 'error');
    }
  }

  // Barra de salvar de um grupo (notícia avulsa ou documento inteiro).
  function saveBar(label, onReset) {
    const bar = el('div', 'editorial-savebar');
    const message = el('span', 'editorial-save-state', 'Tudo salvo');
    message.setAttribute('role', 'status');
    const reset = el('button', 'button button-quiet', 'Desfazer');
    reset.type = 'button';
    reset.disabled = true;
    const save = el('button', 'button button-primary', label);
    save.type = 'submit';
    save.disabled = true;
    reset.addEventListener('click', onReset);
    bar.append(message, reset, save);
    return {
      bar,
      setDirty(dirty) {
        save.disabled = !dirty || state.saving;
        reset.disabled = !dirty || state.saving;
        message.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
        bar.classList.toggle('is-dirty', dirty);
      },
      setSaving(saving) {
        save.disabled = saving;
        reset.disabled = saving;
        save.textContent = saving ? 'Salvando…' : label;
      }
    };
  }

  async function submit(form, payload, bar) {
    if (!form.reportValidity()) return null;
    state.saving = true;
    bar.setSaving(true);
    try {
      const result = await api('PUT', payload);
      return result.item;
    } catch (error) {
      toast('Não foi possível salvar', error.message, 'error');
      bar.setSaving(false);
      bar.setDirty(true);
      return null;
    } finally {
      state.saving = false;
    }
  }

  const savedToast = () => toast('Alterações salvas', 'O site público mostra a nova versão em até 5 minutos (cache).');

  const notice = (text, variant = '') => el('p', 'editorial-notice' + (variant ? ' is-' + variant : ''), text);

  /* Notícias do site: cada notícia salva sozinha. */
  function renderNews(edition) {
    const key = dateKey(edition.date);
    const weekday = formatDay(key, { weekday: 'long' });
    setHeader(`Edição de ${edition.date}`, `${weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) + ' · ' : ''}${plural(edition.stories.length, ['notícia', 'notícias'])}`,
      null, `/editions?date=${edition.date}`);
    editorNode.replaceChildren(
      notice('Cada notícia é salva separadamente. O link da imagem é usado como está (não é copiado para o armazenamento do site).'),
      ...edition.stories.map((story, index) => newsStoryBlock(story, index))
    );
  }

  function newsStoryBlock(story, index) {
    const form = `news-${story.id}`;
    const body = el('form', 'editorial-story-form');
    const accordion = storyAccordion({}, body);
    const heading = () => storySummary(accordion.summary, {
      number: pad(index + 1), image: story.imageUrl,
      tags: [story.headline ? ['Manchete', 'accent'] : null, story.category ? [story.category] : null],
      title: story.title
    });
    heading();
    const bar = saveBar('Salvar notícia', () => {
      fill(story);
      state.dirty.delete(form);
      accordion.details.classList.remove('is-edited');
      bar.setDirty(false);
    });
    const fill = data => {
      body.replaceChildren(
        group('Texto',
          field(form, 'Título', 'title', data.title, { required: true, max: 300, wide: true }),
          field(form, 'Resumo', 'summary', data.summary, { type: 'textarea', rows: 5, required: true }),
          field(form, 'Contexto', 'context', data.context, { type: 'textarea', rows: 5, required: true })
        ),
        group('Fonte e publicação',
          field(form, 'Categoria', 'category', data.category, { required: true, max: 120 }),
          field(form, 'Data de publicação', 'publishedAt', data.publishedAt, { required: true, max: 40, placeholder: 'DD/MM/AAAA' }),
          field(form, 'Fonte', 'source', data.source, { required: true, max: 300 }),
          field(form, 'Link da fonte', 'url', data.url, { type: 'url', required: true, max: 2048 })
        ),
        group('Imagem', imageField(form, 'imageUrl', data.imageUrl, [
          field(form, 'Texto alternativo', 'imageAlt', data.imageAlt, { max: 300, wide: true, hint: 'Descreva a imagem para quem usa leitor de tela.' })
        ])),
        bar.bar
      );
    };
    fill(story);
    trackDirty(body, form, dirty => bar.setDirty(dirty));
    body.addEventListener('submit', async event => {
      event.preventDefault();
      const data = collect(body, {
        title: '', category: '', source: '', publishedAt: '', url: '', imageUrl: '', imageAlt: '', summary: '', context: ''
      });
      const saved = await submit(body, { type: 'news', id: story.id, updatedAt: story.updatedAt, data }, bar);
      if (!saved) return;
      Object.assign(story, saved);
      state.dirty.delete(form);
      accordion.details.classList.remove('is-edited');
      heading();
      fill(story);
      bar.setSaving(false);
      bar.setDirty(false);
      savedToast();
    });
    return accordion.details;
  }

  /* Documento inteiro (resumo diário ou semanal): um botão salva tudo. */
  function documentForm(item, type, build) {
    const form = `${type}-${item.id}`;
    const node = el('form', 'editorial-document');
    const bar = saveBar(type === 'daily' ? 'Salvar resumo' : 'Salvar edição', () => {
      state.dirty.delete(form);
      render();
    });
    const render = () => {
      node.replaceChildren(...build(form, state.item), bar.bar);
      bar.setSaving(false);
      bar.setDirty(false);
      syncToggleAll();
    };
    trackDirty(node, form, dirty => bar.setDirty(dirty));
    node.addEventListener('submit', async event => {
      event.preventDefault();
      const data = collect(node, state.item);
      const saved = await submit(node, { type, id: item.id, updatedAt: state.item.updatedAt, data }, bar);
      if (!saved) return;
      state.item = saved;
      state.dirty.delete(form);
      render();
      savedToast();
      void loadList(true);
    });
    render();
    return node;
  }

  const sectionTitle = text => el('h3', 'editorial-subheading', text);

  function renderDaily(digest) {
    const key = dateKey(digest.editionDate);
    const weekday = formatDay(key, { weekday: 'long' });
    setHeader(digest.headline || digest.subject || `Resumo de ${digest.editionDate}`,
      `${brDate(key) || digest.editionDate}${weekday ? ' · ' + weekday : ''} · ${plural(digest.stories.length, ['notícia', 'notícias'])}`,
      digest.status, digest.status === 'sent' && key ? `/resumo-diario?data=${key}` : '');
    const notes = [];
    if (digest.status === 'sent') notes.push(notice('Este resumo já foi enviado: as mudanças valem para o site; o e-mail que os assinantes receberam não muda.', 'warning'));
    if (digest.status === 'sending') notes.push(notice('Este resumo está sendo enviado agora e não pode ser editado até o envio terminar.', 'warning'));
    const doc = documentForm(digest, 'daily', (form, data) => [
      group('Capa do resumo',
        field(form, 'Manchete (título no site)', 'headline', data.headline, { max: 300, wide: true }),
        field(form, 'Assunto do e-mail', 'subject', data.subject, { required: true, max: 300, wide: true }),
        field(form, 'Pré-cabeçalho', 'preheader', data.preheader, { type: 'textarea', rows: 2, max: 500, hint: 'Texto curto que aparece ao lado do assunto na caixa de entrada.' }),
        field(form, 'O que acompanhar', 'watchNext', data.watchNext, { type: 'textarea', rows: 4, hint: 'Um item por linha.' })
      ),
      sectionTitle(`Notícias · ${data.stories.length}`),
      ...data.stories.map((story, index) => {
        const p = `stories.${index}.`;
        return storyAccordion(
          { number: pad(index + 1), image: story.imageUrl, tags: [story.category ? [story.category] : null], title: story.title },
          group('Texto',
            field(form, 'Título', p + 'title', story.title, { required: true, max: 300, wide: true }),
            field(form, 'Resumo', p + 'summary', story.summary, { type: 'textarea', rows: 6 }),
            field(form, 'Rótulo do contexto', p + 'contextLabel', story.contextLabel, { max: 80, wide: true, hint: 'Título acima do contexto, ex.: “Por que importa”. Vazio usa “Além da manchete”.' }),
            field(form, 'Contexto', p + 'context', story.context, { type: 'textarea', rows: 6, hint: 'Linhas com “-” viram lista; uma linha curta terminada em “?” vira subtítulo.' })
          ),
          group('Fonte',
            field(form, 'Categoria', p + 'category', story.category, { max: 120 }),
            field(form, 'Fonte', p + 'source', story.source, { max: 300 }),
            field(form, 'Link da fonte', p + 'articleUrl', story.articleUrl, { type: 'url', max: 2048, wide: true })
          ),
          group('Imagem', imageField(form, p + 'imageUrl', story.imageUrl, [
            field(form, 'Texto alternativo', p + 'imageAlt', story.imageAlt, { max: 300, wide: true }),
            field(form, 'Legenda', p + 'imageCaption', story.imageCaption, { max: 500 }),
            field(form, 'Crédito da foto', p + 'imageCredit', story.imageCredit, { max: 300 })
          ]))
        ).details;
      })
    ]);
    if (digest.status === 'sending') doc.querySelectorAll('input, textarea, button').forEach(node => { node.disabled = true; });
    editorNode.replaceChildren(...notes, doc);
  }

  function renderWeekly(edition) {
    const label = edition.editionNumber ? `Edição nº ${pad(edition.editionNumber).padStart(3, '0')}` : edition.slug;
    const period = [brDate(dateKey(edition.weekStart)), brDate(dateKey(edition.weekEnd))].filter(Boolean).join(' a ');
    const total = edition.sections.reduce((sum, section) => sum + section.stories.length, 0);
    setHeader(edition.title || label, [label, period, plural(total, ['notícia', 'notícias'])].filter(Boolean).join(' · '),
      edition.status, edition.status === 'published' ? `/weekly?slug=${encodeURIComponent(edition.slug)}` : '');
    const doc = documentForm(edition, 'weekly', (form, data) => [
      group('Capa da edição',
        field(form, 'Título', 'title', data.title, { required: true, max: 300, wide: true }),
        field(form, 'Subtítulo', 'subtitle', data.subtitle, { max: 500, wide: true }),
        field(form, 'Introdução', 'intro', data.intro, { type: 'textarea', rows: 5 }),
        field(form, 'Análise', 'analysis', data.analysis, { type: 'textarea', rows: 5 }),
        field(form, 'O que acompanhar', 'watchNext', data.watchNext, { type: 'textarea', rows: 4, hint: 'Um item por linha.' })
      ),
      ...data.sections.flatMap((section, s) => {
        const sp = `sections.${s}.`;
        let number = data.sections.slice(0, s).reduce((sum, item) => sum + item.stories.length, 0);
        return [
          sectionTitle(`Seção ${s + 1} · ${section.title}`),
          group('Seção',
            field(form, 'Título da seção', sp + 'title', section.title, { required: true, max: 300, wide: true }),
            field(form, 'Introdução da seção', sp + 'intro', section.intro, { type: 'textarea', rows: 3 })
          ),
          ...section.stories.map((story, i) => {
            const p = `${sp}stories.${i}.`;
            number += 1;
            return storyAccordion(
              { number: pad(number), image: story.imageUrl, title: story.title },
              group('Texto',
                field(form, 'Título', p + 'title', story.title, { required: true, max: 300, wide: true }),
                field(form, 'Resumo', p + 'summary', story.summary, { type: 'textarea', rows: 6 }),
                field(form, 'Rótulo do contexto', p + 'contextLabel', story.contextLabel, { max: 80, wide: true }),
                field(form, 'Contexto', p + 'context', story.context, { type: 'textarea', rows: 6 })
              ),
              group('Fonte',
                field(form, 'Fonte', p + 'source', story.source, { max: 300 }),
                field(form, 'Link da fonte', p + 'url', story.url, { type: 'url', max: 2048 })
              ),
              group('Imagem', imageField(form, p + 'imageUrl', story.imageUrl))
            ).details;
          })
        ];
      })
    ]);
    const notes = edition.status === 'published' ? [notice('Edição publicada: as mudanças aparecem no site depois de salvar.')] : [];
    editorNode.replaceChildren(...notes, doc);
  }

  // Abre a notícia com campo inválido antes de o navegador apontar o erro.
  editorNode.addEventListener('invalid', event => {
    let node = event.target.parentElement;
    while (node && node !== editorNode) {
      if (node.tagName === 'DETAILS') node.open = true;
      node = node.parentElement;
    }
  }, true);

  window.AdminEditorial = {
    activate() { void loadList(); },
    confirmLeave() {
      if (!confirmLeave()) return false;
      state.dirty.clear();
      return true;
    }
  };
})();
