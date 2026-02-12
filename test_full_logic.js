
// === MOCK ENVIRONMENT ===
global.window = global;
global.attendance = []; // Storage
global.employees = [
    { nid: 'DAY01', name: 'Budi (Day)', shift: 'P' },
    { nid: 'NIGHT01', name: 'Siti (Night)', shift: 'M' } // Roster says 'M' but might be 'OFF' in valid scenarios
];
global.shifts = {
    P: { start: '07:30', end: '16:00' },
    M: { start: '19:30', end: '07:30' }
};
global.scanMode = 'auto';

// Mock Date System
let mockTime = new Date();
global.now = () => new Date(mockTime); // Dynamic time
global.todayISO = () => mockTime.toISOString().split('T')[0];

// Mock Utils
global.parseRaw = (s) => ({ nid: s });
global.findEmp = (p) => global.employees.find(e => e.nid == p.nid);
global.effectiveShiftFor = (emp, ts) => emp.shift; // Simplification: Always returns rosters shift
global.nextStatusFor = (nid) => {
    const last = global.attendance.slice().reverse().find(a => a.nid === nid);
    return (last && last.status === 'datang') ? 'pulang' : 'datang';
};
global.shiftWindow = () => null; // Ignore window validation for checking logic flow
global.isInWindow = () => true;
global.minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
global.calculateLateStatus = () => false;
global.fmtTs = () => '';
global.save = () => { };
global.syncGlobals = () => { };
global.setScanMode = () => { };
global.pushAttendance = () => { };
global.renderScanPreview = () => { };
global.renderScanTable = () => { };
global.renderDashboard = () => { };
global.updateScanLiveCircle = () => { };
global.$ = () => ({});
global.toast = (msg) => console.log(`[TOAST] ${msg}`);

// Mock DOM
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, querySelector: () => ({}) }),
    body: { appendChild: () => { } }
};
global.window.dispatchEvent = () => { };

// === LOGIC TO TEST (COPIED FROM APP.JS) ===
const lastScanMap = new Map();

function showSuccessOverlay(emp, statusText) {
    console.log(`[UI] OVERLAY: ${statusText} - ${emp.name}`);
}

function handleScan(raw) {
    const parsed = parseRaw(raw);
    const ts = now();
    const emp = findEmp(parsed);

    if (!emp) { console.log('Emp Missing'); return; }

    // === DOUBLE SCAN PREVENTION ===
    const lastTime = lastScanMap.get(emp.nid) || 0;
    if (ts.getTime() - lastTime < 7000) {
        toast(`⏳ Tunggu 7 detik sebelum scan ${emp.name} lagi.`);
        return;
    }
    lastScanMap.set(emp.nid, ts.getTime());

    let effShift = effectiveShiftFor(emp, ts);
    let noteOverride = '';

    // Logic Break vs Auto
    let status = 'datang';
    // (Skipping Break Logic for this test)
    {
        status = nextStatusFor(emp.nid);

        // === CONTEXT AWARE LOGIC ===
        const lastRec = global.attendance.slice().reverse().find(a => a.nid === emp.nid);

        if (lastRec && lastRec.status === 'datang') {
            const hoursSinceLast = (ts.getTime() - lastRec.ts) / (1000 * 60 * 60);
            // C. Last scan was NOT today (Must be a cross-day shift).
            const isSameDay = new Date(lastRec.ts).getDate() === ts.getDate();

            if (ts.getHours() < 14 && hoursSinceLast < 20 && !isSameDay) {
                console.log(`[LOGIC] Night Shift Auto-Detect triggered for ${emp.name}`);
                status = 'pulang';
                effShift = 'M';
                noteOverride = 'Pulang Shift Malam (Auto-Detected)';
            } else {
                console.log(`[LOGIC] Normal Flow. Same Day? ${isSameDay}`);
            }
        }
    }

    const rec = {
        ts: ts.getTime(), status,
        nid: emp.nid, name: emp.name, shift: effShift, note: noteOverride
    };
    global.attendance.push(rec);
    showSuccessOverlay(emp, status === 'datang' ? 'MASUK' : 'PULANG');
    console.log(`[DB] Saved: ${rec.status.toUpperCase()} | Shift: ${rec.shift} | Note: ${rec.note}`);
}

// === RUN SCENARIOS ===

console.log('--- SCENARIO 1: Day Shift (Same Day) ---');
// 1. Masuk Pagi
mockTime = new Date('2023-10-25T07:30:00');
handleScan('DAY01');

// 2. Pulang Sore (Same Day) -> Should NOT trigger Night Shift Logic
mockTime = new Date('2023-10-25T16:00:00'); // > 7s later
handleScan('DAY01');


console.log('\n--- SCENARIO 2: Night Shift (Cross Day) ---');
// 1. Masuk Malam (Hari 1)
mockTime = new Date('2023-10-25T23:00:00');
handleScan('NIGHT01');

// 2. Pulang Pagi (Hari 2) -> Should TRIGGER Night Shift Logic
mockTime = new Date('2023-10-26T07:30:00');
handleScan('NIGHT01');


console.log('\n--- SCENARIO 3: Double Scan Prevention ---');
// 1. Scan
mockTime = new Date('2023-10-27T08:00:00');
handleScan('DAY01'); // Success

// 2. Scan Again immediately (2s later)
mockTime = new Date('2023-10-27T08:00:02');
handleScan('DAY01'); // Should Fail
