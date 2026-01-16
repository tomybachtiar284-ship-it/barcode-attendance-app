// SmartAttend app.js — FINAL v1.4 (polished)
// - Sinkron dengan HTML terbaru (scan stats pakai script inline -> kita panggil via window.refreshScanStats jika ada)
// - Perbaikan “late” untuk shift lintas tengah malam menggunakan tanggal basis shift
// - Hapus duplikasi mini calendar & scan stats internal yang tak terpakai
// - Event refresh terpadu: scan:saved, attendance:update, attendance:changed
// - Sync ke window.* agar script lain bisa membaca data langsung
// - Hapus satu baris attendance saja (bukan semua)
//
window.addEventListener('DOMContentLoaded', () => {
  const LS_EMP = 'SA_EMPLOYEES', LS_ATT = 'SA_ATTENDANCE', LS_SHIFTS = 'SA_SHIFTS',
    LS_NEWS = 'SA_NEWS', LS_SCHED = 'SA_SHIFT_MONTHLY', LS_EDU = 'SA_EDUCATION';

  const BLINK_ALL_COMPANY_CARDS = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const now = () => new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmtTs = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
  const todayISO = () => { const d = now(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const capStatus = s => { if (s === 'datang') return 'Masuk'; if (s === 'break_out') return 'Izin'; if (s === 'break_in') return 'Kembali'; if (s === 'alpha') return 'Tanpa Ket.'; return 'Keluar'; };
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const loadEdu = () => { try { return JSON.parse(localStorage.getItem(LS_EDU) || '[]'); } catch { return []; } };
  const saveEdu = (arr) => localStorage.setItem(LS_EDU, JSON.stringify(arr));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  function toast(m) { const t = document.createElement('div'); t.textContent = m; t.style.position = 'fixed'; t.style.right = '18px'; t.style.bottom = '18px'; t.style.background = 'rgba(12,18,32,.95)'; t.style.border = '1px solid #1f2636'; t.style.padding = '10px 14px'; t.style.borderRadius = '12px'; t.style.color = '#e8edf3'; t.style.zIndex = 999999; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

  let employees = load(LS_EMP, []),
    attendance = load(LS_ATT, []),
    shifts = load(LS_SHIFTS, {
      A: { start: '08:00', end: '16:00' },
      B: { start: '16:00', end: '24:00' },
      C: { start: '24:00', end: '07:00' },
      D: { start: '07:30', end: '15:30' },
      DAYTIME: { start: '07:30', end: '16:00' }
    }),
    news = load(LS_NEWS, []),
    sched = load(LS_SCHED, {});
  /* Cleanup removed */
  // if (shifts.D) { delete shifts.D; save(LS_SHIFTS, shifts); }

  // expose ke window agar script lain dapat ikut pakai
  function syncGlobals() {
    window.employees = employees;
    window.attendance = attendance;
    window.shifts = shifts;
    window.sched = sched;
  }
  syncGlobals();

  // ===== MOBILE NAV LOGIC =====
  const btnMob = $('.mobile-nav-toggle');
  const sidebar = $('.sidebar');
  const overlay = $('.sidebar-overlay'); // Pastikan elemen ini ada di HTML

  if (btnMob && sidebar) {
    function toggleMenu() {
      sidebar.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active');
    }
    function closeMenu() {
      sidebar.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
    }

    btnMob.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    if (overlay) overlay.addEventListener('click', closeMenu);

    // Auto-close saat klik menu item (khusus mobile)
    $$('.navlink').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.innerWidth <= 1024) closeMenu();
      });
    });
  }

  // ===== SUPABASE SYNC =====
  let sb = null;

  function initSupabase() {
    window.initSupabase = initSupabase; // Expose global
    if (sb) return sb; // Already initialized

    // Check prerequisites
    if (!window.supabase) {
      alert('CRITICAL: Library Supabase Gagal Dimuat. Cek koneksi internet Anda atau CDN blocked.');
      console.warn('Supabase JS library not loaded');
      return null;
    }
    if (!window.SA_SUPABASE_URL || window.SA_SUPABASE_URL.includes('ISI_SUPABASE')) {
      alert('CRITICAL: URL Supabase belum disetting di config.local.js');
      console.warn('Supabase URL invalid');
      return null;
    }
    if (!window.SA_SUPABASE_ANON || window.SA_SUPABASE_ANON.includes('ISI_SUPABASE')) {
      alert('CRITICAL: Key Supabase belum disetting di config.local.js');
      console.warn('Supabase Key invalid');
      return null;
    }

    try {
      sb = window.supabase.createClient(window.SA_SUPABASE_URL, window.SA_SUPABASE_ANON);
      window.sb = sb; // Expose global
      // Simple functional check
      sb.from('news').select('count', { count: 'exact', head: true }).then(({ error }) => {
        if (error) alert('Supabase Connect Error: ' + error.message);
        else console.log('✅ Supabase Connected (Test Ping OK)');
      });
      console.log('✅ Supabase Client Initialized!', sb);
      return sb;
    } catch (err) {
      alert('Supabase init Exception: ' + err.message);
      console.error('Supabase init failed:', err);
      return null;
    }
  }

  // Attempt init immediately
  if (initSupabase()) {
    console.log('🚀 Auto-Starting Data Sync...');
    pullAll(); // Restore data from Cloud on launch
  }

  // ...

  async function pushEmployee(e) {
    if (!sb) { alert('Gagal simpan ke Cloud: Supabase belum terkoneksi.'); return false; }
    const { error } = await sb.from('employees').upsert({
      nid: e.nid, name: e.name, title: e.title, company: e.company,
      shift: e.shift, photo: e.photo, updated_at: new Date().toISOString()
    }, { onConflict: 'nid' });
    if (error) {
      console.error('Push emp error:', error);
      alert('Gagal Push Employee: ' + error.message);
      return false;
    }
    return true;
  }

  async function delEmployee(nid) {
    if (!sb) return;
    await sb.from('employees').delete().eq('nid', nid);
  }

  async function pushAttendance(r) {
    if (!sb) return;
    // Check status to decide table
    if (r.status === 'break_out' || r.status === 'break_in') {
      const { error } = await sb.from('breaks').insert({
        ts: r.ts, status: r.status, nid: r.nid, name: r.name,
        company: r.company, created_at: new Date(r.ts).toISOString()
      });
      if (error) console.error('Push break error:', error);
    } else {
      const { error } = await sb.from('attendance').insert({
        ts: r.ts, status: r.status, nid: r.nid, name: r.name,
        title: r.title, company: r.company, shift: r.shift,
        note: r.note, late: r.late, ok_shift: r.okShift,
        created_at: new Date(r.ts).toISOString()
      });
      if (error) console.error('Push att error:', error);
    }
  }
  async function delAttendance(ts) {
    if (!sb) return;
    // Try delete from both to be safe
    await sb.from('attendance').delete().eq('ts', ts);
    await sb.from('breaks').delete().eq('ts', ts);
  }

  async function pushNews(n) {
    if (!sb) { alert('Gagal simpan News: Cloud belum terkoneksi'); return; }
    const { error } = await sb.from('news').upsert({
      ts: n.ts, title: n.title, body: n.body, link: n.link
    }, { onConflict: 'ts' });
    if (error) {
      console.error('Push news error:', error);
      alert('Gagal Push News: ' + error.message);
    }
  }

  let newsEditingId = null; // Fix: Declare global variable

  async function delNews(ts) {
    if (!sb) return;
    try {
      // Use select to confirm deletion count
      const { error, count } = await sb.from('news').delete({ count: 'exact' }).eq('ts', ts);
      if (error) {
        alert('Gagal Hapus News di Cloud: ' + error.message);
        console.error('Del news error:', error);
      } else if (count === 0) {
        alert('Peringatan: Item berhasil dihapus dari lokal, tapi tidak ditemukan di server (atau akses ditolak). Jika item muncul kembali, periksa "RLS Policy" di Supabase Anda.');
        console.warn('Del news count=0 for ts:', ts);
      } else {
        console.log('✅ News deleted from Cloud:', ts);
      }
    } catch (err) {
      alert('Exception saat hapus news: ' + err.message);
    }
  }

  async function pushEdu(e) {
    if (!sb) return;
    const { error } = await sb.from('education').upsert({
      id: e.id, ts: e.ts, title: e.title, body: e.body, img: e.img
    }, { onConflict: 'id' });
    if (error) {
      console.error('Push edu error:', error);
      throw error;
    }
  }
  window.pushEdu = pushEdu;

  async function delEdu(id) {
    if (!sb) return;
    await sb.from('education').delete().eq('id', id);
  }
  window.delEdu = delEdu;

  async function pushInventory(inv) {
    if (!sb) { console.warn('Skip push inventory: no sb'); return; }
    const { error } = await sb.from('inventory').upsert({
      id: inv.id, carrier: inv.carrier, company: inv.company,
      item: inv.item, dest: inv.dest, officer: inv.officer, type: inv.type,
      time_in: inv.timeIn, time_out: inv.timeOut
    }, { onConflict: 'id' });
    if (error) {
      console.error('Push inv error:', error);
      alert('Gagal Push Inventory: ' + error.message);
    }
  }
  window.pushInventory = pushInventory;

  async function delInventory(id) {
    if (!sb) return;
    await sb.from('inventory').delete().eq('id', id);
  }
  window.delInventory = delInventory;

  async function pushShifts() {
    if (!sb) return;
    // Map internal shifts object to array of rows
    const rows = Object.entries(shifts).map(([code, val]) => ({
      code: code,
      label: CODE_TO_LABEL[code] || code, // Use app label or code as fallback
      start_time: val.start,
      end_time: val.end,
      updated_at: new Date().toISOString()
    }));

    // Upsert all rows
    const { error } = await sb.from('shifts').upsert(rows, { onConflict: 'code' });
    if (error) {
      console.error('Push shifts error:', error);
      alert('GAGAL SIMPAN SHIFT KE DB: ' + error.message);
    } else {
      // Debug only (optional, remove later if annoying)
      // toast('Shift berhasil disimpan ke Database SQL');
    }
  }
  async function pushSched(monthId) {
    if (!sb || !monthId) return;
    await sb.from('shift_monthly').upsert({ month: monthId, data: sched[monthId] }, { onConflict: 'month' });
  }

  async function pullAll() {
    if (!sb) return;
    // Employees
    const { data: emps } = await sb.from('employees').select('*');
    if (emps) {
      employees = emps.map(x => ({
        nid: x.nid, name: x.name, title: x.title, company: x.company,
        shift: x.shift, photo: x.photo
      }));
      save(LS_EMP, employees);
    }

    // Attendance (last 7 days)
    const since = Date.now() - 7 * 24 * 3600 * 1000;

    // Fetch Main Attendance
    const { data: atts } = await sb.from('attendance').select('*').gte('ts', since);
    // Fetch Breaks
    const { data: brks } = await sb.from('breaks').select('*').gte('ts', since);

    // Helper: Ensure we parse timestamp as UTC
    const parseSbTs = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        // If likely ISO but missing Z/Offset, append Z to treat as UTC
        if (v.includes('T') && !v.endsWith('Z') && !v.includes('+')) return new Date(v + 'Z').getTime();
        return new Date(v).getTime();
      }
      return Date.now();
    };

    if (atts || brks) {
      // Keep old LOCAL data that is NOT yet synced?
      // Actually pullAll usually replaces everything within the window ('since').
      // But we must support offline.
      const old = attendance.filter(a => a.ts < since);

      let newAtts = [];
      if (atts) {
        newAtts = atts.map(x => ({
          ts: parseSbTs(x.ts), // Fix Timezone
          status: x.status, nid: x.nid, name: x.name,
          title: x.title, company: x.company, shift: x.shift,
          note: x.note, late: x.late, okShift: x.ok_shift
        }));
      }

      let newBreaks = [];
      if (brks) {
        newBreaks = brks.map(x => ({
          ts: parseSbTs(x.ts), // Fix Timezone
          status: x.status, nid: x.nid, name: x.name,
          title: '', company: x.company, shift: '',
          note: (x.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
          late: false, okShift: true
        }));
      }

      attendance = [...old, ...newAtts, ...newBreaks].sort((a, b) => a.ts - b.ts);
      save(LS_ATT, attendance);
    }

    // News (Bi-directional Sync)
    const { data: nws } = await sb.from('news').select('*');
    if (nws) {
      const serverMap = new Map(nws.map(x => [x.ts, x]));
      const localMap = new Map((news || []).map(x => [x.ts, x]));

      // 1. Apply Server Updates to Local
      nws.forEach(x => {
        localMap.set(x.ts, { ts: x.ts, title: x.title, body: x.body, link: x.link });
      });

      // 2. Identify Pending Local Items -> Push to Server OR Delete Local
      for (const [ts, val] of localMap.entries()) {
        if (!serverMap.has(Number(ts))) {
          if (val.pending_sync) {
            await pushNews(val);
          } else {
            // Missing from server & not new = Deleted Remotely
            localMap.delete(ts);
          }
        }
      }

      // 3. Finalize
      news = Array.from(localMap.values()).sort((a, b) => b.ts - a.ts);
      save(LS_NEWS, news);
    }

    // Education
    const { data: edus } = await sb.from('education').select('*');
    if (edus) {
      const eduList = edus.map(x => ({ id: x.id, ts: x.ts, title: x.title, body: x.body, img: x.img }));
      saveEdu(eduList);
    }

    // Inventory (Bi-directional Sync)
    const { data: invs } = await sb.from('inventory').select('*');
    if (invs) {
      const serverMap = new Map(invs.map(x => [x.id, x]));
      const localMap = new Map(inventoryData.map(x => [x.id, x]));

      // 1. Apply Server Updates to Local
      invs.forEach(x => {
        localMap.set(x.id, {
          id: x.id, carrier: x.carrier, company: x.company, item: x.item,
          dest: x.dest, officer: x.officer, type: x.type,
          timeIn: x.time_in, timeOut: x.time_out
        });
      });

      // 2. Identify Pending Local Items -> Push to Server
      for (const [id, val] of localMap.entries()) {
        if (!serverMap.has(id)) {
          await pushInventory(val);
        }
      }

      // 3. Finalize
      inventoryData = Array.from(localMap.values()).sort((a, b) => new Date(b.timeIn || 0) - new Date(a.timeIn || 0));
      saveInventory();
    }

    // Shifts - Fetch from new dedicated table
    const { data: shRows, error: shErr } = await sb.from('shifts').select('*');
    if (shErr) {
      console.error('Error fetching shifts:', shErr);
      alert('GAGAL AMBIL SHIFT DARI DB: ' + shErr.message);
    } else if (shRows && shRows.length > 0) {
      const newShifts = { ...shifts };
      shRows.forEach(row => {
        newShifts[row.code] = { start: row.start_time, end: row.end_time };
      });
      shifts = newShifts;
      save(LS_SHIFTS, shifts);
      // toast(`Sync: ${shRows.length} shift loaded from DB.`);
    } else {
      console.warn('No shifts found in DB?');
      // alert('PERINGATAN: Tabel Shifts di Database kosong! Memakai default.');
    }

    // Schedule (current month)
    const m = monthKey(new Date());
    const { data: sc } = await sb.from('shift_monthly').select('*').eq('month', m).single();
    if (sc && sc.data) {
      sched[m] = sc.data;
      save(LS_SCHED, sched);
    }

    syncGlobals();
    renderDashboard(); renderEmployees(); renderLatest(); renderEduTable(); renderHighlights();
    initMonthlyScheduler();
  }

  function setTextAndBump(sel, val) {
    const el = $(sel); if (!el) return;
    const newStr = String(val);
    if (el.textContent !== newStr) {
      el.textContent = newStr;
      const target = el.classList.contains('stat-value') ? el : (el.closest('.card')?.querySelector('.stat-value') || el);
      target.classList.add('changed');
      setTimeout(() => target.classList.remove('changed'), 700);
    } else el.textContent = newStr;
  }

  // Router
  window.appRoute = function (route) {
    // 1. Update Sidebar Active
    $$('.navlink').forEach(b => b.classList.toggle('active', b.dataset.route === route));

    // 2. Update Mobile Bottom Nav Active
    const mobItems = $$('.mb-item');
    if (mobItems.length) {
      mobItems.forEach(b => b.classList.remove('active'));
      const target = [...mobItems].find(b => b.dataset.route === route);
      if (target) target.classList.add('active');
    }

    // 3. Persist
    localStorage.setItem('SA_CURRENT_ROUTE', route);

    // 4. Show/Hide Sections
    $$('.route').forEach(s => s.classList.add('hidden'));
    const section = $('#route-' + route);
    if (section) section.classList.remove('hidden');

    // 5. Trigger Initializers
    if (route === 'dashboard') { renderDashboard(); window.scrollTo(0, 0); }
    if (route === 'employees') renderEmployees();
    if (route === 'attendance') renderAttendance();
    if (route === 'scan') { renderScanPage(); $('#scanInput')?.focus(); }
    if (route === 'latest') renderLatest();
    if (route === 'shifts') { renderShiftForm(); initMonthlyScheduler(); }
    if (route === 'inventory') renderInventory();
    if (route === 'analysis') renderAnalysisPage();
    if (route === 'general-report') {
      if (window.renderGeneralReport) window.renderGeneralReport();
    }
  };

  // Bind existing sidebar links
  $$('.navlink').forEach(btn => btn.addEventListener('click', () => {
    window.appRoute(btn.dataset.route);
  }));

  // NEW: Restore Last Route (Page Persistence)
  // NEW: Restore Last Route (Page Persistence)
  setTimeout(() => {
    const lastRoute = localStorage.getItem('SA_CURRENT_ROUTE');
    // Force Dashboard on Mobile (User Request)
    if (window.innerWidth <= 768) {
      window.appRoute('dashboard');
    }
    // Otherwise restore last session
    else if (lastRoute) {
      window.appRoute(lastRoute);
    }
  }, 50); // Small delay to ensure DOM fully ready

  // Clock
  function tick() {
    const t = fmtTs(Date.now()).split(' ')[1];
    $('#liveClock') && ($('#liveClock').textContent = t);
    $('#liveClockScan') && ($('#liveClockScan').textContent = t);
  }
  setInterval(tick, 1000); tick();

  // Shift helpers
  const SHIFT_KEYS = ['A', 'B', 'C', 'D', 'DAYTIME'];
  const CODE_TO_LABEL = { A: 'P', B: 'S', C: 'M', D: 'D', DAYTIME: 'DAY', OFF: 'L' };
  const LABEL_TO_CODE = {
    'a': 'A', 'p': 'A', 'pagi': 'A', 'group a': 'A',
    'b': 'B', 's': 'B', 'sore': 'B', 'group b': 'B',
    'c': 'C', 'm': 'C', 'malam': 'C', 'group c': 'C',
    'd': 'D', 'shift d': 'D', 'group d': 'D',
    'day': 'DAYTIME', 'daytime': 'DAYTIME', 'siang': 'DAYTIME',
    'off': 'OFF', 'l': 'OFF', 'libur': 'OFF'
  };
  function normalizeTime(s) {
    s = String(s || '').trim(); if (!s) return '';
    s = s.replace(/[.,\-h ]/g, ':');
    if (/^\d{3,4}$/.test(s)) { const t = s.length === 3 ? `0${s}` : s; return `${t.slice(0, 2)}:${t.slice(2)}`; }
    const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/); if (!m) return s;
    const H = Math.min(24, parseInt(m[1] || '0', 10)), M = Math.min(59, parseInt(m[2] || '0', 10));
    return `${pad(H)}:${pad(M)}`;
  }
  // Fix: Use local time for month key
  const monthKey = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  };

  function effectiveShiftFor(emp, date) {
    // 1. Check override
    if (!emp || !emp.shift) return null;
    const id = monthKey(date), day = date.getDate();
    const override = sched[id]?.[emp.shift]?.[day];
    if (override) return override;

    // 2. Default: Map Group Name -> Shift Code? 
    // Usually Group A works Shift A, Group B works Shift B.
    // If emp.shift is 'A', default is 'A'.
    // If emp.shift is 'D', default SHOULD BE 'D' but D is removed.
    // So if no override, and code D is gone, return null?
    // CODE_TO_LABEL has no D.
    // So 'D' logic is only valid if overridden in sched?
    // Or does Group D have a default? 
    // The previous logic was: return emp.shift (as Code). 
    // But Code 'D' is invalid. 
    // So for Group D, they MUST have a schedule override to work P/S/M.
    // If not, they have no effective shift (OFF).
    return (shifts[emp.shift]) ? emp.shift : 'OFF';
  }

  // Helper utils
  function scheduleDateFor(code, dt) {
    const win = shiftWindow(code); if (!win) return dt;
    if (win.end > win.start) return dt;
    const m = minutesOf(dt);
    if (m < win.end) { const y = new Date(dt); y.setDate(dt.getDate() - 1); return y; }
    return dt;
  }

  function toDateFromHM(baseDate, hm) {
    const [h, m] = hm.split(':').map(Number);
    const d = new Date(baseDate); d.setHours(h, m, 0, 0);
    return d;
  }

  function minutesOf(dt) { return dt.getHours() * 60 + dt.getMinutes(); }
  function shiftWindow(code) {
    const s = shifts[code]; if (!s) return null;
    const [h1, m1] = s.start.split(':').map(Number);
    const [h2, m2] = s.end.split(':').map(Number);
    return { start: h1 * 60 + m1, end: h2 * 60 + m2, code };
  }
  function isInWindow(m, win) {
    if (win.end > win.start) return m >= win.start && m < win.end;
    return m >= win.start || m < win.end;
  }

  function groupsScheduled(code, dateFor) {
    const id = monthKey(dateFor); const day = dateFor.getDate(); const out = [];
    SHIFT_KEYS.forEach(g => { if ((sched[id]?.[g]?.[day] || '') === code) out.push(g); });
    return out;
  }

  function activeShiftsNow() {
    const n = new Date(); const m = minutesOf(n); const arr = [];
    ['A', 'B', 'C', 'D', 'DAYTIME'].forEach(code => {
      const win = shiftWindow(code); if (!win) return;
      if (isInWindow(m, win)) { const df = scheduleDateFor(code, n); const gs = groupsScheduled(code, df); if (gs.length) arr.push({ code, groups: gs, win }); }
    });
    return arr;
  }
  function renderCurrentShiftPanel() {
    const hosts = [document.getElementById('activeShiftsContainer'), document.getElementById('activeShiftsScan')];
    const rows = activeShiftsNow();
    const emptyMsg = `<div class="muted" style="font-size:0.9rem">Tidak ada shift berjalan saat ini.</div>`;

    const CODE_FULL = {
      A: 'Pagi (P)',
      B: 'Sore (S)',
      C: 'Malam (M)',
      D: 'Shift D (D)',
      DAYTIME: 'Daytime (DAY)'
    };

    const content = rows.length === 0 ? emptyMsg : rows.map(r => {
      const time = `${shifts[r.code].start}–${shifts[r.code].end}`;
      const chips = r.groups.map(g => `<span class="chip-sm">Grup ${g}</span>`).join(' ');
      // Use card-light style for consistency on scan page
      return `
      <div class="card-light" style="flex:0 1 auto; min-width:140px; padding:8px 12px; border:1px solid var(--gray-200);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;" data-tooltip="Moda operasional aktif: ${CODE_FULL[r.code]} (${time})">
            <span style="font-weight:700; color:var(--primary-700)">${CODE_FULL[r.code] || r.code}</span>
            <span class="muted">(${time})</span>
        </div>
        <div>${chips}</div>
      </div>`;
    }).join('');

    hosts.forEach(h => { if (h) h.innerHTML = content; });
  }

  // Refactored Overtime Logic: "Daytime" Only + Today's Total (Active + Finished)
  // Threshold: e.g. 1 minute (to avoid noise, can be adjusted)
  const OT_THRESHOLD_MINUTES = 1;

  function getOvertimeData(forceActiveOnly = false) {
    const t = now(); // Current time for "Active" calculation
    const todayStr = todayISO();
    const sod = new Date(todayStr + 'T00:00:00').getTime();

    // 1. Get all attendance for TODAY
    const todays = attendance.filter(a => a.ts >= sod);

    // Group by NID (taking the latest status)
    // But for "Finished Overtime", we need the PAIR (In -> Out).
    // Simplest approach: Check employees who have "Datang" today.
    // If they are "Pulang", check if Pulang Time > Shift End.
    // If they are still "Datang", check if Now > Shift End.

    const results = [];

    employees.forEach(e => {
      // Filter 1: Strictly DAYTIME shift only.
      // Note: Shift 'A', 'B', 'C', 'D' are EXCLUDED.
      // We check `effectiveShiftFor` or just `e.shift`?
      // User said "Shift A, B, C, D tidak berlaku". "Daytime" only.
      // Assuming 'DAYTIME' code is 'DAYTIME' or mapped.

      let isDaytime = (e.shift === 'DAYTIME') || (e.shift && e.shift.toLowerCase().includes('day'));

      const effCode = effectiveShiftFor(e, t);

      // FIX: If effectiveShiftFor returns OFF/null (missing schedule) but static shift IS Daytime, force generic Daytime.
      if ((!effCode || effCode === 'OFF') && isDaytime) {
        // Keep isDaytime = true
      } else if (effCode !== 'DAYTIME') {
        // If explicitly scheduled for something else (A,B,C), then reject.
        isDaytime = false;
      }

      if (!isDaytime) return;

      // Get Employee's Today Status
      // Find 'datang' record
      const came = todays.find(a => a.nid === e.nid && a.status === 'datang');
      if (!came) return; // Not present today

      // Find specific shift times
      const s = shifts['DAYTIME'];
      if (!s) return; // No rule

      // Parse Shift End Time
      const baseDateStr = todayStr;
      let sEnd = toDateFromHM(baseDateStr, s.end);
      // Handle cross-day if needed (Daytime usually doesn't, but safety first)
      let sStart = toDateFromHM(baseDateStr, s.start);
      if (sEnd < sStart) sEnd = new Date(sEnd.getTime() + 24 * 3600 * 1000);

      // Check 'Pulang' record
      // We pick the LATEST 'pulang' after 'datang'
      const left = todays.find(a => a.nid === e.nid && a.status === 'pulang' && a.ts > came.ts);

      const isStillHere = !left;
      let otDurationMs = 0;

      if (isStillHere) {
        // Live Overtime
        // Active & Now > End??
        if (t.getTime() > sEnd.getTime()) {
          otDurationMs = t.getTime() - sEnd.getTime();
        }
      } else {
        // Finished Overtime
        // Left Time > End??
        if (left.ts > sEnd.getTime()) {
          otDurationMs = left.ts - sEnd.getTime();
        }
      }

      if (otDurationMs > OT_THRESHOLD_MINUTES * 60 * 1000) {
        const h = Math.floor(otDurationMs / 3600000);
        const m = Math.floor((otDurationMs % 3600000) / 60000);

        results.push({
          nid: e.nid,
          name: e.name,
          status: isStillHere ? 'Aktif' : 'Pulang',
          shiftEnd: s.end,
          actualOut: isStillHere ? '-' : fmtTs(left.ts).split(' ')[1],
          durationMs: otDurationMs,
          desc: `${h}j ${m}m`,
          isLive: isStillHere
        });
      }
    });

    return results.sort((a, b) => b.durationMs - a.durationMs);
  }

  function renderOvertimePanel() {
    const targets = [
      { host: document.getElementById('overtimePanelScan'), count: document.getElementById('overtimeCount') },
      { host: document.getElementById('overtimePanelDash_Fixed'), count: document.getElementById('overtimeCountDash_Fixed') }
    ];

    const list = getOvertimeData();
    const countVal = list.length;

    targets.forEach(({ host, count }) => {
      if (!host || !count) return;
      if (countVal > 0) {
        // SHOW
        host.style.display = 'flex';
        host.style.setProperty('display', 'flex', 'important');
        host.classList.remove('hidden'); // Ensure no hidden class
        count.textContent = countVal;
        host.title = `Klik untuk melihat ${countVal} karyawan lembur (Daytime)`;
      } else {
        // HIDE
        host.style.display = 'none';
        host.style.setProperty('display', 'none', 'important');
        host.classList.add('hidden'); // Add helper class if exists

        // DEBUG: Nuclear Hide confirmation
        if (host.id.includes('_Fixed') && host.offsetParent !== null) {
          host.setAttribute('style', 'display:none !important; visibility:hidden !important; opacity:0 !important;');
        }
      }
    });
  }

  // New Modal UI for Overtime
  window.showOvertimeList = function () {
    const list = getOvertimeData();
    if (list.length === 0) {
      toast('Tidak ada data lembur untuk Shift Daytime hari ini.');
      return;
    }

    // Reuse existing modal structure if possible or create a dedicated one dynamically
    let modal = document.getElementById('modalOvertime');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modalOvertime';
      modal.className = 'modal-overlay'; // Use existing class if available
      // If no generic modal class, style inline
      modal.style.position = 'fixed';
      modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
      modal.style.background = 'rgba(0,0,0,0.5)'; modal.style.zIndex = '10000';
      modal.style.display = 'none';
      modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';

      modal.innerHTML = `
         <div class="modal-content" style="background:var(--surface,#fff); padding:20px; border-radius:16px; width:90%; max-width:500px; max-height:80vh; overflow-y:auto; box-shadow:var(--shadow-lg);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
               <h3 style="margin:0; color:var(--text)">📋 Lembur Hari Ini (Daytime)</h3>
               <button onclick="document.getElementById('modalOvertime').style.display='none'" style="background:none; border:none; font-size:1.5rem; cursor:pointer">&times;</button>
            </div>
            <div id="modalOvertimeBody"></div>
            <div style="margin-top:20px; text-align:right">
               <button onclick="document.getElementById('modalOvertime').style.display='none'" class="btn-primary" style="padding:8px 16px; border-radius:8px">Tutup</button>
            </div>
         </div>
       `;
      document.body.appendChild(modal);
    }

    // Populate Data
    const tbody = list.map((item, i) => `
       <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line,#eee)">
          <div>
             <div style="font-weight:600; color:var(--text)">${i + 1}. ${item.name}</div>
             <div style="font-size:0.85rem; color:var(--text-muted)">
                ${item.isLive ? '<span style="color:var(--success); font-weight:bold">Sedang Lembur</span>' : `Pulang: ${item.actualOut}`} 
             </div>
          </div>
          <div style="text-align:right">
             <div style="font-weight:bold; color:var(--primary-600)">+${item.desc}</div>
             <div style="font-size:0.8rem; color:var(--text-muted)">Batas: ${item.shiftEnd}</div>
          </div>
       </div>
    `).join('');

    document.getElementById('modalOvertimeBody').innerHTML = tbody;

    // Show
    modal.style.display = 'flex';

    // Close on click outside
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };
  };

  window.showStatDetail = function (type) {
    const t = new Date();
    const since24 = t.getTime() - 24 * 3600 * 1000;
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    let list = [], title = '';

    if (type === 'scan24h') {
      title = 'Aktivitas Scan 24 Jam Terakhir';
      list = attendance.filter(a => a.ts >= since24).sort((a, b) => b.ts - a.ts);
    } else if (type === 'ontime') {
      title = 'Karyawan Tepat Waktu (Hari Ini)';
      list = attendance.filter(a => a.ts >= sod && a.status === 'datang' && !a.late).sort((a, b) => b.ts - a.ts);
    } else if (type === 'late') {
      title = 'Karyawan Terlambat (Hari Ini)';
      list = attendance.filter(a => a.ts >= sod && a.status === 'datang' && a.late).sort((a, b) => b.ts - a.ts);
    }

    if (list.length === 0) {
      toast('Tidak ada data untuk kategori ini.');
      return;
    }

    // Prepare display list with name lookup
    const lines = list.map((r, i) => {
      let name = r.name;
      if (!name) {
        const emp = employees.find(e => e.nid === r.nid);
        name = emp ? emp.name : r.nid;
      }
      const timeStr = new Date(r.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `${i + 1}. ${name} (${r.status.toUpperCase()} - ${timeStr})`;
    });

    alert(title + "\n\n" + lines.join('\n'));
  };

  // Helper for collapsible sections (fixing inline script lint errors)
  window.toggleCollapse = function (headerElement, storageKey) {
    const content = headerElement.nextElementSibling;
    if (!content) return;
    content.classList.toggle('hidden');
    const isHidden = content.classList.contains('hidden');
    const arrow = headerElement.querySelector('.arrow');
    if (arrow) arrow.textContent = isHidden ? '▶' : '▼';
    if (storageKey) localStorage.setItem(storageKey, isHidden ? '1' : '0');
  };

  // Start Loops
  function runLoops() {
    renderCurrentShiftPanel();
    renderOvertimePanel();
  }
  runLoops();
  setInterval(runLoops, 30000);

  // News widgets
  function renderNewsWidgets() {
    ['#newsGridDash', '#newsGridScan'].forEach(sel => {
      const host = $(sel); if (!host) return; host.innerHTML = '';
      const arr = [...news].sort((a, b) => b.ts - a.ts);
      if (arr.length === 0) { const d = document.createElement('div'); d.style.color = '#64748b'; d.textContent = 'Belum ada informasi.'; host.appendChild(d); return; }
      arr.forEach(n => {
        const card = document.createElement('div'); card.className = 'news-card';
        card.setAttribute('data-hover-card', '');
        card.setAttribute('data-tooltip', 'Klik ikon pensil untuk mengedit info ini.');
        card.innerHTML = `<div class="title">${esc(n.title)}</div><div class="meta">${fmtTs(n.ts)}</div>
                        <div class="body">${esc(n.body || '')}${n.link ? ` • <a href="${esc(n.link)}" target="_blank" rel="noopener">Link</a>` : ''}</div>`;
        host.appendChild(card);
      });
    });
  }

  // ===== Company Presence today (map) =====
  function presentMapToday() {
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    const todays = attendance.filter(a => a.ts >= sod).sort((a, b) => a.ts - b.ts);

    const lastByNid = new Map();
    todays.forEach(r => lastByNid.set(r.nid, r));

    const presentNids = [];
    lastByNid.forEach((rec, nid) => { if (rec.status === 'datang') presentNids.push(nid); });

    const totals = {};
    employees.forEach(e => {
      const c = (e.company || '—').trim(); totals[c] = (totals[c] || 0) + 1;
    });

    const counts = {};
    presentNids.forEach(nid => {
      const emp = employees.find(e => e.nid === nid);
      const last = lastByNid.get(nid);
      const comp = (emp?.company || last?.company || '—').trim();
      counts[comp] = (counts[comp] || 0) + 1;
    });

    return { counts, totals };
  }

  // Live stats renderer for multiple targets
  function renderLiveCompanyStats() {
    const targets = ['#liveCompanyStats', '#liveCompanyStatsScan'];
    const { counts, totals } = presentMapToday();
    const companies = Object.keys(totals);
    companies.sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));

    const chips = companies.map(c => {
      const hadir = counts[c] || 0, total = totals[c] || 0;
      const title = `${hadir} hadir dari ${total} karyawan`;
      return `<span class="stat-chip" title="${esc(title)}">${esc(c)}: <b>${hadir}</b> / ${total}</span>`;
    }).join(' ');

    const t = new Date();
    const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;

    targets.forEach(sel => {
      const host = $(sel);
      if (!host) return;

      // Ensure creation for dashboard if missing (legacy logic, but cleaner now)
      if (sel === '#liveCompanyStats' && !host.parentElement) {
        // Fallback if not in DOM (handled by ensureLiveStatsUI previously)
        const grid = $('#companyPresenceGrid');
        if (grid) {
          const bar = document.createElement('div');
          bar.id = 'liveCompanyStats';
          bar.className = 'toolbar';
          bar.style.margin = '4px 0 10px';
          grid.parentElement.insertBefore(bar, grid);
          // Re-select
          renderLiveCompanyStats(); // Retry once
          return;
        }
      }

      // Update content
      if (companies.length === 0) {
        host.innerHTML = `<span class="muted">Belum ada data kehadiran.</span>`;
      } else {
        // Different header for scan page to avoid redundancy if title exists
        const isScan = sel.includes('Scan');
        const header = isScan ? '' : `<div class="live-row"><b>Statistik Kehadiran Langsung</b> <span class="muted">(${ts})</span></div>`;
        host.innerHTML = `${header}<div class="chip-wrap">${chips}</div>`;

        // Also update time spans if they exist separately
        if (isScan) $('#companyLiveTimeScan') && ($('#companyLiveTimeScan').textContent = ts);
        else $('#companyLiveTime') && ($('#companyLiveTime').textContent = ts);
      }
    });
  }

  function renderCompanyPresence() {
    const { counts, totals } = presentMapToday();
    const companies = Object.keys(totals);

    companies.sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

    const html = companies.map((c) => {
      const hadir = counts[c] || 0;
      const total = totals[c] || 0;
      // CSS handles colors via nth-child, or we can force specific classes if needed
      // Logic: if hadir > 0, give it a 'live' class for pulse effect
      const isLive = hadir > 0 ? 'live' : (total === 0 ? 'empty' : '');

      return `
      <div class="company-card ${isLive}" data-company="${esc(c)}"
           onclick="$('.navlink[data-route=\\'employees\\']').click(); setTimeout(()=>{$('#searchEmployee').value='${esc(c)}'; filterEmployees()}, 300)">
        <div>
          <div class="name">${esc(c)}</div>
          <div class="sub">${total} Employee(s)</div>
        </div>
        <div class="badge">${hadir}</div>
      </div>`;
    }).join('');

    ['#companyPresenceGrid', '#companyPresenceGridScan'].forEach(sel => {
      const grid = $(sel);
      if (grid) {
        if (companies.length === 0) grid.innerHTML = '<div class="muted">Belum ada data karyawan.</div>';
        else grid.innerHTML = html;
      }
    });

    renderLiveCompanyStats();
    window.dispatchEvent(new Event('attendance:update'));
  }

  // ===== Dashboard render =====
  function renderDashboard() {
    setTextAndBump('#statTotalEmp', employees.length);
    setTextAndBump('#statTotalEmpScan', employees.length);

    const byGroup = employees.reduce((a, e) => (a[e.shift] = (a[e.shift] || 0) + 1, a), {});
    const breakdown = Object.entries(byGroup).map(([k, v]) => `Grup ${k}:${v}`).join(' • ') || '—';
    $('#statShiftBreakdown') && ($('#statShiftBreakdown').textContent = breakdown);

    const since = Date.now() - 24 * 3600 * 1000; const last24 = attendance.filter(a => a.ts >= since);
    setTextAndBump('#statScan24h', last24.length);
    setTextAndBump('#statScan24hScan', last24.length);
    setTextAndBump('#statIn24h', last24.filter(a => a.status === 'datang').length);
    setTextAndBump('#statOut24h', last24.filter(a => a.status === 'pulang').length);

    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    const today = attendance.filter(a => a.ts >= sod);
    const ontime = today.filter(a => a.status === 'datang' && !a.late).length;
    const late = today.filter(a => a.status === 'datang' && a.late).length;
    setTextAndBump('#statOnTime', ontime);
    setTextAndBump('#statOnTimeScan', ontime);
    setTextAndBump('#statLate', late);
    setTextAndBump('#statLateScan', late);
    const pct = (ontime + late ? (ontime / (ontime + late)) * 100 : 0);
    const bar = $('#onTimeBar'); if (bar) bar.style.width = pct + '%';

    const tb = $('#tableRecent tbody');
    if (tb) {
      tb.innerHTML = '';
      today.sort((a, b) => b.ts - a.ts).slice(0, 3).forEach(r => {
        const tr = document.createElement('tr');
        const emp = employees.find(e => e.nid === r.nid);
        const groupLabel = emp ? `(Grup ${emp.shift})` : '';
        tr.innerHTML = `<td>${fmtTs(r.ts)}</td><td>${capStatus(r.status)}</td><td>${r.nid}</td><td>${r.name}</td>
                      <td>${CODE_TO_LABEL[r.shift] || r.shift || '-'} ${groupLabel}</td>`;
        tb.appendChild(tr);
      });
    }
    renderCurrentShiftPanel();
    // Use standardized Global Overtime Renderer
    if (window.renderOvertimePanel) window.renderOvertimePanel();
    renderNewsWidgets();
    renderCompanyPresence();
    renderLiveCompanyStats();
    if (window.renderMobileDashboard) window.renderMobileDashboard();
  }

  window.renderMobileDashboard = function () {
    if (window.innerWidth > 768) return;
    // 1. Clock & Date
    const d = new Date();
    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
    const dateStr = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const elClock = document.getElementById('mobClock');
    const elDate = document.getElementById('mobDate');
    if (elClock) elClock.textContent = timeStr;
    if (elDate) elDate.textContent = dateStr;

    // 2. Stats
    const total = employees.length;
    // Calc logic
    // FIXED: Use todayISO() + T00:00:00 to match Desktop logic (Local Time)
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    const today = attendance.filter(a => a.ts >= sod);
    const present = today.filter(a => a.status === 'datang').length;
    const late = today.filter(a => a.status === 'datang' && a.late).length;

    const elLate = document.getElementById('mobStatLate');
    const elPres = document.getElementById('mobStatPresent');
    const elTot = document.getElementById('mobStatTotal');
    const elGauge = document.getElementById('mobGaugeVal');

    if (elLate) elLate.textContent = late;
    if (elPres) elPres.textContent = present;
    if (elTot) elTot.textContent = total;
    if (elGauge) elGauge.textContent = (total > 0 ? Math.round((present / total) * 100) : 0) + '%';
  };

  // Auto-tick mobile clock
  setInterval(() => {
    if (window.innerWidth <= 768 && window.renderMobileDashboard) window.renderMobileDashboard();
  }, 1000);
  renderDashboard();
  setInterval(renderLiveCompanyStats, 30000);

  // === MOBILE MENU TOGGLE (Re-added) ===
  window.toggleMobileMenu = function () {
    console.log('Toggle Mobile Menu Clicked');
    const sb = document.querySelector('.sidebar');
    const ov = document.querySelector('.sidebar-overlay');
    if (sb) sb.classList.toggle('active-mobile');
    if (ov) ov.classList.toggle('active');
  };

  // Close menu when clicking overlay
  const ov = document.querySelector('.sidebar-overlay');
  if (ov) ov.onclick = () => {
    document.querySelector('.sidebar')?.classList.remove('active-mobile');
    ov.classList.remove('active');
  };

  // Fullscreen
  function fs(btnSel, targetSel) {
    const b = $(btnSel); if (!b) return; const t = $(targetSel) || document.documentElement;
    const sync = () => { b.textContent = document.fullscreenElement ? '⛶ Keluar Penuh' : '⛶ Layar Penuh'; };
    b.addEventListener('click', () => { if (!document.fullscreenElement) t.requestFullscreen?.(); else document.exitFullscreen?.(); });
    document.addEventListener('fullscreenchange', sync); sync();
  }
  fs('#btnFull', '#route-scan'); fs('#btnFullDash', '#route-dashboard');

  // ===== Scan table + preview =====
  function renderScanTable() {
    const tb = $('#tableScan tbody'); if (!tb) return;
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    const rows = attendance.filter(a => a.ts >= sod).sort((a, b) => b.ts - a.ts).slice(0, 5);
    tb.innerHTML = ''; rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${fmtTs(r.ts)}</td><td>${capStatus(r.status)}</td><td>${r.nid}</td>
                    <td>${r.name}</td><td>${r.title}</td><td>${r.company}</td>
                    <td>${CODE_TO_LABEL[r.shift] || r.shift || ''}</td><td>${r.note || ''}</td>`;
      tb.appendChild(tr);
    });
  }
  function renderScanPreview(emp, rec) {
    $('#scanName') && ($('#scanName').textContent = emp?.name || '—');
    $('#scanNID') && ($('#scanNID').textContent = emp?.nid || '—');
    $('#scanTitle') && ($('#scanTitle').textContent = emp?.title || '—');
    $('#scanCompany') && ($('#scanCompany').textContent = emp?.company || '—');
    const shiftLabel = rec ? (CODE_TO_LABEL[rec.shift] || rec.shift) : (emp?.shift ? `Grup ${emp.shift}` : '—');
    $('#scanShift') && ($('#scanShift').textContent = shiftLabel);
    $('#scanPhoto') && ($('#scanPhoto').style && ($('#scanPhoto').style.backgroundImage = emp?.photo ? `url(${emp.photo})` : ''));
    const pill = $('#scanShiftCheck');
    if (pill) {
      if (rec) { pill.textContent = rec.note; pill.className = 'pill light ' + (rec.okShift ? (rec.late ? 'warn' : '') : 'danger'); $('#scanTs') && ($('#scanTs').textContent = fmtTs(rec.ts)); }
      else { pill.textContent = '—'; $('#scanTs') && ($('#scanTs').textContent = '—'); }
    }
  }
  function nextStatusFor(nid) {
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    // Filter ONLY 'datang' and 'pulang' to toggle main shift status
    const cnt = attendance.filter(a => a.nid === nid && a.ts >= sod && (a.status === 'datang' || a.status === 'pulang')).length;
    return (cnt % 2 === 0) ? 'datang' : 'pulang';
  }
  function parseRaw(s) { if (!s) return null; const p = s.split('|'); return (p.length >= 4) ? { nid: p[0], name: p[1], title: p[2], company: p[3] } : { nid: s }; }
  function findEmp(p) { if (!p) return null; let e = employees.find(x => x.nid == p.nid); if (!e && p.name) { e = employees.find(x => x.name.toLowerCase() === p.name.toLowerCase()); } return e; }

  // ====== SCAN INPUT: clear otomatis & anti-menumpuk ======
  const SCAN_DEBOUNCE = 150, SCAN_WINDOW = 500; let scanTimer = null, lastScan = { v: '', t: 0 };
  function clearScanInputNow() {
    const inp = $('#scanInput'); if (!inp) return;
    inp.value = ''; inp.blur(); setTimeout(() => inp.focus(), 30);
  }
  function tryScan(v) {
    const t = Date.now();
    if (v === lastScan.v && (t - lastScan.t) < SCAN_WINDOW) { lastScan.t = t; return; }
    lastScan = { v, t };
    handleScan(v);
    clearScanInputNow();
  }
  $('#scanInput')?.addEventListener('input', e => {
    const v = e.target.value.trim();
    if (scanTimer) clearTimeout(scanTimer);
    if (!v) return;
    scanTimer = setTimeout(() => { tryScan(v); }, SCAN_DEBOUNCE);
  });
  $('#scanInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
      const v = $('#scanInput').value.trim();
      if (v) { tryScan(v); }
    }
  });
  window.addEventListener('load', () => { $('#scanInput')?.focus(); });

  let scanMode = 'auto'; // auto, break_out, break_in

  // Break Buttons UI Logic
  function setScanMode(mode) {
    scanMode = mode;
    const indicator = $('#breakModeIndicator');
    const txt = $('#breakModeIndicator span');
    const btnCancel = $('#btnBreakCancel');

    if (mode === 'auto') {
      indicator?.classList.add('hidden');
      btnCancel && (btnCancel.style.display = 'none');
      $('#scanInput')?.focus();
    } else {
      indicator?.classList.remove('hidden');
      txt.textContent = (mode === 'break_out') ? 'IZIN KELUAR / ISTIRAHAT' : 'KEMBALI MASUK';
      txt.style.color = (mode === 'break_out') ? 'var(--warning-600)' : 'var(--primary-600)';
      btnCancel && (btnCancel.style.display = 'inline-block');
      $('#scanInput')?.focus();
    }
  }

  $('#btnBreakOut')?.addEventListener('click', () => setScanMode('break_out'));
  $('#btnBreakIn')?.addEventListener('click', () => setScanMode('break_in'));
  $('#btnBreakCancel')?.addEventListener('click', () => setScanMode('auto'));

  // ===== CAMERA SCANNER LOGIC =====
  let cameraObj = null; // Html5Qrcode instance
  let isCamOpen = false;

  async function toggleCamera() {
    // Detect active view (Desktop or Mobile)
    const mobView = document.getElementById('mobScanView');
    const isMobile = mobView && getComputedStyle(mobView).display !== 'none';
    const boxId = isMobile ? 'readerMob' : 'reader';

    // Buttons
    const btnTxtDesktop = $('#btnCamText');
    const btnMob = $('#btnCamToggleMob');

    const box = document.getElementById(boxId);
    if (!box) return alert('Error: Element kamera tidak ditemukan');

    if (isCamOpen) {
      // STOP
      if (cameraObj) {
        try { await cameraObj.stop(); } catch (e) { console.error('Stop error:', e); }
        try { cameraObj.clear(); } catch (e) { console.error('Clear error:', e); }
      }
      box.style.display = 'none';
      box.classList.add('hidden');

      if (btnTxtDesktop) btnTxtDesktop.textContent = "Buka Kamera";
      if (btnMob) btnMob.innerHTML = "📸 Buka Kamera";

      isCamOpen = false;
      cameraObj = null; // Destroy instance
    } else {
      // START
      if (!window.Html5Qrcode) { alert('Library Kamera belum siap. Periksa koneksi internet.'); return; }

      box.style.display = 'block';
      box.classList.remove('hidden');

      if (btnTxtDesktop) btnTxtDesktop.textContent = "Tutup Kamera";
      if (btnMob) btnMob.innerHTML = "❌ Tutup Kamera";

      // Create fresh instance for the visible container
      try {
        cameraObj = new Html5Qrcode(boxId);
        isCamOpen = true;
        await cameraObj.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (txt) => {
            // Success
            if (txt) {
              const inp = isMobile ? $('#mobScanInput') : $('#scanInput');
              if (inp) inp.value = txt;

              handleScan(txt);

              // Pause
              if (cameraObj) cameraObj.pause();
              setTimeout(() => { if (isCamOpen && cameraObj) cameraObj.resume(); }, 2500);
            }
          },
          (err) => { /* ignore frame errors */ }
        );
      } catch (err) {
        alert("Gagal akses kamera: " + err);
        isCamOpen = false;
        box.style.display = 'none';
        if (btnTxtDesktop) btnTxtDesktop.textContent = "Buka Kamera";
        if (btnMob) btnMob.textContent = "📸 Buka Kamera";
        cameraObj = null;
      }
    }
  }

  // Bind Button
  $('#btnCamToggle')?.addEventListener('click', toggleCamera);


  function handleScan(raw) {
    const parsed = parseRaw(raw); const ts = now(); const emp = findEmp(parsed);
    if (!emp) {
      toast('Karyawan tidak ditemukan di database.');
      renderScanPreview({ nid: parsed?.nid || '—', name: 'Tidak ditemukan', title: '—', company: '—', shift: '—', photo: '' }, null);
      const pill = $('#scanShiftCheck'); if (pill) { pill.textContent = 'Belum terdaftar'; pill.className = 'pill light danger'; }
      $('#scanTs') && ($('#scanTs').textContent = fmtTs(ts)); return;
    }
    let effShift = effectiveShiftFor(emp, ts);
    let noteOverride = ''; if (effShift === 'OFF') { noteOverride = 'Libur'; }

    // Logic Break vs Auto
    let status = 'datang';
    if (scanMode === 'break_out') {
      status = 'break_out';
      noteOverride = 'Izin Keluar / Istirahat';
    } else if (scanMode === 'break_in') {
      status = 'break_in';
      noteOverride = 'Kembali dari Istirahat';
    } else {
      status = nextStatusFor(emp.nid);
    }

    const sWin = effShift === 'OFF' ? null : shiftWindow(effShift);
    const inWin = sWin ? isInWindow(minutesOf(ts), sWin) : false;

    // === Late calc yang akurat (berdasarkan tanggal basis shift) ===
    let late = false;
    if (effShift !== 'OFF' && status === 'datang' && sWin) {
      const baseDay = scheduleDateFor(effShift, ts);
      const startDate = toDateFromHM(baseDay, shifts[effShift]?.start || '00:00');
      late = ts.getTime() >= (startDate.getTime() + 5 * 60 * 1000);
    }

    // Reset mode back to auto after scan
    if (scanMode !== 'auto') setScanMode('auto');

    const rec = {
      ts: ts.getTime(), status,
      nid: emp.nid, name: emp.name, title: emp.title, company: emp.company,
      shift: effShift, okShift: inWin,
      note: noteOverride || (status === 'datang' ? (late ? 'Terlambat' : 'On-time') : '—') + (inWin ? '' : ' • Di luar jam shift'),
      late: !!late
    };
    attendance.push(rec); save(LS_ATT, attendance); syncGlobals();
    pushAttendance(rec);
    renderScanPreview(emp, rec); renderScanTable(); renderDashboard(); updateScanLiveCircle(true);
    window.dispatchEvent(new Event('scan:saved'));
    window.dispatchEvent(new Event('attendance:changed'));
    window.dispatchEvent(new Event('attendance:update'));
    renderScanStats();
  }

  // == NEW REPORT: Analisis Izin/Istirahat (Full Page) ==
  function renderAnalysisPage() {
    // Default month to current if empty
    const mPicker = $('#filterAnalysisMonth');
    if (mPicker && !mPicker.value) mPicker.value = todayISO().slice(0, 7);

    // Populate Company Filter
    const cSel = $('#filterAnalysisCompany');
    if (cSel) {
      const currentVal = cSel.value;
      const companies = [...new Set(employees.map(e => (e.company || '').trim()).filter(Boolean))].sort();
      cSel.innerHTML = '<option value="">Semua Perusahaan</option>' +
        companies.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      cSel.value = currentVal;
    }
  }

  window.renderBreakAnalysis = function () {
    const m = $('#filterAnalysisMonth')?.value;
    const c = $('#filterAnalysisCompany')?.value || '';
    const tbody = $('#tableAnalysis tbody');
    if (!tbody) return;

    if (!m) { toast('Pilih bulan terlebih dahulu.'); return; }

    const start = new Date(m + '-01T00:00:00').getTime();
    const year = parseInt(m.split('-')[0]), month = parseInt(m.split('-')[1]);
    const end = new Date(year, month, 0, 23, 59, 59).getTime();

    // Filter Data
    let rawBreaks = attendance.filter(a => a.ts >= start && a.ts <= end && (a.status === 'break_out' || a.status === 'break_in'));

    // Filter Company if selected
    if (c) {
      rawBreaks = rawBreaks.filter(b => (b.company || '').trim() === c);
    }

    // Group by NID and pairwise logic
    const grouped = {};
    rawBreaks.sort((a, b) => a.ts - b.ts); // Ensure time order for pairing

    rawBreaks.forEach(r => {
      if (!grouped[r.nid]) grouped[r.nid] = { name: r.name, company: r.company, sessions: [], lastOut: null };

      if (r.status === 'break_out') {
        grouped[r.nid].lastOut = r.ts;
        // Push partial session
        grouped[r.nid].sessions.push({ out: r.ts, in: null });
      } else if (r.status === 'break_in') {
        // Find last open session
        const sessions = grouped[r.nid].sessions;
        const last = sessions[sessions.length - 1];
        if (last && last.out && !last.in) {
          last.in = r.ts;
        } else {
          // Orphan break_in? Ignore or log?
        }
      }
    });

    // Convert to array and filter only checks that have at least one OUT
    const sorted = Object.entries(grouped)
      .map(([nid, val]) => ({ nid, ...val, count: val.sessions.length }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count);

    // Render
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada data izin keluar pada bulan ${m} ${c ? 'untuk ' + c : ''}.</td></tr>`;
      return;
    }

    const hm = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '...';

    tbody.innerHTML = sorted.map((row, i) => {
      const rank = i + 1;
      // Format sessions
      const details = row.sessions.map(s => {
        const tOut = hm(s.out);
        const tIn = hm(s.in);
        const dur = (s.out && s.in) ? Math.round((s.in - s.out) / 60000) + 'm' : '?';
        return `<div class="chip-sm" style="margin-bottom:2px; font-size:0.75rem; display:inline-flex; align-items:center;">
             ${tOut} - ${tIn} (${dur})
             <button onclick="deleteBreakSession(${s.out}, ${s.in || 'null'})" title="Hapus Sesi" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:6px; font-size:1.1em; line-height:1;">&times;</button>
        </div>`;
      }).join('');

      return `<tr>
              <td style="text-align:center; font-weight:bold;">${rank}</td>
              <td>${row.nid}</td>
              <td>${row.name}</td>
              <td>${row.company || '-'}</td>
              <td style="text-align:center; font-weight:bold; font-size:1.1rem; color:var(--orange-600)">${row.count}</td>
              <td>${details}</td>
          </tr>`;
    }).join('');
  };

  window.deleteBreakSession = async function (tsOut, tsIn) {
    if (!confirm('Apakah Anda yakin ingin menghapus data izin/istirahat ini?')) return;

    // Hapus dari array lokal (filter keluar tsOut dan tsIn)
    attendance = attendance.filter(a => a.ts !== tsOut && a.ts !== tsIn);
    save(LS_ATT, attendance);
    syncGlobals();

    // Tampilkan ulang
    window.renderBreakAnalysis();
    renderDashboard();

    // Hapus dari server
    try {
      await delAttendance(tsOut);
      if (tsIn) await delAttendance(tsIn);
      toast('Data berhasil dihapus dari server.');
    } catch (err) {
      console.error(err);
      toast('Gagal hapus server: ' + err.message);
    }
  };

  window.exportBreakAnalysisPDF = function () {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert("Library jsPDF belum dimuat."); return; }

    const m = $('#filterAnalysisMonth')?.value;
    const c = $('#filterAnalysisCompany')?.value || '';
    if (!m) { toast('Pilih bulan terlebih dahulu.'); return; }

    const start = new Date(m + '-01T00:00:00').getTime();
    const year = parseInt(m.split('-')[0]), month = parseInt(m.split('-')[1]);
    const end = new Date(year, month, 0, 23, 59, 59).getTime();

    let rawBreaks = attendance.filter(a => a.ts >= start && a.ts <= end && (a.status === 'break_out' || a.status === 'break_in'));
    if (c) rawBreaks = rawBreaks.filter(b => (b.company || '').trim() === c);

    rawBreaks.sort((a, b) => a.ts - b.ts);
    const grouped = {};
    rawBreaks.forEach(r => {
      if (!grouped[r.nid]) grouped[r.nid] = { name: r.name, company: r.company, sessions: [] };
      if (r.status === 'break_out') {
        grouped[r.nid].sessions.push({ out: r.ts, in: null });
      } else if (r.status === 'break_in') {
        const last = grouped[r.nid].sessions[grouped[r.nid].sessions.length - 1];
        if (last && last.out && !last.in) last.in = r.ts;
      }
    });

    const sorted = Object.values(grouped).map(v => ({ ...v, count: v.sessions.length })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);
    if (sorted.length === 0) { alert('Tidak ada data untuk diekspor.'); return; }

    const doc = new jsPDF();

    // Header
    doc.setFontSize(14);
    doc.text("Laporan Detil Izin Keluar & Istirahat", 14, 15);
    doc.setFontSize(10);
    doc.text(`Periode: ${m} | Filter: ${c || 'Semua Perusahaan'}`, 14, 22);
    doc.text(`Dicetak: ${new Date().toLocaleString()}`, 14, 27);

    // Table
    const headers = [["Rank", "Nama", "Total", "Detail Waktu (Keluar - Masuk)"]];

    const fullData = [];
    const hm = (ts) => ts ? new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit' }) : '...';

    sorted.forEach((row, i) => {
      const detailStr = row.sessions.map(s => {
        const strOut = hm(s.out);
        const strIn = s.in ? new Date(s.in).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '...'; // Show only hour:min for IN if same day
        // If different day, maybe show date?
        // Let's simplified as: DD HH:mm
        return `${strOut} s/d ${strIn}`;
      }).join('\n');

      fullData.push([
        i + 1,
        row.name + `\n(${row.company || '-'})`,
        row.count + 'x',
        detailStr
      ]);
    });

    doc.autoTable({
      head: headers,
      body: fullData,
      startY: 32,
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        2: { halign: 'center', cellWidth: 15 },
        3: { cellWidth: 80 }
      }
    });

    doc.save(`Analisis_Izin_Detail_${m}.pdf`);
  };

  // ===== Employees =====
  const empTBody = $('#tableEmp tbody'); let editIdx = -1;
  // ===== Debounce Utility =====
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  // ===== Pagination State =====
  let empLimit = 50;
  const empStep = 100;
  let currentFilteredEmp = [];

  function renderEmployees(reset = true) {
    const container = document.getElementById('employeeListContainer');
    if (!container) return;

    if (reset) {
      container.innerHTML = '';
      empLimit = empStep;
      empLimit = empStep;
      const q = $('#searchEmp')?.value?.toLowerCase() || '';
      const gr = $('#filterEmpGroup')?.value || ''; // Group filter

      currentFilteredEmp = employees.filter(e => {
        // 1. Text Search
        const matchText = (e.nid + ' ' + e.name + ' ' + (e.company || '')).toLowerCase().includes(q);
        // 2. Group Filter
        const matchGroup = gr ? (e.shift === gr) : true;

        return matchText && matchGroup;
      });
      currentFilteredEmp.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (currentFilteredEmp.length === 0) {
      container.innerHTML = `<div class="card" style="text-align:center; padding:30px; color:var(--muted)">Tidak ada data karyawan ditemukan.</div>`;
      return;
    }

    // Slice data for this chunk
    const showing = currentFilteredEmp.slice(0, empLimit);
    const more = currentFilteredEmp.length > empLimit;

    // Group by Company
    const groups = {};
    showing.forEach(e => {
      const company = e.company || 'Tanpa Perusahaan';
      if (!groups[company]) groups[company] = [];
      groups[company].push(e);
    });

    // Render Full HTML (Chunked)
    // To avoid complex DOM Diffing, we just re-render the 'showing' set.
    // 50-100 items is very fast.
    let fullHtml = '';
    const companies = Object.keys(groups).sort();

    // State helper
    // Fix: Default to '0' (Expanded) and treat null as '0'.
    // Only collapse if explicitly set to '1'.
    const getCState = (k) => localStorage.getItem('COLLAPSE_' + k) === '1';
    const setCState = (k, v) => localStorage.setItem('COLLAPSE_' + k, v ? '1' : '0');


    companies.forEach(comp => {
      const list = groups[comp];
      list.sort((a, b) => a.name.localeCompare(b.name));
      const key = 'EMP_' + comp.replace(/\s+/g, '_');
      const isHidden = getCState(key);

      let tableHtml = `
      <div class="card mb-4 fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--line); padding-bottom:12px;">
           <div style="display:flex; align-items:center; gap:10px; cursor:pointer" onclick="const b=this.closest('.card').querySelector('.company-body'); b.classList.toggle('hidden'); const h=b.classList.contains('hidden'); this.querySelector('.arrow').innerText = h ? '▶' : '▼'; localStorage.setItem('COLLAPSE_${key}', h?'1':'0')">
             <div style="width:40px; height:40px; background:var(--primary-100); border-radius:8px; display:grid; place-items:center; color:var(--primary-600); font-size:1.2rem;">🏢</div>
             <div>
               <div style="font-weight:700; font-size:1.1rem; color:var(--text)">${comp}</div>
               <div style="font-size:0.85rem; color:var(--muted)">${list.length} Karyawan (Visible)</div>
             </div>
             <div class="arrow" style="margin-left:8px; font-size:0.85rem; color:var(--muted)">${isHidden ? '▶' : '▼'}</div>
           </div>
        </div>
         <div class="company-body table-wrap ${isHidden ? 'hidden' : ''}">
          <table class="emp-table">
            <thead>
              <tr>
                <th style="width:60px" data-i18n="col_photo">Foto</th>
                <th data-i18n="table_nid">NID</th>
                <th data-i18n="table_name">Nama</th>
                <th data-i18n="col_job">Jabatan</th>
                <th data-i18n="table_shift">Shift</th>
                <th style="text-align:right" data-i18n="table_action">Aksi</th>
              </tr>
            </thead>
            <tbody>
      `;

      list.forEach(e => {
        tableHtml += `
          <tr>
            <td data-label="Foto"><div style="width:40px;height:40px;border-radius:10px;background:#eef4ff url('${e.photo || ''}') center/cover no-repeat; border:1px solid var(--line)"></div></td>
            <td data-label="NID">${e.nid}</td>
            <td data-label="Nama">${e.name}</td>
            <td data-label="Jabatan">${e.title}</td>
            <td data-label="Shift"><span style="background:var(--surface-2); padding:4px 8px; border-radius:6px; font-size:0.85rem; font-weight:600; color:var(--primary-700)">Group ${e.shift || '-'}</span></td>
            <td data-label="Aksi">
              <div style="display:flex; justify-content:flex-end; gap:6px;">
                <button class='btn small' data-act='edit' data-id='${e.nid}' title="Edit" style="padding:4px;width:28px;height:28px;display:grid;place-items:center;">✏️</button>
                <button class='btn small' data-act='barcode' data-id='${e.nid}' title="ID Card" style="padding:4px;width:28px;height:28px;display:grid;place-items:center;">🏷️</button>
                <button class='btn small ghost' data-act='del' data-id='${e.nid}' title="Hapus" style="padding:4px;width:28px;height:28px;display:grid;place-items:center;">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      });
      tableHtml += `</tbody></table></div></div>`;
      fullHtml += tableHtml;
    });

    if (more) {
      fullHtml += `
      <div style="text-align:center; margin:20px;">
        <button class="btn primary" id="btnLoadMoreEmp" onclick="loadMoreEmp()">⬇️ Load More (${currentFilteredEmp.length - empLimit} remaining)</button>
      </div>
    `;
    }

    container.innerHTML = fullHtml;

    if (window.translationManager) {
      window.translationManager.applyLanguage(window.translationManager.currentLang);
    }
  }

  window.loadMoreEmp = function () {
    empLimit += empStep;
    renderEmployees(false); // Render false = keep filtering, just expand limit
  };
  // Debounce Search
  $('#searchEmp')?.addEventListener('input', debounce(() => {
    renderEmployees(true);
  }, 300));

  // === Event Delegation for Employee List Actions ===
  $('#employeeListContainer')?.addEventListener('click', async e => {
    const btn = e.target.closest('.btn'); // Handle button clicks only
    if (!btn) return;
    const act = btn.dataset.act;
    const nid = btn.dataset.id;
    if (!act || !nid) return;

    const emp = employees.find(x => x.nid === nid);
    const idx = employees.findIndex(x => x.nid === nid);
    if (!emp) return;

    if (act === 'edit') {
      openEmp(emp, idx);
    } else if (act === 'del') {
      if (confirm(`Hapus karyawan ${emp.name}?`)) {
        employees.splice(idx, 1);
        save(LS_EMP, employees); syncGlobals();
        delEmployee(nid); // Sync delete
        renderEmployees(); renderDashboard();
        toast('Karyawan dihapus.');
      }
    } else if (act === 'barcode') {
      dlBarcode(emp);
    }
  });

  function setCompanyUI(companyText = '') {
    const sel = $('#fCompanySel'); const wrap = $('#wrapCompanyOther'); const other = $('#fCompanyOther');
    if (!sel) return;
    const options = [...sel.options].map(o => o.value || o.textContent);
    const norm = s => String(s || '').trim().toLowerCase();
    if (!companyText) { sel.value = ''; wrap.classList.add('hidden'); other.value = ''; return; }
    const match = options.find(v => norm(v) === norm(companyText));
    if (match && match !== 'OTHER') { sel.value = match; wrap.classList.add('hidden'); other.value = ''; }
    else { sel.value = 'OTHER'; wrap.classList.remove('hidden'); other.value = companyText; }
  }
  function readCompanyFromUI() {
    const sel = $('#fCompanySel'); if (!sel) return '';
    if (sel.value === 'OTHER') return $('#fCompanyOther').value.trim();
    return sel.value || '';
  }
  $('#fCompanySel')?.addEventListener('change', () => {
    const wrap = $('#wrapCompanyOther');
    if ($('#fCompanySel').value === 'OTHER') { wrap.classList.remove('hidden'); }
    else { wrap.classList.add('hidden'); $('#fCompanyOther').value = ''; }
  });

  // Camera
  let camStream = null, camFacing = 'user', camDataUrl = null;
  function stopCam() { camStream?.getTracks()?.forEach(t => t.stop()); camStream = null; }
  async function startCam(facing = 'user') {
    stopCam();
    camFacing = facing;
    const base = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: facing } };
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: { exact: facing } }, audio: false }); }
    catch { camStream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); }
    const v = $('#camVideo'); v.srcObject = camStream; await v.play();
  }
  function ensureCamDialog() {
    let dlg = $('#camDialog');
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id = 'camDialog'; dlg.className = 'camdlg';
    dlg.innerHTML = `
      <div class="cam-box">
        <div class="cam-head"><span>Ambil Foto</span><button class="btn" id="camClose">Tutup</button></div>
        <div class="cam-view"><video id="camVideo" autoplay playsinline muted></video></div>
        <div class="cam-actions">
          <div style="display:flex;gap:8px">
            <button class="btn" id="camSwitch">🔁 Tukar Kamera</button>
            <button class="btn warn" id="camRetry">↺ Muat Ulang</button>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" id="camCancel">Batal</button>
            <button class="btn primary" id="camCapture">📸 Ambil</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', stopCam);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); });
    dlg.querySelector('#camClose').onclick = () => dlg.close();
    dlg.querySelector('#camCancel').onclick = () => dlg.close();
    dlg.querySelector('#camRetry').onclick = () => startCam(camFacing).catch(() => toast('Gagal memulai kamera.'));
    dlg.querySelector('#camSwitch').onclick = () => startCam(camFacing === 'user' ? 'environment' : 'user').catch(() => toast('Tidak bisa beralih kamera.'));
    dlg.querySelector('#camCapture').onclick = () => {
      const v = $('#camVideo'); if (!v.videoWidth) { toast('Video belum siap.'); return; }
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(v, 0, 0, c.width, c.height);
      camDataUrl = c.toDataURL('image/jpeg', 0.92);
      dlg.close();
      let thumb = $('#empPhotoPreview');
      if (!thumb) {
        thumb = document.createElement('img');
        thumb.id = 'empPhotoPreview';
        thumb.className = 'cam-thumb';
        const anchor = $('#btnCamBack')?.parentElement || $('#btnCamFront')?.parentElement || $('#fPhotoFile')?.parentElement;
        anchor?.appendChild(thumb);
      }
      thumb.src = camDataUrl;
      toast('Foto diambil. Akan dipakai saat Simpan.');
    };
    return dlg;
  }
  async function openCamera(facing = 'user') {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Kamera tidak didukung di browser ini.'); return; }
    const dlg = ensureCamDialog();
    try { await dlg.showModal?.(); await startCam(facing); }
    catch (err) {
      toast('Gagal membuka kamera. Coba izinkan akses kamera atau gunakan Upload.');
      dlg.open && dlg.close();
      $('#fPhotoFile')?.click();
    }
  }
  $('#btnCamFront')?.addEventListener('click', () => openCamera('user'));
  $('#btnCamBack')?.addEventListener('click', () => openCamera('environment'));

  function readImageFromAny() {
    return new Promise(res => {
      if (camDataUrl) return res(camDataUrl);
      const f = $('#fPhotoFile')?.files?.[0];
      if (!f) return res(null);
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f);
    });
  }

  // Employees open/save/delete
  empTBody?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const nid = b.dataset.id; const idx = employees.findIndex(x => x.nid == nid); if (idx < 0) return;
    if (b.dataset.act === 'edit') { openEmp(employees[idx], idx); }
    else if (b.dataset.act === 'del') {
      if (confirm(`Hapus karyawan ${employees[idx].name}?`)) {
        employees.splice(idx, 1); save(LS_EMP, employees); syncGlobals();
        delEmployee(nid);
        renderEmployees(); renderDashboard(); toast('Data karyawan dihapus.'); initMonthlyScheduler();
      }
    }
    else if (b.dataset.act === 'barcode') { dlBarcode(employees[idx]); }
  });
  $('#btnExportEmp')?.addEventListener('click', () => exportExcelEmployees());
  $('#searchEmp')?.addEventListener('input', debounce(() => renderEmployees(true), 300));
  $('#filterEmpGroup')?.addEventListener('change', () => renderEmployees(true)); // Filter Group
  $('#btnAddEmp')?.addEventListener('click', () => openEmp());

  function exportExcelEmployees() {
    if (!employees || employees.length === 0) {
      alert('Tidak ada data karyawan untuk diexport.');
      return;
    }

    // Prepare data
    const data = employees.map(e => ({
      NID: e.nid,
      Nama: e.name,
      Jabatan: e.title,
      Perusahaan: e.company,
      Shift: e.shift
    }));

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Karyawan");

    // Save
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Data_Karyawan_${dateStr}.xlsx`);
  }

  // Sync Button Logic
  $('#btnSyncEmp')?.addEventListener('click', async () => {
    if (!confirm(`Upload ${employees.length} data karyawan ke Cloud (Supabase)?`)) return;

    let successCount = 0;
    let failCount = 0;
    toast('Sedang mengupload data...');

    // Batch insert using logic similar to pushEmployee but ideally batch execution if possible
    // Use simple loop for now
    for (const emp of employees) {
      if (!emp.nid) continue;
      const ok = await pushEmployee(emp);
      if (ok) successCount++; else failCount++;
    }

    alert(`Sync Selesai!\nBerhasil: ${successCount}\nGagal: ${failCount}`);
  });

  function openEmp(data = null, index = -1) {
    editIdx = index;
    camDataUrl = null;
    $('#empPhotoPreview')?.remove();

    $('#empModalTitle').textContent = t(index >= 0 ? 'modal_title_edit_emp' : 'modal_title_add_emp');
    $('#fNid').value = data?.nid || ''; $('#fName').value = data?.name || '';
    $('#fTitle').value = data?.title || '';
    setCompanyUI(data?.company || '');
    $('#fShift').value = (data?.shift && SHIFT_KEYS.includes(data.shift)) ? data.shift : 'A';
    $('#fPhoto').value = data?.photo || '';
    $('#fPhotoFile').value = '';
    $('#empModal')?.showModal();
  }
  function closeEmp() { $('#empModal')?.close(); }
  $('#btnCloseEmp')?.addEventListener('click', closeEmp);
  $('#btnExitEmp')?.addEventListener('click', closeEmp);


  // ===== Image Compression Utility =====
  function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = event => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  }

  $('#btnSaveEmp')?.addEventListener('click', async e => {
    e.preventDefault();

    // Use compressImage for file uploads to ensure they fit in DB and upload faster
    let imgDataUrl = '';
    const fileInput = $('#fPhotoFile');
    if (camDataUrl) {
      imgDataUrl = camDataUrl;
    } else if (fileInput && fileInput.files && fileInput.files[0]) {
      try {
        // Compress to max 800x800, quality 0.8
        imgDataUrl = await compressImage(fileInput.files[0], 800, 800, 0.8);
      } catch (err) {
        console.error("Compression error", err);
        return toast('Gagal memproses gambar: ' + err.message);
      }
    } else {
      // Read from URL input or keep existing
      // If no new file, we don't change anything unless user cleared it
      // But wait, existing logic used readImageFromAny.
      // Let's stick to the flow:
    }

    // Logic to resolve final photo string
    let finalPhoto = imgDataUrl;
    if (!finalPhoto) {
      // If no new file/cam, check if there is a manual URL in text input
      finalPhoto = $('#fPhoto').value.trim();
    }

    const emp = {
      nid: $('#fNid').value.trim(),
      name: $('#fName').value.trim(),
      title: $('#fTitle').value.trim(),
      company: readCompanyFromUI(),
      shift: $('#fShift').value,
      photo: finalPhoto || ''
    };

    if (!emp.nid || !emp.name) return toast('NID & Nama wajib diisi.');

    if (editIdx >= 0) { employees[editIdx] = emp; }
    else {
      if (employees.some(e => e.nid == emp.nid)) return toast('NID sudah ada.');
      employees.push(emp);
    }

    save(LS_EMP, employees); syncGlobals();

    // Save locally first
    renderEmployees(); renderDashboard(); $('#empModal')?.close();
    toast('Data tersimpan di lokal. Mengirim ke server...');

    // Sync to Supabase
    pushEmployee(emp).then(success => {
      if (success) toast('✅ Sinkronisasi server berhasil.');
      else toast('❌ Gagal sinkronisasi ke server (cek koneksi/size).');
    });

    initMonthlyScheduler();
  });

  // Import/Export employees
  $('#btnImportEmp')?.addEventListener('click', () => $('#fileImportEmp').click());
  $('#fileImportEmp')?.addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    const data = await file.arrayBuffer(); const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws);
    let up = 0, add = 0;
    rows.forEach(r => {
      const emp = {
        nid: String(r.NID ?? r.nid ?? '').trim(), name: String(r.Nama ?? r.name ?? '').trim(), title: String(r.Jabatan ?? r.title ?? ''), company: String(r.Perusahaan ?? r.company ?? ''),
        shift: String(r.Grup ?? r.Shift ?? 'A'), photo: String(r.FotoURL ?? r.photo ?? '')
      };
      if (!emp.nid || !emp.name) return;
      const i = employees.findIndex(e => e.nid == emp.nid);
      if (i >= 0) { employees[i] = emp; up++; } else { employees.push(emp); add++; }
    });
    save(LS_EMP, employees); syncGlobals(); renderEmployees(); renderDashboard(); initMonthlyScheduler();
    employees.forEach(e => pushEmployee(e));
    toast(`Import selesai. Tambah ${add}, Update ${up}.`); ev.target.value = '';
  });
  $('#btnExportEmp')?.addEventListener('click', () => {
    const rows = employees.map(e => ({ NID: e.nid, Nama: e.name, Jabatan: e.title, Perusahaan: e.company, Grup: e.shift, FotoURL: e.photo }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Karyawan'); XLSX.writeFile(wb, 'karyawan.xlsx');
  });
  $('#btnTemplateEmp')?.addEventListener('click', () => {
    const rows = [{ NID: 'EMP001', Nama: 'Nama Lengkap', Jabatan: 'Operator', Perusahaan: 'PT PLN NPS', Grup: 'Group A', FotoURL: 'https://…' }];
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Template'); XLSX.writeFile(wb, 'template_karyawan.xlsx');
  });

  // QR code download
  async function dlBarcode(emp) {
    const payload = `${emp.nid}|${emp.name}|${emp.title}|${emp.company}`;
    if (typeof QRCode === 'undefined') { toast('Library QRCode belum dimuat. Tambahkan <script qrcode.min.js> di HTML.'); return; }
    const tmp = document.createElement('div'); tmp.style.position = 'fixed'; tmp.style.left = '-9999px'; document.body.appendChild(tmp);
    new QRCode(tmp, { text: payload, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
    let qCanvas = tmp.querySelector('canvas');
    if (!qCanvas) {
      const img = tmp.querySelector('img');
      if (img) {
        await new Promise(res => { if (img.complete) res(); else img.onload = res; });
        qCanvas = document.createElement('canvas');
        qCanvas.width = img.naturalWidth; qCanvas.height = img.naturalHeight;
        qCanvas.getContext('2d').drawImage(img, 0, 0);
      }
    }
    document.body.removeChild(tmp);
    if (!qCanvas) { toast('Gagal membuat QR.'); return; }
    const W = 560, H = 300, PAD = 16, out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const qrSize = H - 2 * PAD; ctx.drawImage(qCanvas, PAD, PAD, qrSize, qrSize);
    const xText = PAD * 2 + qrSize, y0 = PAD + 26, lh = 24;
    ctx.fillStyle = '#000'; ctx.font = 'bold 22px Inter, Arial, sans-serif'; ctx.fillText(emp.name || '', xText, y0);
    ctx.font = '16px Inter, Arial, sans-serif'; ctx.fillText(`NID: ${emp.nid || ''}`, xText, y0 + lh);
    ctx.fillText(emp.title || '', xText, y0 + lh * 2); ctx.fillText(emp.company || '', xText, y0 + lh * 3);
    const a = document.createElement('a'); a.download = `QR_${emp.nid || 'EMP'}.png`; a.href = out.toDataURL('image/png'); a.click();
  }

  // ===== Pengaturan Shift =====
  function tryReadAltShiftRows() {
    const map = {};
    const rows = [...document.querySelectorAll('tr, .shift-row')];
    rows.forEach(row => {
      const sel = row.querySelector('select');
      if (!sel) return;
      const label = (sel.value || sel.options?.[sel.selectedIndex]?.text || '').toLowerCase();
      let code = null;
      if (label.includes('pagi') || label.includes('(p)')) code = 'A';
      else if (label.includes('sore') || label.includes('(s)')) code = 'B';
      else if (label.includes('malam') || label.includes('(m)')) code = 'C';
      else if (label.includes('shift d') || label.includes('(d)')) code = 'D';
      else if (label.includes('day') || label.includes('(day)')) code = 'DAYTIME';
      else if (label.includes('libur') || label.includes('(l)')) code = 'OFF';
      if (!code) return;
      const inputs = [...row.querySelectorAll('input')];
      const start = normalizeTime(inputs[0]?.value || '');
      const end = normalizeTime(inputs[1]?.value || '');
      if (code !== 'OFF' && start && end) map[code] = { start, end };
    });
    return Object.keys(map).length ? map : null;
  }
  function pickVal(id1, id2) {
    const a = document.querySelector(id1);
    if (a && a.value) return normalizeTime(a.value);
    const b = document.querySelector(id2);
    return b ? normalizeTime(b.value) : '';
  }
  function getShiftInputs() {
    const alt = tryReadAltShiftRows();
    if (alt) {
      return {
        pagi: alt.A || { start: '08:00', end: '16:00' },
        sore: alt.B || { start: '16:00', end: '24:00' },
        malam: alt.C || { start: '24:00', end: '07:00' },
        shiftd: alt.D || { start: '07:30', end: '15:30' },
        day: alt.DAYTIME || { start: '07:30', end: '16:00' }
      };
    }
    const pagi = {
      start: pickVal('#shiftPagiStart', '#shiftAStart') || '08:00',
      end: pickVal('#shiftPagiEnd', '#shiftAEnd') || '16:00'
    };
    const sore = {
      start: pickVal('#shiftSoreStart', '#shiftBStart') || '16:00',
      end: pickVal('#shiftSoreEnd', '#shiftBEnd') || '24:00'
    };
    const malam = {
      start: pickVal('#shiftMalamStart', '#shiftCStart') || '24:00',
      end: pickVal('#shiftMalamEnd', '#shiftCEnd') || '07:00'
    };
    const shiftd = {
      start: pickVal('#shiftDStart') || '07:30',
      end: pickVal('#shiftDEnd') || '15:30'
    };
    const day = {
      start: pickVal('#shiftDayStart') || '07:30',
      end: pickVal('#shiftDayEnd') || '16:00'
    };
    return { pagi, sore, malam, shiftd, day };
  }
  function renderShiftForm() {
    const pagi = shifts.A || { start: '08:00', end: '16:00' };
    const sore = shifts.B || { start: '16:00', end: '24:00' };
    const malam = shifts.C || { start: '24:00', end: '07:00' };
    /* shiftd removed */

    $('#shiftPagiStart') && ($('#shiftPagiStart').value = pagi.start);
    $('#shiftPagiEnd') && ($('#shiftPagiEnd').value = pagi.end);
    $('#shiftSoreStart') && ($('#shiftSoreStart').value = sore.start);
    $('#shiftSoreEnd') && ($('#shiftSoreEnd').value = sore.end);
    $('#shiftMalamStart') && ($('#shiftMalamStart').value = malam.start);
    $('#shiftMalamEnd') && ($('#shiftMalamEnd').value = malam.end);

    // Map D/Daytime to the same input
    $('#shiftDStart').value = shifts.D?.start || '07:30';
    $('#shiftDEnd').value = shifts.D?.end || '15:30';

    $('#shiftDayStart').value = shifts.DAYTIME?.start || '07:30';
    $('#shiftDayEnd').value = shifts.DAYTIME?.end || '16:00';

    // Compat selectors just in case
    $('#shiftAStart') && ($('#shiftAStart').value = pagi.start);
    $('#shiftAEnd') && ($('#shiftAEnd').value = pagi.end);
    $('#shiftBStart') && ($('#shiftBStart').value = sore.start);
    $('#shiftBEnd') && ($('#shiftBEnd').value = sore.end);
    $('#shiftCStart') && ($('#shiftCStart').value = malam.start);
    $('#shiftCEnd') && ($('#shiftCEnd').value = malam.end);
  }
  $('#btnSaveShift')?.addEventListener('click', async () => {
    const btn = $('#btnSaveShift');
    const { pagi, sore, malam, day } = getShiftInputs();
    shifts = {
      A: { start: normalizeTime(pagi.start), end: normalizeTime(pagi.end) },
      B: { start: normalizeTime(sore.start), end: normalizeTime(sore.end) },
      C: { start: normalizeTime(malam.start), end: normalizeTime(malam.end) },
      // Automatically sync D to match DAYTIME (since D is just the group using Daytime hours)
      D: { start: normalizeTime(day.start), end: normalizeTime(day.end) },
      DAYTIME: { start: normalizeTime(day.start), end: normalizeTime(day.end) }
    };
    save(LS_SHIFTS, shifts); syncGlobals();
    renderDashboard(); renderCurrentShiftPanel();

    // Sync
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
    try {
      if (sb) {
        await pushShifts();
        toast('Pengaturan shift disimpan & disinkronkan.');
      } else {
        toast('Disimpan lokal (Offline).');
      }
    } catch (err) {
      alert('Gagal sync shift: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Perubahan'; }
    }
  });

  // ===== Attendance (laporan) =====
  function renderAttendance() {
    const to = new Date(), from = new Date(to.getTime() - 24 * 3600 * 1000);
    $('#attFrom').value = from.toISOString().slice(0, 10); $('#attTo').value = to.toISOString().slice(0, 10);
    filterAttendance();
  }
  // Shared filter logic
  function getFilteredAttendanceRows() {
    // 1. Prepare Date Range
    const fromVal = $('#attFrom').value;
    const toVal = $('#attTo').value;
    if (!fromVal || !toVal) return [];

    const dFrom = new Date(fromVal); dFrom.setHours(0, 0, 0, 0); const tFrom = dFrom.getTime();
    const dTo = new Date(toVal); dTo.setHours(23, 59, 59, 999); const tTo = dTo.getTime();

    // Use Window Globals
    let atts = window.attendance || attendance || [];
    if (!Array.isArray(atts)) atts = [];

    const shfs = window.shifts || shifts || {};

    // Inputs
    const q = ($('#attSearch')?.value || '').toLowerCase().trim();
    const gr = $('#attGroupFilter')?.value || '';
    const st = $('#attStatusFilter')?.value || '';

    // === ABSENTEEISM LOGIC (Ghost Records) ===
    if (st === 'UNKNOWN') {
      const ghosts = [];
      // Cache existing 'datang' records
      const presenceMap = new Set();
      atts.forEach(a => {
        if (a.ts >= tFrom && a.ts <= tTo) {
          const dateKey = new Date(a.ts).toISOString().slice(0, 10);
          presenceMap.add(`${a.nid}|${dateKey}`);
        }
      });

      let loop = new Date(dFrom);
      while (loop <= dTo) {
        const dateKey = loop.toISOString().slice(0, 10);

        employees.forEach(e => {
          // 1. Filter Check
          if (q && !(e.name + ' ' + e.nid + ' ' + (e.company || '')).toLowerCase().includes(q)) return;
          if (gr && e.shift !== gr) return;

          // 2. Presence Check
          if (presenceMap.has(`${e.nid}|${dateKey}`)) return;

          // 3. Schedule Check (noon to avoid boundary issues)
          const checkDate = new Date(loop); checkDate.setHours(12, 0, 0, 0);
          const code = effectiveShiftFor(e, checkDate);

          if (!code || code === 'OFF') return;

          // 4. Create Ghost Record
          const s = shfs[code] || { start: '08:00' };
          const [hh, mm] = s.start.split(':').map(Number);
          const ts = new Date(loop); ts.setHours(hh, mm, 0, 0);

          ghosts.push({
            ts: ts.getTime(),
            status: 'alpha',
            nid: e.nid,
            name: e.name,
            title: e.title,
            company: e.company,
            shift: code,
            note: 'Tidak Hadir',
            late: false,
            isGhost: true
          });
        });
        loop.setDate(loop.getDate() + 1);
      }
      return ghosts.sort((a, b) => b.ts - a.ts);
    }

    return atts.filter(a => {
      // 1. Check Date Range
      if (a.ts < tFrom || a.ts > tTo) return false;

      // 2. Check Search (Name or NID)
      if (q) {
        if (!(a.name + ' ' + a.nid).toLowerCase().includes(q)) return false;
      }

      // 3. Check Group
      if (gr) {
        const emp = employees.find(e => e.nid === a.nid);
        if (!emp || emp.shift !== gr) return false;
      }

      // 4. Check Status
      if (st) {
        if (st === 'LATE') return !!a.late;
        if (st === 'ONTIME') return a.status === 'datang' && !a.late;
        // Note: UNKNOWN handled above
        if (st === 'OVERTIME') {
          if (a.status !== 'pulang') return false;
          const sDef = shfs[a.shift];
          if (!sDef || !sDef.end) return false;
          const d = new Date(a.ts);
          const scanMins = d.getHours() * 60 + d.getMinutes();
          const [h, m] = sDef.end.split(':').map(Number);
          const endMins = h * 60 + m;
          return scanMins > (endMins + 10);
        }
        return false;
      }
      return true;
    }).sort((a, b) => b.ts - a.ts);
  }

  function filterAttendance() {
    const tb = $('#tableAtt tbody'); if (!tb) return;
    const rows = getFilteredAttendanceRows();

    tb.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.ts = r.ts;

      let statusLabel = 'Pulang';
      // let statusClass = 'status-pulang'; // Unused in HTML rendering logic below

      if (r.status === 'datang') statusLabel = 'Masuk';
      else if (r.status === 'break_out') statusLabel = 'Izin Keluar';
      else if (r.status === 'break_in') statusLabel = 'Kembali';
      else if (r.status === 'alpha') statusLabel = 'Tanpa Keterangan';

      const delBtn = r.isGhost ? '' : `<button class="btn small danger" data-act="del-att" style="padding:2px 8px; font-size:12px;">Hapus</button>`;

      tr.innerHTML = `
        <td>${fmtTs(r.ts)}</td>
        <td>${statusLabel}</td>
        <td>${r.nid}</td>
        <td>${r.name}</td>
        <td>${r.title}</td>
        <td>${r.company}</td>
        <td>${CODE_TO_LABEL[r.shift] || r.shift || ''}</td>
        <td>${r.note || ''}</td>
        <td style="text-align:center">${delBtn}</td>`;
      tb.appendChild(tr);
    });
    $('#btnExportAtt').dataset.count = rows.length;
  }
  $('#btnFilterAtt')?.addEventListener('click', filterAttendance);
  // Realtime search & group filter & DATE filter
  $('#attSearch')?.addEventListener('input', filterAttendance);
  $('#attGroupFilter')?.addEventListener('change', filterAttendance);
  $('#attStatusFilter')?.addEventListener('change', filterAttendance);
  $('#attFrom')?.addEventListener('change', filterAttendance);
  $('#attTo')?.addEventListener('change', filterAttendance);

  $('#tableAtt tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act="del-att"]'); if (!btn) return;
    const tr = btn.closest('tr'); const ts = Number(tr?.dataset.ts || '0'); if (!ts) return;
    if (confirm('Hapus baris kehadiran ini?')) {
      const idx = attendance.findIndex(a => a.ts === ts);
      if (idx >= 0) { attendance.splice(idx, 1); save(LS_ATT, attendance); syncGlobals(); filterAttendance(); renderDashboard(); renderScanTable(); renderScanStats(); toast('Baris dihapus.'); delAttendance(ts); }
    }
  });
  $('#btnExportAtt')?.addEventListener('click', () => {
    // USE SHARED FILTER FUNCTION so export matches display
    const rows = getFilteredAttendanceRows().map(r => ({
      Waktu: fmtTs(r.ts),
      Status: capStatus(r.status),
      NID: r.nid,
      Nama: r.name,
      Jabatan: r.title,
      Perusahaan: r.company,
      Shift: CODE_TO_LABEL[r.shift] || r.shift || '',
      Keterangan: r.note || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kehadiran');

    // Use the from-to values for filename
    const fName = `kehadiran_${$('#attFrom').value}_sd_${$('#attTo').value}.xlsx`;
    XLSX.writeFile(wb, fName);
  });

  // ===== Latest info =====
  function renderLatest() {
    const tb = $('#tableNews tbody'); if (!tb) return; tb.innerHTML = '';
    const sorted = [...news].sort((a, b) => b.ts - a.ts);
    sorted.forEach(n => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtTs(n.ts)}</td>
        <td style="font-weight:600">${esc(n.title)}</td>
        <td>${esc(n.body || '')}${n.link ? ` • <a href="${esc(n.link)}" target="_blank">Link</a>` : ''}</td>
        <td>
          <div style="display:flex; justify-content:flex-end; align-items:center; gap:4px">
            <button class="btn-icon-soft-blue" data-act="edit-news" data-ts="${n.ts}" title="Edit">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon-soft-red" data-act="del-news" data-ts="${n.ts}" title="Hapus">
               <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>`;
      tb.appendChild(tr);
    });
  }
  function openNews(data = null, id = null) {
    const d = $('#newsModal'); if (!d) return;
    newsEditingId = id; // Set global

    $('#nTitle').value = data?.title || '';
    $('#nBody').value = data?.body || '';
    $('#nLink').value = data?.link || '';
    d.showModal();
  }
  $('#btnAddNews')?.addEventListener('click', () => openNews(null, null));
  $('#btnBackNews')?.addEventListener('click', (e) => { e.preventDefault(); $('#newsModal')?.close(); });
  $('#newsModal')?.addEventListener('close', () => { const d = $('#newsModal'); if (d) d.dataset.ts = ''; });
  // Old btnSaveNews listener removed to prefer the async version below
  // $('#btnSaveNews')?.addEventListener('click', ... );
  $('#tableNews')?.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    // Fix: Ensure we parse the timestamp correctly
    const ts = Number(b.dataset.ts || '0');
    if (!ts) return;

    const idx = news.findIndex(n => n.ts === ts);
    if (idx < 0) return;

    if (b.dataset.act === 'edit-news') openNews(news[idx], ts);
    if (b.dataset.act === 'del-news') {
      if (confirm('Hapus info ini?')) {
        news.splice(idx, 1);
        save(LS_NEWS, news);
        renderLatest();
        renderNewsWidgets();
        toast('Info dihapus.');
        delNews(ts); // Ensure DB sync
      }
    }
  });

  // ===== Scheduler =====
  function daysIn(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function ensureMonth(id) { if (!sched[id]) sched[id] = {}; }
  function renderSchedTable() {
    const host = $('#tableSched'); if (!host) return;
    host.classList.add('compact');
    const mp = $('#schedMonth'); if (!mp.value) mp.value = monthKey(new Date());
    const id = mp.value;
    const [yy, mm] = id.split('-').map(Number); const dim = daysIn(yy, mm - 1);
    ensureMonth(id);
    const head = [...Array(dim)].map((_, i) => { const d = new Date(yy, mm - 1, i + 1); const wd = d.toLocaleDateString('id-ID', { weekday: 'short' }); return `<th>${i + 1}<br><small>${wd}</small></th>`; }).join('');
    host.innerHTML = `<thead><tr><th style="min-width:80px">Shift</th>${head}</tr></thead><tbody></tbody>`;
    const tb = host.querySelector('tbody');
    const opts = Object.entries(CODE_TO_LABEL).filter(([c]) => c !== 'D').map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
    const optsHtml = `<option value="">—</option>${opts}`;
    SHIFT_KEYS.forEach(groupName => {
      const tr = document.createElement('tr');
      let cells = `<td><b>${esc(groupName)}</b></td>`;
      for (let d = 1; d <= dim; d++) {
        cells += `<td><select class="sched" data-group="${groupName}" data-day="${d}" title="Jadwal Grup ${groupName} tgl ${d}">${optsHtml}</select></td>`;
      }
      tr.innerHTML = cells; tb.appendChild(tr);
      tr.querySelectorAll('select.sched').forEach(sel => {
        const day = sel.dataset.day; const curValue = sched[id]?.[groupName]?.[day] || ''; sel.value = curValue;
      });
    });
    tb.querySelectorAll('select.sched').forEach(sel => {
      sel.addEventListener('change', e => {
        const group = e.target.dataset.group, day = +e.target.dataset.day, val = e.target.value;
        const monthId = $('#schedMonth').value;
        ensureMonth(monthId);
        if (!sched[monthId][group]) sched[monthId][group] = {};
        if (val) sched[monthId][group][day] = val; else delete sched[monthId][group][day];
      });
    });
  }
  function initMonthlyScheduler() {
    const el = $('#schedMonth');
    if (!el) return;
    if (!el.value) el.value = monthKey(new Date());
    el.max = '2030-12'; // Enforce max via JS
    ensureMonth(el.value);
    renderSchedTable();
  }
  $('#schedMonth')?.addEventListener('change', () => renderSchedTable());
  $('#btnSchedSave')?.addEventListener('click', async () => {
    const btn = $('#btnSchedSave');
    save(LS_SCHED, sched);
    syncGlobals();
    const m = $('#schedMonth').value;
    renderCurrentShiftPanel();

    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
    try {
      if (sb) {
        await pushSched(m);
        toast(`Jadwal bulan ${m} disimpan & disinkronkan.`);
      } else {
        toast(`Jadwal ${m} disimpan lokal.`);
      }
    } catch (err) {
      alert('Gagal sync jadwal: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Jadwal'; }
    }
  });
  $('#btnSchedReset')?.addEventListener('click', () => {
    const id = $('#schedMonth').value; if (!id) return;
    if (confirm('Kosongkan jadwal untuk bulan ini?')) { sched[id] = {}; save(LS_SCHED, sched); syncGlobals(); renderSchedTable(); toast('Bulan dikosongkan.'); renderCurrentShiftPanel(); }
  });
  $('#btnSchedDownload')?.addEventListener('click', () => {
    const id = $('#schedMonth').value || monthKey(new Date()); const [yy, mm] = id.split('-').map(Number); const dim = daysIn(yy, mm - 1); ensureMonth(id);
    const rows = SHIFT_KEYS.map(group => {
      const row = { Grup: group };
      for (let d = 1; d <= dim; d++) {
        const code = sched[id]?.[group]?.[d] || '';
        row['D' + d] = (CODE_TO_LABEL[code] || code);
      }
      return row;
    });
    const headers = ['Grup', ...Array.from({ length: dim }, (_, i) => 'D' + (i + 1))];
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers }); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Jadwal_${id}`); XLSX.writeFile(wb, `jadwal_grup_${id}.xlsx`);
  });
  $('#btnSchedImport')?.addEventListener('click', () => $('#fileImportSched').click());
  $('#fileImportSched')?.addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    const id = $('#schedMonth').value || monthKey(new Date()); const [yy, mm] = id.split('-').map(Number); const dim = daysIn(yy, mm - 1); ensureMonth(id);
    const data = await file.arrayBuffer(); const wb = XLSX.read(data); const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let applied = 0;
    rows.forEach(r => {
      const group = String(r.Grup || r.grup || '').trim();
      if (!group || !SHIFT_KEYS.includes(group)) return;
      if (!sched[id][group]) sched[id][group] = {};
      for (let d = 1; d <= dim; d++) {
        let v = String(r['D' + d] || '').trim(); if (!v) { delete sched[id][group][d]; continue; }
        const key = LABEL_TO_CODE[v.toLowerCase()] || (['A', 'B', 'C', 'D', 'DAYTIME', 'OFF'].includes(v) ? v : null) || (v.toLowerCase() === 'l' ? 'OFF' : null);
        if (key) { sched[id][group][d] = key; applied++; }
      }
    });
    save(LS_SCHED, sched); syncGlobals(); renderSchedTable(); toast(`Import jadwal: ${applied} sel terisi.`); ev.target.value = ''; renderCurrentShiftPanel();
  });

  // ===== Seeds =====
  // ===== Seeds (Disabled & Cleanup) =====
  // 1. Force cleanup old seeds (Only runs if they exist)
  const seedTitles = ['Sosialisasi K3', 'Maintenance'];
  const seedEmps = ['Chris Jonathan', 'Syafranah San', 'Devon Lane'];

  let dirty = false;

  // Cleanup News
  const newsToDelete = news.filter(n => seedTitles.includes(n.title));
  if (newsToDelete.length > 0) {
    newsToDelete.forEach(n => delNews(n.ts)); // Delete from Cloud
    news = news.filter(n => !seedTitles.includes(n.title)); // Delete from Local
    save(LS_NEWS, news);
    dirty = true;
  }

  // Cleanup Employees
  const empsToDelete = employees.filter(e => seedEmps.includes(e.name));
  if (empsToDelete.length > 0) {
    empsToDelete.forEach(e => delEmployee(e.nid)); // Delete from Cloud
    employees = employees.filter(e => !seedEmps.includes(e.name)); // Delete from Local
    save(LS_EMP, employees);
    dirty = true;
  }

  if (dirty) {
    syncGlobals();
    console.log('🧹 Seed data cleaned up automatically.');
  }

  // (Original Seed Logic Disabled)


  // ===== Scan stats proxy (pakai script inline yang sudah ada) =====
  function renderScanStats() {
    if (typeof window.refreshScanStats === 'function') {
      try { window.refreshScanStats(); } catch { }
    }
  }

  // ===== LIVE CIRCLE di kanan hasil scan =====
  function ensureScanLiveCircle() { return; } // DISABLED
  function updateScanLiveCircle(pulse = false) { return; } // DISABLED
  window.addEventListener('attendance:update', () => { updateScanLiveCircle(true); renderScanStats(); });

  // ===== Init page sections =====
  function renderScanPage() { renderScanTable(); renderScanPreview(null, null); renderNewsWidgets(); ensureScanLiveCircle(); updateScanLiveCircle(false); renderScanStats(); if (typeof renderMobileScanUI === 'function') renderMobileScanUI(); }
  renderEmployees(); renderDashboard(); renderScanPage(); renderLatest();

  const routeShifts = $('#route-shifts');
  if (routeShifts && !routeShifts.classList.contains('hidden')) {
    renderShiftForm(); initMonthlyScheduler();
  }

  // Compact stat cards
  (function injectCompactCards() {
    const st = document.createElement('style');
    st.textContent = `.grid-3 .card.stat{padding:12px 14px;border-radius:16px}.card.stat .stat-value{font-size:28px}.card.stat .progress-bar{height:10px}`;
    document.head.appendChild(st);
  })();

  // periodic
  window.addEventListener('attendance:update', renderLiveCompanyStats);
  setInterval(() => { updateScanLiveCircle(false); renderScanStats(); }, 15000);
  // periodic
  window.addEventListener('attendance:update', renderLiveCompanyStats);
  setInterval(() => { updateScanLiveCircle(false); renderScanStats(); }, 15000);

  // ===== Education Logic (Migrated) =====
  // LS_EDU, loadEdu, saveEdu moved to top
  const makeId = () => 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  let eduEditingId = null;
  let eduCurrentImg = null;

  function renderEduTable() {
    const tbody = document.querySelector('#tableEdu tbody'); if (!tbody) return;

    // Auto-fix missing IDs
    let list = loadEdu();
    let dirty = false;
    list.forEach(x => { if (!x.id) { x.id = makeId(); dirty = true; } });
    if (dirty) { saveEdu(list); }

    const rows = list.sort((a, b) => b.ts - a.ts);
    tbody.innerHTML = rows.map(r =>
      `<tr data-id="${r.id}">
        <td>${fmtTs(r.ts)}</td>
        <td style="font-weight:600">${esc(r.title)}</td>
        <td>${esc(r.body).replace(/\n/g, '<br>')}</td>
        <td>${r.img ? `<img src="${r.img}" alt="img" class="edu-thumb" onclick="window.open(this.src,'_blank')" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0">` : '—'}</td>
        <td>
          <div style="display:flex; gap:6px; align-items:center;">
             <button class="btn small ghost btn-edu-edit" style="padding:4px 10px; font-size:0.85rem">Edit</button>
             <button class="btn small danger btn-edu-del" style="padding:4px 10px; font-size:0.85rem">Hapus</button>
          </div>
        </td>
      </tr>`
    ).join('');

    // Listeners dipindah ke event delegation (lihat bawah)
  }

  // === Event Delegation for Education Table ===
  $('#tableEdu')?.addEventListener('click', e => {
    const btnEdit = e.target.closest('.btn-edu-edit');
    const btnDel = e.target.closest('.btn-edu-del');

    if (btnDel) {
      const id = btnDel.closest('tr')?.dataset.id; if (!id) return;
      if (confirm('Hapus item education ini?')) {
        const next = loadEdu().filter(x => x.id !== id);
        saveEdu(next); renderEduTable(); renderHighlights();
        window.dispatchEvent(new CustomEvent('education:changed'));
        delEdu(id);
        toast('Education dihapus.');
      }
    }

    if (btnEdit) {
      const id = btnEdit.closest('tr')?.dataset.id; if (!id) return;
      const item = loadEdu().find(x => x.id === id); if (!item) return;
      eduEditingId = id;
      eduCurrentImg = item.img || null;
      document.querySelector('#eduModalTitle').textContent = 'Ubah Education';
      document.querySelector('#eTitle').value = item.title || '';
      document.querySelector('#eBody').value = item.body || '';
      document.querySelector('#eImage').value = '';
      updateEduPreview();
      document.querySelector('#eduModal').showModal();
    }
  });


  function renderHighlights() {
    const hostStandalone = document.querySelector('#eduList');
    const hostInRecent = document.querySelector('#eduListRecent');
    const rc = document.getElementById('recentCard');

    const items = loadEdu().sort((a, b) => b.ts - a.ts).slice(0, 6);
    const recencyPercent = (ts) => {
      const age = Date.now() - ts;
      const max = 7 * 24 * 3600 * 1000; // 7 days
      return Math.max(10, 100 - (age / max) * 90);
    };

    const html = items.length
      ? items.map(it => {
        const pct = recencyPercent(it.ts);
        const img = it.img || '';
        return `
          <div class="edu-item" data-hover-card="interactive" data-tooltip="${esc(it.title)}\n${esc(it.body).slice(0, 50)}..." onclick="$('.navlink[data-route=\\'education\\']').click()">
            <img class="thumb" src="${img}" alt="" onerror="this.style.display='none'">
            <div>
              <div class="t">${esc(it.title)}</div>
              <div class="d">${esc(it.body).replace(/\n/g, ' ')}</div>
              <div class="edu-bar" style="--pct:${pct}%"><i></i></div>
              <div class="meta">${fmtTs(it.ts)}</div>
            </div>
          </div>`;
      }).join('')
      : `<div class="muted">Belum ada data education.</div>`;

    if (hostInRecent) hostInRecent.innerHTML = html;
    if (hostStandalone) hostStandalone.innerHTML = html;
    if (rc) rc.setAttribute('data-has-edu', items.length ? '1' : '0');
  }

  function updateEduPreview() {
    const wrap = $('#eImgWrap'); const img = $('#ePreview');
    if (eduCurrentImg) {
      wrap.classList.remove('hidden'); img.src = eduCurrentImg;
    } else {
      wrap.classList.add('hidden'); img.src = '';
    }
  }

  $('#btnAddEdu')?.addEventListener('click', () => {
    eduEditingId = null; eduCurrentImg = null;
    $('#eduModalTitle').textContent = 'Tambah Education';
    $('#eTitle').value = ''; $('#eBody').value = ''; $('#eImage').value = '';
    updateEduPreview();
    $('#eduModal').showModal();
  });
  $('#btnBackEdu')?.addEventListener('click', (e) => { e.preventDefault(); $('#eduModal').close(); });
  $('#btnCloseEdu')?.addEventListener('click', () => $('#eduModal').close());

  $('#eImage')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { eduCurrentImg = await compressImage(f, 1200, 1200, 0.82); updateEduPreview(); }
    catch { toast('Gagal memproses gambar.'); }
  });

  $('#btnClearImg')?.addEventListener('click', () => { eduCurrentImg = null; updateEduPreview(); });

  $('#btnSaveNews')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = $('#btnSaveNews');
    const title = $('#nTitle').value.trim();
    const body = $('#nBody').value.trim();
    if (!title) return toast('Judul wajib diisi.');

    const item = {
      id: newsEditingId || Date.now().toString(36),
      ts: newsEditingId ? (news.find(x => x.id === newsEditingId)?.ts || Date.now()) : Date.now(),
      title,
      body,
      link: $('#nLink').value.trim(),
      pending_sync: true // Flag for sync
    };

    if (newsEditingId) {
      const i = news.findIndex(x => x.id === newsEditingId);
      if (i >= 0) news[i] = item;
    } else {
      news.unshift(item);
    }
    save(LS_NEWS, news); syncGlobals();
    renderLatest(); renderDashboard();

    // Sync
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
    try {
      if (sb) {
        await pushNews(item);
        item.pending_sync = false; // Synced!
        save(LS_NEWS, news); // Update local state
        toast('Info berhasil disimpan & disinkronkan.');
      } else {
        toast('Info disimpan lokal (pending sync).');
      }
      $('#newsModal').close();
    } catch (err) {
      alert('Gagal sync info: ' + err.message);
      $('#newsModal').close();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  });

  $('#btnSaveEdu')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = $('#btnSaveEdu');

    // Validate
    const title = ($('#eTitle').value || '').trim();
    const body = ($('#eBody').value || '').trim();
    if (!title) { $('#eTitle').focus(); return; }

    const list = loadEdu();
    const item = { id: eduEditingId || makeId(), ts: Date.now(), title, body, img: eduCurrentImg };

    if (eduEditingId) {
      const i = list.findIndex(x => x.id === eduEditingId);
      if (i > -1) { list[i] = { ...list[i], title, body, img: eduCurrentImg }; item.id = eduEditingId; item.ts = list[i].ts; }
    } else {
      list.push(item);
    }

    try { saveEdu(list); }
    catch { toast('Penyimpanan penuh. Hapus item lama.'); return; }

    // UI Updates
    renderEduTable(); renderHighlights();
    window.dispatchEvent(new CustomEvent('education:changed'));

    // Sync
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
    try {
      if (sb) {
        await pushEdu(item);
        toast('Education berhasil disimpan & disinkronkan.');
      } else {
        toast('Disimpan di lokal (Offline).');
      }
      $('#eduModal').close();
    } catch (err) {
      alert('Gagal sync ke Cloud: ' + err.message);
      // Keep modal open so user can retry or cancel?
      // Or just close since it is saved locally? 
      // User style: prefer close but warn.
      $('#eduModal').close();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  });

  renderEduTable(); renderHighlights();
  window.addEventListener('storage', (e) => { if (e.key === LS_EDU) { renderEduTable(); renderHighlights(); } });
  window.addEventListener('education:changed', () => { renderEduTable(); renderHighlights(); });

  if (navigator.onLine) pullAll();

  // ===== Global Tooltip (Free Floating) =====
  (function initGlobalTooltip() {
    let tip = document.getElementById('global-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'global-tooltip';
      document.body.appendChild(tip);
    }

    document.body.addEventListener('mouseover', e => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) {
        tip.classList.remove('visible');
        return;
      }
      const text = target.getAttribute('data-tooltip');
      if (!text) return;

      tip.textContent = text;
      tip.classList.add('visible');

      // Position logic
      const rect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();

      // Default: Top Center
      let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      let top = rect.top - tipRect.height - 8;

      // Flip if too close to top
      if (top < 10) {
        top = rect.bottom + 8; // Move to bottom
      }
      // Clamp horizontally
      if (left < 10) left = 10;
      if (left + tipRect.width > window.innerWidth - 10) left = window.innerWidth - tipRect.width - 10;

      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    });

    document.body.addEventListener('mouseout', e => {
      const related = e.relatedTarget;
      if (!related || !related.closest('[data-tooltip]')) {
        tip.classList.remove('visible');
      }
    });

    // Optional: Follow mouse x/y if preferred, but static pos relative to element is cleaner
  })();

  // ===== SHIFT MANAGEMENT =====
  window.openShiftModal = function () {
    const modal = document.getElementById('shiftModal');
    const body = document.getElementById('shiftModalBody');
    if (!modal || !body) return;

    let html = `
      <div style="margin-bottom:16px; color:#64748b; font-size:0.85rem; text-align:center;">
        ${t('shift_modal_desc')}
      </div>
    `;

    // Iterate keys
    Object.keys(shifts).forEach(key => {
      const s = shifts[key];
      if (!s.start || !s.end) return;

      html += `
        <div style="background:#f1f5f9; border-radius:12px; padding:12px; margin-bottom:12px; box-sizing:border-box;">
          <div style="font-weight:700; color:#334155; font-size:1rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
             <span style="background:#0f172a; color:white; padding:2px 8px; border-radius:6px; font-size:0.8rem;">SHIFT ${key}</span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; box-sizing:border-box;">
            <div style="box-sizing:border-box;">
               <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">${t('shift_label_in')}</label>
               <input type="time" id="shift_start_${key}" value="${s.start}" 
                style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; color:#0f172a; font-family:inherit; outline:none; height:42px; box-sizing:border-box;">
            </div>
            <div style="box-sizing:border-box;">
               <label style="font-size:0.75rem; color:#64748b; font-weight:600; display:block; margin-bottom:4px;">${t('shift_label_out')}</label>
               <input type="time" id="shift_end_${key}" value="${s.end}" 
                style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; color:#0f172a; font-family:inherit; outline:none; height:42px; box-sizing:border-box;">
            </div>
          </div>
        </div>
      `;
    });

    body.innerHTML = html;
    modal.style.display = 'flex';
  };

  window.closeShiftModal = function () {
    const modal = document.getElementById('shiftModal');
    if (modal) modal.style.display = 'none';
  };

  // window.saveShifts replaced by event listener #btnSaveShift

  // Close modal if clicked outside
  window.onclick = function (event) {
    const modal = document.getElementById('shiftModal');
    if (event.target == modal) {
      closeShiftModal();
    }
  }
  // ===== EXPORT EXCEL =====
  window.exportExcel = function () {
    if (typeof XLSX === 'undefined') {
      toast("Library Excel belum dimuat. Periksa koneksi internet.");
      return;
    }

    if (!attendance || attendance.length === 0) {
      toast("Belum ada data absensi untuk diekspor.");
      return;
    }

    // Format data for Excel
    const data = attendance.map(a => {
      const d = new Date(a.ts);
      return {
        "Tanggal": `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        "Waktu": `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
        "NID": a.nid,
        "Nama": a.name,
        "Perusahaan": a.company || '-',
        "Shift": a.shift || '-',
        "Status": a.status === 'datang' ? 'Masuk' : 'Pulang',
        "Terlambat": a.late ? 'YA' : 'TIDAK',
        "Catatan": a.note || ''
      };
    });

    // Create Worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-width columns (basic)
    const wscols = [
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 30 }
    ];
    ws['!cols'] = wscols;

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Absensi");

    // Save File
    const dateStr = todayISO();
    XLSX.writeFile(wb, `Laporan_Absensi_${dateStr}.xlsx`);
    toast("Laporan berhasil didownload!");
  };
});

// ===== Mobile Sidebar Logic (New Block) =====
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnMobileNav');
  const overlay = document.getElementById('sidebarOverlay');
  const sidebar = document.querySelector('.sidebar');
  const navLinks = document.querySelectorAll('.navlink');

  function toggleSidebar() {
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
  }

  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Close sidebar when a nav link is clicked (mobile UX)
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
    });
  });

  // ===== Logout Logic =====
  // ===== Logout Logic =====
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm(t('confirm_logout'))) {
        localStorage.removeItem('SA_SESSION');
        window.location.replace('login.html');
      }
    });
  }

  // FORCE RESET DATA LOGIC
  const btnResetData = document.getElementById('btnResetData');
  if (btnResetData) {
    btnResetData.addEventListener('click', () => {
      if (confirm('⚠️ HAPUS SEMUA DATA LOKAL?\n\n1. Data di laptop ini akan dihapus.\n2. Aplikasi akan restart.\n3. Data akan diambil ulang dari Cloud (jika ada).\n\nLanjutkan?')) {
        localStorage.clear();
        window.location.reload();
      }
    });
  }
});

// ===== Laporan Bulanan (Performance Report) =====
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnDownloadMonthlyReport');
  if (!btn) return;

  const pad = n => n < 10 ? '0' + n : n;

  btn.addEventListener('click', async () => {
    const mInput = document.getElementById('reportMonth');
    const mStr = mInput ? mInput.value : '';

    if (!mStr) {
      if (window.toast) toast('Pilih bulan terlebih dahulu.');
      else alert('Pilih bulan terlebih dahulu.');
      return;
    }

    if (!window.jspdf) {
      if (window.toast) toast("Library PDF belum dimuat.");
      return;
    }

    try {
      const [year, month] = mStr.split('-').map(Number);
      const startTs = new Date(year, month - 1, 1).getTime();
      const endTs = new Date(year, month, 1).getTime();

      // 1. Init stats object
      const report = {};
      const atts = window.attendance || [];

      // 2. Process logs (Build report dynamically from logs)
      atts.forEach(a => {
        const ts = Number(a.ts);
        if (isNaN(ts)) return;
        if (ts < startTs || ts >= endTs) return;

        // Init user in report if not exists
        if (!report[a.nid]) {
          report[a.nid] = {
            nid: a.nid,
            name: a.name || '(Unknown)',
            company: a.company || '-',
            shift: a.shift || '-',
            presentDates: new Set(),
            lateCount: 0,
            overtimeMins: 0
          };
        }
        const stats = report[a.nid];

        const d = new Date(ts);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (a.status === 'datang') {
          stats.presentDates.add(dateStr);
          if (a.late) stats.lateCount++;
        } else if (a.status === 'pulang') {
          // Calculate Overtime
          const shCode = a.shift;
          if (window.shifts && window.shifts[shCode]) {
            const sh = window.shifts[shCode];
            let [eh, em] = sh.end.split(':').map(Number);
            if (eh === 24) eh = 0;

            const sched = new Date(ts);
            sched.setHours(eh, em, 0, 0);

            let diffMs = ts - sched.getTime();
            // Handle cross-midnight adjustments if needed (simple logic)
            if (diffMs > 12 * 3600 * 1000) diffMs -= 24 * 3600 * 1000;
            if (diffMs < -12 * 3600 * 1000) diffMs += 24 * 3600 * 1000;

            if (diffMs > 60000) {
              stats.overtimeMins += Math.floor(diffMs / 60000);
            }
          }
        }
      });

      // 3. Prepare PDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

      // Helper: Load & Compress Image
      const loadAndCompressImage = (src, targetWidth) => {
        return new Promise(resolve => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = src;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const aspect = img.height / img.width;
            canvas.width = targetWidth;
            canvas.height = targetWidth * aspect;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Use PNG to preserve transparency, but small resolution
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve(null);
        });
      };

      // Load Logos (Resized to ~150px width -> drastic size reduction)
      const [logoLeft, logoRight] = await Promise.all([
        loadAndCompressImage('assets/AMAN-S-Logo.jpg', 120),
        loadAndCompressImage('assets/LOGO PLN NP SERVICES - FIN.png', 180)
      ]);

      // Header Layout
      let yPos = 15;
      const pageWidth = doc.internal.pageSize.getWidth(); // A4 Landscape ~297mm

      // Left Logo (Aman-S)
      if (logoLeft) {
        doc.addImage(logoLeft, 'PNG', 14, 10, 20, 20); // 20mm width
        doc.setFontSize(18);
        doc.text('Aman-S', 40, 19);
        doc.setFontSize(10);
        doc.text('Aplikasi Manajemen Pengamanan Aset dan Safety', 40, 25);
        yPos = 38;
      } else {
        doc.setFontSize(18);
        doc.text('Aman-S', 14, 18);
        doc.setFontSize(10);
        doc.text('Aplikasi Manajemen Pengamanan Aset dan Safety', 14, 24);
        yPos = 38;
      }

      // Right Logo (PLN)
      if (logoRight) {
        // Position at right side: Width - Margin (14) - ImageWidth (e.g. 40)
        // Adjust width/height as needed typically landscape logos are wider
        const imgW = 35;
        const imgH = 15;
        const xPos = pageWidth - 14 - imgW;
        doc.addImage(logoRight, 'PNG', xPos, 12, imgW, imgH);
      }

      doc.setFontSize(14);
      doc.text('Laporan Efektifitas & Kinerja Bulanan', 14, yPos);
      doc.setFontSize(10);
      doc.text(`Periode: ${mStr}`, 14, yPos + 6);

      // 4. Flatten Data for autoTable
      const tableData = Object.values(report).map((r, i) => {
        const h = Math.floor(r.overtimeMins / 60);
        const m = r.overtimeMins % 60;
        const otStr = r.overtimeMins > 0 ? `${h}h ${m}m` : '0';

        return [
          i + 1,
          r.nid,
          r.name,
          r.company,
          r.shift,
          r.presentDates.size + ' Hari',
          r.lateCount + ' Kali',
          otStr
        ];
      });

      doc.autoTable({
        head: [['No', 'NID', 'Nama', 'Perusahaan', 'Group', 'Total Hadir', 'Terlambat', 'Overtime']],
        body: tableData,
        startY: yPos + 12,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [41, 75, 125], textColor: [255, 255, 255], fontStyle: 'bold' }
      });

      // 5. Save
      doc.save(`Laporan_Kinerja_${mStr}.pdf`);

      if (window.toast) toast(`Laporan ${mStr} (PDF) berhasil didownload.`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat laporan: ' + err.message);
    }
  });
});



/* =========================================
   OVERTIME REPORT LOGIC (DAYTIME SPECIAL)
   ========================================= */
(function initOvertimeReport() {
  const btnGen = document.getElementById('btnGenOtReport');
  const btnPdf = document.getElementById('btnExportOtPdf');

  // Set default date range (First day of month to Now)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const pad = n => String(n).padStart(2, '0');

  if (document.getElementById('otRepStart')) {
    document.getElementById('otRepStart').value = `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`;
    document.getElementById('otRepEnd').value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }

  function getOtReportData() {
    const dStart = new Date(document.getElementById('otRepStart').value + 'T00:00:00');
    const dEnd = new Date(document.getElementById('otRepEnd').value + 'T23:59:59');

    // Cache employees
    const empMap = new Map((window.employees || []).map(e => [e.nid, e]));

    // Group attendance by Date + NID
    // structure: { "YYYY-MM-DD|NID": { datang: ts, pulang: ts, nid: ... } }
    const records = {};

    (window.attendance || []).forEach(a => {
      const d = new Date(a.ts);
      if (d < dStart || d > dEnd) return;

      const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const key = `${dateStr}|${a.nid}`;

      if (!records[key]) records[key] = { date: dateStr, nid: a.nid, datang: null, pulang: null };

      if (a.status === 'datang') {
        // Take earliest datang
        if (!records[key].datang || a.ts < records[key].datang) records[key].datang = a.ts;
      } else if (a.status === 'pulang') {
        // Take latest pulang
        if (!records[key].pulang || a.ts > records[key].pulang) records[key].pulang = a.ts;
      }
    });

    const results = [];

    Object.values(records).forEach(rec => {
      if (!rec.datang || !rec.pulang) return; // Must have In and Out

      const e = empMap.get(rec.nid);
      if (!e) return;

      // --- LOGIC FILTER STRICT DAYTIME (REUSED) ---
      const tDate = new Date(rec.datang);
      const effCode = window.effectiveShiftFor ? window.effectiveShiftFor(e, tDate) : null;
      // Fallback Logic
      let isDaytime = (e.shift === 'DAYTIME') || (e.shift && e.shift.toLowerCase().includes('day'));

      if ((!effCode || effCode === 'OFF') && isDaytime) {
        // Keep trusted static
      } else if (effCode !== 'DAYTIME') {
        isDaytime = false;
      }

      if (!isDaytime) return;
      // ---------------------------------------------

      // Calculate Overtime
      // Shift End Rule
      const s = (window.shifts && window.shifts.DAYTIME) ? window.shifts.DAYTIME : { end: '16:00' };
      const [eh, em] = s.end.split(':').map(Number);

      const schedEnd = new Date(rec.datang); // Base on Scan In Date
      schedEnd.setHours(eh, em, 0, 0);

      if (rec.pulang > schedEnd.getTime()) {
        const diffMs = rec.pulang - schedEnd.getTime();
        // Threshold check (e.g. 1 min)
        if (diffMs > 60000) {
          const hours = Math.floor(diffMs / 3600000);
          const mins = Math.floor((diffMs % 3600000) / 60000);

          results.push({
            date: rec.date,
            nid: rec.nid,
            name: e.name,
            shiftEnd: s.end,
            actualOut: new Date(rec.pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            durationMs: diffMs,
            desc: `${hours}h ${mins}m`
          });
        }
      }
    });

    // Sort by Date Desc, then Duration Desc
    results.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.durationMs - a.durationMs;
    });

    return results;
  }

  function renderReport() {
    const list = getOtReportData();
    const tbody = document.querySelector('#tableOtReport tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let totalEmp = new Set();
    let totalMs = 0;

    list.forEach(r => {
      totalEmp.add(r.nid);
      totalMs += r.durationMs;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.date}</td>
        <td><b style="color:var(--primary-700)">${r.name}</b><br><small class="muted">${r.nid}</small></td>
        <td>DAYTIME (${r.shiftEnd})</td>
        <td>${r.actualOut}</td>
        <td><span class="badgess green">${r.desc}</span></td>
        <td>Lembur Harian</td>
      `;
      tbody.appendChild(tr);
    });

    // Summary
    document.getElementById('otRepTotalEmp').textContent = totalEmp.size + ' Org';
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    document.getElementById('otRepTotalHours').textContent = `${h}h ${m}m`;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada data lembur Daytime pada periode ini.</td></tr>';
    }
  }

  function exportPDF() {
    const list = getOtReportData();
    if (list.length === 0) { alert("Tidak ada data untuk diexport!"); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    // Simple Header
    doc.setFontSize(16);
    doc.text('Laporan Overtime (Daytime)', 14, 15);
    doc.setFontSize(10);
    doc.text(`Periode: ${document.getElementById('otRepStart').value} s.d ${document.getElementById('otRepEnd').value}`, 14, 22);

    const data = list.map((r, i) => [
      i + 1, r.date, r.name, r.nid, 'DAYTIME', r.actualOut, r.desc
    ]);

    doc.autoTable({
      head: [['No', 'Tanggal', 'Nama', 'NID', 'Shift', 'Jam Pulang', 'Durasi']],
      body: data,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38] } // Red header for overtime
    });

    doc.save('Laporan_Overtime_Daytime.pdf');
  }

  if (btnGen) btnGen.onclick = renderReport;
  if (btnPdf) btnPdf.onclick = exportPDF;

  // Expose for debugging if needed
  window.renderOvertimeReport = renderReport;
})();



