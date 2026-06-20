// scan_logic.js - Khusus untuk halaman scan.html

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Clock Update
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
        const dateOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const dateStr = now.toLocaleDateString('id-ID', dateOptions);
        
        const clockEl = document.getElementById('liveClock');
        const dateEl = document.getElementById('currentDateStr');
        if (clockEl) clockEl.textContent = timeStr + ' WIB';
        if (dateEl) dateEl.textContent = dateStr;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // 2. Pre-load dari LocalStorage (Agar data tidak 0 saat offline / sebelum fetch)
    function loadLocalData() {
        try {
            const empData = localStorage.getItem('SA_EMPLOYEES');
            if (empData) window.employees = JSON.parse(empData);
            
            const attData = localStorage.getItem('SA_ATTENDANCE');
            if (attData) window.attendance = JSON.parse(attData);

            const shiftData = localStorage.getItem('SA_SHIFTS');
            if (shiftData) window.shifts = JSON.parse(shiftData);

            const schedData = localStorage.getItem('SA_SHIFT_MONTHLY');
            if (schedData) window.sched = JSON.parse(schedData);
        } catch (e) {
            console.warn('Gagal load local data', e);
        }
        
        if (!window.employees) window.employees = [];
        if (!window.attendance) window.attendance = [];
        if (!window.shifts) {
            window.shifts = {
                P: { start: '07:30', end: '15:30' },
                S: { start: '15:30', end: '23:30' },
                M: { start: '23:30', end: '07:30' },
                DAYTIME: { start: '07:30', end: '16:00' }
            };
        }
        if (!window.sched) window.sched = {};
        
        refreshDashboard();
    }
    loadLocalData();

    // 3. Init DB Connection & Sync
    if (typeof window.checkConn === 'function') {
        try {
            const connected = await window.checkConn();
            if (connected) {
                try {
                    // Mengaktifkan kembali pullAll() agar data sinkron dengan database utama (Shifts, Schedule, dll)
                    if (typeof window.pullAll === 'function') {
                        await window.pullAll();
                    }
                    
                    if (typeof window.subscribeToRealtime === 'function') {
                        window.subscribeToRealtime(); // Listen to live changes
                    }
                    refreshDashboard(); // Refresh lagi setelah dapat data baru
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Terkoneksi ke Database & Sinkron',
                        showConfirmButton: false,
                        timer: 3000
                    });
                } catch (pullErr) {
                    Swal.fire('Error Tarik Data', 'Gagal pullAll: ' + pullErr.message, 'error');
                }
            } else {
                console.warn('Mode Offline. Menampilkan data lokal.');
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'warning',
                    title: 'Gagal Konek DB (Mode Offline)',
                    showConfirmButton: false,
                    timer: 5000
                });
            }
        } catch (connErr) {
            Swal.fire('Error Koneksi', 'Gagal checkConn: ' + connErr.message, 'error');
        }
    }

    // 4. Listen to Data Sync (dari realtime atau pullAll)
    window.addEventListener('data:synced', () => {
        refreshDashboard();
    });

    // 4. Barcode Scanner Logic
    const scanInput = document.getElementById('scanInput');
    if (scanInput) {
        let scanTimeout;

        // Auto-submit otomatis jika tidak ada Enter (Debounce)
        scanInput.addEventListener('input', () => {
            clearTimeout(scanTimeout);
            scanTimeout = setTimeout(async () => {
                const raw = scanInput.value.trim();
                if (raw) {
                    scanInput.value = ''; // clear input
                    await extractAndProcessScan(raw);
                }
            }, 800); // Perbesar jeda jadi 800ms untuk scanner lambat
        });

        // Fallback jika scanner tetap mengirimkan tombol Enter
        scanInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                scanInput.value += ' '; // Tambah spasi untuk menggabungkan multiline
                clearTimeout(scanTimeout); // Restart debounce
                scanTimeout = setTimeout(async () => {
                    const raw = scanInput.value.trim();
                    if (raw) {
                        scanInput.value = ''; // clear input
                        await extractAndProcessScan(raw);
                    }
                }, 800);
            }
        });
        
        // Keep focus on input
        document.addEventListener('click', (e) => {
            if(e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT') {
                scanInput.focus();
            }
        });
    }

    // Manual Submit
    const btnManualSubmit = document.getElementById('btnManualSubmit');
    const manualNid = document.getElementById('manualNid');
    const manualName = document.getElementById('manualName');
    const manualShift = document.getElementById('manualShift');

    const handleManualSubmit = async () => {
        const nid = manualNid ? manualNid.value.trim() : '';
        if(nid) {
            const success = await processScan(nid, '', true); // true = isManual
            if (success) {
                if (manualNid) manualNid.value = '';
                if (manualName) manualName.value = '';
                if (manualShift) manualShift.value = '';
                const typeEl = document.getElementById('manualType');
                if (typeEl) typeEl.value = 'absen';
            }
        }
    };

    if (btnManualSubmit) {
        btnManualSubmit.addEventListener('click', handleManualSubmit);
    }

    // Trigger submit on Enter key
    const submitOnEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleManualSubmit();
        }
    };

    if (manualNid) manualNid.addEventListener('keypress', submitOnEnter);
    if (manualShift) manualShift.addEventListener('keypress', submitOnEnter);
    if (manualName) manualName.addEventListener('keypress', submitOnEnter);

    // Auto-fill nama & shift saat NID diketik
    if (manualNid && manualName) {
        manualNid.addEventListener('input', () => {
            const nid = manualNid.value.trim();
            if (nid && window.employees) {
                const emp = window.employees.find(e => e.nid && String(e.nid).trim() === String(nid).trim());
                if (emp) {
                    manualName.value = emp.name;
                    if (manualShift && emp.shift) {
                        let exists = Array.from(manualShift.options).some(opt => opt.value === emp.shift);
                        if (!exists) {
                            manualShift.add(new Option(emp.shift, emp.shift));
                        }
                        manualShift.value = emp.shift;
                    }
                } else {
                    manualName.value = '';
                    if (manualShift) manualShift.value = '';
                }
            } else {
                manualName.value = '';
                if (manualShift) manualShift.value = '';
            }
        });
    }
});

