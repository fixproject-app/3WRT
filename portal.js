'use strict';
/* ============================================================
   Portal Stok Pelanggan — portal.js
   Semua data lewat fungsi database portal_* (tanpa harga/HPP). Identitas pelanggan diambil server dari akun yang login.
   Konfigurasi & identitas: config.js + brand.js (sama dengan aplikasi admin).
   ============================================================ */
const CFG = window.APP_CONFIG || {};
const OK = /^https:\/\/\S+$/.test(String(CFG.SUPABASE_URL || '').trim()) && !/XXXX/.test(CFG.SUPABASE_URL || '') && String(CFG.SUPABASE_ANON_KEY || '').trim().length > 40 && !/ISI_ANON/.test(CFG.SUPABASE_ANON_KEY || '');
const sb = OK ? window.supabase.createClient(String(CFG.SUPABASE_URL).trim(), String(CFG.SUPABASE_ANON_KEY).trim()) : null;
const DOMAIN = String(CFG.PORTAL_EMAIL_DOMAIN || 'pelanggan.3wrt.app').trim();   // ID "mangipang" → mangipang@<domain>
const LOW = 20, POLL_MS = 45000;
const COPY = '© 2026 App By. Dodoy | Fix Project Development';

/* ───── helper ───── */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const fmt = v => num(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const norm = s => String(s || '').toLowerCase().replace(/[\s\-_.]/g, '');
const pad = n => String(n).padStart(2, '0');
const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const TODAY = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const tgl = s => { if (!s) return '-'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${+d} ${BL[+m - 1]} ${y}`; };
const hm = d => d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '-';
const PAL = ['#16a34a', '#2563eb', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#0891b2', '#4f46e5'];
const warna = k => PAL[[...String(k || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
const app = () => $('#pt-app');

const S = { uid: null, email: '', info: null, stok: [], masuk: [], catatan: [], tab: 'stok', rt: 'masuk', sel: null, qty: 1, at: null, saving: false };
let pollTimer = null;

function toast(t) { const e = $('#pt-toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 3200); }
function judul() { document.title = 'Portal Stok · ' + Brand.get('appName'); }
function theme() { const r = document.documentElement, n = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; r.setAttribute('data-theme', n); try { localStorage.setItem('m3wt-theme', n); } catch (e) { } }

async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args || {});
  if (error) { const e = new Error(/Failed to fetch|NetworkError/i.test(error.message || '') ? 'Koneksi gagal. Periksa internet Anda.' : (error.message || 'Terjadi kesalahan.')); e.code = error.code; throw e; }
  return data;
}

/* ───── identitas (sama dengan aplikasi admin) ───── */
async function loadBrand() {
  try {
    const { data } = await sb.from('app_config').select('key,value');
    if (data) { const m = {}; data.forEach(x => m[x.key] = x.value); Brand.set(m); }
  } catch (e) { }
  judul();
}

/* ───── login ───── */
function renderLogin(msg) {
  stopPoll(); S.uid = null;
  app().innerHTML = `<div class="pt-login"><img data-brand-logo class="pt-logo-lg" alt="Logo"><h1>Portal Stok Pelanggan</h1><p>Masuk untuk melihat dan mencatat stok Anda</p>
    ${msg ? `<div class="pt-err">${esc(msg)}</div>` : ''}
    <label>ID Pelanggan</label><input id="pt-id" class="pt-in" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="mis. mangipang">
    <label>Password</label><input id="pt-pw" type="password" class="pt-in" autocomplete="current-password" placeholder="••••••••">
    <button class="pt-btn" id="pt-go" onclick="doLogin()">Masuk</button>
    <p class="pt-small">Lupa password? Hubungi admin.</p><div class="pt-copy">${COPY}</div></div>`;
  ['#pt-id', '#pt-pw'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
  Brand.apply(); judul();
}
async function doLogin() {
  const id = $('#pt-id').value.trim().toLowerCase(), pw = $('#pt-pw').value;
  if (!id || !pw) return renderLoginKeep('ID dan password wajib diisi.');
  const btn = $('#pt-go'); btn.disabled = true; btn.textContent = 'Masuk...';
  const { error } = await sb.auth.signInWithPassword({ email: id.includes('@') ? id : `${id}@${DOMAIN}`, password: pw });
  if (error) { btn.disabled = false; btn.textContent = 'Masuk'; renderLoginKeep(/Invalid login/i.test(error.message) ? 'ID atau password salah.' : error.message); }
}
function renderLoginKeep(msg) { const id = ($('#pt-id') || {}).value || ''; renderLogin(msg); $('#pt-id').value = id; }
async function logout() { stopPoll(); await sb.auth.signOut(); }

/* ───── sesi ───── */
async function onSession(session) {
  if (!session) { renderLogin(); return; }
  if (S.uid === session.user.id) return;
  S.uid = session.user.id; S.email = session.user.email || '';
  app().innerHTML = '<div class="pt-boot"><div class="pt-spin"></div><p>Memuat stok Anda...</p></div>';
  try { S.info = await rpc('portal_info'); }
  catch (e) { return fatal(e); }
  await refresh(true);
  go('stok'); startPoll();
}
async function fatal(e) {
  if (/bukan akun pelanggan/i.test(e.message)) { await sb.auth.signOut(); S.uid = null; renderLogin('Akun ini bukan akun pelanggan. Admin silakan memakai halaman admin.'); return; }
  app().innerHTML = `<div class="pt-login"><h1>Tidak bisa membuka portal</h1><div class="pt-err">${esc(e.message)}</div><button class="pt-btn" onclick="location.reload()">Coba Lagi</button><button class="pt-btn red" onclick="logout()">Keluar</button><div class="pt-copy">${COPY}</div></div>`;
}

/* ───── data & penyegaran ───── */
async function refresh(silent) {
  try {
    const [info, stok, masuk, catatan] = await Promise.all([rpc('portal_info'), rpc('portal_stok'), rpc('portal_riwayat_masuk', { p_limit: 300 }), rpc('portal_riwayat_catatan', { p_limit: 300 })]);
    S.info = info; S.stok = stok || []; S.masuk = masuk || []; S.catatan = catatan || []; S.at = new Date();
    if (S.uid && $('#pt-head')) repaint();
  } catch (e) {
    if (/bukan akun pelanggan|belum diaktifkan/i.test(e.message)) return fatal(e);
    if (!silent) toast(e.message);
  }
}
async function manualRefresh() { toast('Memuat ulang...'); await refresh(false); toast('Data diperbarui ' + hm(S.at)); }
function startPoll() { stopPoll(); pollTimer = setInterval(() => { if (!document.hidden && S.uid) refresh(true); }, POLL_MS); }
function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.uid) refresh(true); });

/* ───── kerangka & navigasi ───── */
function go(t) { S.tab = t; renderShell(); window.scrollTo(0, 0); }
function nav() { return `<div class="pt-nav">${[['stok', '📦', 'Stok'], ['keluar', '➕', 'Catat Keluar'], ['riwayat', '🕘', 'Riwayat'], ['akun', '👤', 'Akun']].map(([k, i, l]) => `<button class="${S.tab === k ? 'on' : ''}" onclick="go('${k}')"><span>${i}</span>${l}</button>`).join('')}</div>`; }
function renderShell() {
  app().innerHTML = `<div id="pt-head"></div><div id="pt-body"></div>${nav()}`;
  paintHead();
  $('#pt-body').innerHTML = ({ stok: stokTab, keluar: keluarTab, riwayat: riwayatTab, akun: akunTab })[S.tab]();
  repaint(true);
}
function paintHead() {
  const i = S.info || {};
  $('#pt-head').innerHTML = `<div class="pt-hd"><div class="pt-hl"><img data-brand-logo class="pt-logo" alt="Logo"><div><small>Portal Stok Pelanggan</small><h1>${esc(i.pelanggan_nama || '')}</h1><small>Stok dihitung sejak ${tgl(i.stok_mulai)} · Dimuat ${hm(S.at)}</small></div></div><div class="pt-hb"><button class="pt-ic" onclick="manualRefresh()" title="Muat ulang">↻</button><button class="pt-ic" onclick="theme()" title="Mode gelap">◐</button></div></div>`;
  Brand.apply(); judul();
}
function repaint(skipHead) {
  if (!skipHead) paintHead();
  if (S.tab === 'stok') paintStok(); else if (S.tab === 'keluar') paintSel(); else if (S.tab === 'riwayat') paintRiwayat();
}

/* ───── tab Stok ───── */
function stokTab() { return `<div class="pt-chips" id="pt-chips"></div><div class="pt-pad0"><input id="pt-q" class="pt-in" placeholder="🔍 Cari kode atau nama barang" oninput="paintStok()"></div><div id="pt-list"></div>`; }
const thumb = r => r.foto_url ? `<img class="pt-ph" src="${esc(r.foto_url)}" alt="" loading="lazy">` : `<div class="pt-ph" style="background:${warna(r.kode)}">${esc(String(r.kode || r.nama || '?').slice(0, 2).toUpperCase())}</div>`;
function kartu(r) {
  const s = num(r.sisa), b = s < 0 ? 'min' : s < LOW ? 'low' : 'ok';
  return `<div class="pt-item">${thumb(r)}<div class="pt-im">${r.kode ? `<span class="pt-code">${esc(r.kode)}</span>` : ''}<div class="pt-nm">${esc(r.nama)}</div>
    <div class="pt-nums"><div><small>Dikirim</small><b>${fmt(r.dikirim)}</b></div><div><small>Keluar</small><b>${fmt(r.keluar)}</b></div><div class="s ${b}"><small>Sisa ${esc(r.satuan || '')}</small><b>${fmt(s)}</b></div></div>
    ${num(r.koreksi) ? `<div class="pt-note m">Termasuk stok awal/koreksi admin: ${num(r.koreksi) > 0 ? '+' : ''}${fmt(r.koreksi)}</div>` : ''}
    ${b === 'min' ? '<div class="pt-note r">⚠ Stok minus – cek pencatatan</div>' : b === 'low' ? '<div class="pt-note o">Stok menipis</div>' : ''}</div></div>`;
}
function paintStok() {
  const c = $('#pt-chips'), l = $('#pt-list'); if (!c || !l) return;
  const rows = S.stok, w = rows.filter(r => num(r.sisa) < LOW).length, u = rows.reduce((a, r) => a + Math.max(num(r.sisa), 0), 0), n = norm(($('#pt-q') || {}).value);
  c.innerHTML = `<div class="pt-chip"><b>${rows.length}</b><small>Jenis Barang</small></div><div class="pt-chip"><b>${fmt(u)}</b><small>Unit Sisa</small></div><div class="pt-chip ${w ? 'w' : ''}"><b>${w}</b><small>Perlu Perhatian</small></div>`;
  const f = rows.filter(r => !n || norm(r.kode).includes(n) || norm(r.nama).includes(n));
  l.innerHTML = f.map(kartu).join('') || `<div class="pt-empty">${rows.length ? 'Barang tidak ditemukan.' : 'Belum ada stok tercatat. Stok muncul otomatis setelah ada pengiriman dari produsen sejak ' + tgl((S.info || {}).stok_mulai) + '.'}</div>`;
}

/* ───── tab Catat Keluar ───── */
function keluarTab() {
  const i = S.info || {};
  return `<div class="pt-pad"><h2>Catat Keluar</h2><label style="margin-top:0">Barang</label><input id="pt-pk" class="pt-in" placeholder="Ketik kode, mis. STS1 atau STS 1" oninput="pick()" autocomplete="off"><div id="pt-pres"></div><div id="pt-sel"></div>
    <label>Jumlah</label><div class="pt-step"><button onclick="step(-1)">−</button><input id="pt-qty" class="pt-in" type="number" inputmode="decimal" min="1" step="any" value="${S.qty}" oninput="S.qty=+this.value||0;paintSel()"><button onclick="step(1)">+</button></div><div id="pt-warn"></div>
    <label>Tanggal</label><input id="pt-dt" class="pt-in" type="date" min="${esc(i.stok_mulai || '')}" max="${TODAY()}" value="${TODAY()}">
    <label>Catatan</label><input id="pt-nt" class="pt-in" placeholder="Opsional, mis. terjual ke toko ..." maxlength="200">
    <button class="pt-btn" id="pt-save" onclick="simpan()">Simpan</button></div>`;
}
const pilih = () => S.stok.find(r => r.barang_id === S.sel);
function pick() {
  const n = norm(($('#pt-pk') || {}).value), box = $('#pt-pres'); if (!box) return;
  box.innerHTML = n ? (S.stok.filter(r => norm(r.kode).includes(n) || norm(r.nama).includes(n)).slice(0, 6).map(r => `<div class="pt-sr" onclick="choose('${r.barang_id}')">${thumb(r)}<div><b>${esc(r.kode || '')}</b> · ${esc(r.nama)}<br><small>Sisa ${fmt(r.sisa)} ${esc(r.satuan || '')}</small></div></div>`).join('') || '<div class="pt-empty">Tidak ditemukan di stok Anda.</div>') : '';
}
function choose(id) { S.sel = id; $('#pt-pk').value = ''; $('#pt-pres').innerHTML = ''; paintSel(); }
function step(d) { S.qty = Math.max(1, (+$('#pt-qty').value || 0) + d); $('#pt-qty').value = S.qty; paintSel(); }
function paintSel() {
  const box = $('#pt-sel'), w = $('#pt-warn'); if (!box || !w) return;
  const r = pilih();
  box.innerHTML = r ? `<div class="pt-sel"><b>${esc(r.kode || '')}</b> · ${esc(r.nama)}<br><small>Sisa saat ini: <b>${fmt(r.sisa)}</b> ${esc(r.satuan || '')}</small></div>` : '';
  w.innerHTML = r && S.qty > num(r.sisa) ? `<div class="pt-warn">⚠ Jumlah melebihi sisa stok (${fmt(r.sisa)}). Tetap bisa disimpan, tetapi mohon cek kembali.</div>` : '';
}
async function simpan() {
  if (S.saving) return;
  const r = pilih(), tg = $('#pt-dt').value;
  if (!r || !(S.qty > 0)) return toast('Pilih barang dan isi jumlah dulu.');
  if (!tg) return toast('Tanggal wajib diisi.');
  S.saving = true; const btn = $('#pt-save'); btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    const d = await rpc('portal_catat_keluar', { p_tanggal: tg, p_barang_id: r.barang_id, p_jumlah: S.qty, p_catatan: $('#pt-nt').value.trim() || null });
    toast(`Tersimpan. Sisa ${r.kode || r.nama} sekarang ${fmt(d.sisa)}.${d.minus ? ' ⚠ Stok minus, mohon cek pencatatan.' : ''}`);
    S.sel = null; S.qty = 1; await refresh(true); S.saving = false; go('keluar');
  } catch (e) { S.saving = false; btn.disabled = false; btn.textContent = 'Simpan'; toast(e.message); }
}

/* ───── tab Riwayat ───── */
function riwayatTab() { return `<div class="pt-pad"><h2>Riwayat</h2><div class="pt-seg"><button id="pt-sm" onclick="setRt('masuk')">Barang Masuk</button><button id="pt-sk" onclick="setRt('catatan')">Catatan Keluar Saya</button></div><div id="pt-rw"></div></div>`; }
function setRt(t) { S.rt = t; paintRiwayat(); }
function paintRiwayat() {
  const box = $('#pt-rw'); if (!box) return;
  $('#pt-sm').className = S.rt === 'masuk' ? 'on' : ''; $('#pt-sk').className = S.rt === 'catatan' ? 'on' : '';
  if (S.rt === 'masuk') {
    let last = '', h = '<small style="color:var(--text-secondary)">Kiriman dari produsen (hanya lihat)</small>';
    S.masuk.forEach(r => { if (r.tanggal !== last) { last = r.tanggal; h += `<div class="pt-dt">${tgl(r.tanggal)}</div>`; } h += `<div class="pt-row"><div><b>${esc(r.kode || '')}</b><small>${esc(r.nama)}</small></div><div class="q in">+${fmt(r.jumlah)}</div></div>`; });
    box.innerHTML = S.masuk.length ? h : '<div class="pt-empty">Belum ada pengiriman sejak tanggal mulai.</div>';
  } else {
    box.innerHTML = S.catatan.map(c => {
      const kor = c.jenis === 'koreksi', pos = num(c.jumlah) > 0;
      return `<div class="pt-row"><div><b>${esc(c.kode || '')}</b> · ${tgl(c.tanggal)}<small>${esc(c.nama)}</small><small>${kor ? 'Koreksi admin' : 'Dicatat ' + esc(c.dicatat_oleh || '-')}${c.catatan ? ' · ' + esc(c.catatan) : ''}</small>${c.bisa_hapus ? `<button class="pt-del" onclick="hapus('${c.id}')">Hapus (hari ini)</button>` : `<span class="pt-lock">🔒 Hanya admin yang bisa mengubah</span>`}</div><div class="q ${kor ? (pos ? 'in' : 'out') : 'out'}">${kor ? (pos ? '+' : '−') : '−'}${fmt(Math.abs(num(c.jumlah)))}</div></div>`;
    }).join('') || '<div class="pt-empty">Belum ada catatan keluar.</div>';
  }
}
async function hapus(id) {
  if (!confirm('Hapus catatan keluar ini? Stok akan dikembalikan.')) return;
  try { const d = await rpc('portal_hapus_keluar', { p_id: id }); toast(`Dihapus. Sisa sekarang ${fmt(d.sisa)}.`); await refresh(true); }
  catch (e) { toast(e.message); }
}

/* ───── tab Akun ───── */
function akunTab() {
  const i = S.info || {};
  return `<div class="pt-pad"><h2>Akun</h2><div class="pt-card"><p><span>Pelanggan</span><b>${esc(i.pelanggan_nama || '')}</b></p><p><span>ID pengguna</span><b>${esc((S.email || '').split('@')[0])}</b></p><p><span>Nama akun</span><b>${esc(i.user_nama || '-')}</b></p><p style="margin:0"><span>Stok dihitung sejak</span><b>${tgl(i.stok_mulai)}</b></p></div>
    <button class="pt-btn alt" onclick="theme()">Ganti Mode Terang / Gelap</button><button class="pt-btn red" onclick="logout()">Keluar</button><div class="pt-copy">${COPY}</div></div>`;
}

/* ───── mulai ───── */
async function init() {
  if (!OK) { app().innerHTML = '<div class="pt-login"><h1>Konfigurasi belum benar</h1><div class="pt-err">Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js, lalu muat ulang.</div></div>'; return; }
  await loadBrand();
  sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => onSession(session), 0); });
  const { data } = await sb.auth.getSession();
  if (!data.session) onSession(null);
}
document.addEventListener('DOMContentLoaded', init);
