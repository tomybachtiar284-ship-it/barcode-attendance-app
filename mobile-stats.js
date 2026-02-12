/**
 * mobile-stats.js — Standalone Mobile Dashboard Stats Renderer
 * This runs independently of app.js to guarantee stats always display.
 * It polls for data availability and updates the UI elements.
 * Also handles click-to-detail for Active On-Site, Terlambat, and Hadir.
 */
(function () {
    'use strict';

    var POLL_INTERVAL = 2000;
    var MAX_POLLS = 30;
    var pollCount = 0;
    var chartInstance = null;

    // Cache last computed data for click handlers
    var _lastActiveNids = [];   // NIDs of active on-site employees
    var _lastLateNids = [];     // NIDs of late employees today
    var _lastOntimeNids = [];   // NIDs of on-time employees today
    var _lastAttMap = {};       // NID -> latest attendance record

    function getAttendance() {
        if (window.attendance && Array.isArray(window.attendance) && window.attendance.length > 0) {
            return window.attendance;
        }
        try {
            var raw = localStorage.getItem('SA_ATTENDANCE');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { }
        return null;
    }

    function getEmployees() {
        if (window.employees && Array.isArray(window.employees) && window.employees.length > 0) {
            return window.employees;
        }
        try {
            var raw = localStorage.getItem('SA_EMPLOYEES');
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) { }
        return null;
    }

    function findEmp(nid) {
        var emps = getEmployees();
        if (!emps) return null;
        for (var i = 0; i < emps.length; i++) {
            if (emps[i].nid === nid) return emps[i];
        }
        return null;
    }

    function formatTime(ts) {
        var d = new Date(ts);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    // ============================================
    //  MODAL SYSTEM
    // ============================================
    var modalEl = null;

    function ensureModal() {
        if (modalEl) return modalEl;

        // Inject CSS
        var style = document.createElement('style');
        style.textContent = [
            '.mob-detail-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9998;opacity:0;pointer-events:none;transition:opacity .25s}',
            '.mob-detail-overlay.show{opacity:1;pointer-events:auto}',
            '.mob-detail-sheet{position:fixed;bottom:0;left:0;right:0;background:#fff;z-index:9999;' +
            'border-radius:20px 20px 0 0;max-height:80vh;display:flex;flex-direction:column;' +
            'transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);box-shadow:0 -4px 24px rgba(0,0,0,0.15)}',
            '.mob-detail-sheet.show{transform:translateY(0)}',
            '.mob-detail-handle{width:40px;height:4px;background:#cbd5e1;border-radius:4px;margin:10px auto 0}',
            '.mob-detail-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 8px;border-bottom:1px solid #f1f5f9}',
            '.mob-detail-header h3{margin:0;font-size:1rem;font-weight:700;color:#0f172a}',
            '.mob-detail-header .badge{font-size:0.75rem;background:#e2e8f0;color:#475569;padding:2px 10px;border-radius:99px;font-weight:600}',
            '.mob-detail-close{background:none;border:none;font-size:1.5rem;color:#94a3b8;cursor:pointer;padding:0 4px;line-height:1}',
            '.mob-detail-list{overflow-y:auto;flex:1;padding:0}',
            '.mob-detail-item{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #f8fafc}',
            '.mob-detail-item:active{background:#f8fafc}',
            '.mob-detail-name{font-weight:600;color:#1e293b;font-size:0.9rem}',
            '.mob-detail-sub{font-size:0.72rem;color:#64748b;margin-top:2px}',
            '.mob-detail-time{text-align:right}',
            '.mob-detail-time .t{font-weight:700;color:#0f172a;font-size:0.85rem}',
            '.mob-detail-time .tag{font-size:0.65rem;padding:2px 6px;border-radius:4px;display:inline-block;margin-top:2px;font-weight:600}',
            '.mob-detail-time .tag.green{background:#dcfce7;color:#16a34a}',
            '.mob-detail-time .tag.red{background:#fee2e2;color:#dc2626}',
            '.mob-detail-time .tag.blue{background:#dbeafe;color:#2563eb}',
            '.mob-detail-empty{text-align:center;padding:40px 20px;color:#94a3b8;font-size:0.9rem}'
        ].join('\n');
        document.head.appendChild(style);

        // Create overlay
        var overlay = document.createElement('div');
        overlay.className = 'mob-detail-overlay';
        overlay.addEventListener('click', closeMobileDetail);
        document.body.appendChild(overlay);

        // Create sheet
        var sheet = document.createElement('div');
        sheet.className = 'mob-detail-sheet';
        sheet.innerHTML = '<div class="mob-detail-handle"></div>' +
            '<div class="mob-detail-header">' +
            '<div><h3 id="mobDetailTitle">Detail</h3><span class="badge" id="mobDetailBadge">0</span></div>' +
            '<button class="mob-detail-close" onclick="window._closeMobileDetail()">&times;</button>' +
            '</div>' +
            '<div class="mob-detail-list" id="mobDetailList"></div>';
        document.body.appendChild(sheet);

        modalEl = { overlay: overlay, sheet: sheet };
        return modalEl;
    }

    function openMobileDetail(title, items, tagClass) {
        var m = ensureModal();
        document.getElementById('mobDetailTitle').textContent = title;
        document.getElementById('mobDetailBadge').textContent = items.length + ' orang';

        var list = document.getElementById('mobDetailList');

        if (items.length === 0) {
            list.innerHTML = '<div class="mob-detail-empty">Tidak ada data saat ini</div>';
        } else {
            var html = '';
            items.forEach(function (item) {
                html += '<div class="mob-detail-item">' +
                    '<div>' +
                    '<div class="mob-detail-name">' + item.name + '</div>' +
                    '<div class="mob-detail-sub">' + item.job + ' • ' + item.company + '</div>' +
                    '</div>' +
                    '<div class="mob-detail-time">' +
                    '<div class="t">' + item.time + '</div>' +
                    '<div class="tag ' + (item.tagClass || tagClass) + '">' + item.tag + '</div>' +
                    '</div>' +
                    '</div>';
            });
            list.innerHTML = html;
        }

        // Animate in
        requestAnimationFrame(function () {
            m.overlay.classList.add('show');
            m.sheet.classList.add('show');
        });
    }

    function closeMobileDetail() {
        if (!modalEl) return;
        modalEl.overlay.classList.remove('show');
        modalEl.sheet.classList.remove('show');
    }
    window._closeMobileDetail = closeMobileDetail;

    // Expose click handlers globally for inline onclick
    window._showActiveDetail = function () { showActiveDetail(); };
    window._showLateDetail = function () { showLateDetail(); };
    window._showOntimeDetail = function () { showOntimeDetail(); };

    // ============================================
    //  CLICK HANDLERS
    // ============================================

    function showActiveDetail() {
        var items = _lastActiveNids.map(function (nid) {
            var emp = findEmp(nid);
            var rec = _lastAttMap[nid];
            return {
                name: emp ? emp.name : (rec ? rec.name : nid),
                job: emp ? (emp.job || '-') : '-',
                company: emp ? (emp.company || '-') : '-',
                time: rec ? formatTime(rec.ts) : '-',
                tag: 'Aktif',
                tagClass: 'blue'
            };
        });
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
        openMobileDetail('Personil Aktif di Lokasi', items, 'blue');
    }

    function showLateDetail() {
        var att = getAttendance();
        if (!att) return;
        var sod = new Date(); sod.setHours(0, 0, 0, 0);
        var sodMs = sod.getTime();

        var items = _lastLateNids.map(function (nid) {
            var emp = findEmp(nid);
            // Find earliest 'datang' record today for this person
            var rec = null;
            for (var i = 0; i < att.length; i++) {
                if (att[i].nid === nid && att[i].ts >= sodMs && att[i].status === 'datang') {
                    if (!rec || att[i].ts < rec.ts) rec = att[i];
                }
            }
            return {
                name: emp ? emp.name : (rec ? rec.name : nid),
                job: emp ? (emp.job || '-') : '-',
                company: emp ? (emp.company || '-') : '-',
                time: rec ? formatTime(rec.ts) : '-',
                tag: 'Terlambat',
                tagClass: 'red'
            };
        });
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
        openMobileDetail('Karyawan Terlambat Hari Ini', items, 'red');
    }

    function showOntimeDetail() {
        var att = getAttendance();
        if (!att) return;
        var sod = new Date(); sod.setHours(0, 0, 0, 0);
        var sodMs = sod.getTime();

        var items = _lastOntimeNids.map(function (nid) {
            var emp = findEmp(nid);
            var rec = null;
            for (var i = 0; i < att.length; i++) {
                if (att[i].nid === nid && att[i].ts >= sodMs && att[i].status === 'datang') {
                    if (!rec || att[i].ts < rec.ts) rec = att[i];
                }
            }
            return {
                name: emp ? emp.name : (rec ? rec.name : nid),
                job: emp ? (emp.job || '-') : '-',
                company: emp ? (emp.company || '-') : '-',
                time: rec ? formatTime(rec.ts) : '-',
                tag: 'Tepat Waktu',
                tagClass: 'green'
            };
        });
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
        openMobileDetail('Karyawan Hadir Tepat Waktu', items, 'green');
    }

    // Expose for inline onclick (company cards)
    window.showMobileCompanyDetail = function (compName) {
        var items = _lastActiveNids.filter(function (nid) {
            var emp = findEmp(nid);
            if (!emp) return false;
            return (emp.company || 'Lainnya') === compName;
        }).map(function (nid) {
            var emp = findEmp(nid);
            var rec = _lastAttMap[nid];
            return {
                name: emp ? emp.name : nid,
                job: emp ? (emp.job || '-') : '-',
                company: emp ? (emp.company || '-') : '-',
                time: rec ? formatTime(rec.ts) : '-',
                tag: 'Aktif',
                tagClass: 'blue'
            };
        });
        items.sort(function (a, b) { return a.name.localeCompare(b.name); });
        openMobileDetail('Aktif: ' + compName, items, 'blue');
    };

    // ============================================
    //  BIND CLICK EVENTS (Event Delegation — survives DOM re-renders)
    // ============================================
    function bindClickHandlers() {
        // Inject clickable styles
        var clickStyle = document.createElement('style');
        clickStyle.textContent = [
            '.mob-hero-card{cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0.05)}',
            '.mob-stat-row{cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0.05);border-radius:8px;transition:background .15s}',
            '.mob-stat-row:active{background:rgba(0,0,0,0.04)}',
            '.mob-hero-card:active{opacity:0.9}'
        ].join('\n');
        document.head.appendChild(clickStyle);

        // Single delegated listener on document body
        document.body.addEventListener('click', function (e) {
            // Check: Hero Card (Active On-Site)
            var heroCard = e.target.closest('.mob-hero-card');
            if (heroCard) {
                e.stopPropagation();
                showActiveDetail();
                return;
            }

            // Check: Stat Row (Terlambat or Hadir)
            var statRow = e.target.closest('.mob-stat-row');
            if (statRow) {
                e.stopPropagation();
                // Determine which stat row by checking sibling ID or icon
                var lateEl = statRow.querySelector('#mobStatLate_v2') || statRow.querySelector('#mobStatLateNew');
                var ontimeEl = statRow.querySelector('#mobStatOntime_v2') || statRow.querySelector('#mobStatOntimeNew');
                if (lateEl) {
                    showLateDetail();
                } else if (ontimeEl) {
                    showOntimeDetail();
                } else {
                    // Fallback: check icon text
                    var icon = statRow.querySelector('.mob-stat-icon');
                    if (icon && icon.textContent.trim() === '⏰') {
                        showLateDetail();
                    } else {
                        showOntimeDetail();
                    }
                }
                return;
            }
        });
    }
    // ============================================
    //  RENDER STATS (same as before + caching)
    // ============================================
    function renderStats() {
        var att = getAttendance();
        var emps = getEmployees();
        pollCount++;

        if (!att) {
            if (pollCount < MAX_POLLS) {
                setTimeout(renderStats, POLL_INTERVAL);
            }
            return;
        }

        // === 1. ACTIVE ON-SITE ===
        var now = Date.now();
        var rollingStart = now - (24 * 60 * 60 * 1000);
        var activeMap = {};
        var activeRecMap = {};

        att.filter(function (a) { return a.ts >= rollingStart; })
            .sort(function (a, b) { return a.ts - b.ts; })
            .forEach(function (r) { activeMap[r.nid] = r.status; activeRecMap[r.nid] = r; });

        var activeCount = 0;
        var activeNids = [];
        Object.keys(activeMap).forEach(function (nid) {
            if (activeMap[nid] === 'datang' || activeMap[nid] === 'break_in') {
                activeCount++;
                activeNids.push(nid);
            }
        });

        // Cache for click handlers
        _lastActiveNids = activeNids;
        _lastAttMap = activeRecMap;

        var heroEl = document.getElementById('heroActiveCount_v2') || document.getElementById('heroActiveCount');
        if (heroEl) heroEl.textContent = activeCount;

        // === 2. DAILY STATS ===
        var sod = new Date(); sod.setHours(0, 0, 0, 0);
        var sodMs = sod.getTime();

        var todayDatang = att.filter(function (a) {
            return a.ts >= sodMs && a.status === 'datang';
        });

        var cntLate = 0, cntOntime = 0;
        var seen = {};
        var lateNids = [], ontimeNids = [];

        todayDatang.sort(function (a, b) { return b.ts - a.ts; });
        todayDatang.forEach(function (r) {
            if (!seen[r.nid]) {
                seen[r.nid] = true;
                if (r.late) { cntLate++; lateNids.push(r.nid); }
                else { cntOntime++; ontimeNids.push(r.nid); }
            }
        });

        // Cache for click handlers
        _lastLateNids = lateNids;
        _lastOntimeNids = ontimeNids;

        var total = cntLate + cntOntime;
        var rate = total ? Math.round((cntOntime / total) * 100) : 0;

        var elLate = document.getElementById('mobStatLate_v2') || document.getElementById('mobStatLateNew');
        var elOntime = document.getElementById('mobStatOntime_v2') || document.getElementById('mobStatOntimeNew');
        var elPct = document.getElementById('mobChartPercent_v2') || document.getElementById('mobChartPercent');
        var elTot = document.getElementById('mobChartTotal_v2') || document.getElementById('mobChartTotal');
        var elCanvas = document.getElementById('mobDailyChart_v2') || document.getElementById('mobDailyChart');

        if (elLate) elLate.textContent = cntLate;
        if (elOntime) elOntime.textContent = cntOntime;
        if (elPct) elPct.textContent = rate + '%';
        if (elTot) elTot.textContent = total;

        // === 3. CHART ===
        if (elCanvas && window.Chart) {
            try {
                if (chartInstance) {
                    chartInstance.data.datasets[0].data = [cntOntime, cntLate];
                    chartInstance.update();
                } else {
                    chartInstance = new Chart(elCanvas, {
                        type: 'doughnut',
                        data: {
                            labels: ['Hadir (Ontime)', 'Terlambat'],
                            datasets: [{
                                data: [cntOntime, cntLate],
                                backgroundColor: ['#22c55e', '#ef4444'],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            cutout: '75%',
                            plugins: { legend: { display: false }, tooltip: { enabled: false } },
                            maintainAspectRatio: false,
                            animation: { duration: 600 }
                        }
                    });
                }
            } catch (e) {
                console.warn('[mobile-stats] Chart error:', e);
            }
        }

        // === 4. COMPANY PRESENCE GRID ===
        var grid = document.getElementById('companyPresenceGridMobile');
        if (grid && emps) {
            var companyCounts = {};
            Object.keys(activeMap).forEach(function (nid) {
                if (activeMap[nid] === 'datang' || activeMap[nid] === 'break_in') {
                    var emp = null;
                    for (var i = 0; i < emps.length; i++) {
                        if (emps[i].nid === nid) { emp = emps[i]; break; }
                    }
                    if (emp) {
                        var comp = emp.company || 'Lainnya';
                        companyCounts[comp] = (companyCounts[comp] || 0) + 1;
                    }
                }
            });

            var companies = Object.keys(companyCounts).sort();
            var html = '';
            companies.forEach(function (comp) {
                html += '<div class="mob-comp-card" onclick="window.showMobileCompanyDetail(\'' + comp.replace(/'/g, "\\'") + '\')" ' +
                    'style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;">' +
                    '<div style="font-size:0.75rem;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;">' + comp + '</div>' +
                    '<div style="font-size:0.8rem;font-weight:700;padding:2px 8px;border-radius:99px;min-width:24px;text-align:center;background:#dbeafe;color:#2563eb;">' + companyCounts[comp] + '</div>' +
                    '</div>';
            });

            if (companies.length === 0) {
                html = '<div style="grid-column:1/-1;text-align:center;opacity:0.6;font-size:0.8rem;padding:10px;">Belum ada data</div>';
            }

            grid.innerHTML = html;
        }

        // === 5. OVERTIME PANEL ===
        renderOvertime(att, emps);

        // === 6. SHIFT INFO BADGE ===
        renderShiftInfo();

        // Keep updating
        setTimeout(renderStats, 10000);
    }

    // ============================================
    //  OVERTIME LOGIC
    // ============================================
    var _lastOvertimeList = [];
    var OT_THRESHOLD_MS = 1 * 60 * 1000; // 1 minute threshold

    function getShifts() {
        if (window.shifts) return window.shifts;
        try {
            var raw = localStorage.getItem('SA_SHIFTS');
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return null;
    }

    function parseTodayHM(hm) {
        var parts = hm.split(':');
        var d = new Date();
        d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        return d;
    }

    function renderOvertime(att, emps) {
        var panel = document.getElementById('mobOvertimePanel');
        var countEl = document.getElementById('mobOvertimeCount');
        if (!panel) return;

        var shifts = getShifts();
        if (!shifts || !shifts.DAYTIME || !emps || !att) {
            panel.style.display = 'none';
            return;
        }

        var now = new Date();
        var sod = new Date(); sod.setHours(0, 0, 0, 0);
        var sodMs = sod.getTime();
        var shiftEnd = parseTodayHM(shifts.DAYTIME.end);
        var shiftStart = parseTodayHM(shifts.DAYTIME.start);
        if (shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

        var todayAtt = att.filter(function (a) { return a.ts >= sodMs; });
        var results = [];

        emps.forEach(function (emp) {
            // Only Daytime employees
            var isDaytime = (emp.shift === 'DAYTIME') ||
                (emp.shift && emp.shift.toLowerCase().indexOf('day') >= 0);

            // Check effectiveShiftFor if available
            if (window.effectiveShiftFor) {
                var eff = window.effectiveShiftFor(emp, now);
                if (eff && eff !== 'OFF' && eff !== 'DAYTIME') isDaytime = false;
                if ((!eff || eff === 'OFF') && isDaytime) { /* keep */ }
            }

            if (!isDaytime) return;

            // Find 'datang' record today
            var came = null;
            for (var i = 0; i < todayAtt.length; i++) {
                if (todayAtt[i].nid === emp.nid && todayAtt[i].status === 'datang') {
                    came = todayAtt[i]; break;
                }
            }
            if (!came) return;

            // Find 'pulang' after 'datang'
            var left = null;
            for (var j = 0; j < todayAtt.length; j++) {
                if (todayAtt[j].nid === emp.nid && todayAtt[j].status === 'pulang' && todayAtt[j].ts > came.ts) {
                    left = todayAtt[j]; break;
                }
            }

            var otMs = 0;
            var isLive = !left;

            if (isLive) {
                if (now.getTime() > shiftEnd.getTime()) {
                    otMs = now.getTime() - shiftEnd.getTime();
                }
            } else {
                if (left.ts > shiftEnd.getTime()) {
                    otMs = left.ts - shiftEnd.getTime();
                }
            }

            if (otMs > OT_THRESHOLD_MS) {
                var h = Math.floor(otMs / 3600000);
                var m = Math.floor((otMs % 3600000) / 60000);
                results.push({
                    nid: emp.nid,
                    name: emp.name,
                    job: emp.job || '-',
                    company: emp.company || '-',
                    isLive: isLive,
                    duration: h + 'j ' + m + 'm',
                    durationMs: otMs,
                    shiftEnd: shifts.DAYTIME.end,
                    time: came ? formatTime(came.ts) : '-',
                    outTime: left ? formatTime(left.ts) : '-'
                });
            }
        });

        results.sort(function (a, b) { return b.durationMs - a.durationMs; });
        _lastOvertimeList = results;

        if (results.length > 0) {
            panel.style.display = 'block';
            if (countEl) countEl.textContent = results.length;
        } else {
            panel.style.display = 'none';
        }
    }

    function showOvertimeDetail() {
        if (_lastOvertimeList.length === 0) return;

        var items = _lastOvertimeList.map(function (ot) {
            return {
                name: ot.name,
                job: ot.job,
                company: ot.company,
                time: ot.isLive ? 'Masuk: ' + ot.time : 'Pulang: ' + ot.outTime,
                tag: (ot.isLive ? '🔴 ' : '✅ ') + ot.duration,
                tagClass: ot.isLive ? 'red' : 'green'
            };
        });
        openMobileDetail('Karyawan Lembur (Daytime)', items, 'red');
    }
    window._showOvertimeDetail = showOvertimeDetail;

    // ============================================
    //  ACTIVE SHIFT INFO
    // ============================================
    var SHIFT_LABELS = { P: 'Pagi', S: 'Sore', M: 'Malam', DAYTIME: 'Daytime' };
    var GROUP_KEYS = ['A', 'B', 'C', 'D', 'DAYTIME'];

    function getSchedule() {
        try {
            var raw = localStorage.getItem('SA_SHIFT_MONTHLY');
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return null;
    }

    function minutesNow() {
        var d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    }

    function isInTimeWindow(currentMin, startMin, endMin) {
        if (startMin <= endMin) {
            return currentMin >= startMin && currentMin < endMin;
        } else {
            // Cross midnight (e.g. 23:30 - 07:30)
            return currentMin >= startMin || currentMin < endMin;
        }
    }

    function getActiveShifts() {
        var shifts = getShifts();
        if (!shifts) return [];

        var m = minutesNow();
        var shiftCodes = ['P', 'S', 'M', 'DAYTIME'];
        var active = [];

        shiftCodes.forEach(function (code) {
            var s = shifts[code];
            if (!s || !s.start || !s.end) return;
            var parts1 = s.start.split(':').map(Number);
            var parts2 = s.end.split(':').map(Number);
            var startMin = parts1[0] * 60 + parts1[1];
            var endMin = parts2[0] * 60 + parts2[1];

            if (isInTimeWindow(m, startMin, endMin)) {
                // Find groups scheduled for this shift today
                var groups = [];

                // Try using app.js's effectiveShiftFor
                if (window.effectiveShiftFor) {
                    GROUP_KEYS.forEach(function (g) {
                        if (g === 'DAYTIME') return; // DAYTIME handled separately
                        var eff = window.effectiveShiftFor({ shift: g }, new Date());
                        if (eff === code) groups.push(g);
                    });
                    // DAYTIME-specific check
                    if (code === 'DAYTIME') {
                        var eff2 = window.effectiveShiftFor({ shift: 'DAYTIME' }, new Date());
                        if (eff2 === 'DAYTIME') groups.push('DAY');
                    }
                } else {
                    // Fallback: read from monthly schedule
                    var sched = getSchedule();
                    var today = new Date();
                    var monthKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
                    var dayNum = String(today.getDate());

                    if (sched && sched[monthKey]) {
                        var monthData = sched[monthKey];
                        ['A', 'B', 'C', 'D'].forEach(function (g) {
                            if (monthData[g] && monthData[g][dayNum] === code) {
                                groups.push(g);
                            }
                        });
                    }
                    if (code === 'DAYTIME') groups.push('DAY');
                }

                active.push({
                    code: code,
                    label: SHIFT_LABELS[code] || code,
                    time: s.start + '–' + s.end,
                    groups: groups
                });
            }
        });

        return active;
    }

    function renderShiftInfo() {
        var codeEl = document.getElementById('mobShiftCode');
        var groupEl = document.getElementById('mobShiftGroup');
        if (!codeEl || !groupEl) return;

        var active = getActiveShifts();

        if (active.length === 0) {
            codeEl.textContent = 'OFF';
            groupEl.textContent = 'Tidak ada shift';
            return;
        }

        // Show first active shift (most common: only 1 shift active)
        var main = active[0];
        codeEl.textContent = main.label;
        var groupStr = main.groups.length > 0 ? 'Grup ' + main.groups.join(', ') : '';
        if (active.length > 1) {
            groupStr += ' +' + (active.length - 1);
        }
        groupEl.textContent = groupStr || main.time;
    }

    function showShiftDetail() {
        var active = getActiveShifts();
        if (active.length === 0) {
            openMobileDetail('Shift Aktif Saat Ini', [{
                name: 'Tidak ada shift berjalan',
                job: '-',
                company: '-',
                time: '-',
                tag: 'OFF',
                tagClass: 'blue'
            }], 'blue');
            return;
        }

        var items = [];
        active.forEach(function (s) {
            var groupStr = s.groups.length > 0 ? 'Grup ' + s.groups.join(', ') : 'Tidak ada grup';
            items.push({
                name: 'Shift ' + s.label + ' (' + s.code + ')',
                job: groupStr,
                company: 'Jam: ' + s.time,
                time: s.code,
                tag: '🟢 Aktif',
                tagClass: 'green'
            });
        });

        // Also show inactive shifts
        var shifts = getShifts();
        if (shifts) {
            ['P', 'S', 'M', 'DAYTIME'].forEach(function (code) {
                var s = shifts[code];
                if (!s) return;
                var isActive = active.some(function (a) { return a.code === code; });
                if (!isActive) {
                    items.push({
                        name: 'Shift ' + (SHIFT_LABELS[code] || code),
                        job: 'Jam: ' + s.start + '–' + s.end,
                        company: '-',
                        time: code,
                        tag: 'Tidak aktif',
                        tagClass: 'red'
                    });
                }
            });
        }

        openMobileDetail('Info Shift Hari Ini', items, 'green');
    }
    window._showShiftDetail = showShiftDetail;

    // ============================================
    //  INIT
    // ============================================
    function init() {
        setTimeout(function () {
            renderStats();
            bindClickHandlers();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
