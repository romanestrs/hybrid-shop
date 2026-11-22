/* Hybrid Shop front-end (vanilla JS, talks to the local REST API) */
let token = localStorage.getItem('token');
let me = JSON.parse(localStorage.getItem('me') || 'null');
let cfg = { demoMode: false };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toFixed(2) + ' €';
const fdate = (d) => new Date(d).toLocaleString();
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const icon = (p) => p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : '📦';

async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let b;
  if (form) b = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch('/api' + path, { method, headers, body: b });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(false); }
  if (!r.ok) throw new Error(d.error || r.statusText);
  return d;
}
function toast(msg, err) {
  const el = document.createElement('div'); el.className = 't' + (err ? ' err' : ''); el.textContent = msg;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), err ? 6000 : 3000);
}
const run = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function setSession(d) { token = d.token; me = d.user; localStorage.setItem('token', token); localStorage.setItem('me', JSON.stringify(me)); }
function logout(go = true) { token = null; me = null; localStorage.clear(); if (go) show('catalog'); else renderNav(); }

/* ---------- navigation ---------- */
let view = 'catalog';
function renderNav() {
  const tabs = [['catalog', '🛍 Catalog']];
  if (me) tabs.push(['cart', '🧺 Cart'], ['orders', '📄 Orders'], ['notifs', '🔔 Notifications'], ['profile', '👤 Profile']);
  if (me?.role === 'admin') tabs.push(['adminProducts', '⚙ Products'], ['adminUsers', '👥 Users'], ['adminLogs', '📜 Activity logs']);
  tabs.push(me ? ['logout', '⏻ Logout (' + esc(me.full_name.split(' ')[0]) + ')'] : ['login', '🔑 Login / Register']);
  $('#nav').innerHTML = tabs.map(([k, l]) => `<button class="${k === view ? 'on' : ''}" onclick="show('${k}')">${l}</button>`).join('');
}
const views = {};
async function show(v) {
  if (v === 'logout') return logout();
  view = v; renderNav();
  try { await views[v](); } catch (e) { $('#app').innerHTML = `<div class="card">${esc(e.message)}</div>`; }
}

/* ---------- auth ---------- */
views.login = async () => {
  $('#app').innerHTML = `<div class="cols">
  <div class="card"><h2>Login</h2><label>Email</label><input id="le" value="alice@shop.local"><label>Password</label><input id="lp" type="password" value="User123!">
  <p><button onclick="doLogin()">Login</button></p><p class="muted">Demo: admin@shop.local / Admin123!</p></div>
  <div class="card"><h2>Create account</h2><label>Full name</label><input id="rn"><label>Email</label><input id="re"><label>Password (min 6)</label><input id="rp" type="password">
  <p><button class="ok" onclick="doRegister()">Register</button></p></div></div>`;
};
window.doLogin = run(async () => { setSession(await api('/auth/login', { method: 'POST', body: { email: $('#le').value, password: $('#lp').value } })); toast('Welcome back!'); show('catalog'); });
window.doRegister = run(async () => { setSession(await api('/auth/register', { method: 'POST', body: { full_name: $('#rn').value, email: $('#re').value, password: $('#rp').value } })); toast('Account created'); show('catalog'); });

