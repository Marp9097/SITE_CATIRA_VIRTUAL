// ================= Loja (páginas: início, produto, busca, carrinho, checkout, pagamento...) =================
const S = {
  settings: {}, categories: [], products: [],
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  favs: new Set(JSON.parse(localStorage.getItem('favs') || '[]')),
  recent: JSON.parse(localStorage.getItem('recent') || '[]'),
  coupon: null,
  timers: [],
};
const CK = { step: 1, ship: null, options: null, quoting: false };
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const unit = (p) => (p.promo_price_cents && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents);
const offPct = (p) => (p.promo_price_cents && p.promo_price_cents < p.price_cents ? Math.round((1 - p.promo_price_cents / p.price_cents) * 100) : 0);
const prod = (id) => S.products.find((p) => p.id === Number(id));
const cat = (id) => S.categories.find((c) => c.id === Number(id));
const freeAbove = () => Number(S.settings.ship_free_above_cents || 0);
const json = (s, d) => { try { return JSON.parse(s) ?? d; } catch { return d; } };
const go = (h) => { location.hash = h; };
const save = () => {
  localStorage.setItem('cart', JSON.stringify(S.cart));
  localStorage.setItem('favs', JSON.stringify([...S.favs]));
  localStorage.setItem('recent', JSON.stringify(S.recent.slice(0, 16)));
  updateCounts();
};
const cartCount = () => S.cart.reduce((a, i) => a + i.qty, 0);
const subtotal = () => S.cart.reduce((a, i) => a + (prod(i.id) ? unit(prod(i.id)) * i.qty : 0), 0);
const cepMask = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
const phoneMask = (v) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/[-( )]+$/, ''); };
const cpfMask = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');

// ---------------- inicialização ----------------
async function init() {
  try {
    const [settings, cats, prods] = await Promise.all([api('/api/public/settings'), api('/api/categories'), api('/api/products')]);
    S.settings = settings; S.categories = cats; S.products = prods;
  } catch (e) {
    $('#view').innerHTML = `<div class="wrap"><div class="offline"><h2>Loja temporariamente fora do ar</h2><p style="color:var(--muted);margin-top:8px">${esc(e.message)}</p><button class="btn" style="margin-top:16px" onclick="location.reload()">Tentar de novo</button></div></div>`;
    return;
  }
  applyTheme(S.settings);
  const fh = S.settings.font_heading || 'Montserrat';
  if (fh !== 'Montserrat') {
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fh)}:ital,wght@0,700;0,800;0,900;1,800;1,900&display=swap`;
    document.head.appendChild(l);
  }
  document.documentElement.style.setProperty('--font-head', `'${fh}', var(--font)`);
  S.cart = S.cart.filter((i) => prod(i.id));
  // compatibilidade com links antigos ?produto=ID
  const old = new URLSearchParams(location.search).get('produto');
  if (old && !location.hash) location.hash = '#/produto/' + old;
  chrome();
  save();
  route();
}

// ---------------- partes fixas (topo, menu, rodapé) ----------------
function chrome() {
  const s = S.settings;
  document.title = s.store_name + (s.store_tagline ? ' — ' + s.store_tagline : '');
  if (s.announcement_enabled === '1' && !sessionStorage.getItem('hideTop') && (s.announcement_text || s.announcement_text2)) {
    $('#topbar').hidden = false;
    $('#topbar').innerHTML = `<div class="wrap"><div class="t1">${icon('truck')}<span>${esc(s.announcement_text)}</span></div>
      ${s.announcement_text2 ? `<div class="t2">${icon('clock')}<span>${esc(s.announcement_text2)}</span></div>` : ''}
      <button id="topClose" aria-label="Fechar">${icon('x')}</button></div>`;
    $('#topClose').onclick = () => { sessionStorage.setItem('hideTop', 1); $('#topbar').hidden = true; };
  }
  const words = (s.store_name || 'Loja').trim();
  $('#logo').innerHTML = s.logo_image_id ? `<img src="${imgUrl(s.logo_image_id)}" alt="${esc(words)}">` : `<span class="mark">${esc(words[0])}</span><span>${esc(words)}</span>`;
  $('#menuBtn').innerHTML = icon('menu');
  $('#qBtn').innerHTML = icon('search');
  $('#hUser').innerHTML = icon('user');
  $('#hFav').innerHTML = icon('heart') + '<span class="count" id="favCount"></span>';
  $('#hCart').innerHTML = icon('cart') + '<span class="count" id="cartCount"></span>';

  const cats = S.categories;
  $('#mainnav').innerHTML = `
    <a href="#/" data-nav="home">Início</a>
    ${cats.length ? `<div class="dd"><a data-nav="cat">Categorias ${icon('chevronDown')}</a><div class="dd-menu"><div class="dd-box">
      ${cats.map((c) => `<a href="#/categoria/${c.id}">${icon(c.icon || 'tag')}${esc(c.name)}</a>`).join('')}
      <a class="all" href="#/produtos">${icon('grid')}Ver todos os produtos</a></div></div></div>` : ''}
    <a href="#/ofertas" data-nav="ofertas">Ofertas</a>
    <a href="#/sobre" data-nav="sobre">Sobre nós</a>
    <a href="#/contato" data-nav="contato">Contato</a>`;

  $('#mnav').innerHTML = `<header>${$('#logo').innerHTML.replace('<img', '<img style="height:36px"')}<button class="hbtn" data-closenav>${icon('x')}</button></header>
    <nav>
      <a href="#/">${icon('home')}Início</a><a href="#/ofertas">${icon('fire')}Ofertas</a><a href="#/produtos">${icon('grid')}Todos os produtos</a>
      <a href="#/favoritos">${icon('heart')}Favoritos</a><a href="#/pedidos">${icon('receipt')}Meus pedidos</a>
      ${cats.length ? '<small>Categorias</small>' + cats.map((c) => `<a href="#/categoria/${c.id}">${icon(c.icon || 'tag')}${esc(c.name)}</a>`).join('') : ''}
      <small>Institucional</small><a href="#/sobre">${icon('star')}Sobre nós</a><a href="#/contato">${icon('mail')}Contato</a>
    </nav>`;

  const wa = (s.whatsapp || '').replace(/\D/g, '');
  if (wa) { $('#wfab').hidden = false; $('#wfab').href = `https://wa.me/${wa}`; $('#wfab').innerHTML = icon('whatsapp'); }

  $('#foot').innerHTML = `<div class="wrap"><div class="cols">
      <div><div class="logo" style="margin-bottom:14px">${$('#logo').innerHTML}</div><p>${esc(s.store_tagline || '')}</p>
        <div class="socials">${s.instagram ? `<a target="_blank" rel="noopener" href="https://instagram.com/${esc(s.instagram.replace(/^@/, ''))}" aria-label="Instagram">${icon('instagram')}</a>` : ''}
        ${wa ? `<a target="_blank" rel="noopener" href="https://wa.me/${wa}" aria-label="WhatsApp">${icon('whatsapp')}</a>` : ''}
        ${s.contact_email ? `<a href="mailto:${esc(s.contact_email)}" aria-label="E-mail">${icon('mail')}</a>` : ''}</div></div>
      <div><h4>Loja</h4><div class="links"><a href="#/produtos">Todos os produtos</a><a href="#/ofertas">Ofertas</a><a href="#/favoritos">Favoritos</a><a href="#/carrinho">Carrinho</a></div></div>
      <div><h4>Categorias</h4><div class="links">${cats.slice(0, 6).map((c) => `<a href="#/categoria/${c.id}">${esc(c.name)}</a>`).join('') || '<p>—</p>'}</div></div>
      <div><h4>Atendimento</h4><div class="links"><a href="#/pedidos">Meus pedidos</a><a href="#/sobre">Sobre nós</a><a href="#/contato">Contato</a>
        ${s.contact_phone ? `<p>${esc(s.contact_phone)}</p>` : ''}${s.contact_email ? `<p>${esc(s.contact_email)}</p>` : ''}</div></div>
    </div>
    <div class="bottom"><span>${esc(s.footer_text || `© ${new Date().getFullYear()} ${s.store_name}. Todos os direitos reservados.`)}</span>
      <span class="pays">Pagamento seguro <span class="pix-badge">${icon('pix')} PIX</span></span></div></div>`;
}

