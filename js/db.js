/* ============================================================================
   DB.JS
   Supabase Database Logic.
   ========================================================================== */

let sb = null;

// === OFFLINE QUEUE SYSTEM ===
const LS_QUEUE = 'SA_OFFLINE_QUEUE';
let offlineQueue = JSON.parse(localStorage.getItem(LS_QUEUE)) || [];
let isOnline = navigator.onLine;
let isProcessingQueue = false;

window.addEventListener('online', () => {
    console.log('🌐 Online detected. Process queue...');
    isOnline = true;
    processQueue();
    // Dispatch event for UI
    window.dispatchEvent(new Event('network:online'));
});

window.addEventListener('offline', () => {
    console.log('🔌 Offline detected.');
    isOnline = false;
    window.dispatchEvent(new Event('network:offline'));
});

function saveQueue() {
    localStorage.setItem(LS_QUEUE, JSON.stringify(offlineQueue));
}

function addToQueue(action, payload) {
    const item = {
        id: Date.now() + Math.random().toString(36).substr(2, 5),
        ts: Date.now(),
        action,
        payload,
        retry: 0
    };
    offlineQueue.push(item);
    saveQueue();
    console.log(`📥 Added to Queue [${action}]:`, payload);
    return true; // Simulate success
}

async function processQueue() {
    if (!isOnline || offlineQueue.length === 0 || isProcessingQueue) return;

    isProcessingQueue = true;
    console.log(`🔄 Processing Queue (${offlineQueue.length} items)...`);

    // Process one by one FIFO
    // Note: We clone the array to iterate safely, but modifying the real array on success
    // Actually, better to shift() one by one.

    // Limit max attempts per run to avoid infinite loops if something is stuck
    let processed = 0;

    while (offlineQueue.length > 0 && isOnline) {
        const item = offlineQueue[0]; // Peek

        try {
            console.log(`🚀 Sending [${item.action}]...`);
            let success = false;

            // Execute Action
            if (item.action === 'PUSH_ATTENDANCE') {
                if (item.payload.type === 'BREAK') {
                    const { error } = await sb.from('breaks').insert(item.payload.data);
                    if (!error) success = true; else throw error;
                } else {
                    const { error } = await sb.from('attendance').insert(item.payload.data);
                    if (!error) success = true; else throw error;
                }
            }
            else if (item.action === 'PUSH_INVENTORY') {
                const { error } = await sb.from('inventory').upsert(item.payload.data, { onConflict: 'id' });
                if (!error) success = true; else throw error;
            }
            // Add other actions if needed

            if (success) {
                console.log(`✅ Sent Success.`);
                offlineQueue.shift(); // Remove from queue
                saveQueue();
                processed++;
            }

        } catch (err) {
            console.error('❌ Sync Failed:', err);
            item.retry++;
            if (item.retry > 5) {
                console.warn('🗑️ Item dropped after 5 retries:', item);
                offlineQueue.shift(); // Drop if too many fails
                saveQueue();
            } else {
                saveQueue(); // Save retry count
                isProcessingQueue = false;
                return; // Stop processing to wait for better connection
            }
        }
    }

    isProcessingQueue = false;
    if (processed > 0) {
        console.log(`🎉 Queue Batch Done. Processed: ${processed}`);
        if (window.pullAll) window.pullAll(); // Refresh data to be sure
    }
}

// Auto-process on load if online
setTimeout(processQueue, 3000);

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
    if (!sb || !isOnline) {
        // OFFLINE HANDLING
        const isBreak = (r.status === 'break_out' || r.status === 'break_in');
        let dataPayload = {};

        if (isBreak) {
            dataPayload = {
                ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                company: r.company, created_at: new Date(r.ts).toISOString()
            };
        } else {
            dataPayload = {
                ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                title: r.title, company: r.company, shift: r.shift,
                note: r.note, late: r.late, ok_shift: r.okShift,
                created_at: new Date(r.ts).toISOString()
            };
        }

        addToQueue('PUSH_ATTENDANCE', { type: isBreak ? 'BREAK' : 'ATT', data: dataPayload });
        return;
    }

    // ONLINE HANDLING
    if (r.status === 'break_out' || r.status === 'break_in') {
        const { error } = await sb.from('breaks').insert({
            ts: r.ts, status: r.status, nid: r.nid, name: r.name,
            company: r.company, created_at: new Date(r.ts).toISOString()
        });
        if (error) {
            console.error('Push break error (will queue):', error);
            // Fallback to Queue if server error (e.g. timeout)
            addToQueue('PUSH_ATTENDANCE', {
                type: 'BREAK', data: {
                    ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                    company: r.company, created_at: new Date(r.ts).toISOString()
                }
            });
        }
    } else {
        const { error } = await sb.from('attendance').insert({
            ts: r.ts, status: r.status, nid: r.nid, name: r.name,
            title: r.title, company: r.company, shift: r.shift,
            note: r.note, late: r.late, ok_shift: r.okShift,
            created_at: new Date(r.ts).toISOString()
        });
        if (error) {
            console.error('Push att error (will queue):', error);
            addToQueue('PUSH_ATTENDANCE', {
                type: 'ATT', data: {
                    ts: r.ts, status: r.status, nid: r.nid, name: r.name,
                    title: r.title, company: r.company, shift: r.shift,
                    note: r.note, late: r.late, ok_shift: r.okShift,
                    created_at: new Date(r.ts).toISOString()
                }
            });
        }
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
    const payload = {
        id: inv.id, carrier: inv.carrier, company: inv.company,
        item: inv.item, dest: inv.dest, officer: inv.officer, type: inv.type,
        time_in: inv.timeIn, time_out: inv.timeOut
    };

    if (!sb || !isOnline) {
        console.warn('Offline: Queueing Inventory Push');
        addToQueue('PUSH_INVENTORY', { data: payload });
        return;
    }

    const { error } = await sb.from('inventory').upsert(payload, { onConflict: 'id' });
    if (error) {
        console.error('Push inv error (will queue):', error);
        addToQueue('PUSH_INVENTORY', { data: payload });
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

    console.log('📡 Starting Realtime Subscription (FULL SYNC)...');

    // Subscribe to ALL events for attendance and breaks
    rtSubscription = client.channel('public-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'attendance' },
            (payload) => handleRealtimeEvent(payload, 'attendance')
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'breaks' },
            (payload) => handleRealtimeEvent(payload, 'breaks')
        )
        .subscribe((status) => {
            console.log('Realtime Status:', status);
        });
}

