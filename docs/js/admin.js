// Painel administrativo
const A = { tab: 'dashboard', settings: {}, categories: [], products: [], coupons: [], orders: [], orderFilter: '', orderQ: '' };
const authed = (path, opts = {}) => api(path, { ...opts, auth: true }).catch((e) => {
  if (e.status === 401) { localStorage.removeItem('admin_token'); showLogin(); }
  throw e;
});

const toCents = (v) => {
  if (v === '' || v == null) return null;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100);
};
const fromCents = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const fmtDate = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const pill = (st) => `<span class="pill ${st}">${STATUS_LABEL[st] || st}</span>`;

// ---------- login ----------
function showLogin() {
  $('#admin').hidden = true; $('#login').hidden = false;
  $('#apiShow').textContent = API;
  $('#apiInput').value = localStorage.getItem('api_override') || '';
}
$('#apiSave').onclick = () => {
  const v = $('#apiInput').value.trim();
  if (v) localStorage.setItem('api_override', v); else localStorage.removeItem('api_override');
  location.reload();
};
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: { password: e.target.password.value } });
    localStorage.setItem('admin_token', r.token);
    sessionStorage.setItem('default_pw', r.default_password ? '1' : '');
    boot();
  } catch (err) { toast(err.message, 'err'); }
};

async function boot() {
  if (!localStorage.getItem('admin_token')) return showLogin();
  try {
    A.settings = await authed('/api/admin/settings');
  } catch (e) {
    if (e.status !== 401) { toast(e.message, 'err'); showLogin(); }
    return;
  }
  applyTheme(A.settings);
  $('#login').hidden = true; $('#admin').hidden = false;
  $('#sideBrand').innerHTML = A.settings.logo_image_id ? `<img src="${imgUrl(A.settings.logo_image_id)}" alt="">` : `<div class="dot"></div><span>${esc(A.settings.store_name)}</span>`;
  go(location.hash.slice(1) || 'dashboard');
  refreshBadge();
  setInterval(refreshBadge, 30000);
}

async function refreshBadge() {
  try {
    const s = await authed('/api/admin/stats');
    const b = $('#pendBadge');
    b.hidden = !s.pending; b.textContent = s.pending;
  } catch {}
}

