
// Mock Window & Global Scope
global.window = global;
global.employees = [
    { nid: '123', name: 'Test User', shift: 'P' }
];
global.attendance = [];
global.shifts = { P: { start: '07:30', end: '15:30' } };
global.sched = {};

// Mock Utils
global.now = () => new Date();
global.todayISO = () => '2023-10-25';
global.parseRaw = (s) => ({ nid: s });
global.findEmp = (p) => global.employees.find(e => e.nid == p.nid);
global.effectiveShiftFor = () => 'P'; // Simpel
global.shiftWindow = () => null;
global.isInWindow = () => false;
global.minutesOf = (d) => d.getHours() * 60 + d.getMinutes();
global.calculateLateStatus = () => false;
global.scheduleDateFor = (c, d) => d;
global.fmtTs = () => '';
global.save = () => { };
global.syncGlobals = () => { };
global.scanMode = 'auto';
global.setScanMode = () => { };
global.$ = () => ({});
global.toast = console.log;

// Mock DOM
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, querySelector: () => ({}) }),
    body: { appendChild: () => { } }
};

// --- PASTE handleScan & Helpers FROM app.js ---
// (Simplified for testing logic only)

const lastScanMap = new Map();

function showSuccessOverlay(emp, statusText) {
    console.log(`[OVERLAY] Tampil: BERHASIL - ${emp.name} (${statusText})`);
}

function handleScan(raw) {
    const parsed = parseRaw(raw);
    const ts = global.mockTime || now();
    const emp = findEmp(parsed);

    if (!emp) return;

    // === DOUBLE SCAN PREVENTION (7 Seconds Cooldown) ===
    const lastTime = lastScanMap.get(emp.nid) || 0;
    if (ts.getTime() - lastTime < 7000) {
        console.log(`[TOAST] ⏳ Tunggu 7 detik sebelum scan ${emp.name} lagi.`);
        return;
    }
    lastScanMap.set(emp.nid, ts.getTime());

    console.log(`[SUCCESS] Scan diterima untuk ${emp.name}`);
    showSuccessOverlay(emp, 'MASUK');
}

// --- TEST SCENARIO ---

console.log('--- Test 1: Scan Pertama ---');
global.mockTime = new Date('2023-10-25T08:00:00');
handleScan('123'); // Should Success

console.log('\n--- Test 2: Scan Langsung (Jeda 2 detik) ---');
global.mockTime = new Date('2023-10-25T08:00:02');
handleScan('123'); // Should FAIL (Cooldown)

console.log('\n--- Test 3: Scan Setelah 8 Detik ---');
global.mockTime = new Date('2023-10-25T08:00:08');
handleScan('123'); // Should Success