function updateCounts() {
  const c = $('#cartCount'); if (c) { c.textContent = cartCount() || ''; c.dataset.n = cartCount(); }
  const f = $('#favCount'); if (f) { f.textContent = S.favs.size || ''; f.dataset.n = S.favs.size; }
}

// ---------------- rotas ----------------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
function route() {
  S.timers.forEach(clearInterval); S.timers = [];
  closeOverlays();
  const { parts, q } = parseHash();
  const [p0, p1, p2] = parts;
  const nav = { '': 'home', ofertas: 'ofertas', sobre: 'sobre', contato: 'contato', categoria: 'cat' }[p0 || ''];
  $$('#mainnav [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  const v = $('#view');
  v.classList.remove('view'); void v.offsetWidth; v.classList.add('view');
  const pages = {
    '': () => home(), produto: () => productPage(p1), categoria: () => listing('cat', p1, q), busca: () => listing('search', p1, q),
    ofertas: () => listing('offers', null, q), produtos: () => listing('all', null, q), favoritos: () => listing('favs', null, q),
    carrinho: () => cartPage(), checkout: () => checkoutPage(), pagamento: () => payPage(p1, p2), pedidos: () => ordersPage(),
    sobre: () => aboutPage(), contato: () => contactPage(),
  };
  (pages[p0 || ''] || home)();
  if (!['checkout'].includes(p0)) window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

// ---------------- componentes ----------------
function card(p) {
  const out = p.stock != null && p.stock <= 0;
  const off = offPct(p);
  const free = freeAbove() > 0 && unit(p) >= freeAbove();
  return `<article class="pc">
    <a class="im" href="#/produto/${p.id}">${p.images[0] ? `<img src="${imgUrl(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : `<div class="ph">${icon('image')}</div>`}
      ${off ? `<span class="off">-${off}%</span>` : ''}${out ? '<span class="soldout">Esgotado</span>' : ''}</a>
    <button class="fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}" aria-label="Favoritar">${icon('heart')}</button>
    <div class="bd">
      <a class="nm" href="#/produto/${p.id}">${esc(p.name)}</a>
      <div class="was">${off ? brl(p.price_cents) : ''}</div>
      <div class="now"><b>${brl(unit(p))}</b>${off ? `<span class="pct">${off}% OFF</span>` : ''}</div>
      <div class="meta">${free ? '<span class="free">Frete grátis</span>' : ''}${p.sold ? `<span>+${p.sold} vendido${p.sold > 1 ? 's' : ''}</span>` : ''}</div>
      <button class="add" data-add="${p.id}" ${out ? 'disabled' : ''}>${icon('cart')} ${out ? 'Esgotado' : 'Adicionar'}</button>
    </div></article>`;
}
function secTitle(title, more, ic) {
  return `<div class="sec-title"><h2>${ic ? icon(ic) : ''}${title}</h2><span class="ln"></span>${more ? `<a class="more" href="${more[1]}">${more[0]} ${icon('arrow')}</a>` : ''}</div>`;
}
function scroller(list) {
  return `<div class="scroller"><button class="sbtn l" data-scroll="-1">${icon('left')}</button><div class="track">${list.map(card).join('')}</div><button class="sbtn r" data-scroll="1">${icon('chevron')}</button></div>`;
}
const SKEL = `<div class="wrap" style="padding:30px 0"><div class="skel" style="height:360px"></div></div>`;

// ---------------- INÍCIO ----------------
function heroSlides() {
  const s = S.settings;
  let slides = json(s.hero_slides, []);
  if (!Array.isArray(slides) || !slides.length) {
    slides = [{ image_id: s.banner_image_id, eyebrow: 'Bem-vindo à', eyebrow_hl: s.store_name, title: s.banner_title || s.store_name, title_hl: '',
      subtitle: s.banner_subtitle, button_text: 'Explorar loja', button_link: '#/produtos', show_text: true }];
  }
  return slides;
}
function home() {
  const s = S.settings;
  const slides = heroSlides();
  const feats = json(s.features, []);
  const P = S.products;
  const offers = P.filter((p) => offPct(p) > 0).sort((a, b) => offPct(b) - offPct(a));
  const best = P.filter((p) => p.sold > 0).sort((a, b) => b.sold - a.sold);
  const featured = P.filter((p) => p.featured);
  const recent = S.recent.map(prod).filter(Boolean);

  $('#view').innerHTML = `
    <section class="hero2" id="hero">
      ${slides.map((sl, i) => `<div class="slide ${sl.show_text !== false ? 'text' : ''} ${i === 0 ? 'on' : ''}" data-i="${i}">
        ${sl.image_id ? `<img class="bg" src="${imgUrl(sl.image_id)}" alt="">` : '<div class="noimg"></div>'}
        ${sl.show_text !== false ? `<div class="slash"><i></i><i></i></div>
        <div class="hero-txt">
          ${sl.eyebrow || sl.eyebrow_hl ? `<div class="eyebrow">${esc(sl.eyebrow || '')} <span class="hl">${esc(sl.eyebrow_hl || '')}</span></div>` : ''}
          <h1 class="hero-title">${esc(sl.title || '')}${sl.title_hl ? `<span class="hl">${esc(sl.title_hl)}</span>` : ''}</h1>
          ${sl.subtitle ? `<p class="hero-sub">${esc(sl.subtitle)}</p>` : ''}
          ${sl.button_text ? `<a class="btn-neon" href="${esc(sl.button_link || '#/produtos')}">${esc(sl.button_text)} ${icon('arrow')}</a>` : ''}
        </div>` : (sl.button_link ? `<a href="${esc(sl.button_link)}" style="position:absolute;inset:0;z-index:2" aria-label="Abrir"></a>` : '')}
      </div>`).join('')}
      ${slides.length > 1 ? `<button class="harrow l" data-hero="-1">${icon('left')}</button><button class="harrow r" data-hero="1">${icon('chevron')}</button>
        <div class="dots">${slides.map((_, i) => `<button data-dot="${i}" class="${i ? '' : 'on'}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
    </section>
    ${feats.length ? `<section class="features"><div class="wrap">${feats.slice(0, 4).map((f) => `<div class="feat">${icon(f.icon)}<div><b>${esc(f.title)}</b><span>${esc(f.text)}</span></div></div>`).join('')}</div></section>` : ''}
    <div class="wrap">
      ${S.categories.length ? `<section class="sec">${secTitle('Categorias', ['Ver todas as categorias', '#/produtos'])}
        <div class="cat-tiles">${S.categories.map((c) => `<a class="ctile" href="#/categoria/${c.id}">${c.icon || !c.image_id ? icon(c.icon || 'tag') : `<img src="${imgUrl(c.image_id)}" alt="">`}<span>${esc(c.name)}</span></a>`).join('')}</div></section>` : ''}
      ${offers.length ? `<section class="sec">${secTitle('Ofertas <em>Imperdíveis</em>', ['Ver todas as ofertas', '#/ofertas'], 'fire')}${scroller(offers.slice(0, 12))}</section>` : ''}
      ${best.length ? `<section class="sec">${secTitle('Mais <em>vendidos</em>', ['Ver mais', '#/produtos?sort=sold'], 'star')}${scroller(best.slice(0, 12))}</section>` : ''}
      ${featured.length ? `<section class="sec">${secTitle('Destaques', null, 'zap')}${scroller(featured.slice(0, 12))}</section>` : ''}
      <section class="sec">${secTitle('Todos os <em>produtos</em>', ['Ver todos', '#/produtos'], 'grid')}
        ${P.length ? `<div class="pgrid2">${P.slice(0, 12).map(card).join('')}</div>` : '<div class="empty-state">' + icon('box') + '<p>Nenhum produto cadastrado ainda.</p></div>'}
        ${P.length > 12 ? `<div class="pager"><a class="btn-sec" style="width:auto;padding:0 30px;height:46px" href="#/produtos">Ver todos os ${P.length} produtos</a></div>` : ''}</section>
      ${recent.length ? `<section class="sec">${secTitle('Vistos <em>recentemente</em>', null, 'clock')}${scroller(recent.slice(0, 12))}</section>` : ''}
    </div>`;

  // carrossel
  if (slides.length > 1) {
    let cur = 0;
    const show = (i) => {
      cur = (i + slides.length) % slides.length;
      $$('#hero .slide').forEach((el, k) => el.classList.toggle('on', k === cur));
      $$('#hero [data-dot]').forEach((el, k) => el.classList.toggle('on', k === cur));
    };
    $$('#hero [data-dot]').forEach((b) => (b.onclick = () => { show(Number(b.dataset.dot)); }));
    $$('#hero [data-hero]').forEach((b) => (b.onclick = () => show(cur + Number(b.dataset.hero))));
    let x0 = null;
    $('#hero').addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
    $('#hero').addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
    S.timers.push(setInterval(() => { if (!document.hidden) show(cur + 1); }, 6000));
  }
}

// ---------------- LISTAGEM (busca, categoria, ofertas, favoritos) ----------------
function listing(kind, param, q) {
  let base = S.products;
  let title = 'Todos os produtos';
  const crumbs = [['Início', '#/']];
  if (kind === 'cat') { const c = cat(param); base = base.filter((p) => p.category_id === Number(param)); title = c ? c.name : 'Categoria'; crumbs.push([title]); }
  else if (kind === 'search') { const t = (param || '').toLowerCase(); base = base.filter((p) => p.name.toLowerCase().includes(t) || (p.description || '').toLowerCase().includes(t) || (cat(p.category_id)?.name || '').toLowerCase().includes(t)); title = `“${param}”`; crumbs.push(['Busca']); }
  else if (kind === 'offers') { base = base.filter((p) => offPct(p) > 0); title = 'Ofertas'; crumbs.push([title]); }
  else if (kind === 'favs') { base = base.filter((p) => S.favs.has(p.id)); title = 'Meus favoritos'; crumbs.push([title]); }
  else crumbs.push([title]);

  const fcat = q.get('cat'); const min = q.get('min'); const max = q.get('max'); const sort = q.get('sort') || 'rel';
  const onlyOff = q.get('off') === '1'; const freeOnly = q.get('free') === '1';
  let list = base.filter((p) => (!fcat || p.category_id === Number(fcat)) && (!min || unit(p) >= Number(min) * 100) && (!max || unit(p) <= Number(max) * 100)
    && (!onlyOff || offPct(p) > 0) && (!freeOnly || (freeAbove() > 0 && unit(p) >= freeAbove())));
  const sorters = { price_asc: (a, b) => unit(a) - unit(b), price_desc: (a, b) => unit(b) - unit(a), sold: (a, b) => b.sold - a.sold, off: (a, b) => offPct(b) - offPct(a), new: (a, b) => b.id - a.id };
  if (sorters[sort]) list = [...list].sort(sorters[sort]);
  const limit = Number(q.get('n') || 24);

  const link = (changes) => {
    const nq = new URLSearchParams(q);
    for (const [k, v] of Object.entries(changes)) (v == null || v === '') ? nq.delete(k) : nq.set(k, v);
    nq.delete('n');
    const path = location.hash.split('?')[0];
    return path + (nq.toString() ? '?' + nq : '');
  };
  const catCounts = {};
  base.forEach((p) => { if (p.category_id) catCounts[p.category_id] = (catCounts[p.category_id] || 0) + 1; });

  $('#view').innerHTML = `<div class="wrap">
    <div class="crumbs">${crumbs.map(([t, h], i) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`) + (i < crumbs.length - 1 ? icon('chevron') : '')).join('')}</div>
    <div class="listing">
      <aside class="filters" id="filters">
        <div><h1>${esc(title)}</h1><div class="cnt">${list.length} resultado${list.length === 1 ? '' : 's'}</div></div>
        ${kind !== 'cat' && Object.keys(catCounts).length ? `<div class="fgroup"><h4>Categorias</h4>
          ${fcat ? `<a href="${link({ cat: null })}">Todas</a>` : ''}
          ${S.categories.filter((c) => catCounts[c.id]).map((c) => `<a class="${fcat == c.id ? 'on' : ''}" href="${link({ cat: c.id })}">${esc(c.name)} <small>${catCounts[c.id]}</small></a>`).join('')}</div>` : ''}
        <div class="fgroup"><h4>Preço</h4>
          <a class="${!min && max === '50' ? 'on' : ''}" href="${link({ min: null, max: 50 })}">Até R$ 50</a>
          <a class="${min === '50' && max === '150' ? 'on' : ''}" href="${link({ min: 50, max: 150 })}">R$ 50 a R$ 150</a>
          <a class="${min === '150' && !max ? 'on' : ''}" href="${link({ min: 150, max: null })}">Mais de R$ 150</a>
          <form class="price-range" id="pr"><input name="min" inputmode="numeric" placeholder="Mínimo" value="${esc(min || '')}"><span>–</span><input name="max" inputmode="numeric" placeholder="Máximo" value="${esc(max || '')}"><button aria-label="Aplicar">${icon('chevron')}</button></form>
        </div>
        <div class="fgroup"><h4>Filtros</h4>
          <a class="${onlyOff ? 'on' : ''}" href="${link({ off: onlyOff ? null : 1 })}">Somente com desconto</a>
          ${freeAbove() ? `<a class="${freeOnly ? 'on' : ''}" href="${link({ free: freeOnly ? null : 1 })}">Frete grátis</a>` : ''}
          ${min || max || fcat || onlyOff || freeOnly ? `<a href="${location.hash.split('?')[0]}" style="color:var(--primary)">Limpar filtros</a>` : ''}
        </div>
      </aside>
      <section>
        <div class="lbar"><button class="btn ghost sm ftoggle" id="fOpen">${icon('filter')} Filtrar</button><span style="color:var(--muted);font-size:14px">${list.length} produto(s)</span>
          <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)">Ordenar por
          <select id="sort">${[['rel', 'Mais relevantes'], ['price_asc', 'Menor preço'], ['price_desc', 'Maior preço'], ['sold', 'Mais vendidos'], ['off', 'Maior desconto'], ['new', 'Mais recentes']].map(([k, l]) => `<option value="${k}" ${sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        ${list.length ? `<div class="pgrid2">${list.slice(0, limit).map(card).join('')}</div>` : `<div class="empty-state box">${icon(kind === 'favs' ? 'heart' : 'search')}<h3>${kind === 'favs' ? 'Você ainda não favoritou nada' : 'Nenhum produto encontrado'}</h3><p>${kind === 'favs' ? 'Toque no coração dos produtos para salvar aqui.' : 'Tente outros termos ou remova os filtros.'}</p><a class="btn" href="#/produtos">Ver todos os produtos</a></div>`}
        ${list.length > limit ? `<div class="pager"><button class="btn-sec" style="width:auto;padding:0 30px;height:46px" id="more">Carregar mais</button></div>` : ''}
      </section>
    </div></div>`;
  $('#sort').onchange = (e) => go(link({ sort: e.target.value === 'rel' ? null : e.target.value }));
  $('#pr').onsubmit = (e) => { e.preventDefault(); go(link({ min: e.target.min.value.replace(/\D/g, ''), max: e.target.max.value.replace(/\D/g, '') })); };
  $('#fOpen').onclick = () => { $('#filters').classList.add('open'); $('#overlay').classList.add('open'); };
  if ($('#more')) $('#more').onclick = () => { const nq = new URLSearchParams(q); nq.set('n', limit + 24); history.replaceState(null, '', location.hash.split('?')[0] + '?' + nq); listing(kind, param, nq); };
}

// ---------------- PRODUTO (tela cheia) ----------------
function productPage(id) {
  const p = prod(id);
  if (!p) { $('#view').innerHTML = `<div class="wrap"><div class="empty-state">${icon('box')}<h3>Produto não encontrado</h3><a class="btn" href="#/">Voltar ao início</a></div></div>`; return; }
  S.recent = [p.id, ...S.recent.filter((x) => x !== p.id)]; save();
  const c = cat(p.category_id);
  const off = offPct(p);
  const out = p.stock != null && p.stock <= 0;
  const maxQ = p.stock != null ? Math.min(p.stock, 20) : 20;
  const related = S.products.filter((x) => x.id !== p.id && x.category_id === p.category_id).slice(0, 12);
  const imgs = p.images;
  let idx = 0;
  const savedCep = localStorage.getItem('cep') || '';
  const free = freeAbove() > 0 && unit(p) >= freeAbove();

  $('#view').innerHTML = `<div class="wrap">
    <div class="crumbs"><a href="#/">Início</a>${icon('chevron')}${c ? `<a href="#/categoria/${c.id}">${esc(c.name)}</a>${icon('chevron')}` : ''}<span>${esc(p.name)}</span></div>
    <div class="pdp">
      <div class="pgal">
        ${imgs.length > 1 ? `<div class="th">${imgs.map((im, i) => `<img src="${imgUrl(im)}" data-th="${i}" class="${i ? '' : 'on'}" alt="">`).join('')}</div>` : '<div></div>'}
        <div class="main" id="pmain">${imgs[0] ? `<img id="pimg" src="${imgUrl(imgs[0])}" alt="${esc(p.name)}">` : `<div class="ph">${icon('image')}</div>`}
          ${imgs.length > 1 ? `<button class="navb l" data-pn="-1">${icon('left')}</button><button class="navb r" data-pn="1">${icon('chevron')}</button>` : ''}</div>
      </div>
      <div class="pinfo">
        <div class="top"><span>Novo${p.sold ? ` | +${p.sold} vendido${p.sold > 1 ? 's' : ''}` : ''}</span><button class="fav ${S.favs.has(p.id) ? 'on' : ''}" data-fav="${p.id}">${icon('heart')}</button></div>
        <h1>${esc(p.name)}</h1>
        <div class="pprice">${off ? `<div class="was">${brl(p.price_cents)}</div>` : ''}
          <div class="now"><b>${brl(unit(p))}</b>${off ? `<span class="pct">${off}% OFF</span>` : ''}</div>
          <div class="pixline">${icon('pix')} Pagamento à vista no Pix, com aprovação imediata</div></div>
        <div class="buybox">
          <div class="stock ${p.stock != null && p.stock <= 5 && p.stock > 0 ? 'low' : ''}">${out ? 'Produto esgotado' : p.stock == null ? 'Estoque disponível' : p.stock <= 5 ? `Últimas ${p.stock} unidade${p.stock > 1 ? 's' : ''}!` : `Estoque disponível <small>(${p.stock} unidades)</small>`}</div>
          ${out ? '' : `<div class="qtysel">Quantidade: <div class="qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div>${p.stock != null ? `<small style="color:var(--muted)">(${p.stock} disponíveis)</small>` : ''}</div>`}
          <button class="btn-pri" id="buyNow" ${out ? 'disabled' : ''}>${icon('zap')} Comprar agora</button>
          <button class="btn-sec" id="addCart" ${out ? 'disabled' : ''}>${icon('cart')} Adicionar ao carrinho</button>
          <div class="shipcalc">
            <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px">${icon('truck')} ${free ? '<span style="color:var(--ok)">Frete grátis</span> — calcule o prazo' : 'Calcular frete e prazo'}</div>
            <form class="row" id="shipForm"><input id="cepIn" inputmode="numeric" placeholder="00000-000" value="${esc(cepMask(savedCep))}"><button>Calcular</button></form>
            <a class="small" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a>
            <div class="ship-opts" id="shipRes"></div>
          </div>
          <div class="perks">
            <div>${icon('shield')}<span><b>Compra garantida</b><br>Receba o produto que está esperando ou devolvemos o dinheiro.</span></div>
            <div>${icon('lock')}<span><b>Pagamento seguro</b><br>Seus dados protegidos de ponta a ponta.</span></div>
          </div>
        </div>
      </div>
    </div>
    ${p.description ? `<div class="pdesc"><h2>Descrição</h2><p>${esc(p.description)}</p></div>` : ''}
    ${related.length ? `<section class="sec">${secTitle('Produtos <em>relacionados</em>', c ? ['Ver categoria', '#/categoria/' + c.id] : null)}${scroller(related)}</section>` : ''}
  </div>`;

  const setImg = (i) => {
    if (!imgs.length) return;
    idx = (i + imgs.length) % imgs.length;
    $('#pimg').src = imgUrl(imgs[idx]);
    $$('[data-th]').forEach((t, k) => t.classList.toggle('on', k === idx));
  };
  $$('[data-th]').forEach((t) => (t.onmouseenter = t.onclick = () => setImg(Number(t.dataset.th))));
  $$('[data-pn]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); setImg(idx + Number(b.dataset.pn)); }));
  const main = $('#pmain');
  if (imgs.length && matchMedia('(hover:hover)').matches) {
    main.onmousemove = (e) => { const r = main.getBoundingClientRect(); $('#pimg').style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; main.classList.add('zoom'); };
    main.onmouseleave = () => main.classList.remove('zoom');
  }
  if (imgs.length) main.onclick = () => openLightbox(imgs, idx);

  let qty = 1;
  if ($('#qm')) {
    $('#qm').onclick = () => { qty = Math.max(1, qty - 1); $('#qv').textContent = qty; };
    $('#qp').onclick = () => { qty = Math.min(maxQ, qty + 1); $('#qv').textContent = qty; };
  }
  $('#addCart').onclick = () => addToCart(p.id, qty);
  $('#buyNow').onclick = () => { addToCart(p.id, qty, true); go('#/checkout'); };
  $('#cepIn').oninput = (e) => (e.target.value = cepMask(e.target.value));
  $('#shipForm').onsubmit = async (e) => {
    e.preventDefault();
    const cep = $('#cepIn').value.replace(/\D/g, '');
    if (cep.length !== 8) return toast('Digite um CEP válido', 'err');
    localStorage.setItem('cep', cep);
    $('#shipRes').innerHTML = '<div class="cep-status"><span class="spin"></span> Calculando...</div>';
    try {
      const r = await api('/api/shipping/quote', { method: 'POST', body: { cep, items: [{ product_id: p.id, qty }] } });
      $('#shipRes').innerHTML = r.options.length ? r.options.map(shipOptHTML).join('') : '<div class="cep-status">Entrega a combinar com a loja.</div>';
    } catch (err) { $('#shipRes').innerHTML = `<div class="cep-status" style="color:var(--danger)">${esc(err.message)}</div>`; }
  };
  if (savedCep.length === 8) $('#shipForm').requestSubmit();
}
function shipOptHTML(o) {
  return `<div class="ship-opt">${o.picture ? `<img src="${esc(o.picture)}" alt="" style="width:46px;height:22px;object-fit:contain;background:#fff;border-radius:4px;padding:2px">` : icon(o.pickup ? 'pin' : 'truck')}
    <div>${esc(o.name)}<small>${o.pickup ? esc(o.info || 'Combine a retirada com a loja') : o.days ? `Chega em até ${o.days} dia${o.days > 1 ? 's' : ''} úte${o.days > 1 ? 'is' : 'il'}` : ''}</small></div>
    ${o.price_cents ? `<b>${brl(o.price_cents)}</b>` : '<b class="free">Grátis</b>'}</div>`;
}
function openLightbox(imgs, i) {
  const lb = $('#lightbox');
  let k = i;
  const draw = () => {
    lb.innerHTML = `<button class="hbtn cls" data-lbx>${icon('x')}</button>${imgs.length > 1 ? `<button class="navb l" data-lbn="-1">${icon('left')}</button><button class="navb r" data-lbn="1">${icon('chevron')}</button>` : ''}<img src="${imgUrl(imgs[k])}" alt="">`;
    $$('[data-lbn]', lb).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); k = (k + Number(b.dataset.lbn) + imgs.length) % imgs.length; draw(); }));
  };
  draw();
  lb.classList.add('open');
  lb.onclick = (e) => { if (e.target === lb || e.target.closest('[data-lbx]')) lb.classList.remove('open'); };
}

// ---------------- CARRINHO ----------------
function addToCart(id, qty = 1, silent) {
  const p = prod(id);
  if (!p) return;
  const max = p.stock != null ? p.stock : 999;
  const it = S.cart.find((i) => i.id === p.id);
  if (it) it.qty = Math.min(max, it.qty + qty); else S.cart.push({ id: p.id, qty: Math.min(max, qty) });
  save();
  if (!silent) toast(`${p.name} adicionado ao carrinho`);
  CK.options = null; CK.ship = null;
}
async function revalidateCoupon() {
  if (!S.coupon) return;
  try { S.coupon = await api('/api/coupons/validate', { method: 'POST', body: { code: S.coupon.code, subtotal_cents: subtotal() } }); }
  catch (e) { toast(e.message, 'err'); S.coupon = null; }
}
function couponHTML() {
  return S.coupon
    ? `<div class="coupon-ok"><span>${icon('tag')} Cupom <b>${esc(S.coupon.code)}</b> aplicado</span><button class="link" data-rmcoupon>remover</button></div>`
    : `<form class="coupon-row" data-coupon><input class="input" name="code" placeholder="Cupom de desconto" style="text-transform:uppercase"><button class="btn ghost">Aplicar</button></form>`;
}
function totalsHTML(shipLine) {
  const sub = subtotal();
  const disc = S.coupon ? S.coupon.discount_cents : 0;
  const ship = CK.ship ? CK.ship.price_cents : 0;
  const fa = freeAbove();
  return `<div class="totals">
    <div class="muted"><span>Produtos (${cartCount()})</span><span>${brl(sub)}</span></div>
    ${disc ? `<div class="disc"><span>Desconto</span><span>− ${brl(disc)}</span></div>` : ''}
    <div class="muted"><span>Frete</span><span>${CK.ship ? (ship ? brl(ship) : '<b style="color:var(--ok)">Grátis</b>') : shipLine || 'Calculado no checkout'}</span></div>
    <div class="grand"><span>Total</span><span>${brl(Math.max(0, sub - disc) + ship)}</span></div>
    ${fa && sub < fa && !CK.ship ? `<div style="font-size:13px;color:var(--muted);margin-top:6px">Faltam <b style="color:var(--ok)">${brl(fa - sub)}</b> para ganhar frete grátis</div>` : ''}
  </div>`;
}
function cartPage() {
  if (!S.cart.length) {
    $('#view').innerHTML = `<div class="wrap"><h1 class="page-h">Carrinho</h1><div class="box empty-state">${icon('cart')}<h3>Seu carrinho está vazio</h3><p>Que tal conferir as ofertas de hoje?</p><a class="btn" href="#/ofertas">Ver ofertas</a></div></div>`;
    return;
  }
  CK.ship = null;
  $('#view').innerHTML = `<div class="wrap"><h1 class="page-h">Carrinho</h1>
    <div class="cartpage">
      <div class="box"><div class="box-h">Produtos <button class="link" id="clearCart">Esvaziar carrinho</button></div>
        ${S.cart.map((i) => {
          const p = prod(i.id); const off = offPct(p);
          return `<div class="citem">
            <a href="#/produto/${p.id}">${p.images[0] ? `<img src="${imgUrl(p.images[0])}" alt="">` : '<div class="ph"></div>'}</a>
            <div><a class="nm" href="#/produto/${p.id}">${esc(p.name)}</a>
              <div class="acts"><button data-rm="${p.id}">Excluir</button><button data-fav="${p.id}">${S.favs.has(p.id) ? 'Favoritado' : 'Favoritar'}</button></div></div>
            <div class="rt"><div class="qty"><button data-dec="${p.id}">−</button><span>${i.qty}</span><button data-inc="${p.id}">+</button></div>
              <div>${off ? `<s>${brl(p.price_cents * i.qty)}</s> ` : ''}<b>${brl(unit(p) * i.qty)}</b></div></div>
          </div>`;
        }).join('')}
      </div>
      <aside class="box summary"><div class="box-h">Resumo da compra</div><div class="box-b" style="display:grid;gap:16px">
        ${couponHTML()}${totalsHTML()}
        <a class="btn-pri" href="#/checkout">Continuar a compra</a>
        <a class="btn-sec" href="#/produtos" style="height:46px;font-size:14px">Continuar comprando</a>
      </div></aside>
    </div></div>`;
  $('#clearCart').onclick = () => { if (confirm('Remover todos os produtos do carrinho?')) { S.cart = []; S.coupon = null; save(); cartPage(); } };
}

// ---------------- CHECKOUT ----------------
const needAddress = () => S.settings.ask_address === '1';
function checkoutPage() {
  if (!S.cart.length) return go('#/carrinho');
  const cust = json(localStorage.getItem('customer'), {});
  const addr = json(localStorage.getItem('address'), {});
  CK.data = { customer_name: cust.customer_name || '', customer_email: cust.customer_email || '', customer_phone: cust.customer_phone || '', customer_doc: cust.customer_doc || '' };
  CK.addr = { cep: addr.cep || '', street: addr.street || '', number: addr.number || '', complement: addr.complement || '', district: addr.district || '', city: addr.city || '', uf: addr.uf || '', reference: addr.reference || '', nonum: !!addr.nonum };
  CK.notes = '';
  CK.step = 1; CK.options = null; CK.ship = null;
  renderCheckout();
}
function stepsList() { return needAddress() ? ['Dados', 'Endereço', 'Entrega', 'Pagamento'] : ['Dados', 'Entrega', 'Pagamento']; }
function stepKey(n) { return stepsList()[n - 1]; }
function renderCheckout() {
  const steps = stepsList();
  const sumItems = S.cart.map((i) => { const p = prod(i.id); return `<div class="si">${p.images[0] ? `<img src="${imgUrl(p.images[0])}" alt="">` : '<div class="ph"></div>'}<span><b>${esc(p.name)}</b>Qtd: ${i.qty}</span><span style="flex:none;color:var(--text)">${brl(unit(p) * i.qty)}</span></div>`; }).join('');
  $('#view').innerHTML = `<div class="wrap">
    <div class="ck-head"><h1 class="page-h" style="margin:0">Finalizar compra</h1><span class="secure">${icon('lock')} Ambiente seguro</span></div>
    <div class="stepper">${steps.map((s, i) => `${i ? '<span class="sep"></span>' : ''}<div class="${CK.step === i + 1 ? 'on' : CK.step > i + 1 ? 'done' : ''}"><i>${CK.step > i + 1 ? '✓' : i + 1}</i><span class="lbl">${s}</span></div>`).join('')}</div>
    <div class="cartpage">
      <div id="ckSteps">${steps.map((s, i) => stepBox(s, i + 1)).join('')}</div>
      <aside class="box summary"><div class="box-h">Resumo do pedido <a class="link" href="#/carrinho" style="color:var(--primary);text-decoration:none;font-size:13px">Editar</a></div>
        <div class="box-b" style="display:grid;gap:14px"><div class="sum-items">${sumItems}</div>${couponHTML()}<div id="ckTotals">${totalsHTML(CK.step >= steps.indexOf('Entrega') + 1 ? 'Escolha a entrega' : 'Informe o endereço')}</div></div></aside>
    </div></div>`;
  bindCheckout();
}
function stepBox(name, n) {
  const state = CK.step === n ? 'open' : CK.step > n ? 'done' : 'locked';
  const head = `<div class="box-h"><span class="n"><i>${state === 'done' ? icon('check') : n}</i>${name === 'Dados' ? 'Seus dados' : name === 'Endereço' ? 'Endereço de entrega' : name === 'Entrega' ? 'Forma de entrega' : 'Pagamento'}</span>
    ${state === 'done' ? `<button class="edit" data-step="${n}">Alterar</button>` : ''}</div>`;
  let body = '';
  if (state === 'done') body = `<div class="resume">${resumeOf(name)}</div>`;
  if (state === 'open') body = `<div class="box-b">${formOf(name)}</div>`;
  return `<div class="box ckstep ${state}">${head}${body}</div>`;
}
function resumeOf(name) {
  const d = CK.data, a = CK.addr;
  if (name === 'Dados') return `${esc(d.customer_name)} · ${esc(d.customer_email)}${d.customer_phone ? ' · ' + esc(d.customer_phone) : ''}`;
  if (name === 'Endereço') return `${esc(a.street)}, ${esc(a.nonum ? 's/n' : a.number)}${a.complement ? ' - ' + esc(a.complement) : ''} — ${esc(a.district)}, ${esc(a.city)}/${esc(a.uf)}${a.cep ? ' · CEP ' + cepMask(a.cep) : ''}`;
  if (name === 'Entrega') return CK.ship ? `${esc(CK.ship.name)} — ${CK.ship.price_cents ? brl(CK.ship.price_cents) : 'Grátis'}` : 'Entrega combinada com a loja';
  return '';
}
function formOf(name) {
  const d = CK.data, a = CK.addr;
  if (name === 'Dados') return `<form id="ckForm" class="fgrid" novalidate>
      <div class="field c6"><label>Nome completo *</label><input class="input" name="customer_name" autocomplete="name" required value="${esc(d.customer_name)}"></div>
      <div class="field c3"><label>E-mail *</label><input class="input" type="email" name="customer_email" autocomplete="email" required value="${esc(d.customer_email)}"></div>
      <div class="field c3"><label>WhatsApp / celular</label><input class="input" type="tel" name="customer_phone" autocomplete="tel" placeholder="(00) 00000-0000" value="${esc(d.customer_phone)}"></div>
      <div class="field c3"><label>CPF (opcional)</label><input class="input" name="customer_doc" inputmode="numeric" placeholder="000.000.000-00" value="${esc(d.customer_doc)}"></div>
      <div class="c6 ck-actions"><button class="btn-pri">Continuar</button></div></form>`;
  if (name === 'Endereço') return `<form id="ckForm" class="fgrid" novalidate>
      <div class="field c6"><label>CEP</label><div class="cep-row"><input class="input" name="cep" inputmode="numeric" autocomplete="postal-code" placeholder="00000-000" value="${esc(cepMask(a.cep))}">
        <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei meu CEP</a></div><span class="cep-status" id="cepSt">Digite o CEP para preencher automaticamente, ou preencha os campos abaixo.</span></div>
      <div class="field c4"><label>Rua / Avenida *</label><input class="input" name="street" autocomplete="address-line1" value="${esc(a.street)}"></div>
      <div class="field c2"><label>Número *</label><input class="input" name="number" inputmode="numeric" value="${esc(a.number)}" ${a.nonum ? 'disabled' : ''}></div>
      <label class="chk c6" style="justify-content:flex-end"><input type="checkbox" name="nonum" ${a.nonum ? 'checked' : ''}> Sem número</label>
      <div class="field c3"><label>Complemento</label><input class="input" name="complement" placeholder="Apto, bloco, casa..." value="${esc(a.complement)}"></div>
      <div class="field c3"><label>Bairro *</label><input class="input" name="district" value="${esc(a.district)}"></div>
      <div class="field c4"><label>Cidade *</label><input class="input" name="city" autocomplete="address-level2" value="${esc(a.city)}"></div>
      <div class="field c2"><label>Estado *</label><select class="input" name="uf"><option value="">UF</option>${UFS.map((u) => `<option ${a.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="field c6"><label>Ponto de referência</label><input class="input" name="reference" placeholder="Opcional" value="${esc(a.reference)}"></div>
      <div class="c6 ck-actions"><button class="btn-pri">Continuar</button></div></form>`;
  if (name === 'Entrega') {
    if (!CK.options) return `<div class="cep-status"><span class="spin"></span> Calculando opções de entrega...</div>`;
    if (!CK.options.length) return `<p style="color:var(--muted)">A entrega será combinada diretamente com a loja após o pedido.</p><div class="ck-actions"><button class="btn-pri" id="shipNext">Continuar</button></div>`;
    return `${CK.options.map((o) => `<label class="radio-card ${CK.ship && CK.ship.id === o.id ? 'on' : ''}" data-ship="${esc(o.id)}"><span class="dot"></span>
        ${o.picture ? `<img class="co" src="${esc(o.picture)}" alt="">` : icon(o.pickup ? 'pin' : 'truck')}
        <span class="tx"><b>${esc(o.name)}</b><small>${o.pickup ? esc(o.info || 'Retire sem custo — combinamos o horário') : o.days ? `Chega em até ${o.days} dia${o.days > 1 ? 's' : ''} úte${o.days > 1 ? 'is' : 'il'}` : 'Prazo informado após o pedido'}</small></span>
        <span class="pr ${o.price_cents ? '' : 'free'}">${o.price_cents ? brl(o.price_cents) : 'Grátis'}</span></label>`).join('')}
      <div class="ck-actions"><button class="btn-pri" id="shipNext" ${CK.ship ? '' : 'disabled'}>Continuar</button></div>`;
  }
  // Pagamento
  const s = S.settings;
  return `<div class="radio-card on"><span class="dot"></span>${icon('pix')}<span class="tx"><b>Pix</b><small>${s.payment_mode === 'mercadopago' ? 'Aprovação imediata — o pedido é confirmado automaticamente' : 'Pague com o QR Code ou copia e cola no app do seu banco'}</small></span><span class="pix-badge">${icon('zap')} na hora</span></div>
    <div class="field" style="margin-top:6px"><label>Observações para a loja</label><input class="input" id="ckNotes" placeholder="Opcional" value="${esc(CK.notes)}"></div>
    <div class="ck-actions"><button class="btn-pri" id="placeOrder">${icon('lock')} ${s.payment_available ? 'Finalizar e pagar com Pix' : 'Finalizar pedido'}</button></div>`;
}
function invalid(form, names) {
  let ok = true;
  names.forEach((n) => { const el = form[n]; const bad = !el.disabled && !String(el.value).trim(); el.classList.toggle('bad', bad); if (bad && ok) { el.focus(); ok = false; } });
  return ok;
}
function bindCheckout() {
  $$('[data-step]').forEach((b) => (b.onclick = () => { CK.step = Number(b.dataset.step); renderCheckout(); }));
  const name = stepKey(CK.step);
  const f = $('#ckForm');
  if (name === 'Dados') {
    f.customer_phone.oninput = (e) => (e.target.value = phoneMask(e.target.value));
    f.customer_doc.oninput = (e) => (e.target.value = cpfMask(e.target.value));
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!invalid(f, ['customer_name', 'customer_email'])) return toast('Preencha os campos obrigatórios', 'err');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.customer_email.value.trim())) { f.customer_email.classList.add('bad'); return toast('E-mail inválido', 'err'); }
      const doc = f.customer_doc.value.replace(/\D/g, '');
      if (doc && doc.length !== 11) { f.customer_doc.classList.add('bad'); return toast('CPF incompleto', 'err'); }
      CK.data = Object.fromEntries(new FormData(f));
      localStorage.setItem('customer', JSON.stringify(CK.data));
      nextStep();
    };
  } else if (name === 'Endereço') {
    const st = $('#cepSt');
    let last = '';
    f.cep.oninput = async (e) => {
      e.target.value = cepMask(e.target.value);
      const cep = e.target.value.replace(/\D/g, '');
      if (cep.length !== 8 || cep === last) return;
      last = cep;
      st.innerHTML = '<span class="spin"></span> Buscando endereço...';
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
        if (r.erro) { st.innerHTML = `<span style="color:var(--warn)">CEP não encontrado. Preencha o endereço manualmente.</span>`; f.street.focus(); return; }
        if (r.logradouro) f.street.value = r.logradouro;
        if (r.bairro) f.district.value = r.bairro;
        if (r.localidade) f.city.value = r.localidade;
        if (r.uf) f.uf.value = r.uf;
        st.innerHTML = `<span style="color:var(--ok)">✓ ${esc(r.localidade)}/${esc(r.uf)}</span>${r.logradouro ? '' : ' — este CEP é geral da cidade, preencha a rua e o bairro.'}`;
        (r.logradouro ? (f.number.disabled ? f.complement : f.number) : f.street).focus();
      } catch { st.innerHTML = '<span style="color:var(--warn)">Não consegui buscar o CEP agora. Preencha manualmente.</span>'; }
    };
    f.nonum.onchange = () => { f.number.disabled = f.nonum.checked; if (f.nonum.checked) { f.number.value = ''; f.number.classList.remove('bad'); } };
    f.onsubmit = (e) => {
      e.preventDefault();
      const cep = f.cep.value.replace(/\D/g, '');
      if (cep && cep.length !== 8) { f.cep.classList.add('bad'); return toast('CEP incompleto', 'err'); }
      if (!invalid(f, ['street', 'number', 'district', 'city', 'uf'])) return toast('Preencha os campos obrigatórios do endereço', 'err');
      CK.addr = { cep, street: f.street.value.trim(), number: f.nonum.checked ? '' : f.number.value.trim(), nonum: f.nonum.checked, complement: f.complement.value.trim(),
        district: f.district.value.trim(), city: f.city.value.trim(), uf: f.uf.value, reference: f.reference.value.trim() };
      localStorage.setItem('address', JSON.stringify(CK.addr));
      if (cep) localStorage.setItem('cep', cep);
      CK.options = null; CK.ship = null;
      nextStep();
    };
  } else if (name === 'Entrega') {
    if (!CK.options) loadShipping();
    $$('[data-ship]').forEach((el) => (el.onclick = () => {
      CK.ship = CK.options.find((o) => o.id === el.dataset.ship);
      $$('[data-ship]').forEach((x) => x.classList.toggle('on', x === el));
      $('#shipNext').disabled = false;
      $('#ckTotals').innerHTML = totalsHTML();
    }));
    if ($('#shipNext')) $('#shipNext').onclick = () => nextStep();
  } else if (name === 'Pagamento') {
    $('#ckNotes').oninput = (e) => (CK.notes = e.target.value);
    $('#placeOrder').onclick = placeOrder;
  }
}
function nextStep() { CK.step++; renderCheckout(); const open = $('.ckstep.open'); if (open) open.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function loadShipping() {
  try {
    const r = await api('/api/shipping/quote', { method: 'POST', body: { cep: needAddress() ? CK.addr.cep : '', uf: needAddress() ? CK.addr.uf : '', items: S.cart.map((i) => ({ product_id: i.id, qty: i.qty })) } });
    CK.options = r.options;
    if (CK.options.length === 1) CK.ship = CK.options[0];
    if (!CK.options.length && r.errors?.length) toast('Não foi possível calcular o frete agora. Tente novamente.', 'err');
  } catch (e) { CK.options = []; toast(e.message, 'err'); }
  if (stepKey(CK.step) === 'Entrega') renderCheckout();
}
async function placeOrder() {
  const btn = $('#placeOrder');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Gerando pedido...';
  const body = {
    ...CK.data,
    items: S.cart.map((i) => ({ product_id: i.id, qty: i.qty })),
    coupon_code: S.coupon?.code,
    shipping_option: CK.ship?.id,
    notes: CK.notes,
  };
  if (needAddress()) body.address = CK.addr;
  try {
    const order = await api('/api/orders', { method: 'POST', body });
    S.cart = []; S.coupon = null; CK.ship = null; save();
    const mine = json(localStorage.getItem('my_orders'), []);
    mine.unshift({ c: order.code, t: order.public_token, at: Date.now(), total: order.total_cents });
    localStorage.setItem('my_orders', JSON.stringify(mine.slice(0, 30)));
    api('/api/products').then((p) => (S.products = p)).catch(() => {});
    sessionStorage.setItem('order_' + order.code, JSON.stringify(order));
    go(`#/pagamento/${order.code}/${order.public_token}`);
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.innerHTML = 'Tentar novamente';
    if (/entrega|frete/i.test(e.message)) { CK.options = null; CK.ship = null; CK.step = stepsList().indexOf('Entrega') + 1; renderCheckout(); }
  }
}

// ---------------- PAGAMENTO ----------------
async function payPage(code, token) {
  $('#view').innerHTML = SKEL;
  let o = json(sessionStorage.getItem('order_' + code), null);
  try { o = await api(`/api/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`); } catch (e) { if (!o) { $('#view').innerHTML = `<div class="wrap"><div class="empty-state">${icon('receipt')}<h3>Pedido não encontrado</h3></div></div>`; return; } }
  const nota = `pedido.html?c=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`;
  const render = (o) => {
    if (o.status !== 'pending') {
      $('#view').innerHTML = `<div class="wrap paypage"><div class="box"><div class="box-b">
        <div class="success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg></div>
        <h1 style="font-size:26px">${o.status === 'canceled' ? 'Pedido cancelado' : 'Pagamento confirmado!'}</h1>
        <p style="color:var(--muted)">Pedido <b>#${esc(o.code)}</b> · ${brl(o.total_cents)}<br>${o.status === 'canceled' ? '' : 'Enviamos a confirmação para o seu e-mail.'}</p>
        <a class="btn-pri" href="${nota}">${icon('receipt')} Ver nota do pedido</a><a class="btn-sec" href="#/">Continuar comprando</a></div></div></div>`;
      return;
    }
    if (!o.pix_payload && !o.pix_qr_base64) {
      $('#view').innerHTML = `<div class="wrap paypage"><div class="box"><div class="box-b"><div class="success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10"/></svg></div>
        <h1 style="font-size:24px">Pedido #${esc(o.code)} recebido!</h1><p style="color:var(--muted)">Total ${brl(o.total_cents)}. Em breve entraremos em contato para combinar o pagamento.</p>
        <a class="btn-pri" href="${nota}">Ver nota do pedido</a></div></div></div>`;
      return;
    }
    const qr = o.pix_qr_base64 ? `data:image/png;base64,${o.pix_qr_base64}` : qrDataUrl(o.pix_payload);
    const auto = o.payment_method === 'mercadopago';
    $('#view').innerHTML = `<div class="wrap paypage"><div class="box"><div class="box-h"><span>Pedido #${esc(o.code)}</span><span class="status-pill pending"><span class="pulse"></span> Aguardando pagamento</span></div>
      <div class="box-b">
        <span class="pix-badge">${icon('pix')} PAGUE COM PIX</span>
        <div class="amount">${brl(o.total_cents)}</div>
        ${qr ? `<div class="qr"><img src="${qr}" alt="QR Code Pix"></div>` : ''}
        <div class="code">${esc(o.pix_payload || '')}</div>
        <button class="btn-pri" id="copyPix">Copiar código Pix</button>
        <div class="steps-pix"><div><i>1</i>Abra o app do seu banco e entre na área Pix.</div><div><i>2</i>Escolha <b>Ler QR Code</b> ou <b>Pix Copia e Cola</b>.</div><div><i>3</i>Confira o valor e confirme o pagamento.</div></div>
        <p class="timer">${auto ? 'Esta página atualiza sozinha assim que o pagamento for aprovado.' : 'Após o pagamento, a loja confirma o seu pedido e você recebe um e-mail.'}</p>
        <a class="link" href="${nota}">Ver nota do pedido</a>
      </div></div></div>`;
    $('#copyPix').onclick = () => copyText(o.pix_payload);
  };
  render(o);
  if (o.status === 'pending') S.timers.push(setInterval(async () => {
    try { const n = await api(`/api/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`); if (n.status !== o.status) { o = n; render(n); if (n.status !== 'pending') toast('Pagamento confirmado!'); } } catch {}
  }, 4000));
}

// ---------------- MEUS PEDIDOS / SOBRE / CONTATO ----------------
async function ordersPage() {
  const mine = json(localStorage.getItem('my_orders'), []);
  $('#view').innerHTML = `<div class="wrap" style="max-width:860px"><h1 class="page-h">Meus pedidos</h1><div class="olist" id="olist">${mine.length ? '<div class="skel" style="height:80px"></div>' : `<div class="box empty-state">${icon('receipt')}<h3>Nenhum pedido neste aparelho</h3><p>Os pedidos feitos por este navegador aparecem aqui.</p><a class="btn" href="#/">Ir às compras</a></div>`}</div></div>`;
  if (!mine.length) return;
  const rows = await Promise.all(mine.map((m) => api(`/api/orders/${m.c}?t=${m.t}`).then((o) => ({ m, o })).catch(() => null)));
  $('#olist').innerHTML = rows.filter(Boolean).map(({ m, o }) => `<div class="box orow">${icon('box')}
    <div class="tx"><b>Pedido #${esc(o.code)}</b><small>${new Date(o.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR')} · ${o.items.reduce((a, i) => a + i.qty, 0)} item(s)</small></div>
    <b>${brl(o.total_cents)}</b><span class="status-pill ${o.status}">${STATUS_LABEL[o.status]}</span>
    <a class="btn ghost sm" href="${o.status === 'pending' ? `#/pagamento/${o.code}/${m.t}` : `pedido.html?c=${o.code}&t=${m.t}`}">${o.status === 'pending' ? 'Pagar' : 'Ver nota'}</a></div>`).join('') || '<div class="box empty-state"><p>Não foi possível carregar seus pedidos.</p></div>';
}
function aboutPage() {
  const s = S.settings;
  $('#view').innerHTML = `<div class="wrap textpage"><div class="crumbs"><a href="#/">Início</a>${icon('chevron')}<span>Sobre nós</span></div><h1 class="page-h">Sobre a <span class="hl">${esc(s.store_name)}</span></h1>
    <div class="box"><div class="box-b">${esc(s.about_text || `A ${s.store_name} nasceu para oferecer produtos de qualidade com preço justo e atendimento de verdade.\n\nCompre com segurança: pagamento via Pix com confirmação rápida e acompanhamento do seu pedido por e-mail.`)}</div></div></div>`;
}
function contactPage() {
  const s = S.settings;
  const wa = (s.whatsapp || '').replace(/\D/g, '');
  const cards = [];
  if (wa) cards.push(`<a class="box" target="_blank" rel="noopener" href="https://wa.me/${wa}">${icon('whatsapp')}<span><small>WhatsApp</small><b>Fale com a gente</b></span></a>`);
  if (s.contact_email) cards.push(`<a class="box" href="mailto:${esc(s.contact_email)}">${icon('mail')}<span><small>E-mail</small><b>${esc(s.contact_email)}</b></span></a>`);
  if (s.contact_phone) cards.push(`<a class="box" href="tel:${esc(s.contact_phone.replace(/\D/g, ''))}">${icon('phone')}<span><small>Telefone</small><b>${esc(s.contact_phone)}</b></span></a>`);
  if (s.instagram) cards.push(`<a class="box" target="_blank" rel="noopener" href="https://instagram.com/${esc(s.instagram.replace(/^@/, ''))}">${icon('instagram')}<span><small>Instagram</small><b>@${esc(s.instagram.replace(/^@/, ''))}</b></span></a>`);
  if (s.contact_address) cards.push(`<div class="box cc">${icon('pin')}<span><small>Endereço</small><b>${esc(s.contact_address)}</b></span></div>`);
  $('#view').innerHTML = `<div class="wrap textpage"><div class="crumbs"><a href="#/">Início</a>${icon('chevron')}<span>Contato</span></div><h1 class="page-h">Contato</h1>
    ${cards.length ? `<div class="contact-cards">${cards.join('')}</div>` : '<div class="box empty-state"><p>Em breve.</p></div>'}</div>`;
}

// ---------------- busca com sugestões ----------------
let sugSel = -1;
$('#q').addEventListener('input', () => {
  const t = $('#q').value.trim().toLowerCase();
  const box = $('#suggest');
  sugSel = -1;
  if (t.length < 2) { box.hidden = true; return; }
  const hits = S.products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6);
  box.innerHTML = hits.map((p) => `<a href="#/produto/${p.id}">${p.images[0] ? `<img src="${imgUrl(p.images[0])}" alt="">` : '<span class="ph"></span>'}<span>${esc(p.name)}</span><b>${brl(unit(p))}</b></a>`).join('') +
    `<a class="more" href="#/busca/${encodeURIComponent($('#q').value.trim())}">Ver todos os resultados para “${esc($('#q').value.trim())}”</a>`;
  box.hidden = false;
});
$('#q').addEventListener('keydown', (e) => {
  const items = $$('#suggest a');
  if (!items.length || $('#suggest').hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((a, i) => a.classList.toggle('sel', i === sugSel));
  } else if (e.key === 'Enter' && sugSel >= 0) { e.preventDefault(); items[sugSel].click(); }
});
$('#hsearch').onsubmit = (e) => { e.preventDefault(); const t = $('#q').value.trim(); if (t) go('#/busca/' + encodeURIComponent(t)); $('#suggest').hidden = true; $('#q').blur(); };
document.addEventListener('click', (e) => { if (!e.target.closest('#hsearch')) $('#suggest').hidden = true; });

// ---------------- eventos globais ----------------
function closeOverlays() {
  $('#mnav')?.classList.remove('open'); $('#overlay')?.classList.remove('open'); $('#filters')?.classList.remove('open');
  $('#lightbox')?.classList.remove('open'); $('#suggest') && ($('#suggest').hidden = true);
}
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-add],[data-fav],[data-scroll],[data-inc],[data-dec],[data-rm],[data-rmcoupon],[data-closenav],#menuBtn,#overlay');
  if (!t) return;
  if (t.dataset.add) { addToCart(Number(t.dataset.add)); }
  else if (t.dataset.fav) {
    e.preventDefault();
    const id = Number(t.dataset.fav);
    if (S.favs.has(id)) S.favs.delete(id); else { S.favs.add(id); toast('Adicionado aos favoritos'); }
    save();
    $$(`[data-fav="${id}"]`).forEach((b) => { b.classList.toggle('on', S.favs.has(id)); if (!b.classList.contains('fav')) b.textContent = S.favs.has(id) ? 'Favoritado' : 'Favoritar'; });
    if (parseHash().parts[0] === 'favoritos') route();
  } else if (t.dataset.scroll) {
    const tr = t.parentElement.querySelector('.track');
    tr.scrollBy({ left: Number(t.dataset.scroll) * tr.clientWidth * 0.9, behavior: 'smooth' });
  } else if (t.dataset.inc || t.dataset.dec || t.dataset.rm) {
    const id = Number(t.dataset.inc || t.dataset.dec || t.dataset.rm);
    const it = S.cart.find((i) => i.id === id); const p = prod(id);
    if (t.dataset.rm) S.cart = S.cart.filter((i) => i.id !== id);
    else if (t.dataset.inc) it.qty = p.stock != null ? Math.min(p.stock, it.qty + 1) : it.qty + 1;
    else it.qty = Math.max(1, it.qty - 1);
    save(); await revalidateCoupon(); cartPage();
  } else if (t.hasAttribute('data-rmcoupon')) { S.coupon = null; refreshSummary(); }
  else if (t.id === 'menuBtn') { $('#mnav').classList.add('open'); $('#overlay').classList.add('open'); }
  else closeOverlays();
});
document.addEventListener('submit', async (e) => {
  if (!e.target.matches('[data-coupon]')) return;
  e.preventDefault();
  const code = e.target.code.value.trim();
  if (!code) return;
  try { S.coupon = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal_cents: subtotal() } }); toast('Cupom aplicado!'); refreshSummary(); }
  catch (err) { toast(err.message, 'err'); }
});
function refreshSummary() {
  if (parseHash().parts[0] === 'checkout') {
    const box = $('[data-coupon]') || $('.coupon-ok');
    if (box) box.outerHTML = couponHTML();
    $('#ckTotals').innerHTML = totalsHTML();
  } else cartPage();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlays(); });

init();