// ---------- navegação ----------
const PAGES = {};
function go(tab) {
  if (!PAGES[tab]) tab = 'dashboard';
  A.tab = tab;
  location.hash = tab;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  $('#content').innerHTML = '<div class="skel" style="height:200px"></div>';
  PAGES[tab]().catch((e) => { $('#content').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
  window.scrollTo(0, 0);
}
$('#nav').onclick = (e) => { const a = e.target.closest('a[data-tab]'); if (a) go(a.dataset.tab); };

// ---------- modal ----------
function modal(html, wide) {
  $('#modalBox').className = 'modal-box' + (wide ? '' : ' narrow');
  $('#modalBox').innerHTML = `<button class="icon-btn modal-close" data-x>✕</button><div class="modal-pad">${html}</div>`;
  $('#modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal').classList.remove('open'); document.body.style.overflow = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-x]')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- upload de imagem ----------
async function fileToDataUrl(file, max = 1600) {
  const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === 'image/gif') return raw;
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  if (keepAlpha && file.size < 600 * 1024) return raw;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = raw; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return keepAlpha ? c.toDataURL('image/webp', 0.9) : c.toDataURL('image/jpeg', 0.85);
}
async function uploadFiles(files, max) {
  const ids = [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    toast(`Enviando ${f.name}...`);
    const data = await fileToDataUrl(f, max);
    const r = await authed('/api/admin/images', { method: 'POST', body: { data } });
    ids.push(r.id);
  }
  return ids;
}
// campo de imagem única: <div data-single="key" data-val="id" data-kind="wide|logo">
function singleImage(key, val, kind = '', label = 'Enviar imagem') {
  return `<div class="uploader" data-single="${key}" data-kind="${kind}" data-label="${esc(label)}">${singleInner(val, kind, label)}</div>`;
}
function singleInner(val, kind, label) {
  return val
    ? `<div class="up-item ${kind}"><img src="${imgUrl(val)}" alt=""><button type="button" data-clear>✕</button></div><input type="hidden" value="${val}">`
    : `<label class="up-add ${kind === 'logo' ? '' : kind}"><input type="file" accept="image/*">+<br>${esc(label)}</label><input type="hidden" value="">`;
}
function bindSingles(root) {
  $$('[data-single]', root).forEach((box) => {
    const set = (v) => { box.innerHTML = singleInner(v, box.dataset.kind, box.dataset.label); bind(); box.dispatchEvent(new Event('imgchange', { bubbles: true })); };
    const bind = () => {
      const inp = $('input[type=file]', box);
      if (inp) inp.onchange = async () => { try { const [id] = await uploadFiles(inp.files, box.dataset.kind === 'wide' ? 2200 : 1200); if (id) set(id); } catch (e) { toast(e.message, 'err'); } };
      const clr = $('[data-clear]', box);
      if (clr) clr.onclick = () => set('');
    };
    bind();
  });
}
const singleVal = (root, key) => { const h = $(`[data-single="${key}"] input[type=hidden]`, root); return h ? h.value : ''; };

// ======================================================================
// PAINEL
// ======================================================================
PAGES.dashboard = async () => {
  const s = await authed('/api/admin/stats');
  const st = A.settings;
  const alerts = [];
  if (sessionStorage.getItem('default_pw')) alerts.push(`<div class="alert warn">⚠️ Você ainda usa a senha padrão. <a onclick="go('account')">Trocar agora</a></div>`);
  if (!st.pix_key && !(st.payment_mode === 'mercadopago' && st.mp_access_token_set)) alerts.push(`<div class="alert warn">💠 Pagamento ainda não configurado — os clientes não verão o QR Code Pix. <a onclick="go('payment')">Configurar</a></div>`);
  if (!st.notify_email || !st.smtp_user) alerts.push(`<div class="alert info">✉️ Configure o e-mail para receber aviso de cada pedido. <a onclick="go('email')">Configurar</a></div>`);
  if (st.last_email_error) alerts.push(`<div class="alert err">Falha no último e-mail: ${esc(st.last_email_error)}</div>`);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
    const row = s.sales_7d.find((x) => x.d === d);
    days.push({ d, t: row ? row.t : 0 });
  }
  const maxT = Math.max(1, ...days.map((d) => d.t));

  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Olá! 👋</h1><p>Resumo da sua loja</p></div><button class="btn" onclick="newOrder()">+ Novo pedido</button></div>
    ${alerts.join('')}
    <div class="stats">
      <div class="stat"><small>Pedidos hoje</small><b>${s.orders_today}</b></div>
      <div class="stat"><small>Aguardando pagamento</small><b>${s.pending}</b></div>
      <div class="stat"><small>Faturamento do mês</small><b>${brl(s.revenue_month)}</b></div>
      <div class="stat"><small>Faturamento total</small><b>${brl(s.revenue_total)}</b></div>
    </div>
    <div class="panel"><h3>Vendas pagas — últimos 7 dias</h3>
      <div class="bars">${days.map((d) => `<div title="${brl(d.t)}"><i style="height:${(d.t / maxT) * 100}%"></i><small>${d.d.slice(8)}/${d.d.slice(5, 7)}</small></div>`).join('')}</div>
    </div>
    <div class="panel"><h3>Últimos pedidos</h3>${ordersTable(s.last_orders)}</div>`;
  bindOrderRows();
};

// ======================================================================
// PEDIDOS
// ======================================================================
function ordersTable(list) {
  if (!list.length) return '<div class="empty">Nenhum pedido ainda.</div>';
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th><th>Data</th></tr></thead><tbody>
    ${list.map((o) => `<tr class="click" data-order="${o.id}">
      <td><b>#${esc(o.code)}</b>${o.source === 'admin' ? ' <span class="pill off">manual</span>' : ''}</td>
      <td>${esc(o.customer_name || '—')}<div style="color:var(--muted);font-size:12px">${esc(o.customer_email || o.customer_phone || '')}</div></td>
      <td>${o.items.reduce((a, i) => a + i.qty, 0)}</td>
      <td><b>${brl(o.total_cents)}</b>${o.coupon_code ? `<div style="font-size:12px;color:var(--ok)">🏷️ ${esc(o.coupon_code)}</div>` : ''}</td>
      <td>${pill(o.status)}</td>
      <td style="white-space:nowrap;color:var(--muted)">${fmtDate(o.created_at)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function bindOrderRows() {
  $$('[data-order]').forEach((tr) => (tr.onclick = () => openOrder(Number(tr.dataset.order))));
}

PAGES.orders = async () => {
  const q = new URLSearchParams();
  if (A.orderFilter) q.set('status', A.orderFilter);
  if (A.orderQ) q.set('q', A.orderQ);
  A.orders = await authed('/api/admin/orders?' + q);
  const f = A.orderFilter;
  const segs = [['', 'Todos'], ['pending', 'Aguardando'], ['paid', 'Pagos'], ['shipped', 'Enviados'], ['done', 'Concluídos'], ['canceled', 'Cancelados']];
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Pedidos</h1><p>${A.orders.length} pedido(s)</p></div><button class="btn" onclick="newOrder()">+ Novo pedido</button></div>
    <div class="toolbar">
      <div class="seg">${segs.map(([k, l]) => `<button class="${f === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <input class="input" id="oq" placeholder="Buscar por código, nome, e-mail" value="${esc(A.orderQ)}">
    </div>
    <div class="panel" style="padding:6px 8px">${ordersTable(A.orders)}</div>`;
  $$('[data-f]').forEach((b) => (b.onclick = () => { A.orderFilter = b.dataset.f; PAGES.orders(); }));
  let t; $('#oq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { A.orderQ = e.target.value; PAGES.orders().then(() => { const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  bindOrderRows();
};

async function openOrder(id) {
  let o = A.orders.find((x) => x.id === id);
  if (!o) { const all = await authed('/api/admin/orders'); A.orders = all; o = all.find((x) => x.id === id); }
  if (!o) return;
  const statuses = ['pending', 'paid', 'shipped', 'done', 'canceled'];
  const wa = o.customer_phone ? o.customer_phone.replace(/\D/g, '') : '';
  const link = `${location.origin}${location.pathname.replace(/admin\.html$/, '')}pedido.html?c=${o.code}&t=${o.public_token}`;
  modal(`
    <h2 style="margin-bottom:4px">Pedido #${esc(o.code)}</h2>
    <p style="color:var(--muted);font-size:14px;margin-bottom:16px">${fmtDate(o.created_at)} · ${o.source === 'admin' ? 'criado no painel' : 'pelo site'} · ${esc(o.payment_method || 'sem pagamento')}${o.paid_at ? ' · pago em ' + fmtDate(o.paid_at) : ''}</p>
    ${o.payment_error ? `<div class="alert err">${esc(o.payment_error)}</div>` : ''}
    <div class="field"><label>Status</label><div class="seg" id="stSeg">${statuses.map((s) => `<button class="${o.status === s ? 'active' : ''}" data-st="${s}">${STATUS_LABEL[s]}</button>`).join('')}</div></div>
    <div class="receipt" style="margin:16px 0">
      <div class="r-cust"><b>${esc(o.customer_name || '—')}</b><br>${o.customer_email ? esc(o.customer_email) + '<br>' : ''}${o.customer_phone ? esc(o.customer_phone) + '<br>' : ''}${o.customer_doc ? 'CPF ' + esc(o.customer_doc) + '<br>' : ''}${o.customer_address ? '📍 ' + esc(o.customer_address) + '<br>' : ''}${o.notes ? '<i>Obs.: ' + esc(o.notes) + '</i>' : ''}</div>
      <table class="r-items">${o.items.map((i) => `<tr><td>${esc(i.name)}<div class="r-sm">${i.qty} × ${brl(i.unit_cents)}</div></td><td style="text-align:right">${brl(i.total_cents)}</td></tr>`).join('')}</table>
      <table style="margin-top:8px">
        <tr><td class="r-sm">Subtotal</td><td style="text-align:right">${brl(o.subtotal_cents)}</td></tr>
        ${o.discount_cents ? `<tr><td style="color:#0a8a4a">Desconto ${o.coupon_code ? '(' + esc(o.coupon_code) + ')' : ''}</td><td style="text-align:right;color:#0a8a4a">− ${brl(o.discount_cents)}</td></tr>` : ''}
        ${o.shipping_cents || o.shipping_method ? `<tr><td class="r-sm">Entrega${o.shipping_method ? '<br>' + esc(o.shipping_method) : ''}</td><td style="text-align:right">${o.shipping_cents ? brl(o.shipping_cents) : 'Grátis'}</td></tr>` : ''}
        <tr class="r-total"><td>Total</td><td style="text-align:right">${brl(o.total_cents)}</td></tr>
      </table>
    </div>
    ${o.status === 'pending' && o.pix_payload ? `<details style="margin-bottom:14px"><summary style="cursor:pointer;color:var(--muted);font-size:14px">Mostrar QR Code Pix</summary><div class="pay" style="margin-top:12px"><div class="qr"><img src="${o.pix_qr_base64 ? 'data:image/png;base64,' + o.pix_qr_base64 : qrDataUrl(o.pix_payload)}" alt=""></div><button class="btn ghost sm" id="cpPix">Copiar Pix copia e cola</button></div></details>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn ghost sm" id="cpLink">Copiar link da nota</button>
      ${wa ? `<a class="btn ghost sm" target="_blank" href="https://wa.me/${wa.length <= 11 ? '55' + wa : wa}?text=${encodeURIComponent(`Olá ${o.customer_name}! Seu pedido #${o.code} (${brl(o.total_cents)}): ${link}`)}">WhatsApp</a>` : ''}
      <button class="btn ghost sm" id="resend">Reenviar e-mail para mim</button>
      ${o.payment_id ? '<button class="btn ghost sm" id="check">Verificar pagamento</button>' : ''}
      <button class="btn ghost sm" id="del" style="color:var(--danger);margin-left:auto">Excluir</button>
    </div>`, true);
  $$('[data-st]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.st === 'canceled' && !confirm('Cancelar o pedido? O estoque e o uso do cupom serão devolvidos.')) return;
    try {
      await authed(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { status: b.dataset.st } });
      toast('Status atualizado'); closeModal(); go(A.tab); refreshBadge();
    } catch (e) { toast(e.message, 'err'); }
  }));
  $('#cpLink').onclick = () => { navigator.clipboard.writeText(link); toast('Link copiado'); };
  if ($('#cpPix')) $('#cpPix').onclick = () => copyText(o.pix_payload);
  $('#resend').onclick = async () => { try { await authed(`/api/admin/orders/${o.id}/resend`, { method: 'POST', body: {} }); toast('E-mail enviado'); } catch (e) { toast(e.message, 'err'); } };
  if ($('#check')) $('#check').onclick = async () => { try { const n = await authed(`/api/admin/orders/${o.id}/check`, { method: 'POST', body: {} }); toast('Status: ' + STATUS_LABEL[n.status]); closeModal(); go(A.tab); } catch (e) { toast(e.message, 'err'); } };
  $('#del').onclick = async () => {
    if (!confirm('Excluir este pedido definitivamente?')) return;
    await authed(`/api/admin/orders/${o.id}`, { method: 'DELETE' }); closeModal(); go(A.tab); refreshBadge();
  };
}

// Novo pedido manual (com cupom)
async function newOrder() {
  if (!A.products.length) A.products = await authed('/api/admin/products');
  const lines = [];
  let coupon = null;
  modal(`
    <h2 style="margin-bottom:16px">Novo pedido</h2>
    <form id="noForm">
      <div class="form-grid">
        <div class="field"><label>Cliente</label><input class="input" name="customer_name" required></div>
        <div class="field"><label>WhatsApp</label><input class="input" name="customer_phone"></div>
        <div class="field"><label>E-mail (recebe a nota)</label><input class="input" type="email" name="customer_email"></div>
        <div class="field"><label>Endereço</label><input class="input" name="customer_address"></div>
      </div>
      <div class="field"><label>Itens</label>
        <div class="items-edit" id="noItems"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select class="input" id="noProd" style="flex:1;min-width:180px"><option value="">+ Adicionar produto cadastrado...</option>
            ${A.products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${brl(p.promo_price_cents && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents)}${p.stock != null ? ' (estoque ' + p.stock + ')' : ''}</option>`).join('')}
          </select>
          <button type="button" class="btn ghost sm" id="noCustom">+ Item avulso</button>
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Cupom</label><div class="coupon-row"><input class="input" id="noCoupon" style="text-transform:uppercase" placeholder="Código"><button type="button" class="btn ghost sm" id="noApply">Aplicar</button></div><small id="noCouponMsg" style="color:var(--muted);font-size:12px"></small></div>
        <div class="field"><label>Desconto extra (R$)</label><input class="input" id="noExtra" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label>Entrega (R$)</label><input class="input" id="noShip" inputmode="decimal" placeholder="0,00"></div>
        <div class="field"><label>Observações</label><input class="input" name="notes"></div>
      </div>
      <div class="field"><label>Situação</label>
        <div class="seg" id="noSt"><button type="button" data-v="pix" class="active">Gerar Pix (aguardando)</button><button type="button" data-v="pending">Aguardando (sem Pix)</button><button type="button" data-v="paid">Já está pago</button></div>
      </div>
      <div class="totals" id="noTotals" style="margin:10px 0 16px"></div>
      <button class="btn block">Criar pedido</button>
    </form>`, true);

  let mode = 'pix';
  $$('#noSt button').forEach((b) => (b.onclick = () => { mode = b.dataset.v; $$('#noSt button').forEach((x) => x.classList.toggle('active', x === b)); }));

  const sub = () => lines.reduce((a, l) => a + l.unit_cents * l.qty, 0);
  const render = () => {
    $('#noItems').innerHTML = lines.map((l, i) => `<div class="it">
      <input class="input" data-i="${i}" data-k="name" value="${esc(l.name)}" ${l.product_id ? 'readonly' : ''} placeholder="Descrição">
      <input class="input" data-i="${i}" data-k="qty" type="number" min="1" value="${l.qty}">
      <input class="input" data-i="${i}" data-k="price" value="${fromCents(l.unit_cents)}" ${l.product_id ? 'readonly' : ''} inputmode="decimal">
      <button type="button" class="icon-btn" style="width:32px;height:32px" data-rm="${i}">✕</button></div>`).join('') || '<div style="color:var(--muted);font-size:14px;margin-bottom:8px">Nenhum item.</div>';
    $$('#noItems [data-k]').forEach((inp) => (inp.oninput = () => {
      const l = lines[inp.dataset.i];
      if (inp.dataset.k === 'qty') l.qty = Math.max(1, parseInt(inp.value) || 1);
      if (inp.dataset.k === 'price') l.unit_cents = toCents(inp.value) || 0;
      if (inp.dataset.k === 'name') l.name = inp.value;
      totals();
    }));
    $$('#noItems [data-rm]').forEach((b) => (b.onclick = () => { lines.splice(b.dataset.rm, 1); render(); }));
    totals();
  };
  const totals = () => {
    const s = sub();
    let d = 0;
    if (coupon) {
      d = coupon.type === 'percent' ? Math.round(s * coupon.value / 100) : coupon.value;
      if (s < (coupon.min_order_cents || 0)) d = 0;
    }
    const extra = toCents($('#noExtra').value) || 0;
    const ship = toCents($('#noShip').value) || 0;
    const disc = Math.min(s, d + extra);
    $('#noTotals').innerHTML = `<div class="muted"><span>Subtotal</span><span>${brl(s)}</span></div>
      ${disc ? `<div class="disc"><span>Desconto</span><span>− ${brl(disc)}</span></div>` : ''}
      ${ship ? `<div class="muted"><span>Entrega</span><span>${brl(ship)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${brl(s - disc + ship)}</span></div>`;
  };
  $('#noExtra').oninput = totals; $('#noShip').oninput = totals;
  $('#noProd').onchange = (e) => {
    const p = A.products.find((x) => x.id === Number(e.target.value));
    if (p) {
      const ex = lines.find((l) => l.product_id === p.id);
      if (ex) ex.qty++;
      else lines.push({ product_id: p.id, name: p.name, qty: 1, unit_cents: p.promo_price_cents && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents });
    }
    e.target.value = ''; render();
  };
  $('#noCustom').onclick = () => { lines.push({ product_id: null, name: '', qty: 1, unit_cents: 0 }); render(); $$('#noItems [data-k=name]').pop().focus(); };
  $('#noApply').onclick = async () => {
    const code = $('#noCoupon').value.trim();
    if (!code) { coupon = null; $('#noCouponMsg').textContent = ''; return totals(); }
    try {
      const r = await api('/api/coupons/validate', { method: 'POST', body: { code, subtotal_cents: sub() } });
      coupon = r; $('#noCouponMsg').textContent = `✓ ${r.code}: ${r.type === 'percent' ? r.value + '%' : brl(r.value)} de desconto`;
      $('#noCouponMsg').style.color = 'var(--ok)';
    } catch (e) { coupon = null; $('#noCouponMsg').textContent = e.message; $('#noCouponMsg').style.color = 'var(--danger)'; }
    totals();
  };
  $('#noForm').onsubmit = async (e) => {
    e.preventDefault();
    if (!lines.length) return toast('Adicione pelo menos um item', 'err');
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const o = await authed('/api/admin/orders', { method: 'POST', body: {
        ...data,
        items: lines.map((l) => (l.product_id ? { product_id: l.product_id, qty: l.qty } : { name: l.name || 'Item', qty: l.qty, unit_cents: l.unit_cents })),
        coupon_code: coupon ? coupon.code : ($('#noCoupon').value.trim() || undefined),
        extra_discount_cents: toCents($('#noExtra').value) || 0,
        shipping_cents: toCents($('#noShip').value) || 0,
        status: mode === 'paid' ? 'paid' : 'pending',
        generate_pix: mode === 'pix',
      } });
      toast(`Pedido #${o.code} criado`);
      closeModal(); A.orders = []; go('orders'); refreshBadge();
      setTimeout(() => openOrder(o.id), 700);
    } catch (err) { toast(err.message, 'err'); }
  };
  render();
}

// ======================================================================
// PRODUTOS
// ======================================================================
PAGES.products = async () => {
  [A.products, A.categories] = await Promise.all([authed('/api/admin/products'), authed('/api/admin/categories')]);
  const catName = (id) => A.categories.find((c) => c.id === id)?.name || 'Sem categoria';
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Produtos</h1><p>${A.products.length} cadastrado(s)</p></div><button class="btn" id="addP">+ Novo produto</button></div>
    <div class="toolbar"><input class="input" id="pq" placeholder="Buscar produto"></div>
    <div class="pgrid" id="pgrid"></div>`;
  const draw = (q = '') => {
    const list = A.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    $('#pgrid').innerHTML = list.map((p) => `<div class="pcard" data-p="${p.id}">
      <div class="im">${p.images[0] ? `<img src="${imgUrl(p.images[0])}" loading="lazy" alt="">` : 'Sem foto'}
        ${!p.active ? '<span class="pill off">Oculto</span>' : p.stock === 0 ? '<span class="pill canceled">Esgotado</span>' : p.featured ? '<span class="pill paid">Destaque</span>' : ''}</div>
      <div class="bd"><b>${esc(p.name)}</b><small>${esc(catName(p.category_id))} · ${p.stock == null ? 'estoque livre' : p.stock + ' em estoque'}</small>
        <div class="price" style="padding-top:4px"><b style="font-size:16px">${brl(p.promo_price_cents && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents)}</b>${p.promo_price_cents && p.promo_price_cents < p.price_cents ? `<s>${brl(p.price_cents)}</s>` : ''}</div></div>
    </div>`).join('') || '<div class="empty">Nenhum produto. Clique em "Novo produto" para começar.</div>';
    $$('[data-p]').forEach((c) => (c.onclick = () => editProduct(A.products.find((p) => p.id === Number(c.dataset.p)))));
  };
  draw();
  $('#pq').oninput = (e) => draw(e.target.value);
  $('#addP').onclick = () => editProduct();
};

function editProduct(p = {}) {
  let images = [...(p.images || [])];
  modal(`
    <h2 style="margin-bottom:16px">${p.id ? 'Editar produto' : 'Novo produto'}</h2>
    <form id="pForm">
      <div class="field"><label>Fotos (a primeira é a capa)</label><div class="uploader" id="pImgs"></div></div>
      <div class="field"><label>Nome *</label><input class="input" name="name" required value="${esc(p.name || '')}"></div>
      <div class="field"><label>Descrição</label><textarea class="input" name="description" rows="4">${esc(p.description || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label>Preço (R$) *</label><input class="input" name="price" inputmode="decimal" required value="${fromCents(p.price_cents)}" placeholder="0,00"></div>
        <div class="field"><label>Preço promocional (R$)</label><input class="input" name="promo" inputmode="decimal" value="${fromCents(p.promo_price_cents)}" placeholder="opcional"></div>
        <div class="field"><label>Categoria</label><select class="input" name="category_id"><option value="">Sem categoria</option>${A.categories.map((c) => `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Estoque (vazio = ilimitado)</label><input class="input" name="stock" type="number" min="0" value="${p.stock ?? ''}"></div>
        <div class="field"><label>Ordem de exibição</label><input class="input" name="position" type="number" value="${p.position || 0}"></div>
        <div class="field"><label>Vendidos (número inicial exibido)</label><input class="input" name="sold_base" type="number" min="0" value="${p.sold_base || 0}"></div>
      </div>
      <details class="panel" style="padding:14px 16px;margin-bottom:14px"><summary style="cursor:pointer;font-weight:600;font-size:14px">📦 Peso e medidas (para cálculo automático de frete)</summary>
        <p style="color:var(--muted);font-size:12px;margin:8px 0 12px">Usado pelo Melhor Envio (Correios/Jadlog). Em branco = usa o padrão da aba Frete.</p>
        <div class="form-grid">
          <div class="field"><label>Peso (gramas)</label><input class="input" name="weight_g" type="number" min="1" value="${p.weight_g ?? ''}"></div>
          <div class="field"><label>Comprimento (cm)</label><input class="input" name="length_cm" type="number" min="1" value="${p.length_cm ?? ''}"></div>
          <div class="field"><label>Largura (cm)</label><input class="input" name="width_cm" type="number" min="1" value="${p.width_cm ?? ''}"></div>
          <div class="field"><label>Altura (cm)</label><input class="input" name="height_cm" type="number" min="1" value="${p.height_cm ?? ''}"></div>
        </div></details>
      <label class="switch"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Visível na loja</label>
      <label class="switch"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> Produto em destaque (aparece primeiro)</label>
      <div style="display:flex;gap:8px;margin-top:8px">
        ${p.id ? '<button type="button" class="btn ghost" id="pDel" style="color:var(--danger)">Excluir</button>' : ''}
        <button class="btn" style="flex:1">Salvar produto</button>
      </div>
    </form>`, true);
  const drawImgs = () => {
    $('#pImgs').innerHTML = images.map((id, i) => `<div class="up-item"><img src="${imgUrl(id)}" alt="">${i === 0 ? '<span class="cover">capa</span>' : `<button type="button" data-first="${i}" style="right:32px" title="Tornar capa">★</button>`}<button type="button" data-rmi="${i}">✕</button></div>`).join('') +
      `<label class="up-add"><input type="file" accept="image/*" multiple>+<br>Adicionar fotos</label>`;
    $('#pImgs input').onchange = async (e) => { try { images.push(...(await uploadFiles(e.target.files))); drawImgs(); } catch (err) { toast(err.message, 'err'); } };
    $$('[data-rmi]').forEach((b) => (b.onclick = () => { images.splice(b.dataset.rmi, 1); drawImgs(); }));
    $$('[data-first]').forEach((b) => (b.onclick = () => { const [x] = images.splice(b.dataset.first, 1); images.unshift(x); drawImgs(); }));
  };
  drawImgs();
  $('#pForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, description: f.description.value, price_cents: toCents(f.price.value) || 0, promo_price_cents: toCents(f.promo.value),
      category_id: f.category_id.value || null, stock: f.stock.value === '' ? null : f.stock.value, position: f.position.value,
      active: f.active.checked, featured: f.featured.checked, images, sold_base: f.sold_base.value,
      weight_g: f.weight_g.value || null, length_cm: f.length_cm.value || null, width_cm: f.width_cm.value || null, height_cm: f.height_cm.value || null,
    };
    try {
      if (p.id) await authed(`/api/admin/products/${p.id}`, { method: 'PUT', body });
      else await authed('/api/admin/products', { method: 'POST', body });
      toast('Produto salvo'); closeModal(); PAGES.products();
    } catch (err) { toast(err.message, 'err'); }
  };
  if ($('#pDel')) $('#pDel').onclick = async () => {
    if (!confirm('Excluir este produto?')) return;
    await authed(`/api/admin/products/${p.id}`, { method: 'DELETE' }); closeModal(); PAGES.products();
  };
}

// ======================================================================
// CATEGORIAS
// ======================================================================
PAGES.categories = async () => {
  A.categories = await authed('/api/admin/categories');
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Categorias</h1><p>Aparecem na página inicial com ícone (ou foto) e no menu</p></div><button class="btn" id="addC">+ Nova categoria</button></div>
    <div class="pgrid">${A.categories.map((c) => `<div class="pcard" data-c="${c.id}">
      <div class="im">${c.icon ? `<span style="color:var(--primary)">${icon(c.icon).replace('class="ic ', 'style="width:56px;height:56px" class="ic ')}</span>` : c.image_id ? `<img src="${imgUrl(c.image_id)}" alt="">` : 'Sem ícone'}${!c.active ? '<span class="pill off">Oculta</span>' : ''}</div>
      <div class="bd"><b>${esc(c.name)}</b><small>${c.product_count} produto(s)</small></div></div>`).join('') || '<div class="empty">Nenhuma categoria ainda.</div>'}</div>`;
  $$('[data-c]').forEach((el) => (el.onclick = () => editCategory(A.categories.find((c) => c.id === Number(el.dataset.c)))));
  $('#addC').onclick = () => editCategory();
};
function editCategory(c = { icon: 'tag' }) {
  modal(`
    <h2 style="margin-bottom:16px">${c.id ? 'Editar categoria' : 'Nova categoria'}</h2>
    <form id="cForm">
      <div class="field"><label>Ícone</label><div class="icon-pick" id="iconPick">
        <button type="button" data-ic="" class="${!c.icon ? 'on' : ''}" title="Usar foto">📷</button>
        ${CATEGORY_ICONS.map((k) => `<button type="button" data-ic="${k}" class="${c.icon === k ? 'on' : ''}">${icon(k)}</button>`).join('')}</div></div>
      <div class="field"><label>Foto (usada quando "📷" está selecionado)</label>${singleImage('image_id', c.image_id, 'wide', 'Enviar foto')}</div>
      <div class="field"><label>Nome *</label><input class="input" name="name" required value="${esc(c.name || '')}"></div>
      <div class="field"><label>Descrição</label><input class="input" name="description" value="${esc(c.description || '')}"></div>
      <div class="field"><label>Ordem</label><input class="input" type="number" name="position" value="${c.position || 0}"></div>
      <label class="switch"><input type="checkbox" name="active" ${c.active !== 0 ? 'checked' : ''}> Visível na loja</label>
      <div style="display:flex;gap:8px">
        ${c.id ? '<button type="button" class="btn ghost" id="cDel" style="color:var(--danger)">Excluir</button>' : ''}
        <button class="btn" style="flex:1">Salvar</button>
      </div>
    </form>`);
  bindSingles($('#cForm'));
  let chosenIcon = c.icon || '';
  $$('#iconPick button').forEach((b) => (b.onclick = () => { chosenIcon = b.dataset.ic; $$('#iconPick button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#cForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { name: f.name.value, description: f.description.value, position: f.position.value, active: f.active.checked, image_id: singleVal(f, 'image_id') || null, icon: chosenIcon };
    try {
      if (c.id) await authed(`/api/admin/categories/${c.id}`, { method: 'PUT', body });
      else await authed('/api/admin/categories', { method: 'POST', body });
      toast('Categoria salva'); closeModal(); PAGES.categories();
    } catch (err) { toast(err.message, 'err'); }
  };
  if ($('#cDel')) $('#cDel').onclick = async () => {
    if (!confirm('Excluir categoria? Os produtos ficam "sem categoria".')) return;
    await authed(`/api/admin/categories/${c.id}`, { method: 'DELETE' }); closeModal(); PAGES.categories();
  };
}

// ======================================================================
// CUPONS
// ======================================================================
PAGES.coupons = async () => {
  A.coupons = await authed('/api/admin/coupons');
  const today = new Date().toISOString().slice(0, 10);
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Cupons</h1><p>Valem na loja e nos pedidos criados no painel</p></div><button class="btn" id="addK">+ Novo cupom</button></div>
    <div class="panel" style="padding:6px 8px">${A.coupons.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Código</th><th>Desconto</th><th>Mínimo</th><th>Usos</th><th>Validade</th><th>Status</th></tr></thead><tbody>
      ${A.coupons.map((c) => {
        const expired = c.expires_at && c.expires_at < today;
        const out = c.max_uses && c.used_count >= c.max_uses;
        return `<tr class="click" data-k="${c.id}"><td><b style="font-family:ui-monospace,monospace">${esc(c.code)}</b></td>
        <td>${c.type === 'percent' ? c.value + '%' : brl(c.value)}</td><td>${c.min_order_cents ? brl(c.min_order_cents) : '—'}</td>
        <td>${c.used_count}${c.max_uses ? ' / ' + c.max_uses : ''}</td><td>${c.expires_at ? c.expires_at.split('-').reverse().join('/') : 'Sem validade'}</td>
        <td>${!c.active ? '<span class="pill off">Inativo</span>' : expired ? '<span class="pill canceled">Expirado</span>' : out ? '<span class="pill pending">Esgotado</span>' : '<span class="pill paid">Ativo</span>'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">Nenhum cupom criado.</div>'}</div>`;
  $$('[data-k]').forEach((tr) => (tr.onclick = () => editCoupon(A.coupons.find((c) => c.id === Number(tr.dataset.k)))));
  $('#addK').onclick = () => editCoupon();
};
function editCoupon(c = {}) {
  const type = c.type || 'percent';
  modal(`
    <h2 style="margin-bottom:16px">${c.id ? 'Editar cupom' : 'Novo cupom'}</h2>
    <form id="kForm">
      <div class="field"><label>Código *</label><input class="input" name="code" required style="text-transform:uppercase;font-family:ui-monospace,monospace" value="${esc(c.code || '')}" placeholder="EX: BEMVINDO10"></div>
      <div class="field"><label>Tipo</label><div class="seg" id="kType"><button type="button" data-t="percent" class="${type === 'percent' ? 'active' : ''}">Porcentagem (%)</button><button type="button" data-t="fixed" class="${type === 'fixed' ? 'active' : ''}">Valor fixo (R$)</button></div></div>
      <div class="form-grid">
        <div class="field"><label id="kValLbl">${type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}</label><input class="input" name="value" required inputmode="decimal" value="${c.id ? (type === 'percent' ? c.value : fromCents(c.value)) : ''}"></div>
        <div class="field"><label>Pedido mínimo (R$)</label><input class="input" name="min" inputmode="decimal" value="${fromCents(c.min_order_cents || null)}" placeholder="opcional"></div>
        <div class="field"><label>Limite de usos</label><input class="input" name="max_uses" type="number" min="1" value="${c.max_uses ?? ''}" placeholder="ilimitado"></div>
        <div class="field"><label>Válido até</label><input class="input" name="expires_at" type="date" value="${c.expires_at || ''}"></div>
      </div>
      ${c.id ? `<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Usado ${c.used_count} vez(es).</p>` : ''}
      <label class="switch"><input type="checkbox" name="active" ${c.active !== 0 ? 'checked' : ''}> Ativo</label>
      <div style="display:flex;gap:8px">
        ${c.id ? '<button type="button" class="btn ghost" id="kDel" style="color:var(--danger)">Excluir</button>' : ''}
        <button class="btn" style="flex:1">Salvar cupom</button>
      </div>
    </form>`);
  let t = type;
  $$('#kType button').forEach((b) => (b.onclick = () => { t = b.dataset.t; $$('#kType button').forEach((x) => x.classList.toggle('active', x === b)); $('#kValLbl').textContent = t === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'; }));
  $('#kForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { code: f.code.value, type: t, value: t === 'percent' ? parseInt(f.value.value) : toCents(f.value.value), min_order_cents: toCents(f.min.value) || 0,
      max_uses: f.max_uses.value || null, expires_at: f.expires_at.value || null, active: f.active.checked };
    try {
      if (c.id) await authed(`/api/admin/coupons/${c.id}`, { method: 'PUT', body });
      else await authed('/api/admin/coupons', { method: 'POST', body });
      toast('Cupom salvo'); closeModal(); PAGES.coupons();
    } catch (err) { toast(err.message, 'err'); }
  };
  if ($('#kDel')) $('#kDel').onclick = async () => {
    if (!confirm('Excluir cupom?')) return;
    await authed(`/api/admin/coupons/${c.id}`, { method: 'DELETE' }); closeModal(); PAGES.coupons();
  };
}

// ======================================================================
// CONFIGURAÇÕES (aparência / pagamento / e-mail)
// ======================================================================
async function saveSettings(body, msg = 'Configurações salvas') {
  await authed('/api/admin/settings', { method: 'PUT', body });
  A.settings = await authed('/api/admin/settings');
  applyTheme(A.settings);
  toast(msg);
}

const PRESETS = [
  { n: 'Neon rosa', c: { color_bg: '#070708', color_surface: '#121215', color_primary: '#ff1f7a', color_accent: '#ff5fa2', color_text: '#f5f5f7', color_muted: '#9a9aa5' } },
  { n: 'Roxo neon', c: { color_bg: '#09090f', color_surface: '#14141d', color_primary: '#8b5cf6', color_accent: '#22d3ee', color_text: '#f4f4f8', color_muted: '#9b9bb0' } },
  { n: 'Grafite & ouro', c: { color_bg: '#0c0c0c', color_surface: '#171717', color_primary: '#d4a017', color_accent: '#f5d06f', color_text: '#f5f5f5', color_muted: '#a3a3a3' } },
  { n: 'Esmeralda', c: { color_bg: '#06110d', color_surface: '#0f1d18', color_primary: '#10b981', color_accent: '#a3e635', color_text: '#ecfdf5', color_muted: '#8fb3a5' } },
  { n: 'Rosa', c: { color_bg: '#100810', color_surface: '#1c111c', color_primary: '#ec4899', color_accent: '#f9a8d4', color_text: '#fdf2f8', color_muted: '#b79aae' } },
  { n: 'Azul oceano', c: { color_bg: '#060b14', color_surface: '#0f1726', color_primary: '#3b82f6', color_accent: '#38bdf8', color_text: '#eff6ff', color_muted: '#93a4bf' } },
  { n: 'Vermelho', c: { color_bg: '#0d0707', color_surface: '#1a0f0f', color_primary: '#ef4444', color_accent: '#fb923c', color_text: '#fef2f2', color_muted: '#b39a9a' } },
];
const COLOR_FIELDS = [['color_bg', 'Fundo'], ['color_surface', 'Cartões'], ['color_primary', 'Cor principal'], ['color_accent', 'Destaque'], ['color_text', 'Texto'], ['color_muted', 'Texto suave']];
const HEAD_FONTS = ['Montserrat', 'Poppins', 'Saira', 'Exo 2', 'Rajdhani', 'Oswald', 'Bebas Neue', 'Space Grotesk', 'Outfit', 'Sora'];
const FONTS = ['Inter', 'Poppins', 'Montserrat', 'Space Grotesk', 'Outfit', 'Plus Jakarta Sans', 'DM Sans', 'Sora', 'Manrope', 'Rubik'];

PAGES.appearance = async () => {
  if (!A.categories.length || !A.products.length) [A.categories, A.products] = await Promise.all([authed('/api/admin/categories'), authed('/api/admin/products')]);
  const s = A.settings;
  let slides = [];
  try { slides = JSON.parse(s.hero_slides || '[]'); } catch {}
  if (!Array.isArray(slides) || !slides.length) {
    slides = [{ image_id: s.banner_image_id || '', eyebrow: 'Bem-vindo à', eyebrow_hl: s.store_name, title: s.banner_title || '', title_hl: '', subtitle: s.banner_subtitle || '', button_text: 'Explorar loja', button_link: '#/produtos', show_text: true }];
  }
  let feats = [];
  try { feats = JSON.parse(s.features || '[]'); } catch {}
  while (feats.length < 4) feats.push({ icon: 'star', title: '', text: '' });

  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Aparência</h1><p>Tudo o que aparece na loja</p></div><a class="btn ghost" href="./" target="_blank">Ver loja ↗</a></div>
    <form id="apForm">
      <div class="panel"><h3>Identidade</h3>
        <div class="form-grid">
          <div class="field"><label>Nome da loja</label><input class="input" name="store_name" value="${esc(s.store_name)}"></div>
          <div class="field"><label>Slogan</label><input class="input" name="store_tagline" value="${esc(s.store_tagline)}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Logo (PNG transparente fica melhor)</label>${singleImage('logo_image_id', s.logo_image_id, 'logo', 'Enviar logo')}</div>
          <div class="field"><label>Ícone da aba (opcional, quadrado)</label>${singleImage('favicon_image_id', s.favicon_image_id, 'logo', 'Enviar ícone')}</div>
        </div>
      </div>

      <div class="panel"><h3>Barra de anúncio (topo)</h3>
        <label class="switch"><input type="checkbox" name="announcement_enabled" ${s.announcement_enabled === '1' ? 'checked' : ''}> Mostrar barra no topo da loja</label>
        <div class="form-grid">
          <div class="field"><label>Texto da esquerda</label><input class="input" name="announcement_text" value="${esc(s.announcement_text)}"></div>
          <div class="field"><label>Texto da direita</label><input class="input" name="announcement_text2" value="${esc(s.announcement_text2)}"></div>
        </div>
      </div>

      <div class="panel"><h3>Banners (carrossel)</h3>
        <p class="hint">Tamanho ideal da imagem: 1920 × 600 px. Se a sua arte já tem texto, desligue "Mostrar textos por cima".</p>
        <div id="slides"></div>
        <button type="button" class="btn ghost sm" id="addSlide">+ Adicionar banner</button>
      </div>

      <div class="panel"><h3>Faixa de benefícios</h3>
        <div id="feats">${feats.slice(0, 4).map((f, i) => `<div class="feat-row" data-fi="${i}">
          <div class="icon-pick mini">${FEATURE_ICONS.map((k) => `<button type="button" data-fic="${k}" class="${f.icon === k ? 'on' : ''}">${icon(k)}</button>`).join('')}</div>
          <div class="form-grid"><div class="field"><label>Título</label><input class="input" data-ft="title" value="${esc(f.title)}"></div><div class="field"><label>Texto</label><input class="input" data-ft="text" value="${esc(f.text)}"></div></div>
        </div>`).join('')}</div>
        <p class="hint" style="margin:0">Deixe o título vazio para esconder o item. Sem nenhum título, a faixa some.</p>
      </div>

      <div class="panel"><h3>Cores</h3>
        <div class="presets">${PRESETS.map((p, i) => `<button type="button" class="preset" data-preset="${i}"><i style="background:linear-gradient(135deg,${p.c.color_primary},${p.c.color_accent})"></i>${p.n}</button>`).join('')}</div>
        <div class="colors">${COLOR_FIELDS.map(([k, l]) => `<label class="color-field"><input type="color" name="${k}" value="${esc(s[k])}"><span>${l}<small>${esc(s[k])}</small></span></label>`).join('')}</div>
      </div>

      <div class="panel"><h3>Fundo do site</h3>
        <p class="hint">Opcional: uma imagem de fundo fixa atrás de toda a loja.</p>
        <div class="field">${singleImage('bg_image_id', s.bg_image_id, 'wide', 'Enviar imagem de fundo')}</div>
        <div class="field"><label>Escurecer imagem de fundo: <b id="ovVal">${Math.round(s.bg_overlay * 100)}%</b></label><input type="range" name="bg_overlay" min="0" max="0.95" step="0.05" value="${esc(s.bg_overlay)}"></div>
      </div>

      <div class="panel"><h3>Estilo</h3>
        <div class="form-grid">
          <div class="field"><label>Fonte dos títulos</label><select class="input" name="font_heading">${HEAD_FONTS.map((f) => `<option ${s.font_heading === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Fonte do texto</label><select class="input" name="font">${FONTS.map((f) => `<option ${s.font === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Arredondamento: <b id="rdVal">${s.radius}px</b></label><input type="range" name="radius" min="0" max="32" step="1" value="${esc(s.radius)}"></div>
        </div>
      </div>

      <div class="panel"><h3>Páginas "Sobre nós" e "Contato"</h3>
        <div class="field"><label>Texto do Sobre nós</label><textarea class="input" name="about_text" rows="5" placeholder="Conte a história da sua loja...">${esc(s.about_text)}</textarea></div>
        <div class="form-grid">
          <div class="field"><label>WhatsApp (com DDD)</label><input class="input" name="whatsapp" value="${esc(s.whatsapp)}" placeholder="5511999999999"></div>
          <div class="field"><label>Instagram</label><input class="input" name="instagram" value="${esc(s.instagram)}" placeholder="@sualoja"></div>
          <div class="field"><label>E-mail de contato</label><input class="input" name="contact_email" value="${esc(s.contact_email)}"></div>
          <div class="field"><label>Telefone</label><input class="input" name="contact_phone" value="${esc(s.contact_phone)}"></div>
          <div class="field full"><label>Endereço da loja</label><input class="input" name="contact_address" value="${esc(s.contact_address)}"></div>
          <div class="field full"><label>Texto do rodapé</label><input class="input" name="footer_text" value="${esc(s.footer_text)}"></div>
        </div>
      </div>
      <div class="save-bar"><button class="btn">Salvar aparência</button></div>
    </form>`;
  const f = $('#apForm');

  const drawSlides = () => {
    $('#slides').innerHTML = slides.map((sl, i) => `<div class="slide-ed" data-si="${i}">
      <div class="slide-ed-h"><b>Banner ${i + 1}</b><span>
        <button type="button" class="btn ghost sm" data-mv="-1" ${i ? '' : 'disabled'}>↑</button>
        <button type="button" class="btn ghost sm" data-mv="1" ${i < slides.length - 1 ? '' : 'disabled'}>↓</button>
        <button type="button" class="btn ghost sm" data-del style="color:var(--danger)">Remover</button></span></div>
      <div class="field">${singleImage('slide_' + i, sl.image_id, 'wide', 'Imagem do banner')}</div>
      <label class="switch"><input type="checkbox" data-k="show_text" ${sl.show_text !== false ? 'checked' : ''}> Mostrar textos por cima</label>
      <div class="form-grid">
        <div class="field"><label>Frase pequena</label><input class="input" data-k="eyebrow" value="${esc(sl.eyebrow || '')}" placeholder="Bem-vindo à"></div>
        <div class="field"><label>Frase pequena (destaque colorido)</label><input class="input" data-k="eyebrow_hl" value="${esc(sl.eyebrow_hl || '')}" placeholder="Nome da loja"></div>
        <div class="field"><label>Título</label><input class="input" data-k="title" value="${esc(sl.title || '')}" placeholder="Mais que uma loja,"></div>
        <div class="field"><label>Título (linha colorida)</label><input class="input" data-k="title_hl" value="${esc(sl.title_hl || '')}" placeholder="uma experiência."></div>
        <div class="field full"><label>Subtítulo</label><input class="input" data-k="subtitle" value="${esc(sl.subtitle || '')}"></div>
        <div class="field"><label>Texto do botão</label><input class="input" data-k="button_text" value="${esc(sl.button_text || '')}" placeholder="Explorar loja"></div>
        <div class="field"><label>Link do botão</label><select class="input" data-k="button_link">${linkOptions(sl.button_link)}</select></div>
      </div></div>`).join('');
    bindSingles($('#slides'));
    $$('#slides [data-si]').forEach((el) => {
      const i = Number(el.dataset.si);
      $$('[data-mv]', el).forEach((b) => (b.onclick = () => { collectSlides(); const j = i + Number(b.dataset.mv); [slides[i], slides[j]] = [slides[j], slides[i]]; drawSlides(); }));
      $('[data-del]', el).onclick = () => { collectSlides(); slides.splice(i, 1); drawSlides(); };
    });
  };
  const collectSlides = () => {
    slides = $$('#slides [data-si]').map((el) => {
      const o = { image_id: singleVal(el, 'slide_' + el.dataset.si) };
      $$('[data-k]', el).forEach((inp) => (o[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value.trim()));
      return o;
    });
  };
  drawSlides();
  $('#addSlide').onclick = () => { collectSlides(); slides.push({ title: '', show_text: true, button_text: 'Ver ofertas', button_link: '#/ofertas' }); drawSlides(); };

  $$('[data-fi]').forEach((row) => $$('[data-fic]', row).forEach((b) => (b.onclick = () => $$('[data-fic]', row).forEach((x) => x.classList.toggle('on', x === b)))));

  bindSingles(f.querySelector('.panel'));
  bindSingles($$('.panel', f)[5]);
  const live = () => {
    const vals = Object.fromEntries(COLOR_FIELDS.map(([k]) => [k, f[k].value]));
    COLOR_FIELDS.forEach(([k]) => { f[k].nextElementSibling.querySelector('small').textContent = f[k].value; });
    $('#ovVal').textContent = Math.round(f.bg_overlay.value * 100) + '%';
    $('#rdVal').textContent = f.radius.value + 'px';
    applyTheme({ ...A.settings, ...vals, radius: f.radius.value, font: f.font.value, bg_image_id: singleVal(f, 'bg_image_id'), bg_overlay: f.bg_overlay.value });
  };
  f.addEventListener('input', (e) => { if (e.target.type === 'color' || e.target.type === 'range') live(); });
  f.addEventListener('change', (e) => { if (e.target.name === 'font') live(); });
  $$('[data-preset]').forEach((b) => (b.onclick = () => { const p = PRESETS[b.dataset.preset].c; for (const k in p) f[k].value = p[k]; live(); }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    collectSlides();
    const body = {};
    ['store_name', 'store_tagline', 'announcement_text', 'announcement_text2', 'whatsapp', 'instagram', 'footer_text', 'font', 'font_heading', 'radius', 'bg_overlay',
      'about_text', 'contact_email', 'contact_phone', 'contact_address', ...COLOR_FIELDS.map(([k]) => k)].forEach((k) => (body[k] = f[k].value));
    ['logo_image_id', 'favicon_image_id', 'bg_image_id'].forEach((k) => (body[k] = singleVal(f, k)));
    body.announcement_enabled = f.announcement_enabled.checked ? '1' : '0';
    body.hero_slides = JSON.stringify(slides);
    body.features = JSON.stringify($$('[data-fi]').map((row) => ({ icon: $('[data-fic].on', row)?.dataset.fic || 'star', title: $('[data-ft=title]', row).value.trim(), text: $('[data-ft=text]', row).value.trim() })).filter((x) => x.title));
    try {
      await saveSettings(body, 'Aparência salva');
      $('#sideBrand').innerHTML = A.settings.logo_image_id ? `<img src="${imgUrl(A.settings.logo_image_id)}" alt="">` : `<div class="dot"></div><span>${esc(A.settings.store_name)}</span>`;
    } catch (err) { toast(err.message, 'err'); }
  };
};

function linkOptions(cur) {
  const opts = [['#/produtos', 'Todos os produtos'], ['#/ofertas', 'Ofertas'], ['#/sobre', 'Sobre nós'], ['#/contato', 'Contato']]
    .concat(A.categories.map((c) => ['#/categoria/' + c.id, 'Categoria: ' + c.name]))
    .concat(A.products.map((p) => ['#/produto/' + p.id, 'Produto: ' + p.name]));
  if (cur && !opts.some(([v]) => v === cur)) opts.unshift([cur, cur]);
  return opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

const REGIONS = { Sudeste: ['SP', 'RJ', 'MG', 'ES'], Sul: ['PR', 'SC', 'RS'], 'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'], Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'] };

PAGES.shipping = async () => {
  const s = A.settings;
  if (!A.products.length) A.products = await authed('/api/admin/products');
  let table = {};
  try { table = JSON.parse(s.ship_table || '{}'); } catch {}
  const sw = (name, label) => `<label class="switch"><input type="checkbox" name="${name}" ${s[name] === '1' ? 'checked' : ''}> ${label}</label>`;
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Frete</h1><p>Escolha como o frete é calculado no checkout. Pode ligar várias opções juntas — o cliente escolhe.</p></div></div>
    <form id="shForm">
      <div class="panel"><h3>Geral</h3>
        ${sw('ask_address', 'Pedir endereço no checkout (com busca automática pelo CEP)')}
        <div class="form-grid">
          <div class="field"><label>Frete grátis para compras acima de (R$)</label><input class="input" name="free_above" inputmode="decimal" value="${fromCents(Number(s.ship_free_above_cents) || null)}" placeholder="vazio = desligado"></div>
          <div class="field"><label>CEP de origem (de onde você envia)</label><input class="input" name="store_cep" value="${esc(s.store_cep)}" placeholder="00000-000"></div>
        </div>
      </div>

      <div class="panel"><h3>🏷️ Frete fixo (valor que você define)</h3>
        ${sw('ship_fixed_enabled', 'Ativar frete fixo')}
        <div class="form-grid">
          <div class="field"><label>Nome exibido</label><input class="input" name="ship_fixed_name" value="${esc(s.ship_fixed_name)}"></div>
          <div class="field"><label>Valor (R$) — 0 = grátis</label><input class="input" name="fixed_price" inputmode="decimal" value="${fromCents(Number(s.shipping_cents) || 0)}"></div>
          <div class="field"><label>Prazo (dias úteis)</label><input class="input" type="number" min="0" name="ship_fixed_days" value="${esc(s.ship_fixed_days)}"></div>
        </div>
      </div>

      <div class="panel"><h3>🗺️ Valor por estado</h3>
        <p class="hint">Quando ativo, substitui o frete fixo para os estados preenchidos. Estados em branco usam o frete fixo (se ativo).</p>
        ${sw('ship_table_enabled', 'Ativar tabela por estado')}
        <div class="toolbar" style="background:var(--glass);padding:10px;border-radius:12px">
          <span style="font-size:13px;color:var(--muted)">Preencher região:</span>
          <select class="input" id="rgSel" style="max-width:160px">${Object.keys(REGIONS).map((r) => `<option>${r}</option>`).join('')}</select>
          <input class="input" id="rgPrice" placeholder="R$" inputmode="decimal" style="max-width:100px">
          <input class="input" id="rgDays" placeholder="dias" type="number" style="max-width:90px">
          <button type="button" class="btn ghost sm" id="rgApply">Aplicar</button>
        </div>
        <div class="uf-grid">${Object.values(REGIONS).flat().map((uf) => `<div class="uf"><b>${uf}</b><input class="input" data-ufp="${uf}" inputmode="decimal" placeholder="R$" value="${table[uf] && table[uf].cents !== '' && table[uf].cents != null ? fromCents(Number(table[uf].cents)) : ''}"><input class="input" data-ufd="${uf}" type="number" min="0" placeholder="dias" value="${table[uf]?.days ?? ''}"></div>`).join('')}</div>
      </div>

      <div class="panel"><h3>📍 Retirada no local</h3>
        ${sw('ship_pickup_enabled', 'Permitir retirar na loja (grátis)')}
        <div class="form-grid">
          <div class="field"><label>Nome exibido</label><input class="input" name="ship_pickup_name" value="${esc(s.ship_pickup_name)}"></div>
          <div class="field"><label>Informação (endereço / horário)</label><input class="input" name="ship_pickup_info" value="${esc(s.ship_pickup_info)}" placeholder="Rua X, 123 — seg a sex, 9h às 18h"></div>
        </div>
      </div>

      <div class="panel"><h3>🚚 Cálculo automático — Melhor Envio (Correios, Jadlog, Loggi...)</h3>
        <div class="alert info">O <b>Melhor Envio</b> calcula o frete real dos Correios e transportadoras pelo CEP, peso e medidas, sem precisar de contrato com os Correios. A conta é grátis.<br><br>
          Como pegar o token: crie a conta em <b>melhorenvio.com.br</b> → menu <b>Integrações</b> → <b>Permissões de acesso</b> → <b>Gerar novo token</b> → marque a permissão <b>shipping-calculate</b> → copie o token e cole abaixo.</div>
        ${sw('ship_me_enabled', 'Ativar cálculo automático')}
        <div class="form-grid">
          <div class="field full"><label>Token do Melhor Envio ${s.ship_me_token_set ? '<span class="pill paid">configurado</span>' : ''}</label><input class="input" type="password" name="ship_me_token" autocomplete="off" placeholder="${s.ship_me_token_set ? '•••••••• (vazio = manter)' : 'Cole o token aqui'}"></div>
          <div class="field"><label>Acrescentar ao frete (R$) — embalagem/manuseio</label><input class="input" name="me_extra" inputmode="decimal" value="${fromCents(Number(s.ship_me_extra_cents) || null)}" placeholder="0,00"></div>
          <div class="field"><label>Dias a mais no prazo (tempo de postagem)</label><input class="input" type="number" min="0" name="ship_me_extra_days" value="${esc(s.ship_me_extra_days)}"></div>
        </div>
        ${sw('ship_me_sandbox', 'Modo teste (sandbox) — use só se o token for do ambiente de testes')}
        <h4 style="font-size:14px;margin:6px 0 10px">Medidas padrão (para produtos sem medida cadastrada)</h4>
        <div class="form-grid">
          <div class="field"><label>Peso (g)</label><input class="input" type="number" name="ship_default_weight_g" value="${esc(s.ship_default_weight_g)}"></div>
          <div class="field"><label>Comprimento (cm)</label><input class="input" type="number" name="ship_default_length_cm" value="${esc(s.ship_default_length_cm)}"></div>
          <div class="field"><label>Largura (cm)</label><input class="input" type="number" name="ship_default_width_cm" value="${esc(s.ship_default_width_cm)}"></div>
          <div class="field"><label>Altura (cm)</label><input class="input" type="number" name="ship_default_height_cm" value="${esc(s.ship_default_height_cm)}"></div>
        </div>
      </div>

      <div class="panel"><h3>🧪 Testar cálculo</h3>
        <div class="toolbar"><input class="input" id="tCep" placeholder="CEP de destino" style="max-width:180px"><select class="input" id="tProd" style="max-width:280px">${A.products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="btn ghost" id="tBtn">Salvar e calcular</button></div>
        <div id="tRes"></div>
      </div>
      <div class="save-bar"><button class="btn">Salvar frete</button></div>
    </form>`;
  const f = $('#shForm');
  $('#rgApply').onclick = () => {
    for (const uf of REGIONS[$('#rgSel').value]) {
      if ($('#rgPrice').value) $(`[data-ufp="${uf}"]`).value = $('#rgPrice').value;
      if ($('#rgDays').value) $(`[data-ufd="${uf}"]`).value = $('#rgDays').value;
    }
  };
  const body = () => {
    const tb = {};
    $$('[data-ufp]').forEach((i) => {
      const uf = i.dataset.ufp; const c = toCents(i.value); const d = $(`[data-ufd="${uf}"]`).value;
      if (c != null) tb[uf] = { cents: c, days: d === '' ? 0 : Number(d) };
    });
    const b = { ship_table: JSON.stringify(tb), ship_free_above_cents: String(toCents(f.free_above.value) || 0), shipping_cents: String(toCents(f.fixed_price.value) || 0),
      ship_me_extra_cents: String(toCents(f.me_extra.value) || 0), store_cep: f.store_cep.value.replace(/\D/g, '') };
    ['ask_address', 'ship_fixed_enabled', 'ship_table_enabled', 'ship_pickup_enabled', 'ship_me_enabled', 'ship_me_sandbox'].forEach((k) => (b[k] = f[k].checked ? '1' : '0'));
    ['ship_fixed_name', 'ship_fixed_days', 'ship_pickup_name', 'ship_pickup_info', 'ship_me_token', 'ship_me_extra_days', 'ship_default_weight_g', 'ship_default_length_cm', 'ship_default_width_cm', 'ship_default_height_cm'].forEach((k) => (b[k] = f[k].value));
    return b;
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.ship_me_enabled.checked && f.store_cep.value.replace(/\D/g, '').length !== 8) return toast('Informe o CEP de origem para o cálculo automático', 'err');
    try { await saveSettings(body(), 'Frete salvo'); } catch (err) { toast(err.message, 'err'); }
  };
  $('#tBtn').onclick = async () => {
    try {
      await saveSettings(body(), 'Salvo');
      const r = await api('/api/shipping/quote', { method: 'POST', body: { cep: $('#tCep').value.replace(/\D/g, ''), items: [{ product_id: Number($('#tProd').value), qty: 1 }] } });
      $('#tRes').innerHTML = (r.errors || []).map((x) => `<div class="alert err">${esc(x)}</div>`).join('') +
        (r.options.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Opção</th><th>Prazo</th><th>Valor</th></tr></thead><tbody>${r.options.map((o) => `<tr><td>${esc(o.name)}</td><td>${o.pickup ? '—' : o.days ? o.days + ' dia(s) úteis' : '—'}</td><td><b>${o.price_cents ? brl(o.price_cents) : 'Grátis'}</b></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="alert warn">Nenhuma opção de entrega para esse CEP. Ative pelo menos uma forma de frete.</div>') +
        (r.uf ? `<p style="color:var(--muted);font-size:13px;margin-top:8px">Estado detectado: ${r.uf}</p>` : '');
    } catch (err) { toast(err.message, 'err'); }
  };
};

PAGES.payment = async () => {
  const s = A.settings;
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Pagamento</h1><p>Como seus clientes pagam via Pix</p></div></div>
    <form id="pyForm">
      <div class="panel"><h3>Modo de cobrança</h3>
        <div class="seg" id="pyMode" style="margin-bottom:14px">
          <button type="button" data-m="mercadopago" class="${s.payment_mode === 'mercadopago' ? 'active' : ''}">Mercado Pago (confirmação automática)</button>
          <button type="button" data-m="static" class="${s.payment_mode !== 'mercadopago' ? 'active' : ''}">Pix direto na minha chave (confirmo manualmente)</button>
        </div>
        <div id="mpBox">
          <div class="alert info">Com o Mercado Pago, o QR Code é gerado para cada pedido e, quando o cliente paga, o pedido vira <b>Pago</b> sozinho e você recebe o e-mail. Taxa do Pix no Mercado Pago: consulte no seu painel.<br><br>
          Como pegar o token: entre em <b>mercadopago.com.br/developers</b> → <b>Suas integrações</b> → crie uma aplicação → <b>Credenciais de produção</b> → copie o <b>Access Token</b> (começa com <code>APP_USR-</code>).</div>
          <div class="field"><label>Access Token do Mercado Pago ${s.mp_access_token_set ? '<span class="pill paid">configurado</span>' : ''}</label><input class="input" type="password" name="mp_access_token" autocomplete="off" placeholder="${s.mp_access_token_set ? '•••••••• (deixe vazio para manter)' : 'APP_USR-...'}"></div>
          <div class="field"><label>Endereço público do servidor (HTTPS)</label><input class="input" name="public_url" value="${esc(s.public_url)}" placeholder="https://sua-loja.trycloudflare.com"><small style="color:var(--muted);font-size:12px">Usado para o Mercado Pago avisar o pagamento na hora e para mostrar a logo nos e-mails. Mesmo sem ele, o servidor confere os pagamentos a cada 15 segundos.</small></div>
        </div>
      </div>
      <div class="panel"><h3>Chave Pix ${s.payment_mode === 'mercadopago' ? '(reserva, se o Mercado Pago falhar)' : ''}</h3>
        <p class="hint">O QR Code já sai com o valor do pedido e o código do pedido como identificador. Você confirma o pagamento no painel (Pedidos → status "Pago").</p>
        <div class="form-grid">
          <div class="field full"><label>Chave Pix</label><input class="input" name="pix_key" value="${esc(s.pix_key)}" placeholder="CPF, CNPJ, e-mail, +5511999999999 ou chave aleatória"></div>
          <div class="field"><label>Nome do recebedor</label><input class="input" name="pix_name" value="${esc(s.pix_name)}" maxlength="25" placeholder="Como aparece no banco"></div>
          <div class="field"><label>Cidade</label><input class="input" name="pix_city" value="${esc(s.pix_city)}" maxlength="15" placeholder="SAO PAULO"></div>
        </div>
        <p style="color:var(--muted);font-size:12px">Telefone como chave: use o formato <b>+55</b> DDD número (ex.: +5511999998888).</p>
      </div>
      <div class="save-bar"><button class="btn">Salvar pagamento</button></div>
    </form>`;
  let mode = s.payment_mode === 'mercadopago' ? 'mercadopago' : 'static';
  const upd = () => { $('#mpBox').style.display = mode === 'mercadopago' ? '' : 'none'; };
  upd();
  $$('#pyMode button').forEach((b) => (b.onclick = () => { mode = b.dataset.m; $$('#pyMode button').forEach((x) => x.classList.toggle('active', x === b)); upd(); }));
  $('#pyForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await saveSettings({ payment_mode: mode, mp_access_token: f.mp_access_token.value, public_url: f.public_url.value, pix_key: f.pix_key.value, pix_name: f.pix_name.value, pix_city: f.pix_city.value }, 'Pagamento salvo');
      PAGES.payment();
    } catch (err) { toast(err.message, 'err'); }
  };
};

PAGES.email = async () => {
  const s = A.settings;
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Notificações</h1><p>Receba cada pedido no seu e-mail, com a notinha</p></div></div>
    ${s.last_email_error ? `<div class="alert err">Último erro: ${esc(s.last_email_error)}</div>` : ''}
    <form id="emForm">
      <div class="panel"><h3>Para onde enviar</h3>
        <div class="field"><label>Seu e-mail (recebe os pedidos) — pode colocar vários separados por vírgula</label><input class="input" name="notify_email" value="${esc(s.notify_email)}" placeholder="voce@gmail.com"></div>
        <label class="switch"><input type="checkbox" name="send_customer_email" ${s.send_customer_email === '1' ? 'checked' : ''}> Enviar a nota também para o cliente</label>
      </div>
      <div class="panel"><h3>Conta que envia (SMTP)</h3>
        <div class="alert info"><b>Usando Gmail:</b> ative a verificação em 2 etapas na sua conta Google, depois acesse <b>myaccount.google.com/apppasswords</b>, crie uma senha de app chamada "Loja" e cole abaixo (16 letras). Servidor <code>smtp.gmail.com</code>, porta <code>465</code>.</div>
        <div class="form-grid">
          <div class="field"><label>Servidor SMTP</label><input class="input" name="smtp_host" value="${esc(s.smtp_host)}"></div>
          <div class="field"><label>Porta</label><select class="input" name="smtp_port"><option ${s.smtp_port === '465' ? 'selected' : ''}>465</option><option ${s.smtp_port === '587' ? 'selected' : ''}>587</option></select></div>
          <div class="field"><label>Usuário (e-mail)</label><input class="input" name="smtp_user" value="${esc(s.smtp_user)}" autocomplete="off"></div>
          <div class="field"><label>Senha de app ${s.smtp_pass_set ? '<span class="pill paid">configurada</span>' : ''}</label><input class="input" type="password" name="smtp_pass" autocomplete="new-password" placeholder="${s.smtp_pass_set ? '•••••••• (vazio = manter)' : ''}"></div>
          <div class="field full"><label>Remetente (opcional)</label><input class="input" name="smtp_from" value="${esc(s.smtp_from)}" placeholder="Minha Loja <voce@gmail.com>"></div>
        </div>
      </div>
      <div class="save-bar" style="gap:8px"><button type="button" class="btn ghost" id="testEm">Enviar e-mail de teste</button><button class="btn">Salvar</button></div>
    </form>`;
  const f = $('#emForm');
  const body = () => ({ notify_email: f.notify_email.value, send_customer_email: f.send_customer_email.checked ? '1' : '0', smtp_host: f.smtp_host.value,
    smtp_port: f.smtp_port.value, smtp_user: f.smtp_user.value, smtp_pass: f.smtp_pass.value, smtp_from: f.smtp_from.value });
  f.onsubmit = async (e) => { e.preventDefault(); try { await saveSettings(body(), 'E-mail salvo'); PAGES.email(); } catch (err) { toast(err.message, 'err'); } };
  $('#testEm').onclick = async () => {
    const b = $('#testEm'); b.disabled = true; b.textContent = 'Enviando...';
    try { await saveSettings(body(), 'Salvo'); await authed('/api/admin/test-email', { method: 'POST', body: {} }); toast('E-mail de teste enviado! Confira sua caixa de entrada.'); }
    catch (err) { toast(err.message, 'err'); }
    b.disabled = false; b.textContent = 'Enviar e-mail de teste';
  };
};

PAGES.account = async () => {
  $('#content').innerHTML = `
    <div class="page-head"><div><h1>Conta</h1><p>Segurança e conexão</p></div></div>
    <div class="panel"><h3>Trocar senha</h3>
      <form id="pwForm" style="max-width:420px">
        <div class="field"><label>Senha atual</label><input class="input" type="password" name="current" required></div>
        <div class="field"><label>Nova senha (mín. 6)</label><input class="input" type="password" name="new" required minlength="6"></div>
        <button class="btn">Alterar senha</button>
      </form>
    </div>
    <div class="panel"><h3>Servidor conectado</h3>
      <p class="hint">Este navegador está usando: <b>${esc(API)}</b></p>
      <p style="color:var(--muted);font-size:13px">O endereço padrão fica no arquivo <code>docs/js/config.js</code> do GitHub (o script <code>iniciar.sh</code> atualiza sozinho).</p>
    </div>
    <button class="btn ghost" id="logout">Sair do painel</button>`;
  $('#pwForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await authed('/api/admin/password', { method: 'POST', body: { current: e.target.current.value, new: e.target.new.value } });
      localStorage.setItem('admin_token', r.token); sessionStorage.removeItem('default_pw');
      toast('Senha alterada'); e.target.reset();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#logout').onclick = () => { localStorage.removeItem('admin_token'); location.hash = ''; showLogin(); };
};

window.go = go;
window.newOrder = newOrder;
boot();
