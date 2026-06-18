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
        } catch (e) {
            console.warn('Gagal load local data', e);
        }
        
        if (!window.employees) window.employees = [];
        if (!window.attendance) window.attendance = [];
        
        refreshDashboard();
    }
    loadLocalData();

    // 3. Init DB Connection & Sync
    if (typeof window.checkConn === 'function') {
        try {
            const connected = await window.checkConn();
            if (connected) {
                try {
                    // KITA MATIKAN SEMENTARA pullAll() AGAR DATA LOKAL BAPAK TIDAK TERHAPUS OLEH DATABASE YANG KOSONG
                    // await window.pullAll(); 
                    
                    if (typeof window.subscribeToRealtime === 'function') {
                        window.subscribeToRealtime(); // Listen to live changes
                    }
                    refreshDashboard(); // Refresh lagi setelah dapat data baru
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Terkoneksi ke Database',
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
                const nid = scanInput.value.trim();
                if (nid) {
                    scanInput.value = ''; // clear input
                    await processScan(nid);
                }
            }, 300); // Tunggu 300ms setelah karakter terakhir diketik
        });

        // Fallback jika scanner tetap mengirimkan tombol Enter
        scanInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                clearTimeout(scanTimeout); // Cegah double scan
                const nid = scanInput.value.trim();
                if (nid) {
                    scanInput.value = ''; // clear input
                    await processScan(nid);
                }
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
    if (btnManualSubmit) {
        btnManualSubmit.addEventListener('click', async () => {

            const nid = document.getElementById('manualNid').value.trim();
            if(nid) {
                await processScan(nid);
                document.getElementById('manualNid').value = '';
            }
        });
    }
});

// --- CORE LOGIC ---

async function processScan(nid) {
    if (!window.employees || !window.attendance) return;

    // Cari karyawan
    const emp = window.employees.find(e => e.nid === nid || e.nid.toLowerCase() === nid.toLowerCase());
    
    if (!emp) {
        Swal.fire({
            icon: 'error',
            title: 'Tidak Ditemukan',
            text: `Karyawan dengan ID ${nid} tidak terdaftar.`,
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    // Logic Sederhana: Datang / Pulang
    // Cek record terakhir hari ini
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const todayRecords = window.attendance.filter(a => a.nid === emp.nid && a.ts >= today.getTime());
    todayRecords.sort((a,b) => b.ts - a.ts); // Descending

    let status = 'datang';
    let isLate = false;

    // Jika sudah ada record 'datang' hari ini dan belum 'pulang', maka dia 'pulang'
    if (todayRecords.length > 0 && (todayRecords[0].status === 'datang' || todayRecords[0].status === 'break_in')) {
        status = 'pulang';
    }

    // Cek keterlambatan (Dummy logic: Masuk lewat jam 08:00 dianggap telat)
    // Dalam realita gunakan logic 'shifts' yang ada di aplikasi utama
    if (status === 'datang') {
        const nowHr = new Date().getHours();
        const nowMin = new Date().getMinutes();
        if (nowHr >= 8 && nowMin > 0) {
            isLate = true;
        }
    }

    // Buat objek absensi
    const record = {
        ts: Date.now(),
        status: status,
        nid: emp.nid,
        name: emp.name,
        title: emp.title || '-',
        company: emp.company || '-',
        shift: document.getElementById('manualShift')?.value || emp.shift || '-',
        note: '',
        late: isLate,
        okShift: true
    };

    // Tampilkan Overlay Foto & Info
    showOverlay(emp, record);

    // Push ke Database
    if (typeof window.pushAttendance === 'function') {
        try {
            await window.pushAttendance(record);
            // pushAttendance akan memicu Realtime yang kemudian merender ulang UI via data:synced
        } catch (err) {
            console.error('Gagal push absensi', err);
        }
    }
}

function showOverlay(emp, record) {
    const overlay = document.getElementById('employeePhotoOverlay');
    const img = document.getElementById('overlayPhoto');
    const nameEl = document.getElementById('overlayName');
    const statusEl = document.getElementById('overlayStatus');

    img.src = emp.photo || 'assets/dummy-avatar.png';
    nameEl.textContent = emp.name.toUpperCase();
    
    let statusText = (record.status === 'datang' || record.status === 'break_in') ? 'BERHASIL DATANG' : 'BERHASIL PULANG';
    if ((record.status === 'datang' || record.status === 'break_in') && record.late) {
        statusText += " - TERLAMBAT";
        statusEl.style.color = "var(--danger)";
        img.style.borderColor = "var(--danger)";
    } else if (record.status === 'datang' || record.status === 'break_in') {
        statusText += " - TEPAT WAKTU";
        statusEl.style.color = "var(--success)";
        img.style.borderColor = "var(--success)";
    } else {
        statusEl.style.color = "var(--warning)";
        img.style.borderColor = "var(--warning)";
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
            if (r.late) late++;
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
            if (r.status === 'datang' || r.status === 'break_in') { badge = 'masuk'; txt = 'DATANG'; }
            else if (r.status === 'pulang' || r.status === 'break_out') { badge = 'keluar'; txt = 'PULANG'; }
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
            let note = r.late ? '<span class="badge telat">Terlambat</span>' : '-';
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

