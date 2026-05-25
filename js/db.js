/* ============================================================================
   DB.JS  –  Online-Only Mode
   Semua operasi langsung ke Supabase. Tidak ada cache lokal atau antrian offline.
   Jika tidak ada koneksi internet, operasi akan gagal dan tampilkan pesan error.
   ========================================================================== */

let sb = null;

// Bersihkan antrian offline lama yang mungkin tersisa dari versi sebelumnya
localStorage.removeItem('SA_OFFLINE_QUEUE');

// Notifikasi koneksi
window.addEventListener('online', () => {
    console.log('🌐 Koneksi internet tersambung.');
    window.dispatchEvent(new Event('network:online'));
    // Refresh data dari server saat kembali online
    if (window.pullAll) window.pullAll();
});

window.addEventListener('offline', () => {
    console.warn('🔌 Koneksi internet terputus.');
    window.dispatchEvent(new Event('network:offline'));
});

// === INISIALISASI SUPABASE ===
async function checkConn() {
    try {
        const { createClient } = window.supabase;
        const url = window.SA_SUPABASE_URL || window.SUPABASE_URL;
        const key = window.SA_SUPABASE_ANON || window.SUPABASE_KEY;

        if (!url || !key) {
            console.warn('Supabase creds missing in config.local.js');
            return false;
        }
        sb = createClient(url, key);
        window.sb = sb;

        const { error } = await (window.sb || sb).from('attendance').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('✅ Supabase Connected.');
        return true;
    } catch (err) {
        console.error('Supabase connection fail:', err);
        return false;
    }
}

// === HELPER: Cek koneksi dan sb ===
function requireOnline(fnName) {
    if (!navigator.onLine) {
        throw new Error(`Tidak ada koneksi internet. Fungsi "${fnName}" membutuhkan internet.`);
    }
    if (!(window.sb || sb)) {
        throw new Error(`Koneksi ke database belum siap. Coba refresh halaman.`);
    }
}

// === EMPLOYEES ===
async function pushEmployee(e) {
    try {
        requireOnline('pushEmployee');
        const { error } = await (window.sb || sb).from('employees').upsert({
            nid: e.nid, name: e.name, title: e.title, company: e.company,
            shift: e.shift, photo: e.photo, status: e.status || 'Aktif',
            updated_at: new Date().toISOString()
        }, { onConflict: 'nid' });
        if (error) throw error;
        return true;
    } catch (err) {
        console.error('pushEmployee error:', err);
        alert('Gagal menyimpan data karyawan ke server:\n' + err.message);
        return false;
    }
}

async function delEmployee(nid) {
    try {
        requireOnline('delEmployee');
        const { error } = await (window.sb || sb).from('employees').delete().eq('nid', nid);
        if (error) throw error;
    } catch (err) {
        console.error('delEmployee error:', err);
        alert('Gagal menghapus karyawan dari server:\n' + err.message);
    }
}

// === ATTENDANCE ===
async function pushAttendance(r) {
    try {
        requireOnline('pushAttendance');
        if (r.status === 'break_out' || r.status === 'break_in') {
            const { error } = await (window.sb || sb).from('breaks').insert({
                ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                company: r.company, created_at: new Date(r.ts).toISOString()
            });
            if (error) throw error;
        } else {
            const { error } = await (window.sb || sb).from('attendance').insert({
                ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                title: r.title, company: r.company, shift: r.shift,
                note: r.note, late: r.late, ok_shift: r.okShift,
                created_at: new Date(r.ts).toISOString()
            });
            if (error) throw error;
        }
    } catch (err) {
        console.error('pushAttendance error:', err);
        alert('Gagal menyimpan data absensi ke server:\n' + err.message);
        throw err; // Lempar kembali agar pemanggil tahu
    }
}