// --- CORE LOGIC ---

async function extractAndProcessScan(rawData) {
    let nid = rawData.trim();
    
    // 1. Coba parse format Barcode bawaan aplikasi lama: NID|Nama|Jabatan|Perusahaan
    if (nid.includes('|')) {
        const parts = nid.split('|');
        if (parts.length >= 1) {
            nid = parts[0].trim();
        }
    }
    // 2. Coba parse jika formatnya JSON
    else if (nid.startsWith('{') && nid.endsWith('}')) {
        try {
            const obj = JSON.parse(nid);
            if (obj.nid) nid = obj.nid;
            else if (obj.NID) nid = obj.NID;
            else if (obj.id) nid = obj.id;
        } catch(e) {}
    } 
    // 3. Fallback pencarian manual di dalam teks QR (jika format teks bebas)
    else {
        // Coba cari NID: XXXXXX dengan/tanpa spasi/tanda kutip
        const match = nid.match(/NID\s*["':\-=]*\s*([a-zA-Z0-9]+)/i);
        if (match && match[1]) {
            nid = match[1];
        } else {
            const words = nid.split(/[\s\n,;|]+/); // Tambahkan | sebagai pemisah juga
            if (words.length > 1) {
                // Cari kata yang mengandung angka dan minimal 6 karakter (khas NID)
                const possibleNid = words.find(w => /[0-9]/.test(w) && w.length >= 6);
                if (possibleNid) nid = possibleNid;
            }
        }
    }
    
    // Bersihkan karakter non-alfanumerik jika ada (misal tertinggal koma)
    nid = nid.replace(/[^a-zA-Z0-9]/g, '');

    await processScan(nid, rawData);
}

// Helper Constants untuk Logika Shift
const NORMALIZE_GROUP = {
    'a': 'A', 'group a': 'A', 'grup a': 'A',
    'b': 'B', 'group b': 'B', 'grup b': 'B',
    'c': 'C', 'group c': 'C', 'grup c': 'C',
    'd': 'D', 'group d': 'D', 'grup d': 'D',
    'daytime': 'DAYTIME', 'day': 'DAYTIME', 'group daytime': 'DAYTIME', 'grup daytime': 'DAYTIME'
};
const NORMALIZE_SHIFT = {
    'p': 'P', 'pagi': 'P', 'shift pagi': 'P',
    's': 'S', 'sore': 'S', 'shift sore': 'S',
    'm': 'M', 'malam': 'M', 'shift malam': 'M',
    'day': 'DAYTIME', 'daytime': 'DAYTIME', 'siang': 'DAYTIME',
    'off': 'OFF', 'l': 'OFF', 'libur': 'OFF'
};

const monthKey = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

function effectiveShiftFor(emp, date) {
    if (!emp || !emp.shift) return null;
    if (typeof date === 'number' || typeof date === 'string') {
        date = new Date(date);
    }
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        date = new Date();
    }
    let group = emp.shift;
    const groupAlias = NORMALIZE_GROUP[group.toLowerCase()];
    if (groupAlias) group = groupAlias;

    const id = monthKey(date), day = date.getDate();
    const dailyCode = (window.sched && window.sched[id]) ? window.sched[id][group]?.[day] : null;

    if (dailyCode) {
        if (dailyCode === 'L' || dailyCode === 'OFF' || dailyCode.toLowerCase() === 'libur') return 'OFF';
        const normalized = NORMALIZE_SHIFT[dailyCode.toLowerCase()];
        const shiftCode = normalized || dailyCode.toUpperCase();
        if (window.shifts && window.shifts[shiftCode]) return shiftCode;
    }

    const DEFAULT_GROUP_SHIFT = { A: 'P', B: 'S', C: 'M', D: 'P', DAYTIME: 'DAYTIME' };
    const defaultShift = DEFAULT_GROUP_SHIFT[group];
    if (defaultShift && window.shifts && window.shifts[defaultShift]) return defaultShift;

    return 'OFF';
}

function shiftWindow(code) {
    const s = window.shifts ? window.shifts[code] : null; if (!s) return null;
    const [h1, m1] = s.start.split(':').map(Number);
    const [h2, m2] = s.end.split(':').map(Number);
    return { start: h1 * 60 + m1, end: h2 * 60 + m2, code };
}

function minutesOf(dt) { return dt.getHours() * 60 + dt.getMinutes(); }

function isInWindow(m, win) {
    if (win.end > win.start) return m >= win.start && m < win.end;
    return m >= win.start || m < win.end;
}

function scheduleDateFor(code, dt) {
    const win = shiftWindow(code); if (!win) return dt;
    if (win.end > win.start) return dt;
    const m = minutesOf(dt);
    if (m < win.end) { const y = new Date(dt); y.setDate(dt.getDate() - 1); return y; }
    return dt;
}

function calculateLateStatus(emp, ts, shiftCode) {
    if (!shiftCode || shiftCode === 'OFF') return false;
    const sDef = (window.shifts && window.shifts[shiftCode]) ? window.shifts[shiftCode] : null;
    if (!sDef || !sDef.start) return false;

    const baseDay = scheduleDateFor(shiftCode, new Date(ts));
    const [sh, sm] = sDef.start.split(':').map(Number);
    const shiftStart = new Date(baseDay);
    shiftStart.setHours(sh, sm, 0, 0);

    return ts >= (shiftStart.getTime() + 5 * 60 * 1000);
}
window.calculateLateStatus = calculateLateStatus;

function nextStatusFor(nid) {
    // Gunakan zona waktu lokal untuk mendapatkan awal hari
    const now = new Date();
    const sodDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sodTs = sodDate.getTime();
    
    const todays = (window.attendance||[]).filter(a => a.nid === nid && a.ts >= sodTs && (a.status === 'datang' || a.status === 'pulang'));

    if (todays.length === 0) return 'datang';

    todays.sort((a, b) => b.ts - a.ts);
    const last = todays[0];
    return last.status === 'datang' ? 'pulang' : 'datang';
}

function nextBreakStatusFor(nid) {
    const now = new Date();
    const sodDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sodTs = sodDate.getTime();
    
    const todays = (window.attendance||[]).filter(a => a.nid === nid && a.ts >= sodTs && (a.status === 'break_out' || a.status === 'break_in'));

    if (todays.length === 0) return 'break_out';

    todays.sort((a, b) => b.ts - a.ts);
    const last = todays[0];
    return last.status === 'break_out' ? 'break_in' : 'break_out';
}

// Double Scan Prevention
const lastScanMap = new Map();

async function processScan(nid, rawData = '', isManual = false) {
    if (!window.employees || !window.attendance) return false;

    // Cari karyawan
    const emp = window.employees.find(e => {
        if (!e.nid) return false;
        return String(e.nid).trim().toLowerCase() === String(nid).trim().toLowerCase();
    });
    
    if (!emp) {
        Swal.fire({
            icon: 'error',
            title: 'Tidak Ditemukan',
            html: `NID: <b>${nid}</b> tidak terdaftar.<br><br><div style="font-size:0.8rem; color:gray; text-align:left; background:#f4f4f4; padding:8px; border-radius:4px; margin-top:10px;"><b>Data QR Asli:</b><br>${rawData.substring(0, 100)}...</div>`,
            timer: 5000,
            showConfirmButton: true,
            confirmButtonText: 'Tutup'
        });
        return false;
    }

    if (emp.status === 'Non-Aktif') {
        Swal.fire('Akses Ditolak', 'Karyawan berstatus Non-Aktif.', 'error');
        return false;
    }

    const ts = new Date();
    
    // === DOUBLE SCAN PREVENTION (7 Seconds Cooldown) ===
    const lastTime = lastScanMap.get(emp.nid) || 0;
    if (ts.getTime() - lastTime < 7000) {
        Swal.fire({
            toast: true, position: 'top-end', icon: 'warning',
            title: `⏳ Tunggu 7 detik sebelum scan ${emp.name} lagi.`,
            showConfirmButton: false, timer: 3000
        });
        return false;
    }
    lastScanMap.set(emp.nid, ts.getTime());

    let effShift = effectiveShiftFor(emp, ts);
    let noteOverride = ''; 
    if (effShift === 'OFF') { noteOverride = 'Libur'; }

    let status = 'datang';
    let isIjin = false;

    if (isManual) {
        const typeEl = document.getElementById('manualType');
        if (typeEl && typeEl.value === 'ijin') {
            isIjin = true;
        }
    }

    if (isIjin) {
        status = nextBreakStatusFor(emp.nid);
        noteOverride = status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk';
    } else {
        status = nextStatusFor(emp.nid);

        // === CONTEXT AWARE LOGIC: Night Shift Detection ===
        const lastRec = window.attendance.slice().reverse().find(a => a.nid === emp.nid);
        if (lastRec && lastRec.status === 'datang') {
            const hoursSinceLast = (ts.getTime() - lastRec.ts) / (1000 * 60 * 60);
            const isSameDay = new Date(lastRec.ts).getDate() === ts.getDate();
            const wasNightShift = lastRec.shift === 'M' || new Date(lastRec.ts).getHours() >= 18;

            if (ts.getHours() < 14 && hoursSinceLast < 20 && !isSameDay && wasNightShift) {
                status = 'pulang';
                effShift = 'M';
                noteOverride = 'Pulang Shift Malam (Auto-Detected)';
            } else if (!isSameDay && !wasNightShift) {
                status = 'datang';
            }
        }
    }

    const sWin = effShift === 'OFF' ? null : shiftWindow(effShift);
    const inWin = isIjin ? true : (sWin ? isInWindow(minutesOf(ts), sWin) : false);

    let late = false;
    if (!isIjin && effShift !== 'OFF' && status === 'datang' && sWin) {
        late = calculateLateStatus(emp, ts.getTime(), effShift);
    }

    // Tentukan shift akhir (Prioritaskan Grup asli karyawan, bukan status Libur/P/S/M)
    let finalShift = emp.shift || effShift || '-';
    if (isManual && document.getElementById('manualShift')?.value) {
        finalShift = document.getElementById('manualShift').value;
    }

    // Buat objek absensi
    const record = {
        ts: ts.getTime(),
        status: status,
        nid: emp.nid,
        name: emp.name,
        title: emp.title || '-',
        company: emp.company || '-',
        shift: finalShift,
        okShift: inWin,
        note: noteOverride || (status === 'datang' ? (late ? 'Terlambat' : 'On-time') : '—') + (inWin ? '' : ' • Di luar jam shift'),
        late: !!late
    };

    // Tampilkan Overlay Foto & Info
    showOverlay(emp, record);

    // Update Lokal Langsung agar responsif
    window.attendance.push(record);
    window.attendance.sort((a, b) => a.ts - b.ts);
    localStorage.setItem('SA_ATTENDANCE', JSON.stringify(window.attendance));
    window.dispatchEvent(new Event('data:synced'));

    // Push ke Database
    if (typeof window.pushAttendance === 'function') {
        try {
            await window.pushAttendance(record);
            // pushAttendance akan memicu Realtime
        } catch (err) {
            console.error('Gagal push absensi', err);
        }
    }
    return true;
}

function showOverlay(emp, record) {
    const overlay = document.getElementById('employeePhotoOverlay');
    const img = document.getElementById('overlayPhoto');
    const nameEl = document.getElementById('overlayName');
    const statusEl = document.getElementById('overlayStatus');

    img.src = emp.photo || 'assets/dummy-avatar.png';
    nameEl.textContent = emp.name.toUpperCase();
    
    let statusText = '';
    if (record.status === 'break_out') {
        statusText = 'IZIN KELUAR / ISTIRAHAT';
        statusEl.style.color = "var(--warning)";
        img.style.borderColor = "var(--warning)";
    } else if (record.status === 'break_in') {
        statusText = 'KEMBALI MASUK KERJA';
        statusEl.style.color = "var(--success)";
        img.style.borderColor = "var(--success)";
    } else {
        statusText = record.status === 'datang' ? 'BERHASIL DATANG' : 'BERHASIL PULANG';
        if (record.status === 'datang' && record.late) {
            statusText += " - TERLAMBAT";
            statusEl.style.color = "var(--danger)";
            img.style.borderColor = "var(--danger)";
        } else if (record.status === 'datang') {
            statusText += " - TEPAT WAKTU";
            statusEl.style.color = "var(--success)";
            img.style.borderColor = "var(--success)";
        } else {
            statusEl.style.color = "var(--warning)";
            img.style.borderColor = "var(--warning)";
        }
    }
    
    statusEl.textContent = statusText;
    
    overlay.style.display = 'block';

    // Hide after 3 seconds
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000);
}