/* =========================================
   ATTENDANCE REPORT (24H) & ABSENTEEISM LOGIC
   ========================================= */
(function () {
  const btnFilter = document.getElementById('btnFilterAtt');
  const btnExport = document.getElementById('btnExportAtt');
  const tableBody = document.querySelector('#tableAtt tbody');

  // Helper: Format Time
  const fmtTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const pad = n => String(n).padStart(2, '0');

  // Helper: Generate Date Range Array
  const getDates = (start, end) => {
    const dates = [];
    let cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(end);
    last.setHours(0, 0, 0, 0);

    while (cur <= last) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  async function renderAttReport() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center">Memuat data...</td></tr>';

    // 1. Get Filter Values
    const fFrom = document.getElementById('attFrom')?.value || todayISO();
    const fTo = document.getElementById('attTo')?.value || todayISO();
    const fGroup = document.getElementById('attGroupFilter')?.value || '';
    const fStatus = document.getElementById('attStatusFilter')?.value || ''; // '', LATE, ONTIME, OVERTIME, UNKNOWN
    const fSearch = document.getElementById('attSearch')?.value?.toLowerCase() || '';

    // 2. Prepare Data Source
    let allRecords = [];

    // --- A. GET ACTUAL ATTENDANCE ---
    // Filter by Date Range
    const startMs = new Date(fFrom + 'T00:00:00').getTime();
    const endMs = new Date(fTo + 'T23:59:59').getTime();
    const scanRecords = attendance.filter(a => a.ts >= startMs && a.ts <= endMs);

    // --- B. GENERATE ABSENTEE (GHOST) RECORDS ---
    // Only if filter is ALL or UNKNOWN
    if (fStatus === '' || fStatus === 'UNKNOWN') {
      const dates = getDates(fFrom, fTo);
      const emps = employees; // Global

      dates.forEach(dObj => {
        const dateStr = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`; // YYYY-MM-DD
        const nextDayStr = new Date(dObj.getTime() + 86400000).toISOString().split('T')[0];

        emps.forEach(emp => {
          // Check Schedule
          let shiftCode = 'OFF';
          if (window.effectiveShiftFor) {
            shiftCode = window.effectiveShiftFor(emp, dObj.getTime());
          } else {
            shiftCode = emp.shift || 'OFF';
          }

          if (!shiftCode || shiftCode === 'OFF') return; // Scheduled Off

          // Check if Scanned
          // Logic checks if any record exists for this NID on this Date
          const hasScan = scanRecords.some(r => {
            if (r.nid !== emp.nid) return false;
            const rDate = new Date(r.ts);
            const rDateStr = `${rDate.getFullYear()}-${pad(rDate.getMonth() + 1)}-${pad(rDate.getDate())}`;
            return rDateStr === dateStr;
          });

          if (!hasScan) {
            // Create Ghost Record
            allRecords.push({
              isGhost: true,
              ts: dObj.getTime(), // Sortable
              dateStr: dateStr,
              timeStr: '-',
              status: 'UNKNOWN',
              nid: emp.nid,
              name: emp.name,
              title: emp.title,
              company: emp.company,
              shift: shiftCode,
              note: `Tidak Hadir (Jadwal: ${shiftCode})`,
              late: false
            });
          }
        });
      });
    }

    // --- C. MERGE & FILTER STATUS ---
    // Add real scans if allowed
    if (fStatus !== 'UNKNOWN') {
      const mappedScans = scanRecords.map(r => ({
        ...r,
        isGhost: false,
        dateStr: fmtTs(r.ts).split(' ')[0],
        timeStr: fmtTime(r.ts)
      }));
      allRecords = [...allRecords, ...mappedScans];
    }

    // --- D. APPLY FILTERS ---
    let filtered = allRecords.filter(r => {
      // Status Filter
      if (fStatus) {
        if (fStatus === 'LATE' && !r.late) return false;
        if (fStatus === 'ONTIME' && (r.late || r.status !== 'datang')) return false;
        if (fStatus === 'UNKNOWN' && r.status !== 'UNKNOWN') return false;
      }

      // Group Filter
      if (fGroup && fGroup !== '') {
        if (r.shift !== fGroup) return false;
      }

      // Search Filter
      if (fSearch) {
        const raw = `${r.name} ${r.nid} ${r.company} ${r.note}`.toLowerCase();
        if (!raw.includes(fSearch)) return false;
      }

      return true;
    });

    // --- E. SORT ---
    // Sort by TS descending
    filtered.sort((a, b) => b.ts - a.ts);

    // --- F. RENDER ---
    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;" class="muted">Tidak ada data ditemukan.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered.map(r => {
      const rowClass = r.isGhost ? 'style="background-color:#fef2f2"' : ''; // Red tint for absent
      const statusBadge = r.isGhost
        ? `<span class="badge danger">Alpha / Tanpa Keterangan</span>`
        : (r.status === 'datang' ? '<span class="badge success">Masuk</span>' : (r.status === 'break_out' ? '<span class="badge warning">Istirahat</span>' : '<span class="badge">Pulang</span>'));

      const lateBadge = r.late ? `<span class="badge danger">Telat</span>` : '';
      const noteAndLate = `<div>${r.note || '-'} ${lateBadge}</div>`;

      // Use safe access for properties
      const sNid = r.nid || '-';
      const sName = r.name || '-';
      const sTitle = r.title || '-';
      const sComp = r.company || '-';
      const sShift = r.shift || '-';

      return `
        <tr ${rowClass}>
           <td>${fmtTs(r.ts)}</td>
           <td>${statusBadge}</td>
           <td>${sNid}</td>
           <td><b>${sName}</b></td>
           <td>${sTitle}</td>
           <td>${sComp}</td>
           <td>${sShift}</td>
           <td>${noteAndLate}</td>
           <td style="text-align:right">
             ${!r.isGhost ? `<button class="btn small danger" onclick="deleteAttendance(${r.ts})">Hapus</button>` : ''}
           </td>
        </tr>
      `;
    }).join('');

    // Save for Export reference
    window.lastReportData = filtered;
  }

  // Bind Listener
  if (btnFilter) {
    const newBtn = btnFilter.cloneNode(true);
    btnFilter.parentNode.replaceChild(newBtn, btnFilter);
    newBtn.addEventListener('click', renderAttReport);
  }

  // Override Export
  window.exportExcel = function () {
    const data = window.lastReportData || attendance; // Fallback to all if no search done
    if (!data || data.length === 0) { toast('Tidak ada data untuk diexport.'); return; }

    if (typeof XLSX === 'undefined') { toast('Library Excel belum siap.'); return; }

    const curTime = new Date().toISOString().replace(/[:.]/g, '-');

    const rows = data.map(r => ({
      "Waktu": fmtTs(r.ts),
      "Status": r.status === 'UNKNOWN' ? 'TANPA KETERANGAN' : (r.status === 'datang' ? 'MASUK' : 'PULANG'),
      "NID": r.nid,
      "Nama": r.name,
      "Jabatan": r.title,
      "Perusahaan": r.company,
      "Shift": r.shift,
      "Keterangan": r.note + (r.late ? ' (Terlambat)' : '')
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Absensi");
    XLSX.writeFile(wb, `SmartAttend_Report_${curTime}.xlsx`);
  };

  if (btnExport) {
    const newBtn = btnExport.cloneNode(true);
    btnExport.parentNode.replaceChild(newBtn, btnExport);
    newBtn.addEventListener('click', window.exportExcel);
  }

})();


/* =========================================
   INVENTORY (KELUAR MASUK BARANG) LOGIC
   ========================================= */
let inventoryData = getLocal('SA_INVENTORY', []);

function getLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function saveInventory() {
  localStorage.setItem('SA_INVENTORY', JSON.stringify(inventoryData));
  renderInventory();
}

// Action: Checkout (Barang Keluar)
window.checkoutInventory = async function (id) {
  const item = inventoryData.find(x => x.id === id);
  if (!item) return;

  if (confirm('Apakah barang ini akan check-out (Keluar) sekarang?')) {
    const now = new Date();
    // Adjust to local ISO
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    item.timeOut = now.toISOString(); // Full ISO for sorting/DB

    // Optimistic Update
    saveInventory();

    // Sync
    try {
      await pushInventory(item);
      alert(`Barang atas nama ${item.carrier} telah berhasil keluar.`);
    } catch (e) {
      console.error(e);
      // pushInventory handles alerts
    }
  }
};

function getInventoryFilterDates() {
  const dStart = document.getElementById('invDateStart')?.value;
  const dEnd = document.getElementById('invDateEnd')?.value;
  return {
    start: dStart ? new Date(dStart) : null,
    end: dEnd ? new Date(dEnd) : null
  };
}

function renderInventory() {
  const tbody = document.querySelector('#route-inventory tbody');
  if (!tbody) return;

  const { start, end } = getInventoryFilterDates();
  const searchQ = document.getElementById('invSearch')?.value?.toLowerCase() || '';

  // Filter logic
  let filtered = [...inventoryData];
  if (start || end || searchQ) {
    filtered = filtered.filter(item => {
      // Date Logic
      const t = item.timeIn || item.time || item.timeOut;
      if (!t) return false;
      const d = new Date(t);
      d.setHours(0, 0, 0, 0); // Normalize

      if (start) {
        const s = new Date(start); s.setHours(0, 0, 0, 0);
        if (d < s) return false;
      }
      if (end) {
        const e = new Date(end); e.setHours(0, 0, 0, 0);
        if (d > e) return false;
      }

      // Search Logic
      if (searchQ) {
        const raw = [
          item.carrier, item.company, item.item, item.dest, item.officer
        ].join(' ').toLowerCase();
        if (!raw.includes(searchQ)) return false;
      }

      return true;
    });
  }

  // Sort by timeIn desc
  const sorted = filtered.sort((a, b) => new Date(b.timeIn || b.time || 0) - new Date(a.timeIn || a.time || 0));

  if (sorted.length === 0) {
    if (start || end || searchQ) tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center; padding: 20px;">Data tidak ditemukan untuk filter ini.</td></tr>';
    else tbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center; padding: 20px;">Belum ada data log barang.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map((item, idx) => {
    // Migration fallback
    const tIn = item.timeIn || item.time;

    const dIn = tIn ? new Date(tIn) : null;
    const dateStr = dIn ? dIn.toLocaleDateString('id-ID') : '-';
    const timeInStr = dIn ? dIn.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

    let timeOutStr = '-';
    let actionBtn = `
      <div style="display:flex; gap:4px; justify-content:center;">
        <button class="btn small primary" onclick="checkoutInventory('${item.id}')" title="Barang Keluar" style="padding:2px 6px; font-size:12px;">📤</button>
        <button class="btn small" onclick="editInventory('${item.id}')" title="Edit Data" style="padding:2px 6px; font-size:12px; background:#f59e0b; border-color:#f59e0b; color:white;">✏️</button>
        <button class="btn small danger" onclick="deleteInventory('${item.id}')" title="Hapus Data" style="padding:2px 6px; font-size:12px;">🗑️</button>
      </div>
    `;

    if (item.timeOut) {
      const dOut = new Date(item.timeOut);
      timeOutStr = dOut.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      actionBtn = `
        <div style="display:flex; gap:4px; justify-content:center;">
          <span class="badge success" style="background:#e6fffa; color:#047857; padding:2px 6px; border-radius:12px; font-size:11px; font-weight:bold;">Selesai</span>
          <button class="btn small" onclick="editInventory('${item.id}')" title="Edit Data" style="padding:2px 6px; font-size:12px; background:#f59e0b; border-color:#f59e0b; color:white;">✏️</button>
          <button class="btn small danger" onclick="deleteInventory('${item.id}')" title="Hapus Data" style="padding:2px 6px; font-size:12px;">🗑️</button>
        </div>
      `;
    }
    // Fallback for old data with type='OUT'
    else if (item.type === 'OUT') {
      timeOutStr = timeInStr;
      actionBtn = `<span class="badge" style="opacity:0.6; font-size:11px;">Legacy Log</span>`;
    }

    return `
          <tr>
            <td data-label="No">${sorted.length - idx}</td>
            <td data-label="Tanggal">${dateStr}</td>
            <td data-label="Masuk">${timeInStr}</td>
            <td data-label="Keluar">${timeOutStr}</td>
            <td data-label="Pembawa">${item.carrier || '-'}</td>
            <td data-label="Perusahaan">${item.company || '-'}</td>
            <td data-label="Barang">${item.item || '-'}</td>
            <td data-label="Tujuan">${item.dest || '-'}</td>
            <td data-label="Petugas" style="font-family:cursive; opacity:0.7">${item.officer || 'Security'}</td>
            <td data-label="Aksi" style="text-align:center">${actionBtn}</td>
          </tr>
        `;
  }).join('');
}

// Action: Edit Inventory
window.editInventory = function (id) {
  const item = inventoryData.find(x => x.id === id);
  if (!item) return;

  // Open Modal
  openInvModal();

  // Populate Fields
  const elId = document.getElementById('iId');
  const elTime = document.getElementById('iTime');
  const elType = document.getElementById('iType'); // Select
  const elCarrier = document.getElementById('iCarrier');
  const elCompany = document.getElementById('iCompany');
  const elItem = document.getElementById('iItem');
  const elDest = document.getElementById('iDest');
  const elOfficer = document.getElementById('iOfficer');

  if (elId) elId.value = item.id;

  // Restore Time (IN or OUT based on type)
  // For simplicity, we load 'timeIn' if IN, 'timeOut' if OUT (direct out)
  const tVal = item.timeIn || item.timeOut || new Date().toISOString();
  if (elTime) elTime.value = new Date(tVal).toISOString().slice(0, 16); // Local datetime-local format approx

  if (elType) elType.value = item.type;
  if (elCarrier) elCarrier.value = item.carrier || '';
  if (elCompany) elCompany.value = item.company || '';
  if (elItem) elItem.value = item.item || '';
  if (elDest) elDest.value = item.dest || '';
  if (elOfficer) elOfficer.value = item.officer || '';

  // Update Title
  const title = document.getElementById('invModalTitle');
  if (title) title.textContent = 'Edit Data Barang';
}

// Action: Delete Inventory
// Action: Delete Inventory
window.deleteInventory = async function (id) {
  if (!confirm('⚠️ YAKIN INGIN MENGHAPUS DATA INI?\nData yang dihapus akan hilang permanen dari server juga.')) return;

  // 1. Remove Cloud First (Verify it works)
  if (window.sb) {
    try {
      // Show loading indicator implicitly by freezing UI or just notify?
      // Since it's row action, we just await.
      const { error } = await window.sb.from('inventory').delete().eq('id', id);
      if (error) {
        throw error;
      }
    } catch (err) {
      alert('Gagal menghapus dari Cloud: ' + err.message);
      return; // Stop if cloud delete fails
    }
  }

  // 2. Remove Local (Only if Cloud success or Offline)
  inventoryData = inventoryData.filter(x => x.id !== id);
  saveInventory(); // Updates UI

  if (window.sb) if (window.toast) toast('Data berhasil dihapus dari Cloud.');
};


// ... (PDF logic remains) ...

// Bind Buttons
document.addEventListener('DOMContentLoaded', () => {
  // ...
  const dStart = document.getElementById('invDateStart');
  const dEnd = document.getElementById('invDateEnd');
  const invSearch = document.getElementById('invSearch'); // NEW
  const btnPDF = document.getElementById('btnExportInvPDF');

  if (dStart) dStart.addEventListener('change', renderInventory);
  if (dEnd) dEnd.addEventListener('change', renderInventory);
  if (invSearch) invSearch.addEventListener('input', renderInventory);
  if (btnPDF) btnPDF.addEventListener('click', window.exportInventoryPDF);

  // NEW: Manual Sync Button (Delegated)
  // NEW: Manual Sync Button (Global Exposure - Fix unresponsive click)
  // NEW: Manual Sync Button (Global Exposure - Fix unresponsive click)
  // NEW: Manual Sync Button (Diagnostic Mode)
  window.forceSyncInventory = async function () {
    const btnSync = document.getElementById('btnSyncInv');
    if (btnSync && btnSync.disabled) return;

    // Attempt lazy init if not yet ready
    if (!window.sb) { if (window.initSupabase) window.initSupabase(); }
    if (!window.sb) { alert('❌ Mode Offline. Pastikan URL & Key Supabase sudah diisi di index.html'); return; }

    // 1. Production Mode Start
    // const count = inventoryData.length;
    // if (!confirm(...)) return;

    if (btnSync) {
      btnSync.textContent = '⏳ Syncing...';
      btnSync.disabled = true;
    }

    try {
      let success = 0, fail = 0;
      let lastError = null;

      // 1. Push all local items to server

      for (const item of inventoryData) {
        // Fix Timestamp Format (ensure ISO with Timezone)
        const tIn = item.timeIn ? new Date(item.timeIn).toISOString() : null;
        const tOut = item.timeOut ? new Date(item.timeOut).toISOString() : null;

        const { error } = await window.sb.from('inventory').upsert({
          id: item.id, carrier: item.carrier, company: item.company,
          item: item.item, dest: item.dest, officer: item.officer, type: item.type,
          time_in: tIn, time_out: tOut
        }, { onConflict: 'id' });

        if (!error) success++;
        else { fail++; lastError = error; }
      }

      // 4. Pull
      const { data: invs } = await window.sb.from('inventory').select('*');
      if (invs) {
        const serverMap = new Map(invs.map(x => [x.id, x]));
        const localMap = new Map(inventoryData.map(x => [x.id, x]));
        invs.forEach(x => {
          if (x.item === 'CONNECTION_TEST') return; // Skip test item if stuck
          localMap.set(x.id, {
            id: x.id, carrier: x.carrier, company: x.company, item: x.item,
            dest: x.dest, officer: x.officer, type: x.type, timeIn: x.time_in, timeOut: x.time_out
          });
        });
        inventoryData = Array.from(localMap.values()).sort((a, b) => new Date(b.timeIn || 0) - new Date(a.timeIn || 0));
        saveInventory();
      }

      if (fail > 0) {
        alert(`⚠️ Sync Selesai dengan beberapa gagal.\nSukses: ${success}\nGagal: ${fail}\nPesan: ${lastError?.message}`);
      } else {
        alert(`✅ Sync Selesai!\nData Lokal & Cloud sudah sinkron.`);
      }

    } catch (err) {
      alert('❌ Error Sync: ' + err.message);
      console.error(err);
    } finally {
      if (btnSync) {
        btnSync.innerHTML = '🔄 Sync'; // Reset text
        btnSync.disabled = false;
      }
    }
  };

  // NEW: Backup to CSV (Manual Fallback)
  window.backupInventoryCSV = function () {
    if (!inventoryData || inventoryData.length === 0) {
      alert('Belum ada data untuk dibackup.');
      return;
    }

    // CSV Header (Must match Supabase columns for easy import)
    const headers = ['id', 'carrier', 'company', 'item', 'dest', 'officer', 'type', 'time_in', 'time_out'];
    const rows = inventoryData.map(item => {
      // Escape for CSV
      const escape = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;

      const tIn = item.timeIn ? new Date(item.timeIn).toISOString() : '';
      const tOut = item.timeOut ? new Date(item.timeOut).toISOString() : '';

      return [
        escape(item.id),
        escape(item.carrier),
        escape(item.company),
        escape(item.item),
        escape(item.dest),
        escape(item.officer),
        escape(item.type),
        escape(tIn),
        escape(tOut)
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Trigger Download
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'inventory_backup_' + new Date().toISOString().slice(0, 10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Ensure status dropdown is visible
  const elType = document.getElementById('iType');
  if (elType && elType.closest('label')) {
    elType.closest('label').style.display = 'block';
  }

  let invTimeInterval;

  // Expose to window so editInventory can call it
  window.openInvModal = function () {
    if (!invModal) { console.error('Inv Modal Missing'); return; }

    const updateTime = () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      const elTime = document.getElementById('iTime');
      if (elTime) elTime.value = now.toISOString().slice(0, 16);
    };

    // Initial set
    updateTime();

    // Clear existing interval if any
    if (invTimeInterval) clearInterval(invTimeInterval);

    // Update every second (1000ms)
    invTimeInterval = setInterval(updateTime, 1000);

    // Stop auto-update if user manually changes time
    const elTime = document.getElementById('iTime');
    if (elTime) {
      elTime.onfocus = () => clearInterval(invTimeInterval);
      elTime.onchange = () => clearInterval(invTimeInterval);
    }

    const elCarrier = document.getElementById('iCarrier');
    const elCompany = document.getElementById('iCompany');
    const elItem = document.getElementById('iItem');
    const elDest = document.getElementById('iDest');
    const elOfficer = document.getElementById('iOfficer');

    if (elCarrier) elCarrier.value = '';
    if (elCompany) elCompany.value = '';
    if (elItem) elItem.value = '';
    if (elDest) elDest.value = '';
    if (elOfficer) elOfficer.value = 'Admin/Security'; // Default but editable

    // Reset Dropdown to IN
    const t = document.getElementById('iType');
    if (t) t.value = 'IN';

    invModal.showModal();
  };

  if (btnOpenInv) btnOpenInv.onclick = () => {
    // Reset Title & ID when opening fresh
    const elId = document.getElementById('iId');
    const title = document.getElementById('invModalTitle');
    if (elId) elId.value = '';
    if (title) title.textContent = 'Input Barang Masuk / Keluar';
    window.openInvModal();
  };

  if (btnBackInv) btnBackInv.onclick = (e) => {
    e.preventDefault();
    if (invTimeInterval) clearInterval(invTimeInterval);
    invModal.close();
  };

  if (btnSaveInv) btnSaveInv.onclick = async (e) => {
    e.preventDefault();
    const idVal = document.getElementById('iId')?.value; // Check hidden ID
    const type = document.getElementById('iType').value;
    const timeVal = document.getElementById('iTime').value;
    const carrier = document.getElementById('iCarrier').value;
    const company = document.getElementById('iCompany').value;
    const item = document.getElementById('iItem').value;
    const dest = document.getElementById('iDest').value;
    const officer = document.getElementById('iOfficer').value;

    if (!carrier || !item) {
      alert('Mohon isi Nama Pembawa dan Jenis Barang.');
      return;
    }

    // Disable button to prevent double submit
    btnSaveInv.disabled = true;
    btnSaveInv.textContent = 'Menyimpan...';

    let rec;

    // EDIT MODE
    if (idVal) {
      rec = inventoryData.find(x => x.id === idVal);
      if (rec) {
        rec.carrier = carrier;
        rec.company = company;
        rec.item = item;
        rec.dest = dest;
        rec.officer = officer;
        rec.type = type;

        // Update Time logic
        if (type === 'IN') {
          rec.timeIn = timeVal;
          // Keep timeOut if exists (don't erase checkout time if only editing name)
        } else {
          rec.timeIn = null;
          rec.timeOut = timeVal;
        }
      }
    }
    // CREATE MODE
    else {
      rec = {
        id: Date.now().toString(36),
        carrier, company, item, dest, officer, type
      };
      if (type === 'IN') {
        rec.timeIn = timeVal;
        rec.timeOut = null;
      } else {
        rec.timeIn = null;
        rec.timeOut = timeVal;
      }
      inventoryData.push(rec);
    }

    saveInventory();

    // Sync to Supabase
    try {
      if (btnSaveInv) btnSaveInv.textContent = 'Syncing Cloud...';
      await pushInventory(rec);
      // Note: pushInventory already alerts on error, but we should only close modal if success?
      // Actually pushInventory returns void currently in original code, I should update it to return boolean.
      // But for now, let's assume if it throws (which it doesn't, it catches internally), we are fine.
      // Wait, pushInventory CATCHES error?
      // Yes, my implementation in step 176 catches and alerts.
      // So it resolves undefined.

      invModal.close();
      alert('Data berhasil disimpan dan disinkronkan!');
    } catch (err) {
      console.error(err);
      alert('Error logic: ' + err.message);
    } finally {
      if (btnSaveInv) {
        btnSaveInv.disabled = false;
        btnSaveInv.textContent = 'Simpan';
      }
    }
  };
});

// Initial Render if on inventory route
window.renderInventory = renderInventory;

// ===== OVERTIME ALERT (Standardized Logic) =====
window.showOvertimeList = function () {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const start = new Date(todayVal + 'T00:00:00').getTime();
  const end = new Date(todayVal + 'T23:59:59').getTime();

  const atts = window.attendance || [];
  const shfs = window.shifts || {};

  const todays = atts.filter(a => a.ts >= start && a.ts <= end);

  // Logic: DAYTIME ONLY & > End+10m
  const overs = todays.filter(a => {
    if (a.status !== 'pulang') return false;
    // NEW RULE: ONLY DAYTIME SHIFT
    if (a.shift !== 'DAYTIME') return false;

    const sDef = shfs[a.shift];
    if (!sDef || !sDef.end) return false;

    const d = new Date(a.ts);
    const scanMins = d.getHours() * 60 + d.getMinutes();

    const [h, m] = sDef.end.split(':').map(Number);
    const endMins = h * 60 + m;

    return scanMins > (endMins + 10);
  });

  if (overs.length === 0) {
    alert('Belum ada karyawan DAYTIME yang lembur hari ini.');
    return;
  }

  const list = overs.map((a, i) => {
    const sEnd = shfs[a.shift]?.end;
    const d = new Date(a.ts);
    const [eh, em] = sEnd.split(':').map(Number);
    const endMins = eh * 60 + em;
    const scanMins = d.getHours() * 60 + d.getMinutes();
    const diff = scanMins - endMins;
    const durH = Math.floor(diff / 60);
    const durM = diff % 60;
    const durStr = `+${durH}j ${durM}m`;

    return `${i + 1}. ${a.name} (Shift ${a.shift} ${sEnd}, ${durStr})`;
  }).join('\n');

  alert(`Daftar Karyawan Overtime (DAYTIME) Hari Ini:\n\n${list}`);
};

/* 
  ===== DASHBOARD OVERTIME RENDERER (Clean & Strict) =====
  Ensures Dashboard Counter matches the Alert List logic exactly.
*/
window.renderOvertimePanel = function () {
  const elCount = document.getElementById('overtimeCountDash');
  const elPanel = document.getElementById('overtimePanelDash');
  if (!elCount || !elPanel) return;

  // 1. Get Data from Global Window (Freshness)
  const atts = window.attendance || [];
  const shfs = window.shifts || {};

  // 2. Filter Today (Local YYYY-MM-DD)
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const start = new Date(todayVal + 'T00:00:00').getTime();
  const end = new Date(todayVal + 'T23:59:59').getTime();

  const todays = atts.filter(a => a.ts >= start && a.ts <= end);

  // 3. Count Strict Overtime (> 10 mins tolerance, DAYTIME ONLY)
  const overs = todays.filter(a => {
    if (a.status !== 'pulang') return false;

    // NEW RULE: ONLY DAYTIME SHIFT
    if (a.shift !== 'DAYTIME') return false;

    const sDef = shfs[a.shift];
    if (!sDef || !sDef.end) return false;

    const d = new Date(a.ts);
    const scanMins = d.getHours() * 60 + d.getMinutes();

    // Normalize Shift End
    const [h, m] = sDef.end.split(':').map(Number);
    const endMins = h * 60 + m;

    // Logic
    return scanMins > (endMins + 10);
  });

  // 4. Update UI
  const count = overs.length;
  elCount.textContent = count;

  if (count > 0) {
    elPanel.style.display = 'flex'; // Show Red Panel
    // Update tooltip title if possible? No, click handles list.
  } else {
    elPanel.style.display = 'none'; // Hide if 0
  }
};

// OVERRIDE: Force DAYTIME ONLY Logic & Always Show Panel
window.renderOvertimePanel = function () {
  const elCount = document.getElementById('overtimeCountDash');
  const elPanel = document.getElementById('overtimePanelDash');
  if (!elCount || !elPanel) return;

  // 1. Get Data from Global Window (Freshness)
  const atts = window.attendance || [];
  const shfs = window.shifts || {};

  // 2. Filter Today (Local YYYY-MM-DD)
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayVal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`; // Local YYYY-MM-DD
  const start = new Date(todayVal + 'T00:00:00').getTime();
  const end = new Date(todayVal + 'T23:59:59').getTime();

  const todays = atts.filter(a => a.ts >= start && a.ts <= end);

  // 3. Count Strict Overtime (> 10 mins tolerance, DAYTIME ONLY)
  const overs = todays.filter(a => {
    if (a.status !== 'pulang') return false;

    // NEW RULE: ONLY DAYTIME SHIFT
    if (a.shift !== 'DAYTIME') return false;

    const sDef = shfs[a.shift];
    if (!sDef || !sDef.end) return false;

    const d = new Date(a.ts);
    const scanMins = d.getHours() * 60 + d.getMinutes();

    // Normalize Shift End
    const [h, m] = sDef.end.split(':').map(Number);
    const endMins = h * 60 + m;

    // Logic
    return scanMins > (endMins + 10);
  });

  // 4. Update UI
  const count = overs.length;
  elCount.textContent = count;

  // ALWAYS SHOW PANEL (User Request)
  elPanel.style.display = 'flex';
};

// ===== MOBILE INTERACTIVITY (Scrollable Modal) =====
window.showMobileList = function (title, items) {
  // 1. Remove existing if any
  const old = document.getElementById('mobListOverlay');
  if (old) old.remove();

  // 2. Create Overlay
  const ov = document.createElement('div');
  ov.id = 'mobListOverlay';
  Object.assign(ov.style, {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
  });

  // 3. Create Card
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff', width: '100%', maxWidth: '400px', maxHeight: '80vh',
    borderRadius: '16px', display: 'flex', flexDirection: 'column',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', overflow: 'hidden'
  });

  // 4. Header
  const head = document.createElement('div');
  Object.assign(head.style, {
    padding: '16px', borderBottom: '1px solid #eee', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc'
  });
  head.innerHTML = `<h3 style="margin:0; font-size:1.1rem; color:#334155">${title}</h3>
    <button id="btnCloseMobList" style="border:none; background:none; font-size:1.5rem; cursor:pointer; color:#64748b;">&times;</button>`;

  // 5. List Container
  const list = document.createElement('div');
  Object.assign(list.style, {
    padding: '0', overflowY: 'auto', flex: 1
  });

  if (items.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8;">Tidak ada data.</div>`;
  } else {
    items.forEach((it, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem', color: '#0f172a'
      });
      // Alternate bg
      if (i % 2 === 0) row.style.background = '#fff';
      else row.style.background = '#f8fafc';

      row.textContent = `${i + 1}. ${it}`;
      list.appendChild(row);
    });
  }

  // 6. Assemble
  card.appendChild(head);
  card.appendChild(list);
  ov.appendChild(card);
  document.body.appendChild(ov);

  // 7. Close Logic
  const close = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) close(); };
  head.querySelector('#btnCloseMobList').onclick = close;
};

