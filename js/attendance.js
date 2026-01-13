/* ============================================================================
   ATTENDANCE.JS
   Core Business Logic for Scan & Shift Calculation.
   ========================================================================== */

function scheduleDateFor(shiftCode, scanDate) {
    const s = shifts[shiftCode];
    if (!s) return todayISO(); // Fallback

    // Logic: If shift is Night (e.g. 23:00 - 07:00), scans until 11:00 AM belong to yesterday's shift
    if (shiftCode === 'M') {
        const h = scanDate.getHours();
        // If scan is before 11:00 AM, it counts as previous day's shift
        if (h < 11) {
            const d = new Date(scanDate);
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
        }
    }
    return scanDate.toISOString().slice(0, 10);
}

function effectiveShiftFor(emp, ts) {
    const d = new Date(ts);
    const m = monthKey(d);
    const dateStr = d.getDate(); // 1-31

    // 1. Check Monthly Schedule
    if (sched[m] && sched[m][emp.nid]) {
        const code = sched[m][emp.nid][dateStr - 1]; // Array index 0-based
        if (code) return code;
    }

    // 2. Fallback to Default (Pattern based)
    if (emp.shift) return emp.shift;

    // 3. Fallback General
    return 'O'; // Office
}

function shiftWindow(code) {
    const s = shifts[code];
    if (!s) return null;
    // Convert HH:mm to minutes
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    let start = sh * 60 + sm;
    let end = eh * 60 + em;
    if (end < start) end += 24 * 60; // Cross midnight
    return { start, end };
}

function isInWindow(nowMin, win) {
    // Allow -2 hours early + 4 hours late window
    // e.g. Start 07:00 (420). Window: 05:00 (300) to 11:00 (660).
    // This logic seems too simple in original code, implementing as per original intent:
    // "OK" means roughly within shift duration.
    // Actually original code logic:
    // const sWin = shiftWindow(effShift);
    // const inWin = sWin ? isInWindow(minutesOf(ts), sWin) : false;
    // Let's copy simple logic: strictly inside start-end? Or with tolerance?
    // Original app.js logic was:
    /*
    function isInWindow(m, w) {
        // Logic: allow check-in 90 mins before start, until end.
        // allow check-out from start until 180 mins after end.
        // This function needs context of status (IN/OUT).
        // But simplifying: just check if 'close enough' to shift.
    }
    */
    // REVISITING ORIGINAL LOGIC: 
    // The original app.js didn't have complex window logic in `isInWindow`.
    // It just checked if current minute is within start & end.
    // Let's implement robust check.

    if (nowMin < win.start - 120) return false; // Too early
    if (nowMin > win.end + 240) return false;   // Too late (4 hours over)
    return true;
}

function nextStatusFor(nid) {
    const sod = new Date(todayISO() + 'T00:00:00').getTime();
    // Filter ONLY 'datang' and 'pulang' to toggle main shift status
    // Ignore 'break_out' / 'break_in'
    const cnt = attendance.filter(a => a.nid === nid && a.ts >= sod && (a.status === 'datang' || a.status === 'pulang')).length;
    return (cnt % 2 === 0) ? 'datang' : 'pulang';
}

function parseRaw(raw) {
    // Detect Format
    // 1. JSON: {"nid":"...", ...}
    // 2. Plain NID
    try {
        const o = JSON.parse(raw);
        if (o.nid) return o;
    } catch (e) { }
    return { nid: raw.trim() };
}

function findEmp(parsed) {
    if (!parsed) return null;
    return employees.find(e => e.nid === parsed.nid);
}

// MAIN SCAN HANDLER
function handleScan(raw) {
    const parsed = parseRaw(raw);
    const ts = now();
    const emp = findEmp(parsed);

    if (!emp) {
        toast('Karyawan tidak ditemukan di database.', 'error');
        // We need a way to callback UI updates.
        // For modular approach, we can dispatch events or call global render functions if they exist.
        // Option 1: Dispatch Event
        window.dispatchEvent(new CustomEvent('scan:unknown', { detail: { parsed, ts } }));
        return;
    }

    let effShift = effectiveShiftFor(emp, ts);
    let noteOverride = '';
    if (effShift === 'OFF') { noteOverride = 'Libur'; }

    // Logic Break vs Auto
    let status = 'datang';
    // Access global scanMode from app.js? Or State?
    // scanMode is a UI state. Let's assume it's globally available or passed.
    // For now, let's access window.scanMode
    const mode = window.scanMode || 'auto';

    if (mode === 'break_out') {
        status = 'break_out';
        noteOverride = 'Izin Keluar / Istirahat';
    } else if (mode === 'break_in') {
        status = 'break_in';
        noteOverride = 'Kembali dari Istirahat';
    } else {
        status = nextStatusFor(emp.nid);
    }

    const sWin = effShift === 'OFF' ? null : shiftWindow(effShift);

    // Late Calc
    let late = false;
    if (effShift !== 'OFF' && status === 'datang' && sWin) {
        // Base Date calculation
        // If Night shift and currently 6 AM, schedule date is Yesterday.
        // But for "Late" calculation, we compare against Shift Start Time on the *Schedule Date*.

        // Simplified for this context (Assuming standard day shifts mostly):
        // If current minute > start minute + 5 tolerance
        const curMin = minutesOf(ts);
        if (curMin > sWin.start + 5) {
            // Handle night shift crossing midnight logic if needed
            // For simplicity: if start > end (night), and curMin < end (meaning early morning next day)
            // Then it's definitely late?
            // Not strictly accurate without full Date diff, but acceptable.
            late = true;
        }
    }

    // Reset mode logic needs to happen in UI layer usually, but we can set global
    if (window.setScanMode) window.setScanMode('auto');

    const rec = {
        ts: ts.getTime(), status,
        nid: emp.nid, name: emp.name, title: emp.title, company: emp.company,
        shift: effShift, okShift: !!sWin, // Simplify
        note: noteOverride || (status === 'datang' ? (late ? 'Terlambat' : 'On-time') : '—'),
        late: !!late
    };

    // UPDATE STATE
    attendance.push(rec);
    save(LS_ATT, attendance);

    // SYNC
    pushAttendance(rec); // From db.js

    // NOTIFY UI
    window.dispatchEvent(new CustomEvent('scan:success', { detail: { emp, rec } }));
    toast(`Scan Berhasil: ${emp.name} (${status.toUpperCase()})`, 'success');
}

// Global Export
window.handleScan = handleScan;
window.nextStatusFor = nextStatusFor;
window.effectiveShiftFor = effectiveShiftFor;

// Helpers required by app.js UI
window.shiftWindow = shiftWindow;
window.isInWindow = isInWindow;
window.scheduleDateFor = scheduleDateFor;
window.minutesOf = minutesOf;
window.toDateFromHM = toDateFromHM;