// --- UI REFRESH LOGIC ---

function refreshDashboard() {
    if (!window.employees || !window.attendance) return;

    const today = new Date();
    today.setHours(0,0,0,0);

    const attToday = window.attendance.filter(a => a.ts >= today.getTime());

    // 1. STATS
    // Sama seperti index.html, hitung hanya karyawan yang statusnya BUKAN 'Non-Aktif'
    const totalEmp = window.employees.filter(e => e.status !== 'Non-Aktif').length;
    
    // Sama seperti index.html, gunakan Rolling Window 24 Jam untuk Aktif di Site
    const rollingStart = Date.now() - (24 * 60 * 60 * 1000);
    const last24 = window.attendance.filter(a => a.ts >= rollingStart);

    const activeMap = new Map();
    last24.forEach(r => {
        if (!activeMap.has(r.nid) || r.ts > activeMap.get(r.nid).ts) {
            activeMap.set(r.nid, r);
        }
    });
    
    let activeSite = 0;
    let ontime = 0;
    let late = 0;

    activeMap.forEach(r => {
        if (r.status === 'datang' || r.status === 'break_in') activeSite++;
    });

    // Hitung Ontime & Late berdasarkan SEMUA record datang hari ini
    attToday.forEach(r => {
        if (r.status === 'datang') {
            const emp = window.employees.find(e => e.nid && String(e.nid).trim() === String(r.nid).trim());
            const eff = emp ? (effectiveShiftFor(emp, new Date(r.ts)) || emp.shift) : r.shift;
            if (calculateLateStatus(emp, r.ts, eff)) late++;
            else ontime++;
        }
    });

    document.getElementById('statTotalEmp').textContent = totalEmp;
    document.getElementById('statActiveSite').textContent = activeSite;
    document.getElementById('statOntime').textContent = ontime;
    document.getElementById('statLate').textContent = late;

    // 2. RADAR PERUSAHAAN (Visuals)
    renderRadar(activeMap);

    // 3. TABLES
    renderTables(attToday);
}

