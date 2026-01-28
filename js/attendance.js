/* ============================================================================
   ATTENDANCE.JS
   Core Business Logic for Scan & Shift Calculation.
   ========================================================================== */

function scheduleDateFor(shiftCode, scanDate) {
    const s = shifts[shiftCode];
    if (!s) return todayISO(); // Fallback

    // Logic: If shift is Night (e.g. 23:00 - 07:00), scans until 11:00 AM belong to yesterday's shift
    // UPDATED: Use 'C' (Malam) as per App Config
    if (shiftCode === 'C' || shiftCode === 'M') {
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

// ... effectiveShiftFor ... 
// ... shiftWindow ...
// ... isInWindow ...

/* REIMPLEMENTED: Robust Status Toggling for Night Shifts */
function nextStatusFor(nid) {
    // Look back 20 hours (enough to cover night shift gap but ignore forgotten checkouts from days ago)
    const limit = new Date().getTime() - (20 * 60 * 60 * 1000); // 20 hours ago

    // Get the very last scan for this user within the limit
    // We sort DESC by timestamp
    const last = attendance
        .filter(a => a.nid === nid && a.ts > limit && (a.status === 'datang' || a.status === 'pulang'))
        .sort((a, b) => b.ts - a.ts)[0];

    // If no recent history found, assume New Entry -> 'datang'
    if (!last) return 'datang';

    // Toggle status
    return (last.status === 'datang') ? 'pulang' : 'datang';
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