/* ---------- catalog + reviews (SQL products, NoSQL reviews) ---------- */
views.catalog = async () => {
  const q = window._q || '';
  const list = await api('/products?q=' + encodeURIComponent(q));
  $('#app').innerHTML = `<div class="card row"><input id="q" placeholder="Search products..." value="${esc(q)}"><button onclick="window._q=$('#q').value;show('catalog')">Search</button></div>
  <div class="grid">${list.map((p) => `<div class="card"><div class="pimg">${icon(p)}</div><h3>${esc(p.title)}</h3>
  <div class="stars">${stars(p.rating.avg)} <span class="muted">${p.rating.avg || '–'} (${p.rating.count})</span></div>
  <p class="muted">${esc(p.description)}</p><b>${money(p.price)}</b> · <span class="muted">${p.stock_quantity > 0 ? p.stock_quantity + ' in stock' : 'Out of stock'}</span>
  ${p.status === 'archived' ? '<span class="badge">archived</span>' : ''}
  <div class="row" style="margin-top:8px"><input type="number" id="qty${p.product_id}" value="1" min="1" style="width:60px">
  <button onclick="addToCart(${p.product_id})">Add to cart</button><button class="sec" onclick="openReviews(${p.product_id},'${esc(p.title).replace(/'/g, '')}')">Reviews</button></div></div>`).join('') || '<p>No products.</p>'}</div>
  <div id="reviews"></div>`;
};
window.addToCart = run(async (id) => {
  if (!me) { toast('Please login first', true); return show('login'); }
  await api('/cart/items', { method: 'POST', body: { productId: id, quantity: +$('#qty' + id).value } }); toast('Added to cart');
});
window.openReviews = run(async (pid, title) => {
  const d = await api('/reviews?productId=' + pid);
  $('#reviews').innerHTML = `<div class="card"><h2>Reviews – ${esc(title)} <span class="stars">${stars(d.average)}</span> <span class="muted">${d.average} / 5 (${d.count})</span></h2>
  ${d.reviews.map((r) => `<div class="card"><span class="stars">${stars(r.rating)}</span> <b>${esc(r.userName)}</b> <span class="muted">${fdate(r.createdAt)}</span>
  <p>${esc(r.comment)}</p><div class="row"><button class="sec sm" onclick="likeReview('${r._id}',${pid},'${esc(title).replace(/'/g, '')}')">👍 ${r.likes}</button>
  ${me && (me.user_id === r.userId || me.role === 'admin') ? `${me.user_id === r.userId ? `<button class="sec sm" onclick="editReview('${r._id}',${pid},'${esc(title).replace(/'/g, '')}',${r.rating},'${esc(r.comment).replace(/'/g, '')}')">Edit</button>` : ''}
  <button class="bad sm" onclick="delReview('${r._id}',${pid},'${esc(title).replace(/'/g, '')}')">Delete</button>` : ''}</div></div>`).join('') || '<p class="muted">No review yet.</p>'}
  ${me ? `<h3>Write a review</h3><div class="row"><select id="rr">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} ★</option>`).join('')}</select></div>
  <textarea id="rc" rows="3" placeholder="Your comment"></textarea><p><button onclick="postReview(${pid},'${esc(title).replace(/'/g, '')}')">Post review</button></p>` : '<p class="muted">Login to post a review.</p>'}</div>`;
  $('#reviews').scrollIntoView({ behavior: 'smooth' });
});
window.postReview = run(async (pid, t) => { await api('/reviews', { method: 'POST', body: { productId: pid, rating: +$('#rr').value, comment: $('#rc').value } }); toast('Review posted'); openReviews(pid, t); });
window.likeReview = run(async (id, pid, t) => { if (!me) return toast('Login to like', true); await api(`/reviews/${id}/like`, { method: 'POST' }); openReviews(pid, t); });
window.editReview = run(async (id, pid, t, r, c) => {
  const comment = prompt('Edit your comment', c); if (comment === null) return;
  const rating = prompt('Rating (1-5)', r); if (rating === null) return;
  await api('/reviews/' + id, { method: 'PUT', body: { rating: +rating, comment } }); toast('Review updated'); openReviews(pid, t);
});
window.delReview = run(async (id, pid, t) => { if (!confirm('Delete this review?')) return; await api('/reviews/' + id, { method: 'DELETE' }); toast('Review deleted'); openReviews(pid, t); });

/* ---------- cart (NoSQL) + checkout (SQL transaction) ---------- */
views.cart = async () => {
  const c = await api('/cart');
  $('#app').innerHTML = `<div class="card"><h2>My cart <span class="muted">(stored in MongoDB)</span></h2>
  ${c.items.length ? `<table><tr><th>Product</th><th>Price</th><th>Qty</th><th>Subtotal</th><th></th></tr>
  ${c.items.map((i) => `<tr><td>${esc(i.title)}</td><td>${money(i.price)}</td><td><input type="number" min="1" value="${i.quantity}" style="width:65px" onchange="updQty(${i.productId},this.value)"></td>
  <td>${money(i.price * i.quantity)}</td><td><button class="bad sm" onclick="rmItem(${i.productId})">Remove</button></td></tr>`).join('')}
  <tr><th colspan="3">Total</th><th colspan="2">${money(c.total)}</th></tr></table>
  <label>Shipping address</label><input id="addr" style="width:100%" placeholder="12 rue de la Paix, Paris">
  ${cfg.demoMode ? '<label><input type="checkbox" id="sim"> DEMO: simulate a failure during checkout (to show the rollback)</label>' : ''}
  <p class="row"><button class="ok" onclick="checkout()">Checkout</button><button class="sec" onclick="clearCart()">Clear cart</button></p>` : '<p>Your cart is empty.</p>'}</div>`;
};
window.updQty = run(async (id, q) => { await api('/cart/items/' + id, { method: 'PUT', body: { quantity: +q } }); show('cart'); });
window.rmItem = run(async (id) => { await api('/cart/items/' + id, { method: 'DELETE' }); show('cart'); });
window.clearCart = run(async () => { await api('/cart', { method: 'DELETE' }); toast('Cart cleared'); show('cart'); });
window.checkout = async () => {
  try {
    const d = await api('/orders/checkout', { method: 'POST', body: { shipping_address: $('#addr').value, simulateFailure: !!$('#sim')?.checked } });
    toast(`Order #${d.order.order_id} placed ✔ (cart cleared, log written, notification sent)`); show('orders');
  } catch (e) { toast('❌ Transaction rolled back: ' + e.message, true); }
};

