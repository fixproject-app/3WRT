'use strict';
/* ============================================================
   MARKET 3-WT — app.js (Supabase)
   Isi 2 nilai di bawah dari: Supabase → Project Settings → API
   ============================================================ */
const SUPABASE_URL = 'https://fcozeothaqyyjfqehbde.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fthC_Hu8dZIw7ezBUS52aw_LxuTG8Vp';';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ───────────────────────── STATE ───────────────────────── */
const AppState = { user: null, profile: null, role: null, config: {}, masterBarang: [], masterPelanggan: [], masterSumber: [], masterBiaya: [], currentPage: 'dashboard' };
let chartInstances = {};
let bootedUserId = null;
let dashboardFilter = { from: null, to: null };
let dashData = { keluar: [], masuk: [], from: '', to: '' };
let riwayatMap = {};
let kasirEditId = null;
let masukEditId = null;

const MENU = {
  admin: [
    { id: 'dashboard',    icon: 'bi-speedometer2',      label: 'Dashboard' },
    { id: 'kasir',        icon: 'bi-cart-check',        label: 'Barang Keluar (Kasir)' },
    { id: 'barangMasuk',  icon: 'bi-box-arrow-in-down', label: 'Barang Masuk' },
    { id: 'stok',         icon: 'bi-boxes',             label: 'Stok & Master Barang' },
    { id: 'riwayat',      icon: 'bi-clock-history',     label: 'Riwayat Transaksi' },
    { id: 'pelanggan',    icon: 'bi-people',            label: 'Pelanggan' },
    { id: 'masterBiaya',  icon: 'bi-tags',              label: 'Master Biaya' },
    { id: 'inputBiaya',   icon: 'bi-wallet2',           label: 'Input Biaya Operasional' },
    { id: 'laporanBiaya', icon: 'bi-bar-chart-line',    label: 'Laporan Biaya Bulanan' },
    { id: 'invoice',      icon: 'bi-file-earmark-pdf',  label: 'Invoice' },
    { id: 'pengaturan',   icon: 'bi-gear',              label: 'Pengaturan' }
  ],
  owner: [
    { id: 'dashboard', icon: 'bi-speedometer2', label: 'Dashboard' }
  ]
};

/* ───────────────────────── HELPER ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const fmtNum = v => num(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const fmtRupiah = v => 'Rp ' + num(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const pad = n => String(n).padStart(2, '0');
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const dateToStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dateToStr(new Date());
const firstOfMonthStr = () => { const d = new Date(); return dateToStr(new Date(d.getFullYear(), d.getMonth(), 1)); };
const parseDate = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const tglPanjang = s => { const d = parseDate(s); return `${HARI_ID[d.getDay()]}, ${pad(d.getDate())} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`; };
const tglSingkat = s => { const d = parseDate(s); return `${d.getDate()} ${BULAN_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const tglKode = s => { const d = parseDate(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };
const getModal = id => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));
const spinnerBlock = () => '<div class="page-loading"><div class="spinner-border text-success"></div></div>';
const errBox = (msg, retry) => `<div class="section-card text-center"><i class="bi bi-exclamation-triangle text-danger fs-2"></i><p class="mt-2 mb-2">${esc(msg)}</p>${retry ? `<button class="btn btn-outline-accent btn-sm" onclick="${retry}">Coba Lagi</button>` : ''}</div>`;
const badgeStatus = s => `<span class="badge-status ${s === 'Aktif' ? 'badge-ok' : 'badge-off'}">${esc(s)}</span>`;

function showToast(title, msg, type = 'success') {
  const el = $('#appToast');
  $('#toastTitle').textContent = title;
  $('#toastBody').textContent = msg;
  el.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning');
  if (type === 'success') el.classList.add('text-bg-success');
  if (type === 'danger') el.classList.add('text-bg-danger');
  if (type === 'warning') el.classList.add('text-bg-warning');
  bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 }).show();
}

function friendlyError(err) {
  const code = err && err.code, msg = (err && err.message) || '';
  if (code === '23503') return 'Data ini masih dipakai di transaksi lain, sehingga tidak bisa dihapus. Ubah statusnya menjadi Nonaktif.';
  if (code === '23505') return 'Data dengan nilai yang sama (nama/kode) sudah ada.';
  if (code === '23514') return 'Ada nilai yang tidak valid (tidak boleh negatif atau nol).';
  if (code === '42501' || /row-level security/i.test(msg)) return 'Anda tidak memiliki izin untuk aksi ini.';
  if (/JWT|expired/i.test(msg)) return 'Sesi berakhir. Silakan login ulang.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Koneksi gagal. Periksa internet Anda.';
  if (code === 'P0001') return msg;
  return msg || 'Terjadi kesalahan tak terduga.';
}

let busyCount = 0;
function setBusy(on) { busyCount += on ? 1 : -1; if (busyCount < 0) busyCount = 0; $('#topProgress').classList.toggle('active', busyCount > 0); }

/* Semua pemanggilan Supabase lewat sini: loading bar + error ramah */
async function callSb(promise, successMsg, opts = {}) {
  setBusy(true);
  try {
    const { data, error } = await promise;
    if (error) throw error;
    if (successMsg) showToast('Berhasil', successMsg, 'success');
    return { success: true, data };
  } catch (err) {
    const message = friendlyError(err);
    if (!opts.silent) showToast('Gagal', message, 'danger');
    return { success: false, data: null, message };
  } finally { setBusy(false); }
}

function setBtnBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-inline"></span> ' + (label || 'Memproses...'); }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

function confirmDelete(fn, text) {
  $('#deleteModalText').textContent = text || 'Apakah Anda yakin ingin menghapus data ini? Tindakan ini tidak dapat dibatalkan.';
  const btn = $('#confirmDeleteBtn');
  btn.onclick = async () => { btn.disabled = true; await fn(); btn.disabled = false; getModal('deleteModal').hide(); };
  getModal('deleteModal').show();
}
function showForm(title, html) { $('#formModalTitle').textContent = title; $('#formModalBody').innerHTML = html; getModal('formModal').show(); }
function hideForm() { getModal('formModal').hide(); }
function showDetail(title, html) { $('#detailModalTitle').textContent = title; $('#detailModalBody').innerHTML = html; getModal('detailModal').show(); }
function destroyCharts() { Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch (e) { } }); chartInstances = {}; }

/* ───────────────────────── TEMA & SIDEBAR ───────────────────────── */
function toggleDarkMode() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('m3wt-theme', next); } catch (e) { }
  if (AppState.currentPage === 'dashboard' && AppState.role) { renderTop10Chart(); renderCompare(); }
}
function toggleSidebar() { $('#sidebar').classList.toggle('show'); document.querySelector('.sidebar-overlay').classList.toggle('show'); }
function closeSidebar() { $('#sidebar').classList.remove('show'); document.querySelector('.sidebar-overlay').classList.remove('show'); }

/* ───────────────────────── CONFIG ───────────────────────── */
async function loadConfig() {
  const r = await callSb(sb.from('app_config').select('key,value'), null, { silent: true });
  if (r.success) { AppState.config = {}; r.data.forEach(x => AppState.config[x.key] = x.value); }
  applyConfig();
}
function applyConfig() {
  const c = AppState.config;
  const name = c.appName || 'MARKET 3-WT';
  document.title = name;
  $('#appTitle').textContent = name;
  $('#loginTitle').textContent = name;
  const PH = 'https://placehold.co/80x80/16a34a/ffffff?text=3WT';
  ['#appLogo', '#loginLogo'].forEach(sel => {
    const img = $(sel);
    img.onerror = () => { img.onerror = null; img.src = PH; };   // URL rusak → tampil placeholder, bukan ikon rusak
    img.src = c.logoUrl || PH;
  });
}

/* ───────────────────────── AUTH ───────────────────────── */
function showLogin(msg) {
  $('#loadingOverlay').style.display = 'none';
  $('#sidebar').style.display = 'none';
  $('#mainContent').style.display = 'none';
  $('#loginView').style.display = 'flex';
  const e = $('#loginError');
  if (msg) { e.textContent = msg; e.style.display = 'block'; } else e.style.display = 'none';
}

async function doLogin() {
  const email = $('#loginEmail').value.trim(), password = $('#loginPassword').value;
  if (!email || !password) return showLogin('Email dan password wajib diisi.');
  const btn = $('#loginBtn'); setBtnBusy(btn, true, 'Masuk...');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  setBtnBusy(btn, false);
  if (error) showLogin(/Invalid login/i.test(error.message) ? 'Email atau password salah.' : friendlyError(error));
}

async function logout() { bootedUserId = null; await sb.auth.signOut(); }

async function handleSession(session) {
  if (!session) { bootedUserId = null; AppState.user = null; AppState.role = null; showLogin(); return; }
  if (bootedUserId === session.user.id) return;
  bootedUserId = session.user.id;
  await bootApp(session.user);
}

async function bootApp(user) {
  const p = await callSb(sb.from('profiles').select('*').eq('id', user.id).maybeSingle(), null, { silent: true });
  if (!p.success || !p.data) { bootedUserId = null; await sb.auth.signOut(); return showLogin('Profil pengguna tidak ditemukan. Hubungi admin.'); }
  AppState.user = user; AppState.profile = p.data; AppState.role = p.data.role;
  await loadConfig();
  await loadMasterCaches();
  $('#userEmailLabel').textContent = user.email;
  $('#userRoleLabel').textContent = AppState.role;
  renderSidebarNav();
  $('#loginView').style.display = 'none';
  $('#loadingOverlay').style.display = 'none';
  $('#sidebar').style.display = 'flex';
  $('#mainContent').style.display = 'block';
  navigateTo('dashboard');
}

async function loadMasterCaches() {
  const admin = AppState.role === 'admin';
  const reqs = [
    callSb(sb.from('master_barang').select('*').order('nama'), null, { silent: true }),
    callSb(sb.from('master_pelanggan').select('*').order('nama'), null, { silent: true }),
    callSb(sb.from('master_sumber').select('*').order('nama'), null, { silent: true })
  ];
  if (admin) reqs.push(callSb(sb.from('master_biaya').select('*').order('keterangan'), null, { silent: true }));
  const [b, p, s, bi] = await Promise.all(reqs);
  if (b.success) AppState.masterBarang = b.data;
  if (p.success) AppState.masterPelanggan = p.data;
  if (s.success) AppState.masterSumber = s.data;
  if (bi && bi.success) AppState.masterBiaya = bi.data;
}

function renderSidebarNav() {
  $('#sidebarNav').innerHTML = (MENU[AppState.role] || []).map(m =>
    `<li><a class="nav-link" data-page="${m.id}" onclick="navigateTo('${m.id}')"><i class="bi ${m.icon}"></i> <span>${m.label}</span></a></li>`).join('');
}

