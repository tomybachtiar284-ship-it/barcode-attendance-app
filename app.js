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
  const capStatus = s => s === 'datang' ? 'Masuk' : 'Keluar';
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
      /* D removed */
      DAYTIME: { start: '08:00', end: '16:00' }
    }),
    news = load(LS_NEWS, []),
    sched = load(LS_SCHED, {});
  /* Cleanup removed */
  if (shifts.D) { delete shifts.D; save(LS_SHIFTS, shifts); }

  // expose ke window agar script lain dapat ikut pakai
  function syncGlobals() {
    window.employees = employees;
    window.attendance = attendance;
    window.shifts = shifts;
    window.sched = sched;
  }
  syncGlobals();

  // ===== SUPABASE SYNC =====
  let sb = null;
  if (window.SA_SUPABASE_URL && window.SA_SUPABASE_ANON && window.supabase) {
    sb = window.supabase.createClient(window.SA_SUPABASE_URL, window.SA_SUPABASE_ANON);
  }

  async function compressImage(file, maxW, maxH, q) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const cvs = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxH) { w *= maxH / h; h = maxH; }
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cvs.toDataURL('image/jpeg', q));
      };
      img.onerror = reject;
    });
  }

  async function pushEmployee(e) {
    if (!sb) return false;
    const { error } = await sb.from('employees').upsert({
      nid: e.nid, name: e.name, title: e.title, company: e.company,
      shift: e.shift, photo: e.photo, updated_at: new Date().toISOString()
    }, { onConflict: 'nid' });
    if (error) {
      console.error('Push emp error:', error);
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
    const { error } = await sb.from('attendance').insert({
      ts: r.ts, status: r.status, nid: r.nid, name: r.name,
      title: r.title, company: r.company, shift: r.shift,
      note: r.note, late: r.late, ok_shift: r.okShift,
      created_at: new Date(r.ts).toISOString()
    });
    if (error) console.error('Push att error:', error);
  }
  async function delAttendance(ts) {
    if (!sb) return;
    await sb.from('attendance').delete().eq('ts', ts);
  }

  async function pushNews(n) {
    if (!sb) return;
    const { error } = await sb.from('news').upsert({
      ts: n.ts, title: n.title, body: n.body, link: n.link
    }, { onConflict: 'ts' });
    if (error) console.error('Push news error:', error);
  }
  async function delNews(ts) {
    if (!sb) return;
    await sb.from('news').delete().eq('ts', ts);
  }

  async function pushEdu(e) {
    if (!sb) return;
    const { error } = await sb.from('education').upsert({
      id: e.id, ts: e.ts, title: e.title, body: e.body, img: e.img
    }, { onConflict: 'id' });
    if (error) console.error('Push edu error:', error);
  }
  async function delEdu(id) {
    if (!sb) return;
    await sb.from('education').delete().eq('id', id);
  }

  async function pushShifts() {
    if (!sb) return;
    await sb.from('settings').upsert({ key: 'shifts', value: shifts }, { onConflict: 'key' });
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
    const { data: atts } = await sb.from('attendance').select('*').gte('ts', since);
    if (atts) {
      const old = attendance.filter(a => a.ts < since);
      const newAtts = atts.map(x => ({
        ts: x.ts, status: x.status, nid: x.nid, name: x.name,
        title: x.title, company: x.company, shift: x.shift,
        note: x.note, late: x.late, okShift: x.ok_shift
      }));
      attendance = [...old, ...newAtts].sort((a, b) => a.ts - b.ts);
      save(LS_ATT, attendance);
    }

    // News
    const { data: nws } = await sb.from('news').select('*');
    if (nws) {
      // MERGE LOCAL & SERVER: Keep local items (unsynced) + Server items (source of truth)
      const combined = [...news];
      nws.forEach(rem => {
        const idx = combined.findIndex(loc => loc.ts === rem.ts);
        const cleanRem = { ts: rem.ts, title: rem.title, body: rem.body, link: rem.link };
        if (idx >= 0) {
          combined[idx] = cleanRem; // Update existing
        } else {
          combined.push(cleanRem); // Add new from server
        }
      });
      // Deduplicate by ts just in case
      const seen = new Set();
      news = combined.filter(x => {
        if (seen.has(x.ts)) return false;
        seen.add(x.ts);
        return true;
      }).sort((a, b) => b.ts - a.ts);
      save(LS_NEWS, news);
    }

    // Education
    const { data: edus } = await sb.from('education').select('*');
    if (edus) {
      const eduList = edus.map(x => ({ id: x.id, ts: x.ts, title: x.title, body: x.body, img: x.img }));
      saveEdu(eduList);
    }

    // Shifts
    const { data: sh } = await sb.from('settings').select('*').eq('key', 'shifts').single();
    if (sh && sh.value) {
      shifts = sh.value;
      if (shifts.D) { delete shifts.D; pushShifts(); } // Auto-clean server
      save(LS_SHIFTS, shifts);
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
  $$('.navlink').forEach(btn => btn.addEventListener('click', () => {
    $$('.navlink').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    const route = btn.dataset.route; $$('.route').forEach(s => s.classList.add('hidden'));
    $('#route-' + route)?.classList.remove('hidden');
    if (route === 'dashboard') { renderDashboard(); }
    if (route === 'employees') renderEmployees();
    if (route === 'attendance') renderAttendance();
    if (route === 'scan') { renderScanPage(); $('#scanInput')?.focus(); }
    if (route === 'latest') renderLatest();
    if (route === 'shifts') { renderShiftForm(); initMonthlyScheduler(); }
  }));

  // Clock
  function tick() {
    const t = fmtTs(Date.now()).split(' ')[1];
    $('#liveClock') && ($('#liveClock').textContent = t);
    $('#liveClockScan') && ($('#liveClockScan').textContent = t);
  }
  setInterval(tick, 1000); tick();

  // Shift helpers
  const SHIFT_KEYS = ['A', 'B', 'C', 'D', 'DAYTIME'];
  const CODE_TO_LABEL = { A: 'P', B: 'S', C: 'M', DAYTIME: 'DAY', OFF: 'L' };
  const LABEL_TO_CODE = {
    'a': 'A', 'p': 'A', 'pagi': 'A',
    'b': 'B', 's': 'B', 'sore': 'B',
    'c': 'C', 'm': 'C', 'malam': 'C',
    /* D removed */
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
    ['A', 'B', 'C', 'DAYTIME'].forEach(code => {
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
      A: 'Shift Pagi (P)',
      B: 'Shift Sore (S)',
      C: 'Shift Malam (M)',
      /* D removed */
      DAYTIME: 'Day Time'
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

  function renderOvertimePanel() {
    const targets = [
      { host: document.getElementById('overtimePanelScan'), count: document.getElementById('overtimeCount') },
      { host: document.getElementById('overtimePanelDash'), count: document.getElementById('overtimeCountDash') }
    ];

    const t = now();
    const latestMap = {};
    attendance.forEach(a => {
      if (!latestMap[a.nid] || a.ts > latestMap[a.nid].ts) {
        latestMap[a.nid] = a;
      }
    });

    let otCount = 0;
    employees.forEach(e => {
      const last = latestMap[e.nid];
      if (last && last.status === 'datang') {
        const effShift = effectiveShiftFor(e, t);
        if (effShift && effShift !== 'OFF' && shifts[effShift]) {
          const sEndStr = shifts[effShift].end;
          const checkDate = new Date(last.ts);
          const baseDateStr = `${checkDate.getFullYear()}-${pad(checkDate.getMonth() + 1)}-${pad(checkDate.getDate())}`;
          let sEnd = toDateFromHM(baseDateStr, sEndStr);
          if (shifts[effShift].end < shifts[effShift].start) {
            sEnd = new Date(sEnd.getTime() + 24 * 3600 * 1000);
          }
          if (now().getTime() > sEnd.getTime()) {
            otCount++;
          }
        }
      }
    });

    targets.forEach(({ host, count }) => {
      if (!host || !count) return;
      if (otCount > 0) {
        host.style.display = 'flex';
        count.textContent = otCount;
        host.title = `Klik untuk melihat ${otCount} karyawan overtime`;
      } else {
        host.style.display = 'none';
      }
    });
  }

  // Function to show details
  window.showOvertimeList = function () {
    const t = now();
    const latestMap = {};
    attendance.forEach(a => { if (!latestMap[a.nid] || a.ts > latestMap[a.nid].ts) latestMap[a.nid] = a; });

    const otList = [];
    employees.forEach(e => {
      const last = latestMap[e.nid];
      if (last && last.status === 'datang') {
        const effShift = effectiveShiftFor(e, t);
        if (effShift && effShift !== 'OFF' && shifts[effShift]) {
          const sEndStr = shifts[effShift].end;
          const checkDate = new Date(last.ts);
          const baseDateStr = `${checkDate.getFullYear()}-${pad(checkDate.getMonth() + 1)}-${pad(checkDate.getDate())}`;
          let sEnd = toDateFromHM(baseDateStr, sEndStr);
          if (shifts[effShift].end < shifts[effShift].start) sEnd = new Date(sEnd.getTime() + 24 * 3600 * 1000);

          const diff = now().getTime() - sEnd.getTime();
          if (diff > 0) {
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            otList.push(`${e.name} (Shift ${shifts[effShift].end}, +${h}j ${m}m)`);
          }
        }
      }
    });

    if (otList.length > 0) {
      alert("Daftar Karyawan Overtime:\n\n" + otList.map((n, i) => `${i + 1}. ${n}`).join('\n'));
    } else {
      toast('Tidak ada data overtime saat ini.');
    }
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
    renderOvertimePanel();
    renderNewsWidgets();
    renderCompanyPresence();
    renderLiveCompanyStats();
  }
  renderDashboard();
  setInterval(renderLiveCompanyStats, 30000);

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
  function nextStatusFor(nid) { const sod = new Date(todayISO() + 'T00:00:00').getTime(); const cnt = attendance.filter(a => a.nid === nid && a.ts >= sod).length; return (cnt % 2 === 0) ? 'datang' : 'pulang'; }
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

    const status = nextStatusFor(emp.nid);
    const sWin = effShift === 'OFF' ? null : shiftWindow(effShift);
    const inWin = sWin ? isInWindow(minutesOf(ts), sWin) : false;

    // === Late calc yang akurat (berdasarkan tanggal basis shift) ===
    let late = false;
    if (effShift !== 'OFF' && status === 'datang' && sWin) {
      const baseDay = scheduleDateFor(effShift, ts);
      const startDate = toDateFromHM(baseDay, shifts[effShift]?.start || '00:00');
      late = ts.getTime() >= (startDate.getTime() + 5 * 60 * 1000);
    }

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
      const q = $('#searchEmp')?.value?.toLowerCase() || '';
      currentFilteredEmp = employees.filter(e => (e.nid + ' ' + e.name + ' ' + (e.company || '')).toLowerCase().includes(q));
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
          <table class="table">
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
            <td><div style="width:40px;height:40px;border-radius:10px;background:#eef4ff url('${e.photo || ''}') center/cover no-repeat; border:1px solid var(--line)"></div></td>
            <td style="font-weight:600">${e.nid}</td>
            <td>${e.name}</td>
            <td style="color:var(--muted)">${e.title}</td>
            <td><span style="background:var(--surface-2); padding:4px 8px; border-radius:6px; font-size:0.85rem; font-weight:600; color:var(--primary-700)">Group ${e.shift || '-'}</span></td>
            <td style="text-align:right">
              <button class='btn' data-act='edit' data-id='${e.nid}' title="Edit">✏️</button>
              <button class='btn' data-act='barcode' data-id='${e.nid}' title="ID Card">🏷️</button>
              <button class='btn ghost' data-act='del' data-id='${e.nid}' title="Hapus">🗑️</button>
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
  $('#btnAddEmp')?.addEventListener('click', () => openEmp());

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
    const rows = [{ NID: 'EMP001', Nama: 'Nama Lengkap', Jabatan: 'Operator', Perusahaan: 'PT PLN NPS', Grup: 'A', FotoURL: 'https://…' }];
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
        shiftd: alt.D || { start: '07:00', end: '15:00' },
        day: alt.DAYTIME || alt.A || { start: '08:00', end: '16:00' }
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
    const day = {
      start: pickVal('#shiftDayStart', '') || '08:00',
      end: pickVal('#shiftDayEnd', '') || '16:00'
    };
    /* shiftd removed */
    return { pagi, sore, malam, day };
  }
  function renderShiftForm() {
    const pagi = shifts.A || { start: '08:00', end: '16:00' };
    const sore = shifts.B || { start: '16:00', end: '24:00' };
    const malam = shifts.C || { start: '24:00', end: '07:00' };
    const day = shifts.DAYTIME || { start: pagi.start, end: pagi.end };
    /* shiftd removed */

    $('#shiftPagiStart') && ($('#shiftPagiStart').value = pagi.start);
    $('#shiftPagiEnd') && ($('#shiftPagiEnd').value = pagi.end);
    $('#shiftSoreStart') && ($('#shiftSoreStart').value = sore.start);
    $('#shiftSoreEnd') && ($('#shiftSoreEnd').value = sore.end);
    $('#shiftMalamStart') && ($('#shiftMalamStart').value = malam.start);
    $('#shiftMalamEnd') && ($('#shiftMalamEnd').value = malam.end);
    $('#shiftDayStart') && ($('#shiftDayStart').value = day.start);
    $('#shiftDayEnd') && ($('#shiftDayEnd').value = day.end);
    /* shiftd inputs removed */

    $('#shiftAStart') && ($('#shiftAStart').value = pagi.start);
    $('#shiftAEnd') && ($('#shiftAEnd').value = pagi.end);
    $('#shiftBStart') && ($('#shiftBStart').value = sore.start);
    $('#shiftBEnd') && ($('#shiftBEnd').value = sore.end);
    $('#shiftCStart') && ($('#shiftCStart').value = malam.start);
    $('#shiftCEnd') && ($('#shiftCEnd').value = malam.end);
  }
  $('#btnSaveShift')?.addEventListener('click', () => {
    const { pagi, sore, malam, day } = getShiftInputs();
    shifts = {
      A: { start: normalizeTime(pagi.start), end: normalizeTime(pagi.end) },
      B: { start: normalizeTime(sore.start), end: normalizeTime(sore.end) },
      C: { start: normalizeTime(malam.start), end: normalizeTime(malam.end) },
      /* D removed */
      DAYTIME: { start: normalizeTime(day.start), end: normalizeTime(day.end) }
    };
    save(LS_SHIFTS, shifts); syncGlobals();
    pushShifts();
    toast('Pengaturan shift disimpan.');
    renderDashboard(); renderCurrentShiftPanel();
  });

  // ===== Attendance (laporan) =====
  function renderAttendance() {
    const to = new Date(), from = new Date(to.getTime() - 24 * 3600 * 1000);
    $('#attFrom').value = from.toISOString().slice(0, 10); $('#attTo').value = to.toISOString().slice(0, 10);
    filterAttendance();
  }
  function filterAttendance() {
    const tb = $('#tableAtt tbody'); if (!tb) return;
    const from = new Date($('#attFrom').value + 'T00:00:00').getTime(), to = new Date($('#attTo').value + 'T23:59:59').getTime();

    // Search query
    const q = ($('#attSearch')?.value || '').toLowerCase().trim();

    const rows = attendance.filter(a => {
      // 1. Check Date
      if (a.ts < from || a.ts > to) return false;

      // 2. Check Search (Name or NID)
      if (q) {
        const text = (a.name + ' ' + a.nid).toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.ts - a.ts);

    tb.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.ts = r.ts;

      const statusClass = r.status === 'datang' ? 'status-masuk' : 'status-pulang';
      const statusLabel = r.status === 'datang' ? 'Masuk' : 'Pulang';

      // Highlight matching text if simple enough, or just render
      tr.innerHTML = `
        <td style="color:#64748b">${fmtTs(r.ts)}</td>
        <td class="${statusClass}">${statusLabel}</td>
        <td style="font-weight:600">${r.nid}</td>
        <td>${r.name}</td>
        <td style="color:#64748b">${r.title}</td>
        <td style="font-weight:600; color:#334155">${r.company}</td>
        <td>${CODE_TO_LABEL[r.shift] || r.shift || ''}</td>
        <td style="color:#64748b">${r.note || ''}</td>
        <td><button class="btn-text-danger" data-act="del-att">Hapus</button></td>`;
      tb.appendChild(tr);
    });
    $('#btnExportAtt').dataset.count = rows.length;
  }
  $('#btnFilterAtt')?.addEventListener('click', filterAttendance);
  // Realtime search filter
  $('#attSearch')?.addEventListener('input', filterAttendance);
  $('#tableAtt tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act="del-att"]'); if (!btn) return;
    const tr = btn.closest('tr'); const ts = Number(tr?.dataset.ts || '0'); if (!ts) return;
    if (confirm('Hapus baris kehadiran ini?')) {
      const idx = attendance.findIndex(a => a.ts === ts);
      if (idx >= 0) { attendance.splice(idx, 1); save(LS_ATT, attendance); syncGlobals(); filterAttendance(); renderDashboard(); renderScanTable(); renderScanStats(); toast('Baris dihapus.'); delAttendance(ts); }
    }
  });
  $('#btnExportAtt')?.addEventListener('click', () => {
    const from = new Date($('#attFrom').value + 'T00:00:00').getTime(), to = new Date($('#attTo').value + 'T23:59:59').getTime();
    const rows = attendance.filter(a => a.ts >= from && a.ts <= to).map(r => ({ Waktu: fmtTs(r.ts), Status: capStatus(r.status), NID: r.nid, Nama: r.name, Jabatan: r.title, Perusahaan: r.company, Shift: CODE_TO_LABEL[r.shift] || r.shift || '', Keterangan: r.note || '' }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Kehadiran'); XLSX.writeFile(wb, `kehadiran_${$('#attFrom').value}_sd_${$('#attTo').value}.xlsx`);
  });

  // ===== Latest info =====
  function renderLatest() {
    const tb = $('#tableNews tbody'); if (!tb) return; tb.innerHTML = '';
    const sorted = [...news].sort((a, b) => b.ts - a.ts);
    sorted.forEach(n => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#64748b; font-size:0.9rem">${fmtTs(n.ts)}</td>
        <td style="font-weight:600; color:var(--text)">${esc(n.title)}</td>
        <td style="color:#64748b">${esc(n.body || '')}${n.link ? ` • <a href="${esc(n.link)}" target="_blank">Link</a>` : ''}</td>
        <td>
          <div style="display:flex; justify-content:flex-end; gap:4px">
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
  function openNews(data = null, ts = null) {
    const d = $('#newsModal'); if (!d) return;
    d.dataset.ts = ts ? String(ts) : '';
    $('#nTitle').value = data?.title || '';
    $('#nBody').value = data?.body || '';
    $('#nLink').value = data?.link || '';
    d.showModal();
  }
  $('#btnAddNews')?.addEventListener('click', () => openNews(null, null));
  $('#btnBackNews')?.addEventListener('click', (e) => { e.preventDefault(); $('#newsModal')?.close(); });
  $('#newsModal')?.addEventListener('close', () => { const d = $('#newsModal'); if (d) d.dataset.ts = ''; });
  $('#btnSaveNews')?.addEventListener('click', e => {
    e.preventDefault();
    const d = $('#newsModal'); if (!d) return;
    const tsStr = d.dataset.ts || '';

    // Logic fix: if editing, keep original ts. If new, create new ts.
    const isEdit = !!tsStr;
    const tsVal = isEdit ? Number(tsStr) : Date.now();

    const item = { ts: tsVal, title: $('#nTitle').value.trim(), body: $('#nBody').value.trim(), link: $('#nLink').value.trim() };
    if (!item.title) return toast('Judul wajib diisi.');

    const idx = news.findIndex(n => n.ts === tsVal);
    if (idx >= 0) {
      news[idx] = item;
    } else {
      news.push(item);
    }

    save(LS_NEWS, news); renderLatest(); renderNewsWidgets(); toast('Info tersimpan.');
    pushNews(item);
    $('#newsModal')?.close();
  });
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
  $('#btnSchedSave')?.addEventListener('click', () => {
    save(LS_SCHED, sched);
    syncGlobals();
    const m = $('#schedMonth').value;
    toast(`Jadwal bulan ${m} disimpan.`); // Specific feedack
    renderCurrentShiftPanel();
    pushSched(m);
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
  if (employees.length === 0) {
    employees = [
      { nid: 'EMP001', name: 'Chris Jonathan', title: 'General Manager', company: 'PT PLN NPS', shift: 'A', photo: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?q=80&w=300&auto=format&fit=crop' },
      { nid: 'EMP002', name: 'Syafranah San', title: 'Designer', company: 'PT PLN NPS', shift: 'A', photo: 'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?q=80&w=300&auto=format&fit=crop' },
      { nid: 'EMP003', name: 'Devon Lane', title: 'Developer', company: 'PT PLN NPS', shift: 'B', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=300&auto=format&fit=crop' }
    ];
    save(LS_EMP, employees); syncGlobals();
  }
  if (news.length === 0) {
    news = [
      { ts: Date.now() - 2 * 60 * 60 * 1000, title: 'Sosialisasi K3', body: 'Briefing K3 pukul 08:30 di ruang meeting.' },
      { ts: Date.now() - 1 * 60 * 60 * 1000, title: 'Maintenance', body: 'Pemeliharaan unit 2 (shift malam).' }
    ];
    save(LS_NEWS, news);
  }

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
  function renderScanPage() { renderScanTable(); renderScanPreview(null, null); renderNewsWidgets(); ensureScanLiveCircle(); updateScanLiveCircle(false); renderScanStats(); }
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
        <td><b>${esc(r.title)}</b></td>
        <td>${esc(r.body).replace(/\n/g, '<br>')}</td>
        <td>${r.img ? `<img src="${r.img}" alt="img" class="edu-thumb" onclick="window.open(this.src,'_blank')">` : '—'}</td>
        <td>
          <button class="btn ghost btn-edu-edit">Edit</button>
          <button class="btn danger btn-edu-del">Hapus</button>
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

  $('#btnSaveEdu')?.addEventListener('click', (e) => {
    e.preventDefault();
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

    $('#eduModal').close();
    renderEduTable(); renderHighlights();
    window.dispatchEvent(new CustomEvent('education:changed'));
    pushEdu(item);
    toast('Education disimpan.');
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

  window.saveShifts = function () {
    const newShifts = { ...shifts }; // clone
    let changed = false;

    Object.keys(newShifts).forEach(key => {
      const startEl = document.getElementById(`shift_start_${key}`);
      const endEl = document.getElementById(`shift_end_${key}`);
      if (startEl && endEl) {
        if (newShifts[key].start !== startEl.value || newShifts[key].end !== endEl.value) {
          newShifts[key].start = startEl.value;
          newShifts[key].end = endEl.value;
          changed = true;
        }
      }
    });

    if (changed) {
      shifts = newShifts;
      save(LS_SHIFTS, shifts); // Save to LocalStorage
      syncGlobals(); // Update window.shifts
      renderCurrentShiftPanel(); // Refresh UI
      // Force reload specific panels if needed
      renderCurrentShiftPanel(); // Refresh UI
      // Force reload specific panels if needed
      toast(t('msg_saved'));
      closeShiftModal();
    } else {
      closeShiftModal();
    }
  };

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
        window.location.href = 'login.html';
      }
    });
  }
});

// ===== Laporan Bulanan (Performance Report) =====
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnDownloadMonthlyReport');
  if (!btn) return;

  const pad = n => n < 10 ? '0' + n : n;

  btn.addEventListener('click', () => {
    const mInput = document.getElementById('reportMonth');
    const mStr = mInput ? mInput.value : '';

    if (!mStr) {
      if (window.toast) toast('Pilih bulan terlebih dahulu.');
      else alert('Pilih bulan terlebih dahulu.');
      return;
    }

    if (typeof XLSX === 'undefined') {
      if (window.toast) toast("Library Excel belum dimuat.");
      else alert("Library Excel belum dimuat.");
      return;
    }

    try {
      const [year, month] = mStr.split('-').map(Number);
      const startTs = new Date(year, month - 1, 1).getTime();
      // End date: First day of NEXT month
      const endTs = new Date(year, month, 1).getTime();

      // 1. Init stats
      const report = {};
      const emps = window.employees || [];
      const atts = window.attendance || [];

      if (emps.length === 0) {
        if (window.toast) toast("Data karyawan kosong.");
        return;
      }

      emps.forEach(e => {
        report[e.nid] = {
          nid: e.nid,
          name: e.name,
          company: e.company || '-',
          shift: e.shift || '-',
          presentDates: new Set(),
          lateCount: 0,
          overtimeMins: 0
        };
      });

      // 2. Process logs
      atts.forEach(a => {
        // Ensure TS is valid number
        const ts = Number(a.ts);
        if (isNaN(ts)) return;

        if (ts < startTs || ts >= endTs) return;

        const stats = report[a.nid];
        if (!stats) return;

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

            // Adjust for day boundaries
            if (diffMs > 12 * 3600 * 1000) diffMs -= 24 * 3600 * 1000;
            if (diffMs < -12 * 3600 * 1000) diffMs += 24 * 3600 * 1000;

            if (diffMs > 60000) {
              stats.overtimeMins += Math.floor(diffMs / 60000);
            }
          }
        }
      });

      // 3. Flatten for Excel
      const rows = Object.values(report).map(r => {
        const h = Math.floor(r.overtimeMins / 60);
        const m = r.overtimeMins % 60;
        const otStr = r.overtimeMins > 0 ? `${h} Jam ${m} Menit` : '0';

        return {
          "NID": r.nid,
          "Nama": r.name,
          "Perusahaan": r.company,
          "Group": r.shift,
          "Total Hadir (Hari)": r.presentDates.size,
          "Total Terlambat (Kali)": r.lateCount,
          "Total Overtime": otStr
        };
      });

      // 4. Download
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Kinerja ${mStr}`);
      XLSX.writeFile(wb, `Laporan_Kinerja_${mStr}.xlsx`);

      if (window.toast) toast(`Laporan ${mStr} berhasil didownload.`);
    } catch (err) {
      console.error(err);
      alert('Gagal membuat laporan: ' + err.message);
    }
  });
});