/* ---------- orders (SQL joins) ---------- */
views.orders = async () => {
  const list = await api('/orders'); const adm = me.role === 'admin';
  $('#app').innerHTML = `<div class="card"><h2>${adm ? 'All orders' : 'My order history'}</h2><table>
  <tr><th>#</th>${adm ? '<th>Customer</th>' : ''}<th>Date</th><th>Items</th><th>Total</th><th>Status</th><th></th></tr>
  ${list.map((o) => `<tr><td>${o.order_id}</td>${adm ? `<td>${esc(o.full_name)}<br><span class="muted">${esc(o.email)}</span></td>` : ''}<td>${fdate(o.created_at)}</td><td>${o.items_count}</td><td>${money(o.total_amount)}</td>
  <td>${adm ? `<select onchange="setStatus(${o.order_id},this.value)">${['pending', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => `<option ${s === o.order_status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : `<span class="badge s-${o.order_status}">${o.order_status}</span>`}</td>
  <td class="row"><button class="sec sm" onclick="orderDetail(${o.order_id})">Details</button>${adm || o.order_status === 'pending' ? `<button class="bad sm" onclick="delOrder(${o.order_id})">Delete</button>` : ''}</td></tr>
  <tr id="od${o.order_id}"></tr>`).join('') || '<tr><td colspan="7">No orders yet.</td></tr>'}</table></div>`;
};
window.orderDetail = run(async (id) => {
  const o = await api('/orders/' + id), row = $('#od' + id);
  if (row.innerHTML) { row.innerHTML = ''; return; }
  row.innerHTML = `<td colspan="7"><b>Shipping:</b> ${esc(o.shipping_address)}<table>${o.items.map((i) => `<tr><td>${esc(i.title)}</td><td>${money(i.unit_price)} × ${i.quantity}</td><td>${money(i.unit_price * i.quantity)}</td>
  <td>${o.order_status === 'pending' || me.role === 'admin' ? `<button class="bad sm" onclick="delItem(${id},${i.item_id})">Cancel line</button>` : ''}</td></tr>`).join('')}</table></td>`;
});
window.setStatus = run(async (id, s) => { await api(`/orders/${id}/status`, { method: 'PUT', body: { status: s } }); toast('Status updated'); show('orders'); });
window.delItem = run(async (id, item) => { if (!confirm('Cancel this line? Stock is restored.')) return; await api(`/orders/${id}/items/${item}`, { method: 'DELETE' }); toast('Line cancelled'); show('orders'); });
window.delOrder = run(async (id) => { if (!confirm('Delete this order? Stock is restored.')) return; await api('/orders/' + id, { method: 'DELETE' }); toast('Order deleted'); show('orders'); });

/* ---------- notifications (NoSQL) ---------- */
views.notifs = async () => {
  const d = await api('/notifications');
  $('#app').innerHTML = `<div class="card"><h2>Notifications <span class="badge">${d.unread} unread</span></h2><p><button class="sec sm" onclick="readAll()">Mark all as read</button></p>
  ${d.notifications.map((n) => `<div class="card ${n.isRead ? '' : 'unread'}"><b>${esc(n.title)}</b> <span class="muted">${fdate(n.sentAt)}</span><p>${esc(n.message)}</p>
  <div class="row">${n.isRead ? '' : `<button class="sec sm" onclick="readOne('${n._id}')">Mark as read</button>`}<button class="bad sm" onclick="dismiss('${n._id}')">Dismiss</button></div></div>`).join('') || '<p>Nothing here.</p>'}</div>
  ${me.role === 'admin' ? `<div class="card"><h2>Send notification (admin)</h2><div class="row"><input id="nu" placeholder="user id or 'all'" value="all" style="width:130px"><input id="nt" placeholder="Title"></div>
  <textarea id="nm" rows="2" placeholder="Message"></textarea><p><button onclick="sendNotif()">Send</button></p></div>` : ''}`;
};
window.readAll = run(async () => { await api('/notifications/read-all', { method: 'PUT' }); show('notifs'); });
window.readOne = run(async (id) => { await api(`/notifications/${id}/read`, { method: 'PUT' }); show('notifs'); });
window.dismiss = run(async (id) => { await api('/notifications/' + id, { method: 'DELETE' }); show('notifs'); });
window.sendNotif = run(async () => { const d = await api('/notifications', { method: 'POST', body: { userId: $('#nu').value, title: $('#nt').value, message: $('#nm').value } }); toast(`Sent to ${d.sent} user(s)`); show('notifs'); });

/* ---------- profile (SQL users) ---------- */
views.profile = async () => {
  const u = await api('/users/me'); const mine = await api('/logs/mine');
  $('#app').innerHTML = `<div class="cols"><div class="card"><h2>My profile</h2>${u.avatar_url ? `<img class="avatar" src="${esc(u.avatar_url)}">` : '<div class="avatar"></div>'}
  <label>Avatar (stored on the server's disk)</label><input type="file" id="av" accept="image/*"><p><button class="sec sm" onclick="upAvatar()">Upload</button></p>
  <label>Full name</label><input id="pn" value="${esc(u.full_name)}"><label>Email</label><input id="pe" value="${esc(u.email)}"><label>New password (optional)</label><input id="pp" type="password">
  <p><button onclick="saveProfile()">Save</button></p></div>
  <div class="card"><h2>My recent activity <span class="muted">(MongoDB)</span></h2><table>${mine.slice(0, 12).map((l) => `<tr><td>${esc(l.action_type)}</td><td class="muted">${fdate(l.timestamp)}</td></tr>`).join('')}</table></div></div>`;
};
window.saveProfile = run(async () => { const u = await api('/users/me', { method: 'PUT', body: { full_name: $('#pn').value, email: $('#pe').value, password: $('#pp').value || undefined } }); me = { ...me, ...u }; localStorage.setItem('me', JSON.stringify(me)); toast('Profile saved'); show('profile'); });
window.upAvatar = run(async () => { const f = $('#av').files[0]; if (!f) return toast('Choose an image', true); const fd = new FormData(); fd.append('avatar', f); await api('/users/me/avatar', { method: 'POST', form: fd }); toast('Avatar updated'); show('profile'); });

/* ---------- admin: products (SQL) ---------- */
views.adminProducts = async () => {
  const list = await api('/products');
  $('#app').innerHTML = `<div class="card"><h2 id="pf-title">Add a product</h2><input type="hidden" id="pid">
  <div class="row"><input id="pt" placeholder="Title"><input id="pr" type="number" step="0.01" placeholder="Price" style="width:100px"><input id="ps" type="number" placeholder="Stock" style="width:90px">
  <select id="pst"><option>active</option><option>archived</option></select></div><textarea id="pd" rows="2" placeholder="Description"></textarea>
  <label>Image (saved locally in /uploads/products)</label><input type="file" id="pi" accept="image/*"><p class="row"><button onclick="saveProduct()">Save</button><button class="sec" onclick="show('adminProducts')">Reset</button></p></div>
  <div class="card"><h2>Inventory</h2><table><tr><th></th><th>Title</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>
  ${list.map((p) => `<tr><td style="width:54px"><div class="pimg" style="height:44px;width:44px;font-size:20px">${icon(p)}</div></td><td>${esc(p.title)}</td><td>${money(p.price)}</td>
  <td><b>${p.stock_quantity}</b></td><td><span class="badge">${p.status}</span></td><td class="row"><button class="sec sm" onclick='editProduct(${JSON.stringify(p).replace(/'/g, '&#39;')})'>Edit</button><button class="bad sm" onclick="delProduct(${p.product_id})">Delete</button></td></tr>`).join('')}</table></div>`;
};
window.editProduct = (p) => { $('#pf-title').textContent = 'Edit product #' + p.product_id; $('#pid').value = p.product_id; $('#pt').value = p.title; $('#pr').value = p.price; $('#ps').value = p.stock_quantity; $('#pst').value = p.status; $('#pd').value = p.description || ''; window.scrollTo(0, 0); };
window.saveProduct = run(async () => {
  const fd = new FormData(); fd.append('title', $('#pt').value); fd.append('price', $('#pr').value); fd.append('stock_quantity', $('#ps').value); fd.append('status', $('#pst').value); fd.append('description', $('#pd').value);
  if ($('#pi').files[0]) fd.append('image', $('#pi').files[0]);
  const id = $('#pid').value; await api(id ? '/products/' + id : '/products', { method: id ? 'PUT' : 'POST', form: fd }); toast('Product saved'); show('adminProducts');
});
window.delProduct = run(async (id) => { if (!confirm('Delete this product?')) return; await api('/products/' + id, { method: 'DELETE' }); toast('Product deleted'); show('adminProducts'); });