async function delAttendance(ts) {
    try {
        requireOnline('delAttendance');
        // Hapus dari tabel attendance
        const { data, error: err1 } = await (window.sb || sb).from('attendance').delete().eq('ts', ts).select();
        if (err1) throw err1;

        // Cek apakah data benar-benar terhapus
        if (data && data.length === 0) {
            // Mungkin ada di tabel breaks, coba hapus dari sana juga
            const { error: err2 } = await (window.sb || sb).from('breaks').delete().eq('ts', ts);
            if (err2) throw err2;
        } else {
            // Hapus juga dari breaks jika ada (breaks terkait)
            await (window.sb || sb).from('breaks').delete().eq('ts', ts);
        }

        console.log('✅ Berhasil dihapus dari server. ts:', ts);
    } catch (err) {
        console.error('delAttendance error:', err);
        alert('Gagal menghapus data dari server:\n' + err.message);
        throw err; // Lempar kembali agar UI tahu gagal
    }
}

// Update/edit data absensi
async function updateAttendance(oldTs, updatedRecord) {
    try {
        requireOnline('updateAttendance');
        const { error } = await (window.sb || sb).from('attendance').update({
            ts: updatedRecord.ts,
            status: updatedRecord.status,
            note: updatedRecord.note,
            late: updatedRecord.late,
            ok_shift: updatedRecord.okShift,
            shift: updatedRecord.shift
        }).eq('ts', oldTs);
        if (error) throw error;
        console.log('✅ Berhasil update data di server. ts:', oldTs);
    } catch (err) {
        console.error('updateAttendance error:', err);
        alert('Gagal mengubah data di server:\n' + err.message);
        throw err;
    }
}

// === NEWS ===
async function pushNews(n) {
    try {
        requireOnline('pushNews');
        const { error } = await (window.sb || sb).from('news').upsert({
            ts: n.ts, title: n.title, body: n.body, link: n.link
        }, { onConflict: 'ts' });
        if (error) throw error;
    } catch (err) {
        console.error('pushNews error:', err);
        alert('Gagal menyimpan info ke server:\n' + err.message);
    }
}

async function delNews(ts) {
    try {
        requireOnline('delNews');
        const { error } = await (window.sb || sb).from('news').delete().eq('ts', ts);
        if (error) throw error;
    } catch (err) {
        console.error('delNews error:', err);
        alert('Gagal menghapus info dari server:\n' + err.message);
    }
}

// === EDUCATION ===
async function pushEdu(e) {
    try {
        requireOnline('pushEdu');
        const { error } = await (window.sb || sb).from('education').upsert({
            id: e.id, ts: e.ts, title: e.title, body: e.body, img: e.img
        }, { onConflict: 'id' });
        if (error) throw error;
    } catch (err) {
        console.error('pushEdu error:', err);
        throw err;
    }
}

async function delEdu(id) {
    try {
        requireOnline('delEdu');
        const { error } = await (window.sb || sb).from('education').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        console.error('delEdu error:', err);
        alert('Gagal menghapus education dari server:\n' + err.message);
    }
}

// === INVENTORY ===
async function pushInventory(inv) {
    try {
        requireOnline('pushInventory');
        const payload = {
            id: inv.id, carrier: inv.carrier, company: inv.company,
            item: inv.item, dest: inv.dest, officer: inv.officer, type: inv.type,
            time_in: inv.timeIn, time_out: inv.timeOut
        };
        const { error } = await (window.sb || sb).from('inventory').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
    } catch (err) {
        console.error('pushInventory error:', err);
        alert('Gagal menyimpan inventori ke server:\n' + err.message);
        throw err;
    }
}

async function delInventory(id) {
    try {
        requireOnline('delInventory');
        const { error } = await (window.sb || sb).from('inventory').delete().eq('id', id);
        if (error) throw error;
    } catch (err) {
        console.error('delInventory error:', err);
        alert('Gagal menghapus inventori dari server:\n' + err.message);
    }
}

// === SHIFTS & SCHEDULE ===
async function pushShifts() {
    try {
        if (!(window.sb || sb)) return;
        await (window.sb || sb).from('settings').upsert({ key: 'shifts', value: window.shifts }, { onConflict: 'key' });
    } catch (err) {
        console.error('pushShifts error:', err);
    }
}

async function pushSched(monthId) {
    try {
        if (!sb || !monthId) return;
        await (window.sb || sb).from('shift_monthly').upsert({ month: monthId, data: window.sched[monthId] }, { onConflict: 'month' });
    } catch (err) {
        console.error('pushSched error:', err);
    }
}