function renderRadar(activeMap) {
    const container = document.getElementById('radarContainer');
    if (!container) return;

    // Hapus node yang ada (sisakan radar-bg dan scan-box)
    const existingNodes = container.querySelectorAll('.company-node');
    existingNodes.forEach(n => n.remove());

    // Kelompokkan active karyawan per perusahaan
    const compCount = {};
    activeMap.forEach(r => {
        if (r.status === 'datang' || r.status === 'break_in') {
            const comp = r.company || 'Lainnya';
            compCount[comp] = (compCount[comp] || 0) + 1;
        }
    });

    // Generate Node
    const companies = Object.keys(compCount);
    const center = { x: 50, y: 50 }; // percentages
    
    companies.forEach((comp, i) => {
        // Hapus batas maksimal 8 agar SEMUA PT muncul
        const totalNodes = companies.length;
        const angle = (i / totalNodes) * Math.PI * 2;
        
        // Buat jarak radius (30% s/d 42%) selang-seling agar tidak terlalu bertumpuk jika banyak
        const distance = 32 + (i % 2 === 0 ? 0 : 8); 
        
        const x = center.x + Math.cos(angle) * distance; 
        const y = center.y + Math.sin(angle) * distance;

        const node = document.createElement('div');
        node.className = 'company-node';
        node.style.left = `calc(${x}% - 40px)`;
        node.style.top = `calc(${y}% - 15px)`;
        node.innerHTML = `${comp} <span class="node-count">${compCount[comp]}</span>`;
        
        container.appendChild(node);
    });
}