const PAGES = {};
function navigateTo(page, arg) {
  const menu = MENU[AppState.role] || [];
  if (!menu.some(m => m.id === page)) page = 'dashboard';
  AppState.currentPage = page;
  document.querySelectorAll('#sidebarNav .nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const m = menu.find(x => x.id === page);
  $('#pageTitle').textContent = m ? m.label : '';
  destroyCharts(); closeSidebar(); window.scrollTo(0, 0);
  PAGES[page](arg);
}

/* ───────────────────────── DASHBOARD ───────────────────────── */
PAGES.dashboard = function () {
  $('#app-container').innerHTML = `
    <div class="section-card mb-3"><div class="row g-2 align-items-end">
      <div class="col-6 col-md-3"><label class="form-label">Dari</label><input type="date" id="dbFrom" class="form-control" value="${dashboardFilter.from || firstOfMonthStr()}"></div>
      <div class="col-6 col-md-3"><label class="form-label">Sampai</label><input type="date" id="dbTo" class="form-control" value="${dashboardFilter.to || todayStr()}"></div>
      <div class="col-12 col-md-auto"><button class="btn btn-accent" onclick="applyDashboardFilter()"><i class="bi bi-funnel"></i> Terapkan</button></div>
    </div></div>
    <div id="dashboardBody"></div>`;
  loadDashboard();
};
function applyDashboardFilter() {
  const f = $('#dbFrom').value, t = $('#dbTo').value;
  if (!f || !t || f > t) return showToast('Validasi', 'Rentang tanggal tidak valid.', 'warning');
  dashboardFilter = { from: f, to: t }; loadDashboard();
}

let top10Data = [];
async function loadDashboard() {
  const body = $('#dashboardBody'); body.innerHTML = spinnerBlock();
  const from = dashboardFilter.from || firstOfMonthStr(), to = dashboardFilter.to || todayStr();
  const now = new Date(), om = now.getMonth() + 1, oy = now.getFullYear();
  const opexFrom = `${oy}-${pad(om)}-01`, opexTo = dateToStr(new Date(oy, om, 0));
  const [kel, mas, hari, opx] = await Promise.all([
    callSb(sb.from('barang_keluar').select('id,tanggal,pelanggan_id,pelanggan_nama,total,total_margin,barang_keluar_item(nama_barang,satuan,jumlah,subtotal)').gte('tanggal', from).lte('tanggal', to), null, { silent: true }),
    callSb(sb.from('barang_masuk').select('id,tanggal,sumber_id,sumber_nama,barang_masuk_item(nama_barang,satuan,jumlah)').gte('tanggal', from).lte('tanggal', to), null, { silent: true }),
    callSb(sb.from('barang_keluar').select('id,pelanggan_nama,total,barang_keluar_item(nama_barang,satuan,jumlah)').eq('tanggal', todayStr()), null, { silent: true }),
    callSb(sb.from('biaya_operasional').select('total').gte('tanggal', opexFrom).lte('tanggal', opexTo), null, { silent: true })
  ]);
  if (![kel, mas, hari, opx].every(r => r.success)) { body.innerHTML = errBox('Gagal memuat data dashboard.', 'loadDashboard()'); return; }
  dashData = { keluar: kel.data, masuk: mas.data, from, to };

  const omset = kel.data.reduce((s, k) => s + num(k.total), 0);
  const margin = kel.data.reduce((s, k) => s + num(k.total_margin), 0);
  const opex = opx.data.reduce((s, r) => s + num(r.total), 0);
  const qtyMasuk = mas.data.reduce((s, m) => s + (m.barang_masuk_item || []).reduce((a, i) => a + num(i.jumlah), 0), 0);
  const stokAda = AppState.masterBarang.filter(b => num(b.stok) > 0);
  const omsetHariIni = hari.data.reduce((s, k) => s + num(k.total), 0);

  const perPel = AppState.masterPelanggan.filter(p => p.status === 'Aktif').map(p => ({ id: p.id, nama: p.nama, omset: kel.data.filter(k => k.pelanggan_id === p.id).reduce((s, k) => s + num(k.total), 0) })).sort((a, b) => b.omset - a.omset);
  const perSum = AppState.masterSumber.filter(s => s.status === 'Aktif').map(s => ({ id: s.id, nama: s.nama, qty: mas.data.filter(m => m.sumber_id === s.id).reduce((a, m) => a + (m.barang_masuk_item || []).reduce((x, i) => x + num(i.jumlah), 0), 0) }));

  const agg = {};
  kel.data.forEach(k => (k.barang_keluar_item || []).forEach(i => { agg[i.nama_barang] = agg[i.nama_barang] || { nama: i.nama_barang, qty: 0, nilai: 0 }; agg[i.nama_barang].qty += num(i.jumlah); agg[i.nama_barang].nilai += num(i.subtotal); }));
  top10Data = Object.values(agg).sort((a, b) => b.qty - a.qty).slice(0, 10);

  const hariGroup = {};
  hari.data.forEach(k => { const key = k.pelanggan_nama || '-'; hariGroup[key] = hariGroup[key] || []; (k.barang_keluar_item || []).forEach(i => hariGroup[key].push(i)); });

  const insights = buildInsights({ omset, margin, opex, perPel, kel: kel.data, stokAda });
  const kpi = (cls, icon, label, value, btn) => `<div class="col-6 col-lg-4 col-xl-2"><div class="kpi-card ${cls}"><i class="bi ${icon} kpi-icon"></i><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>${btn || ''}</div></div>`;

  body.innerHTML = `
    <div class="row g-3 mb-3">
      ${kpi('kpi-purple', 'bi-cash-stack', 'Omset Periode', fmtRupiah(omset))}
      ${kpi('kpi-green', 'bi-graph-up-arrow', 'Margin Periode', fmtRupiah(margin))}
      ${kpi('kpi-orange', 'bi-wallet2', 'Biaya Operasional Bulan Ini', fmtRupiah(opex))}
      ${kpi('kpi-blue', 'bi-box-arrow-in-down', 'Barang Masuk (Qty)', fmtNum(qtyMasuk))}
      ${kpi('kpi-teal', 'bi-boxes', 'Jenis Barang Berstok', fmtNum(stokAda.length), '<button class="kpi-btn" onclick="showDetailStok()">Detail</button>')}
      ${kpi('kpi-pink', 'bi-calendar-check', 'Omset Hari Ini', fmtRupiah(omsetHariIni))}
    </div>

    <div class="section-card mb-3"><h6><span><i class="bi bi-lightbulb text-warning"></i> Insight Otomatis</span></h6>
      <ul class="insight-list">${insights.map(i => `<li class="${i.warn ? 'warn' : ''}"><i class="bi ${i.warn ? 'bi-exclamation-triangle' : 'bi-check2-circle'}"></i><span>${i.text}</span></li>`).join('')}</ul>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-7"><div class="section-card chart-card"><h6>Top 10 Barang Terlaris (Qty)</h6><div style="position:relative;height:320px;"><canvas id="top10Chart"></canvas></div></div></div>
      <div class="col-lg-5"><div class="section-card"><h6>Transaksi Hari Ini</h6>
        ${Object.keys(hariGroup).length ? Object.entries(hariGroup).map(([n, items]) => `<div class="today-trx-card"><div class="tc-head"><span>${esc(n)}</span></div><ul>${items.map(i => `<li>${esc(i.nama_barang)} — ${fmtNum(i.jumlah)} ${esc(i.satuan || '')}</li>`).join('')}</ul></div>`).join('') : '<p class="text-secondary small mb-0">Belum ada transaksi hari ini.</p>'}
      </div></div>
    </div>

    ${compareCardHtml()}

    <div class="row g-3">
      <div class="col-lg-6"><div class="section-card"><h6>Omset per Pelanggan</h6>
        ${perPel.length ? perPel.map(p => `<div class="mini-card"><div><div class="mc-name">${esc(p.nama)}</div><div class="mc-value">${fmtRupiah(p.omset)}</div></div><button class="mc-btn" onclick="showDetailPelanggan('${p.id}')">Detail</button></div>`).join('') : '<p class="text-secondary small mb-0">Belum ada pelanggan aktif.</p>'}
      </div></div>
      <div class="col-lg-6"><div class="section-card"><h6>Barang Masuk per Sumber</h6>
        ${perSum.length ? perSum.map(s => `<div class="mini-card"><div><div class="mc-name">${esc(s.nama)}</div><div class="mc-value">${fmtNum(s.qty)} unit</div></div><button class="mc-btn" onclick="showDetailSumber('${s.id}')">Detail</button></div>`).join('') : '<p class="text-secondary small mb-0">Belum ada sumber aktif.</p>'}
      </div></div>
    </div>`;
  renderTop10Chart();
  loadCompareChart();
}

/* ── Perbandingan barang keluar per item: bulan lalu vs bulan ini ── */
let compareData = null;
let compareOpt = { metrik: 'qty', mode: 'penuh', top: 10, pelanggan: '', kategori: '' };
const katKey = b => (String((b && b.kategori) || '').trim().toUpperCase()) || '(TANPA KATEGORI)';
function kategoriList() {
  const m = new Map();
  AppState.masterBarang.forEach(b => { const k = katKey(b); if (!m.has(k)) m.set(k, k === '(TANPA KATEGORI)' ? '(Tanpa kategori)' : String(b.kategori).trim()); });
  return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
}
const optSel = (v, cur) => String(v) === String(cur) ? 'selected' : '';
function compareCardHtml() {
  return `<div class="section-card mb-3"><h6><span><i class="bi bi-bar-chart-steps text-success"></i> Perbandingan Barang Keluar per Item: Bulan Lalu vs Bulan Ini</span></h6>
    <div class="row g-2 mb-3">
      <div class="col-6 col-md-4 col-lg"><label class="form-label small mb-1">Ukuran</label><select id="cmpMetrik" class="form-select form-select-sm" onchange="onCompareOpt()"><option value="qty" ${optSel('qty', compareOpt.metrik)}>Qty (unit)</option><option value="nilai" ${optSel('nilai', compareOpt.metrik)}>Omset (Rp)</option></select></div>
      <div class="col-6 col-md-4 col-lg"><label class="form-label small mb-1">Pembanding</label><select id="cmpMode" class="form-select form-select-sm" onchange="onCompareOpt()"><option value="penuh" ${optSel('penuh', compareOpt.mode)}>Bulan lalu penuh</option><option value="sama" ${optSel('sama', compareOpt.mode)}>Bulan lalu s/d tgl sama</option></select></div>
      <div class="col-6 col-md-4 col-lg"><label class="form-label small mb-1">Pelanggan</label><select id="cmpPel" class="form-select form-select-sm" onchange="onCompareOpt()"><option value="">Semua pelanggan</option>${AppState.masterPelanggan.map(p => `<option value="${p.id}" ${optSel(p.id, compareOpt.pelanggan)}>${esc(p.nama)}</option>`).join('')}</select></div>
      <div class="col-6 col-md-4 col-lg"><label class="form-label small mb-1">Jenis Barang</label><select id="cmpKat" class="form-select form-select-sm" onchange="onCompareOpt()"><option value="">Semua jenis</option>${kategoriList().map(([k, l]) => `<option value="${esc(k)}" ${optSel(k, compareOpt.kategori)}>${esc(l)}</option>`).join('')}</select></div>
      <div class="col-6 col-md-4 col-lg"><label class="form-label small mb-1">Tampilkan</label><select id="cmpTop" class="form-select form-select-sm" onchange="onCompareOpt()"><option value="10" ${optSel(10, compareOpt.top)}>Top 10 item</option><option value="20" ${optSel(20, compareOpt.top)}>Top 20 item</option><option value="999" ${optSel(999, compareOpt.top)}>Semua item</option></select></div>
    </div>
    <div id="compareBody">${spinnerBlock()}</div></div>`;
}
async function loadCompareChart() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const thisStart = dateToStr(new Date(y, m, 1)), thisEnd = dateToStr(new Date(y, m + 1, 0));
  const lastStart = dateToStr(new Date(y, m - 1, 1)), lastEnd = dateToStr(new Date(y, m, 0));
  const rows = await fetchAllPages(() => sb.from('barang_keluar').select('tanggal,pelanggan_id,barang_keluar_item(barang_id,nama_barang,satuan,jumlah,subtotal)').gte('tanggal', lastStart).lte('tanggal', thisEnd).order('tanggal').order('id'));
  const box = $('#compareBody'); if (!box) return;   // pengguna sudah pindah halaman
  if (!rows) { box.innerHTML = errBox('Gagal memuat data perbandingan.', 'loadCompareChart()'); return; }
  compareData = { rows, thisStart, lastStart, lastEnd, today: now.getDate(), lastLabel: `${BULAN_ID[(m + 11) % 12]} ${m === 0 ? y - 1 : y}`, thisLabel: `${BULAN_ID[m]} ${y}` };
  renderCompare();
}
function onCompareOpt() {
  compareOpt = { metrik: $('#cmpMetrik').value, mode: $('#cmpMode').value, top: num($('#cmpTop').value), pelanggan: $('#cmpPel').value, kategori: $('#cmpKat').value };
  renderCompare();
}
function renderCompare() {
  const box = $('#compareBody'); if (!box || !compareData) return;
  const d = compareData, qty = compareOpt.metrik === 'qty', field = qty ? 'jumlah' : 'subtotal', sama = compareOpt.mode === 'sama';
  const fmtV = v => qty ? fmtNum(v) : fmtRupiah(v);
  const cutDay = Math.min(d.today, num(d.lastEnd.slice(8, 10)));
  const lastCut = sama ? d.lastStart.slice(0, 8) + pad(cutDay) : d.lastEnd;
  const agg = {}, bMap = new Map(AppState.masterBarang.map(b => [b.id, b]));
  d.rows.forEach(r => {
    if (compareOpt.pelanggan && r.pelanggan_id !== compareOpt.pelanggan) return;
    const ini = r.tanggal >= d.thisStart;
    if (!ini && r.tanggal > lastCut) return;
    (r.barang_keluar_item || []).forEach(i => {
      if (compareOpt.kategori && katKey(bMap.get(i.barang_id)) !== compareOpt.kategori) return;
      const e = agg[i.nama_barang] = agg[i.nama_barang] || { nama: i.nama_barang, lalu: 0, ini: 0 }; e[ini ? 'ini' : 'lalu'] += num(i[field]); });
  });
  const list = Object.values(agg).sort((a, b) => (b.lalu + b.ini) - (a.lalu + a.ini));
  if (!list.length) { box.innerHTML = '<p class="text-secondary small mb-0">Tidak ada barang keluar untuk filter ini pada bulan lalu maupun bulan ini.</p>'; return; }
  const pelNama = compareOpt.pelanggan ? (AppState.masterPelanggan.find(p => p.id === compareOpt.pelanggan) || {}).nama : '';
  const katLabel = compareOpt.kategori ? (kategoriList().find(([k]) => k === compareOpt.kategori) || [])[1] : '';
  const filterInfo = [pelNama && 'Pelanggan: ' + pelNama, katLabel && 'Jenis: ' + katLabel].filter(Boolean).join('  ·  ');
  const totLalu = list.reduce((s, e) => s + e.lalu, 0), totIni = list.reduce((s, e) => s + e.ini, 0);
  const pct = (a, b) => a > 0 ? ((b - a) / a * 100) : null;
  const pTot = pct(totLalu, totIni), up = totIni >= totLalu;
  const shown = list.slice(0, compareOpt.top);
  const h = Math.max(260, shown.length * 40 + 70);
  const lblLalu = d.lastLabel + (sama ? ` (s/d tgl ${cutDay})` : ''), lblIni = d.thisLabel + ' (s/d hari ini)';
  box.innerHTML = `
    <div class="row g-2 mb-3">
      <div class="col-md-4"><div class="mini-card mb-0"><div><div class="mc-name">${esc(lblLalu)}</div><div class="mc-value" style="color:#64748b">${fmtV(totLalu)}</div></div></div></div>
      <div class="col-md-4"><div class="mini-card mb-0"><div><div class="mc-name">${esc(lblIni)}</div><div class="mc-value">${fmtV(totIni)}</div></div></div></div>
      <div class="col-md-4"><div class="mini-card mb-0"><div><div class="mc-name">Perubahan total</div><div class="mc-value ${up ? 'text-success' : 'text-danger'}">${up ? '▲' : '▼'} ${pTot === null ? (totIni > 0 ? 'Baru' : '-') : Math.abs(pTot).toFixed(0) + '%'}</div></div></div></div>
    </div>
    ${filterInfo ? `<p class="small fw-bold text-success mb-2"><i class="bi bi-funnel-fill"></i> ${esc(filterInfo)}</p>` : ''}
    <div style="position:relative;height:${h}px;"><canvas id="compareChart"></canvas></div>
    <div class="table-responsive mt-3" style="max-height:300px;overflow:auto;"><table class="table"><thead><tr><th>Item</th><th class="text-end">Bulan Lalu</th><th class="text-end">Bulan Ini</th><th class="text-end">Selisih</th><th class="text-end">%</th></tr></thead><tbody>
      ${shown.map(e => { const sel = e.ini - e.lalu, p = pct(e.lalu, e.ini); return `<tr><td class="fw-bold">${esc(e.nama)}</td><td class="text-end">${fmtV(e.lalu)}</td><td class="text-end">${fmtV(e.ini)}</td><td class="text-end ${sel >= 0 ? 'text-success' : 'text-danger'}">${sel >= 0 ? '+' : '-'}${fmtV(Math.abs(sel))}</td><td class="text-end">${p === null ? (e.ini > 0 ? 'Baru' : '-') : (sel >= 0 ? '+' : '-') + Math.abs(p).toFixed(0) + '%'}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  if (chartInstances.compare) chartInstances.compare.destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#9aa0bc' : '#6b7280', gc = dark ? '#262c47' : '#e5e7eb';
  chartInstances.compare = new Chart($('#compareChart'), {
    type: 'bar',
    data: { labels: shown.map(e => e.nama), datasets: [
      { label: lblLalu, data: shown.map(e => e.lalu), backgroundColor: '#94a3b8', borderRadius: 5 },
      { label: lblIni, data: shown.map(e => e.ini), backgroundColor: '#16a34a', borderRadius: 5 } ] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { color: tc } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtV(c.parsed.x)}` } } },
      scales: { x: { ticks: { color: tc, callback: v => qty ? fmtNum(v) : 'Rp ' + fmtNum(v) }, grid: { color: gc } }, y: { ticks: { color: tc }, grid: { display: false } } } }
  });
}

function buildInsights({ omset, margin, opex, perPel, kel, stokAda }) {
  const out = [];
  if (!kel.length) { out.push({ text: 'Belum ada transaksi keluar pada periode ini.' }); }
  else {
    const mp = omset > 0 ? (margin / omset * 100) : 0;
    out.push({ text: `Margin periode <b>${mp.toFixed(1)}%</b> dari omset (${fmtRupiah(margin)} dari ${fmtRupiah(omset)}).` });
    const top = perPel[0];
    if (top && top.omset > 0 && omset > 0) out.push({ text: `Pelanggan terbesar: <b>${esc(top.nama)}</b> (${(top.omset / omset * 100).toFixed(0)}% omset).` });
    if (top10Data[0]) out.push({ text: `Barang terlaris: <b>${esc(top10Data[0].nama)}</b> (${fmtNum(top10Data[0].qty)} unit).` });
  }
  if (opex > 0) out.push({ text: `Perbandingan kasar: margin periode ${fmtRupiah(margin)} vs biaya operasional bulan ini ${fmtRupiah(opex)} (selisih ${fmtRupiah(margin - opex)}).`, warn: margin < opex });
  const tipis = AppState.masterBarang.filter(b => b.status === 'Aktif' && num(b.stok) <= 5);
  if (tipis.length) out.push({ text: `<b>${tipis.length}</b> barang aktif stoknya ≤ 5: ${tipis.slice(0, 3).map(b => esc(b.nama)).join(', ')}${tipis.length > 3 ? ', ...' : ''}.`, warn: true });
  const tanpaHpp = AppState.masterBarang.filter(b => b.status === 'Aktif' && b.hpp == null).length;
  if (tanpaHpp) out.push({ text: `${tanpaHpp} barang aktif belum punya HPP, sehingga margin-nya dihitung 0 saat transaksi.`, warn: true });
  return out;
}

function renderTop10Chart() {
  const cv = $('#top10Chart'); if (!cv) return;
  if (chartInstances.top10) chartInstances.top10.destroy();
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc = dark ? '#9aa0bc' : '#6b7280', gc = dark ? '#262c47' : '#e5e7eb';
  chartInstances.top10 = new Chart(cv, {
    type: 'bar',
    data: { labels: top10Data.map(i => i.nama), datasets: [{ label: 'Qty', data: top10Data.map(i => i.qty), backgroundColor: '#16a34a', borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tc }, grid: { color: gc } }, y: { ticks: { color: tc }, grid: { display: false } } } }
  });
}

function aggItems(rows, itemKey) {
  const a = {};
  rows.forEach(r => (r[itemKey] || []).forEach(i => { const k = i.nama_barang; a[k] = a[k] || { nama: k, satuan: i.satuan, qty: 0, nilai: 0 }; a[k].qty += num(i.jumlah); a[k].nilai += num(i.subtotal); }));
  return Object.values(a).sort((x, y) => y.qty - x.qty);
}
function showDetailPelanggan(id) {
  const p = AppState.masterPelanggan.find(x => x.id === id);
  const list = aggItems(dashData.keluar.filter(k => k.pelanggan_id === id), 'barang_keluar_item');
  showDetail('Detail Omset — ' + (p ? p.nama : ''), `<p class="small text-secondary">Periode ${tglSingkat(dashData.from)} – ${tglSingkat(dashData.to)}</p>` +
    (list.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Barang</th><th class="text-end">Qty</th><th class="text-end">Nilai</th></tr></thead><tbody>${list.map(i => `<tr><td>${esc(i.nama)}</td><td class="text-end">${fmtNum(i.qty)} ${esc(i.satuan || '')}</td><td class="text-end">${fmtRupiah(i.nilai)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-secondary">Tidak ada transaksi.</p>'));
}
function showDetailSumber(id) {
  const s = AppState.masterSumber.find(x => x.id === id);
  const list = aggItems(dashData.masuk.filter(m => m.sumber_id === id), 'barang_masuk_item');
  showDetail('Detail Barang Masuk — ' + (s ? s.nama : ''), `<p class="small text-secondary">Periode ${tglSingkat(dashData.from)} – ${tglSingkat(dashData.to)}</p>` +
    (list.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Barang</th><th class="text-end">Qty</th></tr></thead><tbody>${list.map(i => `<tr><td>${esc(i.nama)}</td><td class="text-end">${fmtNum(i.qty)} ${esc(i.satuan || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-secondary">Tidak ada barang masuk.</p>'));
}
function showDetailStok() {
  const list = AppState.masterBarang.filter(b => num(b.stok) > 0);
  showDetail('Barang Berstok', `<div class="table-responsive"><table class="table"><thead><tr><th>Barang</th><th class="text-end">Stok</th></tr></thead><tbody>${list.map(b => `<tr><td>${esc(b.nama)}</td><td class="text-end">${fmtNum(b.stok)} ${esc(b.satuan || '')}</td></tr>`).join('')}</tbody></table></div>`);
}

/* ───────────────────────── BUILDER ITEM (kasir & barang masuk) ───────────────────────── */
function barangOptions(selectedId, mode) {
  const list = AppState.masterBarang.filter(b => b.status === 'Aktif' || b.id === selectedId);
  return '<option value="">-- Pilih Barang --</option>' + list.map(b =>
    `<option value="${b.id}" data-harga="${num(b.harga_jual)}" data-stok="${num(b.stok)}" ${b.id === selectedId ? 'selected' : ''}>${b.kode ? esc(b.kode) + ' · ' : ''}${esc(b.nama)} (Stok: ${fmtNum(b.stok)})</option>`).join('');
}
function itemRowHtml(it, withHarga) {
  return `<div class="item-row">
    <div class="flex-2"><select class="form-select form-select-sm r-barang" onchange="onRowChange(this)">${barangOptions(it && it.barang_id)}</select></div>
    <div class="flex-1"><input type="number" min="0.01" step="any" class="form-control form-control-sm r-qty" placeholder="Qty" value="${it ? esc(it.jumlah) : ''}" oninput="onRowChange(this)"></div>
    ${withHarga ? `<div class="flex-1"><input type="number" min="0" step="any" class="form-control form-control-sm r-harga" placeholder="Harga" value="${it ? esc(it.harga) : ''}" oninput="onRowChange(this)"></div>
    <div class="flex-1 fw-bold small text-end r-sub">${it ? fmtRupiah(num(it.jumlah) * num(it.harga)) : 'Rp 0'}</div>` : ''}
    <button type="button" class="action-btn delete" onclick="removeRow(this)"><i class="bi bi-trash"></i></button>
    <div class="stok-hint"></div>
  </div>`;
}
function onRowChange(el) {
  const row = el.closest('.item-row');
  const sel = row.querySelector('.r-barang'), opt = sel.options[sel.selectedIndex];
  const hargaEl = row.querySelector('.r-harga'), qty = num(row.querySelector('.r-qty').value);
  if (el === sel && hargaEl && opt && opt.value) hargaEl.value = opt.dataset.harga;
  if (hargaEl) row.querySelector('.r-sub').textContent = fmtRupiah(qty * num(hargaEl.value));
  const hint = row.querySelector('.stok-hint');
  hint.textContent = (hargaEl && opt && opt.value && qty > num(opt.dataset.stok)) ? `Qty melebihi stok tersedia (${fmtNum(opt.dataset.stok)}).` : '';
  updateListTotal();
}
function removeRow(btn) { const list = btn.closest('.item-list'); btn.closest('.item-row').remove(); updateListTotal(); }
function updateListTotal() {
  const el = $('#listTotal'); if (!el) return;
  let t = 0; document.querySelectorAll('.item-list .item-row').forEach(r => { const h = r.querySelector('.r-harga'); if (h) t += num(r.querySelector('.r-qty').value) * num(h.value); });
  el.textContent = fmtRupiah(t);
}
function addRow(withHarga) { $('.item-list').insertAdjacentHTML('beforeend', itemRowHtml(null, withHarga)); }
function collectItems(withHarga) {
  const items = [];
  for (const r of document.querySelectorAll('.item-list .item-row')) {
    const id = r.querySelector('.r-barang').value, q = num(r.querySelector('.r-qty').value);
    if (!id && !q) continue;
    if (!id || q <= 0) { showToast('Validasi', 'Setiap baris harus punya barang dan qty > 0.', 'warning'); return null; }
    const it = { barang_id: id, jumlah: q }; if (withHarga) it.harga = num(r.querySelector('.r-harga').value); items.push(it);
  }
  if (!items.length) { showToast('Validasi', 'Tambahkan minimal satu barang.', 'warning'); return null; }
  return items;
}

/* ───────────────────────── KASIR (BARANG KELUAR) ───────────────────────── */
PAGES.kasir = function (rec) {
  const edit = rec && rec.id ? rec : null; kasirEditId = edit ? edit.id : null;
  const pel = AppState.masterPelanggan.filter(p => p.status === 'Aktif' || (edit && p.id === edit.pihak_id));
  $('#app-container').innerHTML = `<div class="section-card">
    ${edit ? '<div class="alert alert-warning py-2 small"><i class="bi bi-pencil-square"></i> Mode edit transaksi. Stok akan dikoreksi otomatis saat disimpan.</div>' : ''}
    <div class="row g-3 mb-3">
      <div class="col-md-4"><label class="form-label">Tanggal</label><input type="date" id="kTanggal" class="form-control" value="${edit ? edit.tanggal : todayStr()}"></div>
      <div class="col-md-8"><label class="form-label">Pelanggan</label><select id="kPelanggan" class="form-select"><option value="">-- Pilih Pelanggan --</option>${pel.map(p => `<option value="${p.id}" ${edit && edit.pihak_id === p.id ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select></div>
    </div>
    <label class="form-label">Item Barang</label>
    <div class="item-list">${edit ? edit.items.map(i => itemRowHtml(i, true)).join('') : itemRowHtml(null, true)}</div>
    <button class="btn btn-outline-accent btn-sm mb-3" onclick="addRow(true)"><i class="bi bi-plus-lg"></i> Tambah Barang</button>
    <div class="mb-3"><label class="form-label">Catatan</label><input type="text" id="kCatatan" class="form-control" value="${edit ? esc(edit.catatan || '') : ''}"></div>
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="fs-5 fw-bold">Total: <span id="listTotal" class="text-success">Rp 0</span></div>
      <div>${edit ? '<button class="btn btn-secondary me-2" onclick="navigateTo(\'riwayat\')">Batal</button>' : ''}<button class="btn btn-accent px-4" id="kSimpan" onclick="submitKasir()"><i class="bi bi-check2-circle"></i> ${edit ? 'Simpan Perubahan' : 'Simpan Transaksi'}</button></div>
    </div></div>`;
  updateListTotal();
};
async function submitKasir() {
  const pel = $('#kPelanggan').value, tgl = $('#kTanggal').value;
  if (!tgl || !pel) return showToast('Validasi', 'Tanggal dan pelanggan wajib diisi.', 'warning');
  const items = collectItems(true); if (!items) return;
  const wasEdit = !!kasirEditId;
  const btn = $('#kSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(sb.rpc('simpan_barang_keluar', { p_id: kasirEditId, p_tanggal: tgl, p_pelanggan_id: pel, p_catatan: $('#kCatatan').value.trim() || null, p_items: items }), wasEdit ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.');
  setBtnBusy(btn, false);
  if (r.success) { await loadMasterCaches(); kasirEditId = null; navigateTo(wasEdit ? 'riwayat' : 'kasir'); }
}

/* ───────────────────────── BARANG MASUK ───────────────────────── */
PAGES.barangMasuk = function (rec) {
  const edit = rec && rec.id ? rec : null; masukEditId = edit ? edit.id : null;
  const sum = AppState.masterSumber.filter(s => s.status === 'Aktif' || (edit && s.id === edit.pihak_id));
  $('#app-container').innerHTML = `<div class="section-card">
    ${edit ? '<div class="alert alert-warning py-2 small"><i class="bi bi-pencil-square"></i> Mode edit barang masuk. Stok akan dikoreksi otomatis saat disimpan.</div>' : ''}
    <div class="row g-3 mb-3">
      <div class="col-md-4"><label class="form-label">Tanggal</label><input type="date" id="mTanggal" class="form-control" value="${edit ? edit.tanggal : todayStr()}"></div>
      <div class="col-md-8"><label class="form-label">Sumber</label><select id="mSumber" class="form-select"><option value="">-- Pilih Sumber --</option>${sum.map(s => `<option value="${s.id}" ${edit && edit.pihak_id === s.id ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}</select></div>
    </div>
    <label class="form-label">Item Barang</label>
    <div class="item-list">${edit ? edit.items.map(i => itemRowHtml(i, false)).join('') : itemRowHtml(null, false)}</div>
    <button class="btn btn-outline-accent btn-sm mb-3" onclick="addRow(false)"><i class="bi bi-plus-lg"></i> Tambah Barang</button>
    <div class="mb-3"><label class="form-label">Catatan</label><input type="text" id="mCatatan" class="form-control" value="${edit ? esc(edit.catatan || '') : ''}"></div>
    <div class="text-end">${edit ? '<button class="btn btn-secondary me-2" onclick="navigateTo(\'riwayat\')">Batal</button>' : ''}<button class="btn btn-accent px-4" id="mSimpan" onclick="submitMasuk()"><i class="bi bi-check2-circle"></i> ${edit ? 'Simpan Perubahan' : 'Simpan Barang Masuk'}</button></div>
  </div>`;
};
async function submitMasuk() {
  const sum = $('#mSumber').value, tgl = $('#mTanggal').value;
  if (!tgl || !sum) return showToast('Validasi', 'Tanggal dan sumber wajib diisi.', 'warning');
  const items = collectItems(false); if (!items) return;
  const wasEdit = !!masukEditId;
  const btn = $('#mSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(sb.rpc('simpan_barang_masuk', { p_id: masukEditId, p_tanggal: tgl, p_sumber_id: sum, p_catatan: $('#mCatatan').value.trim() || null, p_items: items }), wasEdit ? 'Barang masuk diperbarui.' : 'Barang masuk tersimpan.');
  setBtnBusy(btn, false);
  if (r.success) { await loadMasterCaches(); masukEditId = null; navigateTo(wasEdit ? 'riwayat' : 'barangMasuk'); }
}

/* ───────────────────────── STOK & MASTER BARANG ───────────────────────── */
PAGES.stok = function () {
  $('#app-container').innerHTML = `<div class="section-card">
    <div class="d-flex flex-wrap gap-2 justify-content-between mb-3">
      <input type="search" id="stokSearch" class="form-control" style="max-width:280px" placeholder="Cari kode / nama barang..." oninput="renderStokTable()">
      <button class="btn btn-accent" onclick="openBarangForm()"><i class="bi bi-plus-lg"></i> Tambah Barang</button>
    </div><div id="stokTable"></div></div>`;
  renderStokTable();
};
function renderStokTable() {
  const q = ($('#stokSearch') ? $('#stokSearch').value : '').toLowerCase();
  const list = AppState.masterBarang.filter(b => !q || (b.nama || '').toLowerCase().includes(q) || (b.kode || '').toLowerCase().includes(q));
  $('#stokTable').innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Diproduksi</th><th>Satuan</th><th class="text-end">Harga Jual</th><th class="text-end">Harga Karjo</th><th class="text-end">HPP</th><th class="text-end">Margin</th><th class="text-end">Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    ${list.map(b => `<tr><td>${esc(b.kode || '-')}</td><td class="fw-bold">${esc(b.nama)}</td><td>${esc(b.kategori || '-')}</td><td><span class="badge-status ${b.diproduksi_oleh === 'Karjo' ? '' : 'badge-ok'}" ${b.diproduksi_oleh === 'Karjo' ? 'style="background:rgba(217,119,6,.15);color:#d97706"' : ''}>${esc(b.diproduksi_oleh || '3-WRT')}</span></td><td>${esc(b.satuan)}</td><td class="text-end">${fmtRupiah(b.harga_jual)}</td><td class="text-end">${b.relevan_karjo ? fmtRupiah(b.harga_karjo) : '-'}</td><td class="text-end">${b.hpp == null ? '-' : fmtRupiah(b.hpp)}</td><td class="text-end">${b.margin == null ? '-' : fmtRupiah(b.margin)}</td><td class="text-end"><span class="badge-status ${num(b.stok) <= 5 ? 'badge-low' : 'badge-ok'}">${fmtNum(b.stok)}</span></td><td>${badgeStatus(b.status)}</td><td><button class="action-btn edit" onclick="openBarangForm('${b.id}')"><i class="bi bi-pencil"></i></button><button class="action-btn delete" onclick="deleteBarang('${b.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="12" class="text-center text-secondary py-4">Belum ada barang.</td></tr>'}
  </tbody></table></div>`;
}
function openBarangForm(id) {
  const b = id ? AppState.masterBarang.find(x => x.id === id) : null;
  showForm(b ? 'Edit Barang' : 'Tambah Barang', `<div class="row g-3">
    <div class="col-md-4"><label class="form-label">Kode Item</label><input id="fbKode" class="form-control" placeholder="mis. STS1" value="${esc(b ? b.kode || '' : '')}"></div>
    <div class="col-md-8"><label class="form-label">Nama Barang *</label><input id="fbNama" class="form-control" value="${esc(b ? b.nama : '')}"></div>
    <div class="col-md-6"><label class="form-label">Kategori</label><input id="fbKategori" class="form-control" value="${esc(b ? b.kategori || '' : '')}"></div>
    <div class="col-md-6"><label class="form-label">Satuan</label><input id="fbSatuan" class="form-control" value="${esc(b ? b.satuan : 'PCS')}"></div>
    <div class="col-md-4"><label class="form-label">Harga Jual</label><input id="fbHarga" type="number" min="0" step="any" class="form-control" value="${b ? num(b.harga_jual) : 0}"></div>
    <div class="col-md-4"><label class="form-label">HPP (kosongkan jika belum ada)</label><input id="fbHpp" type="number" min="0" step="any" class="form-control" value="${b && b.hpp != null ? num(b.hpp) : ''}"></div>
    <div class="col-md-4"><label class="form-label">${b ? 'Stok (ubah lewat transaksi)' : 'Stok Awal'}</label><input id="fbStok" type="number" step="any" class="form-control" value="${b ? num(b.stok) : 0}" ${b ? 'disabled' : ''}></div>
    <div class="col-md-4"><label class="form-label">Ditagih ke Karjo? (Relevan Karjo)</label><select id="fbRelevan" class="form-select"><option value="Tidak" ${b && b.relevan_karjo ? '' : 'selected'}>Tidak</option><option value="Ya" ${b && b.relevan_karjo ? 'selected' : ''}>Ya</option></select></div>
    <div class="col-md-4"><label class="form-label">Harga Karjo</label><input id="fbHargaKarjo" type="number" min="0" step="any" class="form-control" value="${b ? num(b.harga_karjo) : 0}"></div>
    <div class="col-md-4"><label class="form-label">Status</label><select id="fbStatus" class="form-select"><option ${b && b.status === 'Nonaktif' ? '' : 'selected'}>Aktif</option><option ${b && b.status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
    <div class="col-md-4"><label class="form-label">Diproduksi oleh</label><select id="fbProduksi" class="form-select"><option value="3-WRT" ${b && b.diproduksi_oleh === 'Karjo' ? '' : 'selected'}>3-WRT</option><option value="Karjo" ${b && b.diproduksi_oleh === 'Karjo' ? 'selected' : ''}>Karjo</option></select></div>
    <div class="col-md-8 small text-secondary align-self-end">"Ditagih ke Karjo" menentukan barang muncul di badan invoice Karjo (dengan Harga Karjo). "Diproduksi oleh" hanya menentukan masuk tabel rekap PRODUKSI KARJO atau PRODUKSI 3-WRT. Keduanya bebas dikombinasikan.</div>
    <div class="col-12 text-end"><button class="btn btn-secondary me-2" data-bs-dismiss="modal">Batal</button><button class="btn btn-accent" id="fbSimpan" onclick="saveBarang('${id || ''}')">Simpan</button></div>
  </div>`);
}
async function saveBarang(id) {
  const g = i => $('#' + i).value.trim();
  if (!g('fbNama')) return showToast('Validasi', 'Nama barang wajib diisi.', 'warning');
  const payload = { kode: g('fbKode').toUpperCase() || null, nama: g('fbNama'), kategori: g('fbKategori') || null, satuan: g('fbSatuan') || 'PCS', harga_jual: num(g('fbHarga')), harga_karjo: num(g('fbHargaKarjo')), relevan_karjo: g('fbRelevan') === 'Ya', hpp: g('fbHpp') === '' ? null : num(g('fbHpp')), diproduksi_oleh: g('fbProduksi'), status: g('fbStatus') };
  let q; if (id) q = sb.from('master_barang').update(payload).eq('id', id); else { payload.stok = num(g('fbStok')); q = sb.from('master_barang').insert(payload); }
  const btn = $('#fbSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(q, 'Barang disimpan.'); setBtnBusy(btn, false);
  if (r.success) { hideForm(); await loadMasterCaches(); renderStokTable(); }
}
function deleteBarang(id) {
  const b = AppState.masterBarang.find(x => x.id === id);
  confirmDelete(async () => { const r = await callSb(sb.from('master_barang').delete().eq('id', id), 'Barang dihapus.'); if (r.success) { await loadMasterCaches(); renderStokTable(); } }, `Hapus barang "${b ? b.nama : ''}"? Barang yang sudah dipakai transaksi tidak bisa dihapus (nonaktifkan saja).`);
}

/* ───────────────────────── RIWAYAT ───────────────────────── */
PAGES.riwayat = function () {
  $('#app-container').innerHTML = `<div class="section-card">
    <div class="row g-2 align-items-end mb-3">
      <div class="col-6 col-md-3"><label class="form-label">Dari</label><input type="date" id="rwFrom" class="form-control" value="${firstOfMonthStr()}"></div>
      <div class="col-6 col-md-3"><label class="form-label">Sampai</label><input type="date" id="rwTo" class="form-control" value="${todayStr()}"></div>
      <div class="col-6 col-md-3"><label class="form-label">Jenis</label><select id="rwJenis" class="form-select"><option value="all">Semua</option><option value="Keluar">Barang Keluar</option><option value="Masuk">Barang Masuk</option></select></div>
      <div class="col-6 col-md-auto"><button class="btn btn-accent" onclick="loadRiwayat()"><i class="bi bi-search"></i> Tampilkan</button></div>
    </div><div id="riwayatTable"></div><p class="small text-secondary mt-2 mb-0">Menampilkan maksimal 300 transaksi terbaru per jenis.</p></div>`;
  loadRiwayat();
};
const sortUrutan = arr => (arr || []).slice().sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
async function loadRiwayat() {
  const from = $('#rwFrom').value, to = $('#rwTo').value, jenis = $('#rwJenis').value;
  const box = $('#riwayatTable'); box.innerHTML = spinnerBlock();
  const mk = (table, itemTable) => { let q = sb.from(table).select(`*, ${itemTable}(*)`).order('tanggal', { ascending: false }).order('created_at', { ascending: false }).limit(300); if (from) q = q.gte('tanggal', from); if (to) q = q.lte('tanggal', to); return callSb(q, null, { silent: true }); };
  const [k, m] = await Promise.all([jenis !== 'Masuk' ? mk('barang_keluar', 'barang_keluar_item') : Promise.resolve({ success: true, data: [] }), jenis !== 'Keluar' ? mk('barang_masuk', 'barang_masuk_item') : Promise.resolve({ success: true, data: [] })]);
  if (!k.success || !m.success) { box.innerHTML = errBox('Gagal memuat riwayat.', 'loadRiwayat()'); return; }
  riwayatMap = {};
  const rows = [
    ...k.data.map(r => ({ id: r.id, jenis: 'Keluar', tanggal: r.tanggal, pihak: r.pelanggan_nama, pihak_id: r.pelanggan_id, total: r.total, catatan: r.catatan, created_at: r.created_at, items: sortUrutan(r.barang_keluar_item) })),
    ...m.data.map(r => ({ id: r.id, jenis: 'Masuk', tanggal: r.tanggal, pihak: r.sumber_nama, pihak_id: r.sumber_id, total: null, catatan: r.catatan, created_at: r.created_at, items: sortUrutan(r.barang_masuk_item) }))
  ].sort((a, b) => a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : (a.created_at < b.created_at ? 1 : -1));
  rows.forEach(r => riwayatMap[r.id] = r);
  box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Pelanggan / Sumber</th><th class="text-end">Item</th><th class="text-end">Total</th><th>Aksi</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${tglSingkat(r.tanggal)}</td><td><span class="badge-status ${r.jenis === 'Keluar' ? 'badge-low' : 'badge-ok'}">${r.jenis}</span></td><td class="fw-bold">${esc(r.pihak || '-')}</td><td class="text-end">${r.items.length}</td><td class="text-end">${r.total == null ? '-' : fmtRupiah(r.total)}</td><td><button class="action-btn view" onclick="viewRiwayat('${r.id}')"><i class="bi bi-eye"></i></button><button class="action-btn edit" onclick="editRiwayat('${r.id}')"><i class="bi bi-pencil"></i></button><button class="action-btn delete" onclick="deleteRiwayat('${r.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-secondary py-4">Tidak ada transaksi.</td></tr>'}
  </tbody></table></div>`;
}
function viewRiwayat(id) {
  const r = riwayatMap[id]; if (!r) return;
  const keluar = r.jenis === 'Keluar';
  showDetail(`${keluar ? 'Barang Keluar' : 'Barang Masuk'} — ${tglPanjang(r.tanggal)}`, `<p class="mb-2"><b>${keluar ? 'Pelanggan' : 'Sumber'}:</b> ${esc(r.pihak || '-')}</p>
    <div class="table-responsive"><table class="table"><thead><tr><th>Barang</th><th class="text-end">Qty</th>${keluar ? '<th class="text-end">Harga</th><th class="text-end">Subtotal</th>' : ''}</tr></thead><tbody>
    ${r.items.map(i => `<tr><td>${esc(i.nama_barang)}</td><td class="text-end">${fmtNum(i.jumlah)} ${esc(i.satuan || '')}</td>${keluar ? `<td class="text-end">${fmtRupiah(i.harga)}</td><td class="text-end">${fmtRupiah(i.subtotal)}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>${keluar ? `<p class="fw-bold text-end mt-2 mb-0">Total: ${fmtRupiah(r.total)}</p>` : ''}${r.catatan ? `<p class="small text-secondary mt-2 mb-0">Catatan: ${esc(r.catatan)}</p>` : ''}`);
}
function editRiwayat(id) { const r = riwayatMap[id]; if (!r) return; navigateTo(r.jenis === 'Keluar' ? 'kasir' : 'barangMasuk', r); }
function deleteRiwayat(id) {
  const r = riwayatMap[id]; if (!r) return;
  confirmDelete(async () => {
    const res = await callSb(sb.rpc(r.jenis === 'Keluar' ? 'hapus_barang_keluar' : 'hapus_barang_masuk', { p_id: id }), 'Transaksi dihapus dan stok dikoreksi.');
    if (res.success) { await loadMasterCaches(); loadRiwayat(); }
  }, 'Hapus transaksi ini? Stok barang akan dikembalikan seperti sebelum transaksi.');
}

/* ───────────────────────── PELANGGAN ───────────────────────── */
PAGES.pelanggan = function () {
  $('#app-container').innerHTML = `<div class="section-card"><div class="d-flex justify-content-end mb-3"><button class="btn btn-accent" onclick="openPelangganForm()"><i class="bi bi-plus-lg"></i> Tambah Pelanggan</button></div><div id="pelTable"></div></div>`;
  renderPelanggan();
};
function renderPelanggan() {
  $('#pelTable').innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Nama</th><th>Kontak</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    ${AppState.masterPelanggan.map(p => `<tr><td class="fw-bold">${esc(p.nama)}</td><td>${esc(p.kontak || '-')}</td><td>${badgeStatus(p.status)}</td><td><button class="action-btn edit" onclick="openPelangganForm('${p.id}')"><i class="bi bi-pencil"></i></button><button class="action-btn delete" onclick="deletePelanggan('${p.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-secondary py-4">Belum ada pelanggan.</td></tr>'}
  </tbody></table></div>`;
}
function openPelangganForm(id) {
  const p = id ? AppState.masterPelanggan.find(x => x.id === id) : null;
  showForm(p ? 'Edit Pelanggan' : 'Tambah Pelanggan', `<div class="row g-3">
    <div class="col-12"><label class="form-label">Nama *</label><input id="fpNama" class="form-control" value="${esc(p ? p.nama : '')}"></div>
    <div class="col-md-8"><label class="form-label">Kontak</label><input id="fpKontak" class="form-control" value="${esc(p ? p.kontak || '' : '')}"></div>
    <div class="col-md-4"><label class="form-label">Status</label><select id="fpStatus" class="form-select"><option ${p && p.status === 'Nonaktif' ? '' : 'selected'}>Aktif</option><option ${p && p.status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
    <div class="col-12 text-end"><button class="btn btn-secondary me-2" data-bs-dismiss="modal">Batal</button><button class="btn btn-accent" id="fpSimpan" onclick="savePelanggan('${id || ''}')">Simpan</button></div></div>`);
}
async function savePelanggan(id) {
  const nama = $('#fpNama').value.trim(); if (!nama) return showToast('Validasi', 'Nama wajib diisi.', 'warning');
  const payload = { nama, kontak: $('#fpKontak').value.trim() || null, status: $('#fpStatus').value };
  const btn = $('#fpSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(id ? sb.from('master_pelanggan').update(payload).eq('id', id) : sb.from('master_pelanggan').insert(payload), 'Pelanggan disimpan.'); setBtnBusy(btn, false);
  if (r.success) { hideForm(); await loadMasterCaches(); renderPelanggan(); }
}
function deletePelanggan(id) {
  confirmDelete(async () => { const r = await callSb(sb.from('master_pelanggan').delete().eq('id', id), 'Pelanggan dihapus.'); if (r.success) { await loadMasterCaches(); renderPelanggan(); } }, 'Hapus pelanggan ini? Riwayat transaksinya tetap tersimpan.');
}

/* ───────────────────────── MASTER BIAYA ───────────────────────── */
PAGES.masterBiaya = function () {
  $('#app-container').innerHTML = `<div class="section-card"><div class="d-flex justify-content-end mb-3"><button class="btn btn-accent" onclick="openMasterBiayaForm()"><i class="bi bi-plus-lg"></i> Tambah Master Biaya</button></div><div id="mbTable"></div></div>`;
  renderMasterBiaya();
};
function renderMasterBiaya() {
  $('#mbTable').innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Keterangan</th><th>Jenis</th><th>Satuan</th><th class="text-end">Harga</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    ${AppState.masterBiaya.map(b => `<tr><td class="fw-bold">${esc(b.keterangan)}</td><td>${esc(b.jenis || '-')}</td><td>${esc(b.satuan || '-')}</td><td class="text-end">${fmtRupiah(b.harga)}</td><td>${badgeStatus(b.status)}</td><td><button class="action-btn edit" onclick="openMasterBiayaForm('${b.id}')"><i class="bi bi-pencil"></i></button><button class="action-btn delete" onclick="deleteMasterBiaya('${b.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-secondary py-4">Belum ada master biaya.</td></tr>'}
  </tbody></table></div>`;
}
function openMasterBiayaForm(id) {
  const b = id ? AppState.masterBiaya.find(x => x.id === id) : null;
  showForm(b ? 'Edit Master Biaya' : 'Tambah Master Biaya', `<div class="row g-3">
    <div class="col-12"><label class="form-label">Keterangan *</label><input id="fmKet" class="form-control" value="${esc(b ? b.keterangan : '')}"></div>
    <div class="col-md-4"><label class="form-label">Jenis</label><input id="fmJenis" class="form-control" value="${esc(b ? b.jenis || '' : '')}"></div>
    <div class="col-md-4"><label class="form-label">Satuan</label><input id="fmSatuan" class="form-control" value="${esc(b ? b.satuan || '' : '')}"></div>
    <div class="col-md-4"><label class="form-label">Harga</label><input id="fmHarga" type="number" min="0" step="any" class="form-control" value="${b ? num(b.harga) : 0}"></div>
    <div class="col-md-4"><label class="form-label">Status</label><select id="fmStatus" class="form-select"><option ${b && b.status === 'Nonaktif' ? '' : 'selected'}>Aktif</option><option ${b && b.status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select></div>
    <div class="col-12 text-end"><button class="btn btn-secondary me-2" data-bs-dismiss="modal">Batal</button><button class="btn btn-accent" id="fmSimpan" onclick="saveMasterBiaya('${id || ''}')">Simpan</button></div></div>`);
}
async function saveMasterBiaya(id) {
  const ket = $('#fmKet').value.trim(); if (!ket) return showToast('Validasi', 'Keterangan wajib diisi.', 'warning');
  const payload = { keterangan: ket, jenis: $('#fmJenis').value.trim() || null, satuan: $('#fmSatuan').value.trim() || null, harga: num($('#fmHarga').value), status: $('#fmStatus').value };
  const btn = $('#fmSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(id ? sb.from('master_biaya').update(payload).eq('id', id) : sb.from('master_biaya').insert(payload), 'Master biaya disimpan.'); setBtnBusy(btn, false);
  if (r.success) { hideForm(); await loadMasterCaches(); renderMasterBiaya(); }
}
function deleteMasterBiaya(id) {
  confirmDelete(async () => { const r = await callSb(sb.from('master_biaya').delete().eq('id', id), 'Master biaya dihapus.'); if (r.success) { await loadMasterCaches(); renderMasterBiaya(); } });
}

/* ───────────────────────── INPUT BIAYA OPERASIONAL ───────────────────────── */
PAGES.inputBiaya = function () {
  const aktif = AppState.masterBiaya.filter(b => b.status === 'Aktif');
  $('#app-container').innerHTML = `<div class="section-card mb-3"><div class="row g-3">
    <div class="col-md-3"><label class="form-label">Tanggal</label><input type="date" id="ibTanggal" class="form-control" value="${todayStr()}"></div>
    <div class="col-md-5"><label class="form-label">Biaya</label><select id="ibMaster" class="form-select" onchange="onMasterBiayaChange()"><option value="">-- Pilih dari Master Biaya --</option>${aktif.map(b => `<option value="${b.id}">${esc(b.keterangan)}</option>`).join('')}</select></div>
    <div class="col-md-2"><label class="form-label">Harga</label><input type="number" id="ibHarga" min="0" step="any" class="form-control" value="0"></div>
    <div class="col-md-2"><label class="form-label">Jumlah</label><input type="number" id="ibJumlah" min="0.01" step="any" class="form-control" value="1"></div>
    <div class="col-12 text-end"><button class="btn btn-accent" id="ibSimpan" onclick="submitBiaya()"><i class="bi bi-check2-circle"></i> Simpan Biaya</button></div>
  </div></div><div class="section-card"><h6>Biaya 30 Hari Terakhir</h6><div id="ibList">${spinnerBlock()}</div></div>`;
  loadBiayaTerakhir();
};
function onMasterBiayaChange() { const b = AppState.masterBiaya.find(x => x.id === $('#ibMaster').value); if (b) $('#ibHarga').value = num(b.harga); }
async function submitBiaya() {
  const m = AppState.masterBiaya.find(x => x.id === $('#ibMaster').value), jumlah = num($('#ibJumlah').value);
  if (!m) return showToast('Validasi', 'Pilih jenis biaya.', 'warning');
  if (jumlah <= 0) return showToast('Validasi', 'Jumlah harus lebih dari 0.', 'warning');
  const btn = $('#ibSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(sb.from('biaya_operasional').insert({ tanggal: $('#ibTanggal').value, nama_biaya: m.keterangan, jenis: m.jenis, satuan: m.satuan, harga: num($('#ibHarga').value), jumlah, dibuat_oleh: AppState.user.id }), 'Biaya tersimpan.');
  setBtnBusy(btn, false); if (r.success) loadBiayaTerakhir();
}
async function loadBiayaTerakhir() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  const r = await callSb(sb.from('biaya_operasional').select('*').gte('tanggal', dateToStr(d)).order('tanggal', { ascending: false }).order('created_at', { ascending: false }), null, { silent: true });
  const box = $('#ibList'); if (!box) return;
  if (!r.success) { box.innerHTML = errBox('Gagal memuat biaya.', 'loadBiayaTerakhir()'); return; }
  box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Tanggal</th><th>Biaya</th><th>Jenis</th><th class="text-end">Harga</th><th class="text-end">Jumlah</th><th class="text-end">Total</th><th>Aksi</th></tr></thead><tbody>
    ${r.data.map(b => `<tr><td>${tglSingkat(b.tanggal)}</td><td class="fw-bold">${esc(b.nama_biaya)}</td><td>${esc(b.jenis || '-')}</td><td class="text-end">${fmtRupiah(b.harga)}</td><td class="text-end">${fmtNum(b.jumlah)} ${esc(b.satuan || '')}</td><td class="text-end">${fmtRupiah(b.total)}</td><td><button class="action-btn delete" onclick="deleteBiaya('${b.id}')"><i class="bi bi-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-secondary py-4">Belum ada biaya.</td></tr>'}
  </tbody></table></div>`;
}
function deleteBiaya(id) { confirmDelete(async () => { const r = await callSb(sb.from('biaya_operasional').delete().eq('id', id), 'Biaya dihapus.'); if (r.success) loadBiayaTerakhir(); }); }

/* ───────────────────────── LAPORAN BIAYA BULANAN ───────────────────────── */
PAGES.laporanBiaya = function () {
  const now = new Date();
  $('#app-container').innerHTML = `<div class="section-card"><div class="row g-2 align-items-end mb-3">
    <div class="col-6 col-md-3"><label class="form-label">Bulan</label><select id="lbBulan" class="form-select">${BULAN_ID.map((b, i) => `<option value="${i + 1}" ${i === now.getMonth() ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">Tahun</label><input type="number" id="lbTahun" class="form-control" value="${now.getFullYear()}"></div>
    <div class="col-12 col-md-auto"><button class="btn btn-accent" onclick="loadLaporanBiaya()"><i class="bi bi-search"></i> Tampilkan</button></div>
  </div><div id="lbBody"></div></div>`;
  loadLaporanBiaya();
};
async function loadLaporanBiaya() {
  const m = num($('#lbBulan').value), y = num($('#lbTahun').value), box = $('#lbBody'); box.innerHTML = spinnerBlock();
  const r = await callSb(sb.from('biaya_operasional').select('*').gte('tanggal', `${y}-${pad(m)}-01`).lte('tanggal', dateToStr(new Date(y, m, 0))).order('tanggal'), null, { silent: true });
  if (!r.success) { box.innerHTML = errBox('Gagal memuat laporan.', 'loadLaporanBiaya()'); return; }
  const total = r.data.reduce((s, b) => s + num(b.total), 0), perJenis = {};
  r.data.forEach(b => { const k = b.jenis || 'Lainnya'; perJenis[k] = (perJenis[k] || 0) + num(b.total); });
  box.innerHTML = `<div class="row g-3 mb-3"><div class="col-md-4"><div class="kpi-card kpi-orange"><i class="bi bi-wallet2 kpi-icon"></i><div><div class="kpi-label">Total ${BULAN_ID[m - 1]} ${y}</div><div class="kpi-value">${fmtRupiah(total)}</div></div></div></div>
    <div class="col-md-8">${Object.entries(perJenis).map(([k, v]) => `<div class="mini-card"><span class="mc-name">${esc(k)}</span><span class="mc-value">${fmtRupiah(v)}</span></div>`).join('') || '<p class="text-secondary small">Tidak ada biaya pada bulan ini.</p>'}</div></div>
    <div class="table-responsive"><table class="table"><thead><tr><th>Tanggal</th><th>Biaya</th><th>Jenis</th><th class="text-end">Jumlah</th><th class="text-end">Total</th></tr></thead><tbody>
    ${r.data.map(b => `<tr><td>${tglSingkat(b.tanggal)}</td><td>${esc(b.nama_biaya)}</td><td>${esc(b.jenis || '-')}</td><td class="text-end">${fmtNum(b.jumlah)} ${esc(b.satuan || '')}</td><td class="text-end">${fmtRupiah(b.total)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* ───────────────────────── PENGATURAN ───────────────────────── */
PAGES.pengaturan = function () {
  const c = AppState.config;
  $('#app-container').innerHTML = `
    <div class="section-card mb-3"><h6>Identitas Aplikasi & Invoice</h6><div class="row g-3">
      <div class="col-md-6"><label class="form-label">Nama Aplikasi</label><input id="cfgApp" class="form-control" value="${esc(c.appName || '')}"></div>
      <div class="col-md-6"><label class="form-label">URL Logo (dipakai juga di invoice)</label><input id="cfgLogo" class="form-control" placeholder="https://..." value="${esc(c.logoUrl || '')}"></div>
      <div class="col-12"><div class="p-3 rounded-3" style="background:var(--bg-primary);border:1px dashed var(--border-color)">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input type="file" id="cfgLogoFile" accept="image/png,image/jpeg,image/webp" class="form-control form-control-sm" style="max-width:280px">
          <button class="btn btn-outline-accent btn-sm" id="cfgUpload" onclick="uploadLogo()"><i class="bi bi-upload"></i> Upload Logo</button>
          <button class="btn btn-secondary btn-sm" onclick="testLogo()"><i class="bi bi-search"></i> Tes Logo</button>
        </div>
        <div class="small text-secondary mt-2">PNG / JPG / WebP, maks. 2 MB. Upload langsung adalah cara paling andal agar logo tampil di aplikasi <b>dan</b> invoice PDF. Tombol Tes Logo memeriksa URL yang tertulis di kolom atas.</div>
        <div id="logoTest" class="mt-2 small"></div>
      </div></div>
      <div class="col-md-6"><label class="form-label">Nama Perusahaan (header invoice)</label><input id="cfgPerusahaan" class="form-control" value="${esc(c.perusahaan || '')}"></div>
      <div class="col-md-6"><label class="form-label">Telepon</label><input id="cfgTelepon" class="form-control" value="${esc(c.telepon || '')}"></div>
      <div class="col-12"><label class="form-label">Alamat</label><input id="cfgAlamat" class="form-control" value="${esc(c.alamat || '')}"></div>
      <div class="col-12 text-end"><button class="btn btn-accent" id="cfgSimpan" onclick="saveConfig()">Simpan Pengaturan</button></div>
    </div></div>
    <div class="section-card mb-3"><h6>Pengguna & Role</h6>
      <p class="small text-secondary">Admin = akses penuh. Owner = hanya Dashboard. Akun baru dibuat lewat Supabase → Authentication → Users → Add user (otomatis berperan Owner).</p>
      <div id="userList">${spinnerBlock()}</div></div>
    <div class="section-card"><h6>Sumber Barang Masuk <button class="btn btn-accent btn-sm" onclick="openSumberForm()"><i class="bi bi-plus-lg"></i> Tambah</button></h6><div id="sumberList"></div></div>`;
  renderSumberList(); loadUsers();
};
async function saveConfig() {
  const rows = [['appName', 'cfgApp'], ['logoUrl', 'cfgLogo'], ['perusahaan', 'cfgPerusahaan'], ['telepon', 'cfgTelepon'], ['alamat', 'cfgAlamat']].map(([key, id]) => ({ key, value: $('#' + id).value.trim() }));
  const btn = $('#cfgSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(sb.from('app_config').upsert(rows, { onConflict: 'key' }), 'Pengaturan disimpan.'); setBtnBusy(btn, false);
  if (r.success) { rows.forEach(x => AppState.config[x.key] = x.value); applyConfig(); testLogo(); }
}
/* Tes URL logo: apakah tampil di aplikasi, dan apakah bisa dipakai di PDF (butuh izin CORS dari server gambar) */
async function testLogo() {
  const url = $('#cfgLogo').value.trim(), box = $('#logoTest');
  if (!url) { box.innerHTML = '<span class="text-secondary">Belum ada URL logo. Isi URL atau upload file.</span>'; return; }
  box.innerHTML = '<span class="text-secondary">Menguji logo...</span>';
  const display = await new Promise(res => { const i = new Image(); const t = setTimeout(() => res(false), 8000); i.onload = () => { clearTimeout(t); res(true); }; i.onerror = () => { clearTimeout(t); res(false); }; i.src = url; });
  const pdf = display ? !!(await loadImageDataUrl(url)) : false;
  const ok = t => `<div class="text-success"><i class="bi bi-check-circle-fill"></i> ${t}</div>`, bad = t => `<div class="text-danger"><i class="bi bi-x-circle-fill"></i> ${t}</div>`;
  box.innerHTML = (display ? `<img src="${esc(url)}" alt="Pratinjau" style="height:56px;max-width:160px;object-fit:contain;background:#fff;border-radius:8px;padding:4px;border:1px solid var(--border-color)" class="mb-2 d-block">` : '') +
    (display ? ok('Tampil di aplikasi (navbar & login).') : bad('Tidak tampil: URL ini bukan link gambar langsung (biasanya link halaman / share dari Google Drive, Google Photos, Canva, ibb.co, dll). Gunakan Upload Logo.')) +
    (display ? (pdf ? ok('Bisa dipakai di invoice PDF.') : bad('Tidak bisa dipakai di invoice PDF: server gambar memblokir akses lintas-situs. Gunakan Upload Logo.')) : '');
}

/* Upload logo ke Supabase Storage (bucket publik "app-assets") lalu simpan URL-nya di pengaturan */
async function uploadLogo() {
  const f = $('#cfgLogoFile').files[0];
  if (!f) return showToast('Validasi', 'Pilih file logo terlebih dahulu.', 'warning');
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return showToast('Validasi', 'Format harus PNG, JPG, atau WebP.', 'warning');
  if (f.size > 2 * 1024 * 1024) return showToast('Validasi', 'Ukuran file maksimal 2 MB.', 'warning');
  const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `logo/logo-${Date.now()}.${ext}`;
  const btn = $('#cfgUpload'); setBtnBusy(btn, true, 'Mengunggah...');
  const up = await callSb(sb.storage.from('app-assets').upload(path, f, { contentType: f.type, cacheControl: '3600', upsert: false }));
  if (!up.success) { setBtnBusy(btn, false); return; }
  const url = sb.storage.from('app-assets').getPublicUrl(path).data.publicUrl;
  const sv = await callSb(sb.from('app_config').upsert({ key: 'logoUrl', value: url }, { onConflict: 'key' }), 'Logo diunggah dan disimpan.');
  setBtnBusy(btn, false);
  if (sv.success) { AppState.config.logoUrl = url; $('#cfgLogo').value = url; applyConfig(); $('#cfgLogoFile').value = ''; testLogo(); }
}

async function loadUsers() {
  const r = await callSb(sb.from('profiles').select('*').order('created_at'), null, { silent: true });
  const box = $('#userList'); if (!box) return;
  if (!r.success) { box.innerHTML = errBox('Gagal memuat pengguna.', 'loadUsers()'); return; }
  box.innerHTML = `<div class="table-responsive"><table class="table"><thead><tr><th>Email</th><th>Nama</th><th>Role</th></tr></thead><tbody>
    ${r.data.map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.nama || '-')}</td><td><select class="form-select form-select-sm" style="max-width:140px" ${u.id === AppState.user.id ? 'disabled title="Tidak bisa mengubah role sendiri"' : ''} onchange="changeRole('${u.id}', this.value)"><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option><option value="owner" ${u.role === 'owner' ? 'selected' : ''}>owner</option></select></td></tr>`).join('')}</tbody></table></div>`;
}
async function changeRole(id, role) { const r = await callSb(sb.from('profiles').update({ role }).eq('id', id), 'Role diperbarui.'); if (!r.success) loadUsers(); }
function renderSumberList() {
  $('#sumberList').innerHTML = AppState.masterSumber.map(s => `<div class="mini-card"><span class="mc-name">${esc(s.nama)}</span><span>${badgeStatus(s.status)} <button class="mc-btn ms-2" onclick="toggleSumber('${s.id}')">${s.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button></span></div>`).join('') || '<p class="text-secondary small mb-0">Belum ada sumber.</p>';
}
function openSumberForm() {
  showForm('Tambah Sumber', `<div class="mb-3"><label class="form-label">Nama Sumber *</label><input id="fsNama" class="form-control"></div><div class="text-end"><button class="btn btn-secondary me-2" data-bs-dismiss="modal">Batal</button><button class="btn btn-accent" id="fsSimpan" onclick="saveSumber()">Simpan</button></div>`);
}
async function saveSumber() {
  const nama = $('#fsNama').value.trim(); if (!nama) return showToast('Validasi', 'Nama wajib diisi.', 'warning');
  const btn = $('#fsSimpan'); setBtnBusy(btn, true, 'Menyimpan...');
  const r = await callSb(sb.from('master_sumber').insert({ nama }), 'Sumber ditambahkan.'); setBtnBusy(btn, false);
  if (r.success) { hideForm(); await loadMasterCaches(); renderSumberList(); }
}
async function toggleSumber(id) {
  const s = AppState.masterSumber.find(x => x.id === id);
  const r = await callSb(sb.from('master_sumber').update({ status: s.status === 'Aktif' ? 'Nonaktif' : 'Aktif' }).eq('id', id), 'Status sumber diubah.');
  if (r.success) { await loadMasterCaches(); renderSumberList(); }
}

/* ───────────────────────── INVOICE ───────────────────────── */
PAGES.invoice = function () {
  const n = new Date();
  const from = dateToStr(new Date(n.getFullYear(), n.getMonth(), 1)), to = dateToStr(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  $('#app-container').innerHTML = `
    <div class="section-card mb-3"><h6>Invoice Pengiriman Barang (per Pelanggan)</h6><div class="row g-3 align-items-end">
      <div class="col-md-4"><label class="form-label">Pelanggan</label><select id="invPel" class="form-select"><option value="">-- Pilih Pelanggan --</option>${AppState.masterPelanggan.map(p => `<option value="${p.id}">${esc(p.nama)}</option>`).join('')}</select></div>
      <div class="col-6 col-md-3"><label class="form-label">Dari</label><input type="date" id="invFrom" class="form-control" value="${from}"></div>
      <div class="col-6 col-md-3"><label class="form-label">Sampai</label><input type="date" id="invTo" class="form-control" value="${to}"></div>
      <div class="col-12 col-md-2"><button class="btn btn-accent w-100" onclick="generateInvoicePelanggan(this)"><i class="bi bi-file-earmark-pdf"></i> Buat Invoice</button></div>
    </div></div>
    <div class="section-card"><h6>Invoice Tagihan Produksi Karjo (dari Barang Keluar)</h6>
      <p class="small text-secondary">Diambil dari data Barang Keluar (semua pelanggan) pada barang bertanda "Relevan Produksi Karjo", dihitung dengan Harga Karjo. Di bawah tabel ada rekap produksi stang terkirim yang dipisah <b>PRODUKSI KARJO</b> dan <b>PRODUKSI 3-WRT</b> menurut kolom "Diproduksi oleh" di master barang (terlepas barang itu ditagih ke Karjo atau tidak).</p>
      <div class="row g-3 align-items-end">
      <div class="col-6 col-md-4"><label class="form-label">Dari</label><input type="date" id="kjFrom" class="form-control" value="${from}"></div>
      <div class="col-6 col-md-4"><label class="form-label">Sampai</label><input type="date" id="kjTo" class="form-control" value="${to}"></div>
      <div class="col-12 col-md-4"><button class="btn btn-accent2 w-100" onclick="generateInvoiceKarjo(this)"><i class="bi bi-file-earmark-pdf"></i> Buat Invoice Karjo</button></div>
    </div></div>`;
};

function groupByDate(rows, itemKey, mapItem) {
  const map = new Map();
  rows.forEach(r => { const arr = map.get(r.tanggal) || []; sortUrutan(r[itemKey]).forEach(it => { const m = mapItem(it); if (m) arr.push(m); }); map.set(r.tanggal, arr); });
  return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).filter(([, items]) => items.length).map(([tanggal, items]) => ({ tanggal, items }));
}
function kodeBarang(it) { const b = AppState.masterBarang.find(x => x.id === it.barang_id); return (b && b.kode) || it.kode_barang || '-'; }

async function generateInvoicePelanggan(btn) {
  const pelId = $('#invPel').value, from = $('#invFrom').value, to = $('#invTo').value;
  if (!pelId || !from || !to || from > to) return showToast('Validasi', 'Pilih pelanggan dan rentang tanggal yang valid.', 'warning');
  const pel = AppState.masterPelanggan.find(p => p.id === pelId);
  setBtnBusy(btn, true, 'Membuat...');
  try {
    const r = await callSb(sb.from('barang_keluar').select('tanggal,created_at,barang_keluar_item(barang_id,kode_barang,nama_barang,satuan,jumlah,harga,subtotal,urutan)').eq('pelanggan_id', pelId).gte('tanggal', from).lte('tanggal', to).order('tanggal').order('created_at'));
    if (!r.success) return;
    const groups = groupByDate(r.data, 'barang_keluar_item', i => ({ kode: kodeBarang(i), nama: i.nama_barang, qty: num(i.jumlah), satuan: i.satuan || '-', harga: num(i.harga), subtotal: num(i.subtotal) }));
    if (!groups.length) return showToast('Info', 'Tidak ada transaksi pada periode tersebut.', 'warning');
    await finishInvoice({ prefix: 'PJL', tipe: 'Per Pelanggan', judul: 'INVOICE PENGIRIMAN BARANG', target: pel.nama, kontak: pel.kontak, from, to, groups });
  } finally { setBtnBusy(btn, false); }
}

/* Ambil semua halaman data (Supabase membatasi 1000 baris per permintaan) */
async function fetchAllPages(makeQuery) {
  const size = 1000; let all = [];
  for (let from = 0; ; from += size) {
    const r = await callSb(makeQuery().range(from, from + size - 1));
    if (!r.success) return null;
    all = all.concat(r.data);
    if (r.data.length < size) break;
  }
  return all;
}

/* Invoice Karjo: dari BARANG KELUAR (semua pelanggan) untuk barang bertanda "Relevan Produksi Karjo",
   dihitung dengan Harga Karjo. Ditambah rekap total per item khusus kategori STANG. */
async function generateInvoiceKarjo(btn) {
  const from = $('#kjFrom').value, to = $('#kjTo').value;
  if (!from || !to || from > to) return showToast('Validasi', 'Rentang tanggal tidak valid.', 'warning');
  setBtnBusy(btn, true, 'Membuat...');
  try {
    const rows = await fetchAllPages(() => sb.from('barang_keluar')
      .select('tanggal,created_at,barang_keluar_item(barang_id,kode_barang,nama_barang,satuan,jumlah,urutan)')
      .gte('tanggal', from).lte('tanggal', to).order('tanggal').order('created_at').order('id'));
    if (!rows) return;
    const bMap = new Map(AppState.masterBarang.map(b => [b.id, b]));
    const isStang = b => String(b.kategori || '').toUpperCase().includes('STANG');
    const groups = groupByDate(rows, 'barang_keluar_item', i => {
      const b = bMap.get(i.barang_id);
      if (!b || !b.relevan_karjo) return null;
      const qty = num(i.jumlah), harga = num(b.harga_karjo);
      return { kode: kodeBarang(i), nama: i.nama_barang, qty, satuan: i.satuan || b.satuan || '-', harga, subtotal: qty * harga, stang: isStang(b), prod: b.diproduksi_oleh === 'Karjo' ? 0 : 1 };
    });
    groups.forEach(g => g.items.sort((x, y) => x.prod - y.prod));   // produksi Karjo di atas, produksi 3-WRT menyusul (sort stabil)
    if (!groups.length) return showToast('Info', 'Tidak ada barang keluar bertanda "Relevan Produksi Karjo" pada periode tersebut.', 'warning');

    // Rekap produksi stang terkirim: semua barang keluar kategori STANG, dipisah menurut penanda Relevan Karjo
    const rk = { karjo: new Map(), wrt: new Map(), min: null, max: null };
    rows.forEach(r => (r.barang_keluar_item || []).forEach(i => {
      const b = bMap.get(i.barang_id); if (!b || !isStang(b)) return;
      const tgt = b.diproduksi_oleh === 'Karjo' ? rk.karjo : rk.wrt;
      const e = tgt.get(i.nama_barang) || { nama: i.nama_barang, qty: 0, jumlah: 0, satuan: i.satuan || b.satuan || 'PCS' };
      e.qty += num(i.jumlah); e.jumlah += b.relevan_karjo ? num(i.jumlah) * num(b.harga_karjo) : 0; tgt.set(i.nama_barang, e);
      if (!rk.min || r.tanggal < rk.min) rk.min = r.tanggal;
      if (!rk.max || r.tanggal > rk.max) rk.max = r.tanggal;
    }));
    const urut = m => [...m.values()].sort((x, y) => x.nama.localeCompare(y.nama, 'id'));
    const rekap = { karjo: urut(rk.karjo), wrt: urut(rk.wrt), label: rk.min ? rekapLabel(rk.min, rk.max) : '' };
    await finishInvoice({ prefix: 'KRJ', tipe: 'Produksi Karjo', judul: 'LAPORAN TAGIHAN MINGGUAN', kepadaLabel: 'NAMA VENDOR :', target: 'KARJO', kontak: '', from, to, groups, rekap });
  } finally { setBtnBusy(btn, false); }
}

async function finishInvoice(o) {
  o.totalQty = o.groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.qty, 0), 0);
  o.total = o.groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.subtotal, 0), 0);
  const nm = await callSb(sb.rpc('buat_nomor_invoice', { p_prefix: o.prefix, p_tipe: o.tipe, p_mulai: o.from, p_selesai: o.to, p_target: o.target, p_total: o.total }));
  if (!nm.success) return;
  o.nomor = nm.data; o.cfg = AppState.config;
  const doc = await buildInvoiceDoc(o);
  showPdfPreview(doc.output('blob'), `Invoice_${o.target.replace(/\s+/g, '_')}_${o.from}_${o.to}.pdf`, o.nomor);
}

let pdfUrl = null;
function showPdfPreview(blob, filename, nomor) {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = URL.createObjectURL(blob);
  $('#pdfModalTitle').textContent = 'Pratinjau ' + nomor;
  $('#pdfFrame').src = pdfUrl;
  const a = $('#pdfDownloadBtn'); a.href = pdfUrl; a.download = filename;
  getModal('pdfModal').show();
}
document.addEventListener('hidden.bs.modal', e => { if (e.target.id === 'pdfModal') $('#pdfFrame').src = 'about:blank'; });

function loadImageDataUrl(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image(); img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => { clearTimeout(timer); try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); resolve({ data: c.toDataURL('image/png'), w: c.width, h: c.height }); } catch (e) { resolve(null); } };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/* "MINGGU KE- 4 | 21 s/d 26 SEPTEMBER 2026" — minggu ke-n dihitung dari minggu (Senin-Minggu) yang memuat tanggal 1 */
function rekapLabel(a, b) {
  const A = parseDate(a), B = parseDate(b);
  const same = A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear();
  const bln = `${BULAN_ID[B.getMonth()].toUpperCase()} ${B.getFullYear()}`;
  const range = same ? `${A.getDate()} s/d ${B.getDate()} ${bln}` : `${A.getDate()} ${BULAN_ID[A.getMonth()].toUpperCase()} s/d ${B.getDate()} ${bln}`;
  if (same && Math.round((B - A) / 86400000) <= 6) {
    const off = (new Date(A.getFullYear(), A.getMonth(), 1).getDay() + 6) % 7;
    return `MINGGU KE- ${Math.ceil((A.getDate() + off) / 7)} | ${range}`;
  }
  return `PERIODE ${range}`;
}

function labelBulan(from, to) {
  const a = parseDate(from), b = parseDate(to);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return BULAN_ID[a.getMonth()].toUpperCase();
  return `${BULAN_ID[a.getMonth()].slice(0, 3).toUpperCase()} – ${BULAN_ID[b.getMonth()].slice(0, 3).toUpperCase()} ${b.getFullYear()}`;
}

/* Layout mengikuti contoh PDF: header logo+judul kiri, bulan/periode kanan, pita "Tanggal | Kepada",
   blok per tanggal, total di akhir, nomor halaman x/y. Desain tabel dibuat modern. */
async function buildInvoiceDoc(o) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, ML = 14, MR = 14, MB = 18, CW = W - ML - MR;
  const C = { ink: [17, 24, 39], muted: [107, 114, 128], line: [226, 232, 240], accent: [22, 163, 74], soft: [236, 253, 245], band: [243, 245, 249], navy: [21, 26, 53], zebra: [248, 250, 252], mint: [110, 231, 183] };
  const cfg = o.cfg || {};

  // ── Header kiri: logo + identitas ──
  const logo = await loadImageDataUrl(cfg.logoUrl);
  if (cfg.logoUrl && !logo) showToast('Logo invoice', 'Logo tidak bisa dimuat ke PDF (server gambar memblokir akses). Pakai Upload Logo di Pengaturan.', 'warning');
  let drawn = false;
  if (logo) { try { const s = 22, r = Math.min(s / logo.w, s / logo.h); const w = logo.w * r, h = logo.h * r; doc.addImage(logo.data, 'PNG', ML + (s - w) / 2, 12 + (s - h) / 2, w, h); drawn = true; } catch (e) { } }
  if (!drawn) { doc.setFillColor(...C.accent); doc.roundedRect(ML, 12, 22, 22, 4, 4, 'F'); doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(255, 255, 255).text('3WT', ML + 11, 25.5, { align: 'center' }); }
  const tx = ML + 27;
  doc.setFont('helvetica', 'bold').setFontSize(13.5).setTextColor(...C.ink).text(o.judul, tx, 18);
  doc.setFontSize(9.5).text(cfg.perusahaan || '3 WARNA TEKNIK', tx, 24);
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...C.muted);
  doc.text(cfg.alamat || '-', tx, 29); doc.text(cfg.telepon || '-', tx, 33.5);

  // ── Header kanan: bulan + periode ──
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(...C.accent).text(labelBulan(o.from, o.to), W - MR, 18, { align: 'right' });
  doc.setFontSize(9).setTextColor(...C.ink).text(`PERIODE : ${tglKode(o.from)} - ${tglKode(o.to)}`, W - MR, 24, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...C.muted).text('No. ' + o.nomor, W - MR, 29, { align: 'right' });

  // ── Pita: Tanggal | Kepada ──
  doc.setFillColor(...C.band); doc.roundedRect(ML, 40, CW, 14, 2, 2, 'F');
  doc.setFillColor(...C.accent); doc.roundedRect(ML, 40, 1.4, 14, 0.7, 0.7, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...C.ink).text('Tanggal', ML + 5, o.kontak ? 45.2 : 47.2);
  const mid = ML + CW / 2;
  const lblKpd = o.kepadaLabel || 'Kepada :';
  doc.setTextColor(...C.muted).text(lblKpd, mid, o.kontak ? 45.2 : 47.2);
  const nx = mid + doc.getTextWidth(lblKpd) + 3;
  doc.setFontSize(11).setTextColor(...C.ink).text(String(o.target).toUpperCase(), nx, o.kontak ? 45.2 : 47.2);
  if (o.kontak) doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...C.muted).text(String(o.kontak), nx, 50.4);

  // ── Blok per tanggal ──
  let y = 62; const bottom = H - MB;
  const ensure = need => { if (y + need > bottom) { doc.addPage(); y = 16; } };
  for (const g of o.groups) {
    ensure(34);
    const sub = g.items.reduce((s, i) => s + i.subtotal, 0);
    doc.setFillColor(...C.soft); doc.roundedRect(ML, y, CW, 8, 1.5, 1.5, 'F');
    doc.setFillColor(...C.accent); doc.roundedRect(ML, y, 1.6, 8, 0.8, 0.8, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...C.ink).text(tglPanjang(g.tanggal), ML + 5, y + 5.4);
    doc.setFontSize(8.3).setTextColor(...C.accent).text('Subtotal  ' + fmtNum(sub), W - MR - 3, y + 5.4, { align: 'right' });
    y += 10;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR, top: 16, bottom: MB }, theme: 'plain',
      head: [['No.', 'Kd. Item', 'Nama Item', 'Qty', 'Satuan', 'Harga', 'Jumlah']],
      body: g.items.map((it, i) => [i + 1, it.kode, it.nama, fmtNum(it.qty), it.satuan, fmtNum(it.harga), fmtNum(it.subtotal)]),
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, textColor: C.ink, lineWidth: 0, overflow: 'linebreak' },
      headStyles: { fillColor: C.navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8, cellPadding: { top: 2.2, bottom: 2.2, left: 2.2, right: 2.2 } },
      alternateRowStyles: { fillColor: C.zebra },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 17, halign: 'center' }, 4: { cellWidth: 18, halign: 'center' }, 5: { cellWidth: 26, halign: 'center' }, 6: { cellWidth: 30, halign: 'center', fontStyle: 'bold' } },
      didParseCell: d => { if (d.column.index >= 3) d.cell.styles.halign = 'center'; },
      didDrawCell: d => { if (d.section === 'body') { doc.setDrawColor(...C.line); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } }
    });
    y = doc.lastAutoTable.finalY + 4;
    doc.setDrawColor(...C.muted); doc.setLineWidth(0.25); doc.setLineDashPattern([0.6, 1.2], 0); doc.line(ML, y, W - MR, y); doc.setLineDashPattern([], 0);
    y += 9;
  }

  // ── Ringkasan akhir ──
  ensure(36);
  doc.setFillColor(...C.navy); doc.roundedRect(ML, y, CW, 32, 3, 3, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(255, 255, 255).text('TOTAL KESELURUHAN', ML + 8, y + 13);
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(180, 186, 210).text(`${o.groups.length} hari pengiriman`, ML + 8, y + 19);
  const lx = ML + CW * 0.5, rx = W - MR - 8;
  doc.setFontSize(9).setTextColor(200, 205, 225);
  doc.text('Jumlah Item :', lx, y + 9); doc.text('Sub Total :', lx, y + 15.5);
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').text(fmtNum(o.totalQty), rx, y + 9, { align: 'right' }); doc.text('Rp ' + fmtNum(o.total), rx, y + 15.5, { align: 'right' });
  doc.setDrawColor(70, 78, 120); doc.setLineWidth(0.2); doc.line(lx, y + 19, rx, y + 19);
  doc.setFontSize(10.5).setTextColor(...C.mint).text('TOTAL AKHIR :', lx, y + 27); doc.setFontSize(13).text('Rp ' + fmtNum(o.total), rx, y + 27, { align: 'right' });

  // ── Rekap produksi stang terkirim: PRODUKSI KARJO vs PRODUKSI 3-WRT (khusus invoice Karjo) ──
  const rk = o.rekap;
  if (rk && (rk.karjo.length || rk.wrt.length)) {
    y += 32 + 10;
    ensure(60);
    doc.setFillColor(220, 38, 38); doc.roundedRect(ML, y, CW, 15, 2, 2, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255).text('REKAP PRODUKSI STANG TERKIRIM', ML + CW / 2, y + 6.2, { align: 'center' });
    doc.setFontSize(9.5).text(rk.label, ML + CW / 2, y + 11.6, { align: 'center' });
    y += 21;
    const tabel = (judul, rows, warna) => {
      if (!rows.length) return 0;
      ensure(36);
      doc.setFillColor(...warna); doc.roundedRect(ML, y, 52, 7, 3.5, 3.5, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(8.8).setTextColor(255, 255, 255).text(judul, ML + 26, y + 4.8, { align: 'center' });
      y += 9;
      const tot = rows.reduce((s, r) => s + r.qty, 0), totJ = rows.reduce((s, r) => s + r.jumlah, 0), sat = new Set(rows.map(r => r.satuan || 'PCS'));
      doc.autoTable({
        startY: y, margin: { left: ML, right: MR, top: 16, bottom: MB }, theme: 'plain',
        head: [['NAMA ITEM BARANG', 'QTY', 'SATUAN', 'JUMLAH']],
        body: rows.map(r => [r.nama, fmtNum(r.qty), r.satuan || 'PCS', fmtNum(r.jumlah)]),
        foot: [['Total :', fmtNum(tot), sat.size === 1 ? [...sat][0] : '', fmtNum(totJ)]], showFoot: 'lastPage',
        styles: { font: 'helvetica', fontSize: 8.8, cellPadding: { top: 2, bottom: 2, left: 2.2, right: 2.2 }, textColor: C.ink, lineWidth: 0, overflow: 'linebreak' },
        headStyles: { fillColor: warna, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
        footStyles: { fillColor: C.band, textColor: C.ink, fontStyle: 'bold', fontSize: 9.2 },
        alternateRowStyles: { fillColor: C.zebra },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 24, halign: 'center' }, 3: { cellWidth: 38, halign: 'center', fontStyle: 'bold' } },
        didParseCell: d => { if (d.column.index >= 1) d.cell.styles.halign = 'center'; },
        didDrawCell: d => { if (d.section === 'body') { doc.setDrawColor(...C.line); doc.setLineWidth(0.15); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } }
      });
      y = doc.lastAutoTable.finalY + 8;
      return tot;
    };
    const tk = tabel('PRODUKSI KARJO', rk.karjo, [217, 119, 6]);
    const tw = tabel('PRODUKSI 3-WRT', rk.wrt, C.accent);
    ensure(14);
    doc.setFillColor(...C.accent); doc.roundedRect(W - MR - 78, y, 78, 11, 3, 3, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255).text('TOTAL ITEM :', W - MR - 72, y + 7.4);
    doc.text(fmtNum(tk + tw), W - MR - 5, y + 7.4, { align: 'right' });
  }

  // ── Nomor halaman x/y ──
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...C.muted).text(`${i}/${n}`, W - MR, H - 8, { align: 'right' }); }
  return doc;
}

/* ───────────────────────── INIT ───────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  $('#loginBtn').addEventListener('click', doLogin);
  ['loginEmail', 'loginPassword'].forEach(id => $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }));
  // Penting: jangan await panggilan Supabase di dalam callback ini (hindari deadlock) → pakai setTimeout
  sb.auth.onAuthStateChange((event, session) => { setTimeout(() => handleSession(session), 0); });
  const { data } = await sb.auth.getSession();
  if (!data.session) { await loadConfig(); showLogin(); }
});