// === PULL ALL (Server sebagai sumber kebenaran) ===
async function pullAll() {
    if (!(window.sb || sb)) return;

    // Employees
    const { data: emps } = await (window.sb || sb).from('employees').select('*');
    if (emps) {
        window.employees = emps.map(x => ({
            nid: x.nid, name: x.name, title: x.title, company: x.company,
            shift: x.shift, photo: x.photo || '', status: x.status || 'Aktif'
        }));
        localStorage.setItem('SA_EMPLOYEES', JSON.stringify(window.employees));
    }

    // Attendance (3 hari terakhir) - SERVER adalah sumber kebenaran
    const since = Date.now() - (3 * 24 * 3600 * 1000);
    const { data: atts } = await (window.sb || sb).from('attendance').select('*').gte('ts', since);
    const { data: brks } = await (window.sb || sb).from('breaks').select('*').gte('ts', since);

    const parseSbTs = (v) => {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            if (v.includes('T') && !v.endsWith('Z') && !v.includes('+')) return new Date(v + 'Z').getTime();
            return new Date(v).getTime();
        }
        return Date.now();
    };

    // Data lebih lama dari 3 hari diambil dari lokal (tidak dalam jangkauan server)
    const oldLocal = (window.attendance || []).filter(a => a.ts < since);

    let newAtts = [];
    if (atts) {
        newAtts = atts.map(x => ({
            ts: parseSbTs(x.ts), status: x.status, nid: x.nid, name: x.name,
            title: x.title, company: x.company, shift: x.shift,
            note: x.note, late: x.late, okShift: x.ok_shift
        }));
    }

    let newBreaks = [];
    if (brks) {
        newBreaks = brks.map(x => ({
            ts: parseSbTs(x.ts), status: x.status, nid: x.nid, name: x.name,
            title: '', company: x.company, shift: '',
            note: (x.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
            late: false, okShift: true
        }));
    }

    // Server menang untuk data 3 hari terakhir - tidak ada merge dengan local
    const serverTsSet = new Set([...newAtts, ...newBreaks].map(r => r.ts));
    const filteredOld = oldLocal.filter(r => !serverTsSet.has(r.ts));
    window.attendance = [...filteredOld, ...newAtts, ...newBreaks].sort((a, b) => a.ts - b.ts);
    localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));

    // News - server sebagai sumber kebenaran
    const { data: nws } = await (window.sb || sb).from('news').select('*');
    if (nws) {
        window.news = nws.map(x => ({ ts: x.ts, title: x.title, body: x.body, link: x.link }))
                        .sort((a, b) => b.ts - a.ts);
        localStorage.setItem('SA_NEWS', JSON.stringify(window.news));
    }

    // Education - server sebagai sumber kebenaran
    const { data: edus } = await (window.sb || sb).from('education').select('*');
    if (edus) {
        const eduList = edus.map(x => ({ id: x.id, ts: x.ts, title: x.title, body: x.body, img: x.img }));
        window.eduData = eduList;
        localStorage.setItem('SA_EDUCATION', JSON.stringify(eduList));
    }

    // Inventory - server sebagai sumber kebenaran
    const { data: invs } = await (window.sb || sb).from('inventory').select('*');
    if (invs) {
        window.inventoryData = invs.map(x => ({
            id: x.id, carrier: x.carrier, company: x.company, item: x.item,
            dest: x.dest, officer: x.officer, type: x.type,
            timeIn: x.time_in, timeOut: x.time_out
        })).sort((a, b) => new Date(b.timeIn || 0) - new Date(a.timeIn || 0));
        localStorage.setItem('SA_INVENTORY', JSON.stringify(window.inventoryData));
    }

    // Shifts
    const { data: sh } = await (window.sb || sb).from('settings').select('*').eq('key', 'shifts').single();
    if (sh && sh.value) {
        window.shifts = sh.value;
        if (window.shifts.D) { delete window.shifts.D; pushShifts(); }
        localStorage.setItem('SA_SHIFTS', JSON.stringify(window.shifts));
    }

    // Schedule (bulan ini)
    const m = monthKey ? monthKey(new Date()) : (new Date().toISOString().substring(0, 7));
    const { data: sc } = await (window.sb || sb).from('shift_monthly').select('*').eq('month', m).single();
    if (sc && sc.data) {
        if (window.sched) window.sched[m] = sc.data;
        const schedData = window.sched || {};
        localStorage.setItem('SA_SHIFT_MONTHLY', JSON.stringify(schedData));
    }

    // Dispatch event agar UI di-refresh
    window.dispatchEvent(new Event('data:synced'));
}