/* ---------- admin: users (SQL) ---------- */
views.adminUsers = async () => {
  const list = await api('/users');
  $('#app').innerHTML = `<div class="card"><h2>Users</h2><table><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th></th></tr>
  ${list.map((u) => `<tr><td>${u.user_id}</td><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td>
  <td><select onchange="setRole(${u.user_id},this.value)"><option ${u.role === 'customer' ? 'selected' : ''}>customer</option><option ${u.role === 'admin' ? 'selected' : ''}>admin</option></select></td>
  <td>${fdate(u.created_at)}</td><td><button class="bad sm" onclick="delUser(${u.user_id})">Delete</button></td></tr>`).join('')}</table></div>`;
};
window.setRole = run(async (id, role) => { await api('/users/' + id, { method: 'PUT', body: { role } }); toast('Role updated'); });
window.delUser = run(async (id) => { if (!confirm('Delete this user and his NoSQL data?')) return; await api('/users/' + id, { method: 'DELETE' }); toast('User deleted'); show('adminUsers'); });

/* ---------- admin: activity logs (NoSQL) ---------- */
views.adminLogs = async () => {
  const f = window._lf || ''; const list = await api('/logs?limit=150' + (f ? '&action_type=' + encodeURIComponent(f) : ''));
  $('#app').innerHTML = `<div class="card"><h2>Activity logs <span class="muted">(MongoDB – live audit trail)</span></h2>
  <div class="row"><input id="lf" placeholder="Filter by action e.g. ORDER_PLACED" value="${esc(f)}" style="width:260px"><button onclick="window._lf=$('#lf').value.toUpperCase();show('adminLogs')">Filter</button>
  <button class="sec" onclick="show('adminLogs')">Refresh</button><button class="bad" onclick="clearLogs()">Delete all</button></div>
  <div class="row" style="margin-top:8px"><input id="la" placeholder="Manual entry action" style="width:200px"><input id="lm" placeholder="note"><button class="ok" onclick="addLog()">Add log entry</button></div>
  <table><tr><th>Time</th><th>User</th><th>Action</th><th>IP</th><th>Metadata</th><th></th></tr>
  ${list.map((l) => `<tr><td>${fdate(l.timestamp)}</td><td>${l.userId ?? '–'}</td><td><b>${esc(l.action_type)}</b></td><td>${esc(l.ip_address)}</td><td><pre>${esc(JSON.stringify(l.metadata))}</pre></td>
  <td class="row"><button class="sec sm" onclick="noteLog('${l._id}')">Note</button><button class="bad sm" onclick="delLog('${l._id}')">✕</button></td></tr>`).join('')}</table></div>`;
};
window.addLog = run(async () => { await api('/logs', { method: 'POST', body: { action_type: $('#la').value || 'MANUAL_NOTE', metadata: { note: $('#lm').value } } }); show('adminLogs'); });
window.noteLog = run(async (id) => { const n = prompt('Admin note'); if (n === null) return; await api('/logs/' + id, { method: 'PUT', body: { note: n } }); show('adminLogs'); });
window.delLog = run(async (id) => { await api('/logs/' + id, { method: 'DELETE' }); show('adminLogs'); });
window.clearLogs = run(async () => { if (!confirm('Delete ALL logs?')) return; await api('/logs', { method: 'DELETE' }); show('adminLogs'); });

/* ---------- boot ---------- */
fetch('/api/config').then((r) => r.json()).then((c) => { cfg = c; }).finally(() => show('catalog'));
