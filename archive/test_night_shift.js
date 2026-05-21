
// Mock Window & Global Scope
global.window = global;
global.employees = [
    { nid: '123', name: 'Test User', shift: 'C' }
];
global.attendance = [];
global.shifts = {
    P: { start: '07:30', end: '15:30' },
    S: { start: '15:30', end: '23:30' },
    M: { start: '23:30', end: '07:30' },
    DAYTIME: { start: '07:30', end: '16:00' }
};
global.sched = {}; // Empty schedule = Default or OFF

// Mock Utils
global.now = () => new Date();
global.todayISO = () => '2023-10-25'; // Fixed date
global.parseRaw = (s) => ({ nid: s });
global.findEmp = (p) => global.employees.find(e => e.nid == p.nid);
global.effectiveShiftFor = (emp, ts) => { return 'OFF'; }; // FORCE 'OFF' TO SIMULATE THE BUG SCENARIO
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

// --- PASTE handleScan LOGIC HERE (Simulated) ---
function handleScan(raw) {
    const parsed = parseRaw(raw);
    // MOCK TIME: passed as argument for testing, or use global
    const ts = global.mockTime || now();
    const emp = findEmp(parsed);

    if (!emp) return;

    let effShift = effectiveShiftFor(emp, ts); // Will return OFF in this test
    let noteOverride = '';
    if (effShift === 'OFF') { noteOverride = 'Libur'; }

    let status = 'datang';

    // Simplistic nextStatusFor mock
    const last = attendance.slice().reverse().find(a => a.nid === emp.nid);
    if (last && last.status === 'datang') status = 'pulang';

    // === CONTEXT AWARE LOGIC (THE FIX) ===
    const lastRec = attendance.slice().reverse().find(a => a.nid === emp.nid);

    if (lastRec && lastRec.status === 'datang') {
        const hoursSinceLast = (ts.getTime() - lastRec.ts) / (1000 * 60 * 60);

        // Conditions: Morning < 14:00 AND < 20h gap
        if (ts.getHours() < 14 && hoursSinceLast < 20) {
            console.log(`Context-Aware Triggered: Gap ${hoursSinceLast.toFixed(1)}h`);
            status = 'pulang';
            effShift = 'M';
            noteOverride = 'Pulang Shift Malam (Auto-Detected)';
        }
    }
    // =====================================

    const rec = {
        ts: ts.getTime(), status,
        nid: emp.nid,
        shift: effShift,
        note: noteOverride
    };
    attendance.push(rec);
    return rec;
}

// --- SKENARIO TEST ---

// 1. Simulasi: Scan MASUK Kemarin Malam (Jam 23:00)
// Kondisi: Jadwal tertulis OFF (Libur), tapi karyawan masuk kerja.
global.mockTime = new Date('2023-10-24T23:00:00');
console.log('--- Langkah 1: Scan MASUK (Kemarin Malam 23:00) ---');
const rec1 = handleScan('123');
console.log('Hasil Scan 1:', `Status: ${rec1.status.toUpperCase()}`, `| Shift Terdeteksi: ${rec1.shift}`, `| Catatan: ${rec1.note}`);
// Harapan: Status DATANG, Shift OFF (karena jadwal libur), Note Libur

// 2. Simulasi: Scan PULANG Pagi Ini (Jam 07:30)
// Kondisi: Jadwal hari ini juga OFF/Pagi.
// TANPA PERBAIKAN: Sistem akan menganggap ini Scan MASUK baru (Double Masuk).
// DENGAN PERBAIKAN: Sistem melihat sejarah "Masuk Kemarin", jadi OTOMATIS dianggap PULANG SHIFT MALAM.
global.mockTime = new Date('2023-10-25T07:30:00');
console.log('\n--- Langkah 2: Scan PULANG (Pagi Ini 07:30) ---');
const rec2 = handleScan('123');
console.log('Hasil Scan 2:', `Status: ${rec2.status.toUpperCase()}`, `| Shift Terdeteksi: ${rec2.shift}`, `| Catatan: ${rec2.note}`);

// VERIFIKASI AKHIR
if (rec2.status === 'pulang' && rec2.shift === 'M') {
    console.log('\n✅ SUKSES: Sistem berhasil mendeteksi "Pulang Shift Malam" meskipun jadwal tertulis Libur/OFF.');
    console.log('   Solusi "Data Priority" berfungsi dengan baik!');
} else {
    console.log('\n❌ GAGAL: Sistem gagal mendeteksi pulang (Masih dianggap Masuk).');
}