// === REALTIME SUBSCRIPTION ===
let rtSubscription = null;

function subscribeToRealtime() {
    const client = sb || window.sb;
    if (!client || rtSubscription) return;

    console.log('📡 Memulai Realtime Subscription...');

    rtSubscription = client.channel('public-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' },
            (payload) => handleRealtimeEvent(payload, 'attendance'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'breaks' },
            (payload) => handleRealtimeEvent(payload, 'breaks'))
        .subscribe((status) => {
            console.log('Realtime Status:', status);
        });
}

function handleRealtimeEvent(payload, tableName) {
    console.log(`⚡ Realtime [${payload.eventType}] on ${tableName}:`, payload);
    if (payload.eventType === 'INSERT') handleRealtimeInsert(payload.new, tableName);
    else if (payload.eventType === 'UPDATE') handleRealtimeUpdate(payload.new, tableName);
    else if (payload.eventType === 'DELETE') handleRealtimeDelete(payload.old, tableName);
}

function normalizeRecord(row, tableName) {
    const parseTs = (t) => {
        if (typeof t === 'number') return t;
        return new Date(t).getTime();
    };
    if (tableName === 'attendance') {
        return {
            ts: parseTs(row.ts), status: row.status, nid: row.nid, name: row.name,
            title: row.title, company: row.company, shift: row.shift,
            note: row.note, late: row.late, okShift: row.ok_shift
        };
    } else if (tableName === 'breaks') {
        return {
            ts: parseTs(row.ts), status: row.status, nid: row.nid, name: row.name,
            title: '', company: row.company, shift: '',
            note: (row.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
            late: false, okShift: true
        };
    }
    return null;
}

function handleRealtimeInsert(newRow, tableName) {
    if (!newRow || !window.attendance) return;
    const rec = normalizeRecord(newRow, tableName);
    if (!rec) return;
    const exists = window.attendance.some(a => a.nid === rec.nid && Math.abs(a.ts - rec.ts) < 2000);
    if (exists) return;
    window.attendance.push(rec);
    window.attendance.sort((a, b) => a.ts - b.ts);
    localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));
    window.dispatchEvent(new Event('data:synced'));
    if (window.triggerMobileUpdate) window.triggerMobileUpdate(rec);
}

function handleRealtimeUpdate(newRow, tableName) {
    if (!newRow || !window.attendance) return;
    const rec = normalizeRecord(newRow, tableName);
    if (!rec) return;
    const index = window.attendance.findIndex(a => a.ts === rec.ts);
    if (index !== -1) {
        window.attendance[index] = rec;
        window.attendance.sort((a, b) => a.ts - b.ts);
        localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));
        window.dispatchEvent(new Event('data:synced'));
    } else {
        handleRealtimeInsert(newRow, tableName);
    }
}

function handleRealtimeDelete(oldRow, tableName) {
    if (!oldRow || !window.attendance) return;
    const targetTs = typeof oldRow.ts === 'number' ? oldRow.ts : new Date(oldRow.ts).getTime();
    if (!targetTs) return;
    const index = window.attendance.findIndex(a => Math.abs(a.ts - targetTs) < 100);
    if (index !== -1) {
        window.attendance.splice(index, 1);
        localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));
        window.dispatchEvent(new Event('data:synced'));
    }
}

// === GLOBAL EXPORT ===
window.sb = sb;
window.checkConn = checkConn;
window.pushEmployee = pushEmployee;
window.delEmployee = delEmployee;
window.pushAttendance = pushAttendance;
window.delAttendance = delAttendance;
window.updateAttendance = updateAttendance;
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
