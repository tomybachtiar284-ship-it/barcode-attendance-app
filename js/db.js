/* ============================================================================
   DB.JS
   Supabase Database Logic.
   ========================================================================== */

let sb = null;

// INIT
// INIT
async function checkConn() {
    try {
        const { createClient } = window.supabase;
        // Fix: Use generic or SA_ prefix
        const url = window.SA_SUPABASE_URL || window.SUPABASE_URL;
        const key = window.SA_SUPABASE_ANON || window.SUPABASE_KEY;

        if (!url || !key) {
            console.warn('Supabase creds missing in config.local.js');
            return false;
        }
        sb = createClient(url, key);
        window.sb = sb; // Sync global

        const { data, error } = await sb.from('attendance').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('Supabase Connected. logic DB.');
        return true;
    } catch (err) {
        console.error('Supabase connection fail:', err);
        return false;
    }
}

// === EMPLOYEES ===
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

// === ATTENDANCE (Dual Table Support) ===
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

// === OTHER MODULES ===
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

async function delNews(ts) {
    if (!sb) return;
    const { error } = await sb.from('news').delete().eq('ts', ts);
    if (error) alert('Gagal Hapus News di Cloud: ' + error.message);
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

async function delEdu(id) {
    if (!sb) return;
    await sb.from('education').delete().eq('id', id);
}

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

async function delInventory(id) {
    if (!sb) return;
    await sb.from('inventory').delete().eq('id', id);
}

async function pushShifts() {
    if (!sb) return;
    await sb.from('settings').upsert({ key: 'shifts', value: shifts }, { onConflict: 'key' });
}

async function pushSched(monthId) {
    if (!sb || !monthId) return;
    await sb.from('shift_monthly').upsert({ month: monthId, data: sched[monthId] }, { onConflict: 'month' });
}

// === SYNC ALL ===
async function pullAll() {
    if (!sb) return;
    // Employees
    const { data: emps } = await sb.from('employees').select('*');
    if (emps) {
        window.employees = emps.map(x => ({
            nid: x.nid, name: x.name, title: x.title, company: x.company,
            shift: x.shift, photo: x.photo
        }));
        save(LS_EMP, window.employees);
    }

    // Attendance (last 7 days)
    const since = Date.now() - 7 * 24 * 3600 * 1000;

    // Fetch Main Attendance
    const { data: atts } = await sb.from('attendance').select('*').gte('ts', since);
    // Fetch Breaks
    const { data: brks } = await sb.from('breaks').select('*').gte('ts', since);

    if (atts || brks) {
        const old = (window.attendance || []).filter(a => a.ts < since);

        let newAtts = [];
        if (atts) {
            newAtts = atts.map(x => ({
                ts: x.ts, status: x.status, nid: x.nid, name: x.name,
                title: x.title, company: x.company, shift: x.shift,
                note: x.note, late: x.late, okShift: x.ok_shift
            }));
        }

        let newBreaks = [];
        if (brks) {
            newBreaks = brks.map(x => ({
                ts: x.ts, status: x.status, nid: x.nid, name: x.name,
                title: '', company: x.company, shift: '',
                note: (x.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
                late: false, okShift: true
            }));
        }

        window.attendance = [...old, ...newAtts, ...newBreaks].sort((a, b) => a.ts - b.ts);
        save(LS_ATT, window.attendance);
    }

    // News (Bi-directional Sync)
    const { data: nws } = await sb.from('news').select('*');
    if (nws) {
        const serverMap = new Map(nws.map(x => [x.ts, x]));
        const localMap = new Map((window.news || []).map(x => [x.ts, x]));

        // 1. Apply Server Updates to Local
        nws.forEach(x => {
            localMap.set(x.ts, { ts: x.ts, title: x.title, body: x.body, link: x.link });
        });

        // 2. Identify Pending Local Items -> Push to Server
        for (const [ts, val] of localMap.entries()) {
            if (!serverMap.has(Number(ts))) {
                await pushNews(val);
            }
        }

        // 3. Finalize
        window.news = Array.from(localMap.values()).sort((a, b) => b.ts - a.ts);
        save(LS_NEWS, window.news);
    }

    // Education
    const { data: edus } = await sb.from('education').select('*');
    if (edus) {
        const eduList = edus.map(x => ({ id: x.id, ts: x.ts, title: x.title, body: x.body, img: x.img }));
        // Assuming saveEdu exists in app.js or we need to extract it? 
        // Wait, saveEdu is UI logic or State logic? It's likely state. 
        // Ideally state should handle saving. But for now let's just use window.eduData
        window.eduData = eduList;
        save(LS_EDU, eduList);
    }

    // Inventory (Bi-directional Sync)
    const { data: invs } = await sb.from('inventory').select('*');
    if (invs) {
        const serverMap = new Map(invs.map(x => [x.id, x]));
        const localMap = new Map((window.inventoryData || []).map(x => [x.id, x]));

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
        window.inventoryData = Array.from(localMap.values()).sort((a, b) => new Date(b.timeIn || 0) - new Date(a.timeIn || 0));
        save(LS_INV, window.inventoryData);
    }

    // Shifts
    const { data: sh } = await sb.from('settings').select('*').eq('key', 'shifts').single();
    if (sh && sh.value) {
        window.shifts = sh.value;
        if (window.shifts.D) { delete window.shifts.D; pushShifts(); } // Auto-clean server
        save(LS_SHIFTS, window.shifts);
    }

    // Schedule (current month)
    const m = monthKey(new Date());
    const { data: sc } = await sb.from('shift_monthly').select('*').eq('month', m).single();
    if (sc && sc.data) {
        window.sched[m] = sc.data;
        save(LS_SCHED, window.sched);
    }

    // DISPATCH EVENT so app.js can re-render
    window.dispatchEvent(new Event('data:synced'));
}

// Global Export
// === REALTIME SUBSCRIPTION ===
let rtSubscription = null;

function subscribeToRealtime() {
    const client = sb || window.sb;
    if (!client) return;

    // Prevent double subscription
    if (rtSubscription) return;

    console.log('📡 Starting Realtime Subscription...');

    rtSubscription = client.channel('public-db-changes')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'attendance' },
            (payload) => handleRealtimeInsert(payload.new, 'attendance')
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'breaks' },
            (payload) => handleRealtimeInsert(payload.new, 'breaks')
        )
        .subscribe((status) => {
            console.log('Realtime Status:', status);
        });
}

