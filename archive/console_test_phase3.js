// ==========================================
// TEST SCRIPT: VERIFIKASI LOGIKA TERLAMBAT (FASE 3)
// ==========================================
(function () {
    console.clear();
    console.log("%c🧪 MULAI PENGUJIAN LOGIKA TERLAMBAT...", "color:blue; font-weight:bold; font-size:14px;");

    // 1. BACKUP DATA
    const originalEmp = window.employees;
    const originalAtt = window.attendance;

    // 2. SETUP DATA DUMMY
    // Shift Daytime: Start 08:00
    const TGL = new Date().toISOString().slice(0, 10);

    window.employees = [
        { nid: 'LATE01', name: 'Si Ontime', shift: 'DAYTIME', company: 'PT TEST' },
        { nid: 'LATE02', name: 'Si Telat Dikit', shift: 'DAYTIME', company: 'PT TEST' }, // 08:05 (Masih Toleransi 5 menit?? Harusnya Telat jika >= 08:05) -> Logic is >= start + 5min
        { nid: 'LATE03', name: 'Si Telat Parah', shift: 'DAYTIME', company: 'PT TEST' }
    ];

    // Logic: Late if ts >= Start + 5 mins
    // 08:00 -> 08:05 is exactly 5 mins. So 08:05:00 IS LATE.
    // 08:04:59 IS NOT LATE.

    window.attendance = [
        { nid: 'LATE01', status: 'datang', ts: new Date(`${TGL}T08:04:30`).getTime() }, // ONTIME (< 08:05)
        { nid: 'LATE02', status: 'datang', ts: new Date(`${TGL}T08:05:00`).getTime() }, // LATE (Pas batas)
        { nid: 'LATE03', status: 'datang', ts: new Date(`${TGL}T08:10:00`).getTime() }  // LATE
    ];

    // 3. JALANKAN FILTER LAPORAN
    // Kita cek via getFilteredAttendanceRows dengan filter Status 'LATE'

    // Mock Filter UI
    const oldFrom = document.getElementById('attFrom')?.value;
    if (document.getElementById('attFrom')) document.getElementById('attFrom').value = TGL;
    if (document.getElementById('attTo')) document.getElementById('attTo').value = TGL;

    // Set status filter to 'LATE'
    const oldSt = document.getElementById('attStatusFilter')?.value;
    if (document.getElementById('attStatusFilter')) {
        document.getElementById('attStatusFilter').innerHTML = '<option value="LATE">Terlambat</option>';
        document.getElementById('attStatusFilter').value = 'LATE';
    }

    console.log("⚙️ Memfilter Laporan status 'TERLAMBAT'...");

    // Check if function exists
    if (typeof window.getFilteredAttendanceRows !== 'function') {
        console.error("❌ Function getFilteredAttendanceRows not found!");
        return;
    }

    const results = window.getFilteredAttendanceRows();

    // 4. VALIDASI
    const ontimeFound = results.find(r => r.nid === 'LATE01'); // Harusnya GAK ada
    const late1Found = results.find(r => r.nid === 'LATE02');  // Harusnya ADA
    const late2Found = results.find(r => r.nid === 'LATE03');  // Harusnya ADA

    let passed = 0;

    if (!ontimeFound) {
        console.log("✅ Si Ontime (08:04:30): Tidak dianggap terlambat. (Benar)");
        passed++;
    } else {
        console.error("❌ Si Ontime dianggap TERLAMBAT! (Salah)");
    }

    if (late1Found) {
        console.log("✅ Si Telat Dikit (08:05:00): Terdeteksi Terlambat. (Benar - Batas Toleransi)");
        passed++;
    } else {
        console.error("❌ Si Telat Dikit (08:05:00) dianggap ONTIME! (Salah)");
    }

    if (late2Found) {
        console.log("✅ Si Telat Parah (08:10:00): Terdeteksi Terlambat. (Benar)");
        passed++;
    } else {
        console.error("❌ Si Telat Parah HILANG dari laporan!");
    }

    if (passed === 3) {
        console.log("%c🎉 PENGUJIAN LOGIKA TERLAMBAT SUKSES!", "color:green; font-weight:bold; font-size:16px;");
        console.log("Batas toleransi 5 menit konsisten (>= 5 menit dianggap telat).");
    } else {
        console.log(`%c⚠️ DITEMUKAN MASALAH.`, "color:red; font-weight:bold;");
    }

    // 5. RESTORE
    window.employees = originalEmp;
    window.attendance = originalAtt;
    if (document.getElementById('attStatusFilter')) {
        // Reset manually or refresh
        document.getElementById('attStatusFilter').value = oldSt || '';
    }
    console.log("🔄 Data asli dikembalikan. Silakan refresh halaman.");

})();