function renderTables(attToday) {
    // 1. Shift Log Table (kiri)
    const tbLog = document.getElementById('tableAttendance')?.querySelector('tbody');
    if (tbLog) {
        const wrapper = tbLog.closest('.table-wrapper');
        const oldScroll = wrapper ? wrapper.scrollTop : 0;
        const recent = [...attToday].sort((a,b) => b.ts - a.ts).slice(0, 10);
        let rowsHtml = recent.map(r => {
            const time = new Date(r.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
            let badge = 'bg-gray-100 text-gray-800';
            let txt = r.status.toUpperCase();
            if (r.status === 'datang') { badge = 'masuk'; txt = 'DATANG'; }
            else if (r.status === 'break_in') { badge = 'masuk'; txt = 'KEMBALI'; }
            else if (r.status === 'pulang') { badge = 'keluar'; txt = 'PULANG'; }
            else if (r.status === 'break_out') { badge = 'keluar'; txt = 'IZIN KELUAR'; }
            return `
                <tr>
                    <td>${time}</td>
                    <td><span class="badge ${badge}">${txt}</span></td>
                    <td><b>${r.name}</b></td>
                    <td>${r.company || '-'}</td>
                </tr>
            `;
        }).join('');
        
        // Gandakan data agar efek scrolling/ticker terlihat terus memutar tanpa putus walau datanya sedikit
        if (recent.length > 0) {
            tbLog.innerHTML = rowsHtml + rowsHtml + rowsHtml;
        } else {
            tbLog.innerHTML = '';
        }
        
        if (wrapper) wrapper.scrollTop = oldScroll;
    }

    // 2. Activity Table (kanan) - Menampilkan detail (misal jika late)
    const tbAct = document.getElementById('tableActivity')?.querySelector('tbody');
    if (tbAct) {
        const wrapper = tbAct.closest('.table-wrapper');
        const oldScroll = wrapper ? wrapper.scrollTop : 0;
        const recent = [...attToday].sort((a,b) => b.ts - a.ts).slice(0, 10);
        let rowsHtmlAct = recent.map(r => {
            const time = new Date(r.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
            let note = '-';
            if (r.late) {
                note = '<span class="badge telat">Terlambat</span>';
            } else if (r.status === 'break_out') {
                note = '<span class="badge keluar">Izin Keluar</span>';
            } else if (r.status === 'break_in') {
                note = '<span class="badge masuk">Kembali</span>';
            } else if (r.note && r.note !== '—') {
                note = r.note;
            }
            return `
                <tr>
                    <td>${time}</td>
                    <td>${r.nid}</td>
                    <td>${r.name}</td>
                    <td>${note}</td>
                </tr>
            `;
        }).join('');
        
        if (recent.length > 0) {
            tbAct.innerHTML = rowsHtmlAct + rowsHtmlAct + rowsHtmlAct;
        } else {
            tbAct.innerHTML = '';
        }

        if (wrapper) wrapper.scrollTop = oldScroll;
    }

    // 3. Live Updates (News / Informasi Terbaru)
    const feed = document.getElementById('liveUpdatesArea');
    if (feed) {
        try {
            const newsData = JSON.parse(localStorage.getItem('SA_NEWS') || '[]');
            if (newsData && newsData.length > 0) {
                feed.innerHTML = newsData.map(n => `
                    <div style="padding: 10px; background: var(--bg-light); border-left: 4px solid var(--warning); margin-bottom: 10px; border-radius: 4px;">
                        <div style="font-weight: 800; color: var(--danger); font-size: 0.9rem;">📢 ${n.title || 'Informasi'}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">${new Date(n.ts).toLocaleString('id-ID')}</div>
                        <div style="font-size: 0.85rem;">${n.body || ''}</div>
                    </div>
                `).join('');
            } else {
                feed.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; margin-top: 20px;">Belum ada informasi terbaru.</div>';
            }
        } catch(e) {
            feed.innerHTML = '';
        }
    }
}

// Fitur Animasi Auto Scroll untuk Tabel
function startAutoScroll() {
    setInterval(() => {
        const wrappers = document.querySelectorAll('.table-wrapper');
        wrappers.forEach(wrap => {
            // Hanya scroll jika konten lebih panjang dari kotaknya
            if (wrap.scrollHeight > wrap.clientHeight) {
                wrap.scrollTop += 1; // Kecepatan scroll (1px)
                
                // Jika sudah mentok sampai bawah, ulangi lagi dari atas
                if (Math.ceil(wrap.scrollTop) + wrap.clientHeight >= wrap.scrollHeight) {
                    wrap.scrollTop = 0;
                }
            }
        });
    }, 50); // 50ms = halus
}

// Mulai scroll otomatis saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    startAutoScroll();
});

window.logoutScan = async function() {
    Swal.fire({
        title: 'Logout?',
        text: 'Anda akan keluar dari mode Scanner.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Logout'
    }).then(async (result) => {
        if (result.isConfirmed) {
            if (window.sb) {
                await window.sb.auth.signOut();
            }
            window.location.replace('login.html?redirect=scan.html');
        }
    });
};