function handleRealtimeEvent(payload, tableName) {
    console.log(`⚡ Realtime Event [${payload.eventType}] on ${tableName}:`, payload);

    if (payload.eventType === 'INSERT') {
        handleRealtimeInsert(payload.new, tableName);
    } else if (payload.eventType === 'UPDATE') {
        handleRealtimeUpdate(payload.new, tableName);
    } else if (payload.eventType === 'DELETE') {
        handleRealtimeDelete(payload.old, tableName);
    }
}

// --- INSERT HANDLER ---
function handleRealtimeInsert(newRow, tableName) {
    if (!newRow) return;

    const rec = normalizeRecord(newRow, tableName);
    if (!rec) return;

    // Check Duplicate +- 2s tolerance
    const exists = window.attendance.some(a =>
        a.nid === rec.nid &&
        Math.abs(a.ts - rec.ts) < 2000
    );

    if (exists) return;

    console.log('⚡ RT Insert Applied:', rec);
    window.attendance.push(rec);
    window.attendance.sort((a, b) => a.ts - b.ts);
    saveToStorage();
    triggerRefresh();
}

// --- UPDATE HANDLER ---
function handleRealtimeUpdate(newRow, tableName) {
    if (!newRow) return;

    // Note: Normalize first to ensure consistent format
    const rec = normalizeRecord(newRow, tableName);
    if (!rec) return;

    // Find matching record by TS (assuming TS is primary key or unique enough)
    // If TS was updated, this might fail, but TS usually doesn't change in this app.
    const index = window.attendance.findIndex(a => a.ts === rec.ts);

    if (index !== -1) {
        console.log('⚡ RT Update Applied:', rec);
        window.attendance[index] = rec; // Replace
        window.attendance.sort((a, b) => a.ts - b.ts);
        saveToStorage();
        triggerRefresh();
    } else {
        // If not found, treat as Insert? Or ignore?
        // Let's treat as Insert to be safe (maybe we missed the initial insert)
        console.warn('⚡ RT Update Record Not Found, treating as Insert:', rec);
        handleRealtimeInsert(newRow, tableName);
    }
}

// --- DELETE HANDLER ---
function handleRealtimeDelete(oldRow, tableName) {
    if (!oldRow) return;

    // Supabase DELETE payload usually contains the Primary Key. 
    // Ideally 'ts' is the identifier.
    // We need to handle potential time format differences if 'ts' comes as string.

    const targetTs = new Date(oldRow.ts).getTime();
    if (!targetTs) return;

    const index = window.attendance.findIndex(a => Math.abs(a.ts - targetTs) < 100); // Exact match tolerance

    if (index !== -1) {
        console.log('⚡ RT Delete Applied:', oldRow);
        window.attendance.splice(index, 1);
        saveToStorage();
        triggerRefresh();
    } else {
        console.warn('⚡ RT Delete Record Not Found:', oldRow);
    }
}

// --- HELPERS ---
function normalizeRecord(row, tableName) {
    const parseTs = (t) => new Date(t).getTime();

    if (tableName === 'attendance') {
        return {
            ts: parseTs(row.ts),
            status: row.status,
            nid: row.nid,
            name: row.name,
            title: row.title,
            company: row.company,
            shift: row.shift,
            note: row.note,
            late: row.late,
            okShift: row.ok_shift
        };
    } else if (tableName === 'breaks') {
        return {
            ts: parseTs(row.ts),
            status: row.status,
            nid: row.nid,
            name: row.name,
            title: '',
            company: row.company,
            shift: '',
            note: (row.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
            late: false,
            okShift: true
        };
    }
    return null;
}

function saveToStorage() {
    localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));
}

function triggerRefresh() {
    window.dispatchEvent(new Event('data:synced'));
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