function handleRealtimeInsert(newRow, tableName) {
    if (!newRow) return;

    // 1. Normalisasi Data (Samakan format dengan local attendance)
    // Note: Payload dari Realtime adalah Raw DB Columns
    let rec = null;

    // Helper parse TS
    const parseTs = (t) => new Date(t).getTime();

    if (tableName === 'attendance') {
        rec = {
            ts: parseTs(newRow.ts),
            status: newRow.status,
            nid: newRow.nid,
            name: newRow.name,
            title: newRow.title,
            company: newRow.company,
            shift: newRow.shift,
            note: newRow.note,
            late: newRow.late,
            okShift: newRow.ok_shift
        };
    } else if (tableName === 'breaks') {
        rec = {
            ts: parseTs(newRow.ts),
            status: newRow.status,
            nid: newRow.nid,
            name: newRow.name,
            title: '', // Breaks usually don't have title/shift stored
            company: newRow.company,
            shift: '',
            note: (newRow.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
            late: false,
            okShift: true
        };
    }

    if (!rec) return;

    // 2. Cek Duplikat di Window.Attendance
    // Kita cek range waktu +- 1 detik untuk aman, atau exact match TS
    const exists = window.attendance.some(a =>
        a.nid === rec.nid &&
        Math.abs(a.ts - rec.ts) < 2000 // Tolerance 2s (karena pembulatan ms di DB)
    );

    if (exists) {
        // console.log('Skipping echo insert from realtime');
        return;
    }

    console.log('⚡ New Data from Realtime:', rec);

    // 3. Update Local Data
    window.attendance.push(rec);
    window.attendance.sort((a, b) => a.ts - b.ts);

    // 4. Save to LocalStorage
    // WARNING: "LS_ATT" variable is inside app.js scope, we cannot access it here easily 
    // without passing it or assuming global.
    // However, app.js logic exposes 'attendance' to window, but maybe not the SAVE function constant.
    // We will use string literal 'SA_ATTENDANCE' to be safe.
    localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));

    // 5. Notify App to Re-render
    // Gunakan event 'data:synced' yang sudah ada di app.js untuk trigger renderDashboard() dll
    window.dispatchEvent(new Event('data:synced'));

    // Optional: Toast notif
    // window.dispatchEvent(new CustomEvent('realtime:toast', { detail: `Data baru: ${rec.name} (${rec.status})` }));
}

// Global Export
window.sb = sb;
window.checkConn = checkConn;
window.pushEmployee = pushEmployee;
window.delEmployee = delEmployee;
window.pushAttendance = pushAttendance;
window.delAttendance = delAttendance;
window.pushNews = pushNews;
window.delNews = delNews;
window.pushEdu = pushEdu;
window.delEdu = delEdu;
window.pushInventory = pushInventory;
window.delInventory = delInventory;
window.pushShifts = pushShifts;
window.pushSched = pushSched;
window.pullAll = pullAll;
window.subscribeToRealtime = subscribeToRealtime;