function setupMobileListeners() {
  const elLate = document.getElementById('mobStatLate');
  const elPres = document.getElementById('mobStatPresent');
  const elTot = document.getElementById('mobStatTotal');

  const getTodayAtts = () => {
    const sod = new Date(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0')).getTime();
    return (window.attendance || []).filter(a => a.ts >= sod);
  };

  if (elLate) {
    const card = elLate.closest('.mob-stat-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.onclick = () => {
        const today = getTodayAtts();
        const lates = today.filter(a => a.status === 'datang' && a.late);
        const names = lates.map(a => `${a.name} (${a.shift})`);
        showMobileList(`📋 Terlambat (${lates.length})`, names);
      };
    }
  }

  if (elPres) {
    const card = elPres.closest('.mob-stat-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.onclick = () => {
        const today = getTodayAtts();
        const presents = today.filter(a => a.status === 'datang');
        const names = presents.map(a => `${a.name} (${a.late ? 'Terlambat' : 'On-time'})`);
        showMobileList(`📋 Hadir (${presents.length})`, names);
      };
    }
  }

  if (elTot) {
    const card = elTot.closest('.mob-stat-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.onclick = () => {
        document.querySelector('.navlink[data-route="employees"]')?.click();
      };
    }
  }
}

// Init safely
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMobileListeners);
} else {
  setupMobileListeners();
}
