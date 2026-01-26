/* ============================================================================
   REPORT.JS
   Logic for General Report & Analytics.
   Isolated from app.js for safety and performance.
   ========================================================================== */

(function () {
    // Private Scope for Report Logic
    let grCharts = {};

    async function renderGeneralReport() {
        console.log('Rendering General Report safely...');

        // Ensure Global Data Exists
        const employees = window.employees || [];
        let attendance = window.attendance || [];
        const shifts = window.shifts || {};

        // --- OPTIMIZATION STEP: ENSURE HISTORY (30 DAYS) ---
        const thirtyDaysAgo = Date.now() - (30 * 24 * 3600 * 1000);

        // Check if we need to fetch history?
        // Simpler check: If we have Supabase connected, and we don't seem to have old data (e.g. min TS > 30 days ago)
        // But since we only load "Today" by default now, we almost certainly need to fetch.
        // We use a flag to avoid re-fetching multiple times in one session if possible?
        // Or just rely on SB cache? Let's fetch if needed.

        if (window.sb) {
            const minTs = attendance.length > 0 ? attendance[0].ts : Date.now();
            if (minTs > thirtyDaysAgo) {
                const btn = document.getElementById('btnRouteGeneral'); // heuristic button
                // console.log('Fetching 30 days history for report...');
                try {
                    // Fetch Attendance
                    const { data: atts } = await window.sb.from('attendance')
                        .select('*')
                        .gte('ts', thirtyDaysAgo); // >= 30 days ago

                    // Fetch Breaks
                    const { data: brks } = await window.sb.from('breaks')
                        .select('*')
                        .gte('ts', thirtyDaysAgo);

                    if (atts || brks) {
                        const newItems = [];
                        if (atts) atts.forEach(x => {
                            newItems.push({
                                ts: new Date(x.ts).getTime(),
                                status: x.status, nid: x.nid, name: x.name,
                                title: x.title, company: x.company, shift: x.shift,
                                note: x.note, late: x.late, okShift: x.ok_shift
                            });
                        });
                        if (brks) brks.forEach(x => {
                            newItems.push({
                                ts: new Date(x.ts).getTime(),
                                status: x.status, nid: x.nid, name: x.name,
                                title: '', company: x.company, shift: '',
                                note: (x.status === 'break_out' ? 'Izin Keluar / Istirahat' : 'Kembali Masuk'),
                                late: false, okShift: true
                            });
                        });

                        // Merge
                        const merged = new Map();
                        window.attendance.forEach(a => merged.set(a.ts, a));
                        newItems.forEach(a => merged.set(a.ts, a));
                        window.attendance = Array.from(merged.values()).sort((a, b) => a.ts - b.ts);
                        attendance = window.attendance; // Update local ref
                    }
                } catch (e) {
                    console.warn('Report history fetch failed:', e);
                }
            }
        }

        // --- READ FILTER INPUTS ---
        const fStart = document.getElementById('repStartDate');
        const fEnd = document.getElementById('repEndDate');
        const fComp = document.getElementById('repCompanyFilter');
        const fShift = document.getElementById('repShiftFilter');

        // Populate Company Dropdown (if empty)
        if (fComp && fComp.options.length <= 1) {
            const comps = new Set(employees.map(e => e.company || 'Unknown').filter(Boolean));
            [...comps].sort().forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                fComp.appendChild(opt);
            });
        }

        // --- FILTER DATA ---
        let filteredAtt = [...attendance];

        // 1. Date Range
        let dStart = fStart?.value ? new Date(fStart.value).getTime() : (Date.now() - 30 * 24 * 3600 * 1000);
        let dEnd = fEnd?.value ? new Date(fEnd.value).getTime() + (24 * 3600 * 1000) : Date.now();

        // Default: If inputs empty, set them to 30 days
        if (fStart && !fStart.value) {
            fStart.valueAsDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
            dStart = new Date(fStart.value).getTime();
        }
        if (fEnd && !fEnd.value) {
            fEnd.valueAsDate = new Date();
            dEnd = new Date(fEnd.value).getTime() + (24 * 3600 * 1000); // end of day
        }

        filteredAtt = filteredAtt.filter(a => a.ts >= dStart && a.ts <= dEnd);

        // 2. Company
        if (fComp && fComp.value) {
            const targetComp = fComp.value;
            filteredAtt = filteredAtt.filter(a => (a.company || 'Unknown') === targetComp);
        }

        // 3. Shift
        if (fShift && fShift.value) {
            const targetShift = fShift.value;
            filteredAtt = filteredAtt.filter(a => {
                let s = a.shift;
                // Try to find shift from employee DB if missing in attendance log
                if (!s) {
                    const emp = employees.find(e => (e.nid == a.nid || e.name == a.name));
                    if (emp) s = emp.shift;
                }
                return (s || '') === targetShift;
            });
        }

        // 1. Calculate Summary Stats (using FILTERED data)
        const recentAtt = filteredAtt;

        // Total Employees (Contextual)
        const elTotal = document.getElementById('repTotalEmp');
        if (elTotal) {
            // If filtered by company/shift, count matching employees
            let countArgs = employees;
            if (fComp && fComp.value) countArgs = countArgs.filter(e => (e.company || 'Unknown') === fComp.value);
            if (fShift && fShift.value) countArgs = countArgs.filter(e => (e.shift || '') === fShift.value);
            elTotal.textContent = countArgs.length;
        }

        // Avg Late (based on filtered range)
        const lateCount = recentAtt.filter(a => (a.status === 'datang' || a.status === 'late') && a.late).length;
        const totalDays = Math.max(1, Math.round((dEnd - dStart) / (24 * 3600 * 1000)));
        const avgLate = (lateCount / totalDays).toFixed(1); // Avg per day
        const elLate = document.getElementById('repAvgLate');
        if (elLate) {
            elLate.parentElement.querySelector('.lbl').textContent = `Avg. Terlambat (${totalDays} Hari)`;
            elLate.textContent = avgLate;
        }

        // Avg Presence %
        const presentCount = recentAtt.filter(a => a.status === 'datang').length;
        let empCountBase = employees.length;
        if (fComp && fComp.value) empCountBase = employees.filter(e => (e.company || 'Unknown') === fComp.value).length;
        if (fShift && fShift.value) empCountBase = employees.filter(e => (e.shift || '') === fShift.value).length;

        const possiblePresence = (empCountBase * totalDays) || 1;
        const avgPres = ((presentCount / possiblePresence) * 100).toFixed(1);
        const elPres = document.getElementById('repAvgPresent');
        if (elPres) {
            elPres.parentElement.querySelector('.lbl').textContent = `Avg. Kehadiran (${totalDays} Hari)`;
            elPres.textContent = avgPres + '%';
        }

        // Top Division
        const compCounts = {};
        recentAtt.filter(a => a.status === 'datang' && !a.late).forEach(a => {
            const c = a.company || 'Unknown';
            compCounts[c] = (compCounts[c] || 0) + 1;
        });

        let topDiv = '-', maxVal = 0;
        for (const [c, val] of Object.entries(compCounts)) {
            if (val > maxVal) { maxVal = val; topDiv = c; }
        }
        const elTop = document.getElementById('repTopDiv');
        if (elTop) elTop.textContent = topDiv;

        // 2. Render Charts (Deferred) -> Pass FILTERED data + Date Context
        initGeneralChartsSafe(filteredAtt, shifts, { start: dStart, end: dEnd });
    }

    function initGeneralChartsSafe(attendance, shifts, dateContext) {
        // Helper to destroy old charts
        ['chartLateTrend', 'chartInOutFlow', 'chartAttendanceRate', 'chartDivPerformance', 'chartOvertimeTrend', 'chartTopOvertime', 'chartTopLate', 'chartLateByDay', 'chartShiftDistribution'].forEach(id => {
            if (grCharts[id]) {
                try { grCharts[id].destroy(); } catch (e) { }
                delete grCharts[id];
            }
        });

        // Use setTimeout to unblock the main thread immediately
        setTimeout(() => {
            try {
                if (!window.Chart) { console.warn('Chart.js not loaded'); return; }

                // --- PREPARE DATA ---
                // If dateContext is provided, use it. Otherwise default to 14 days.
                let dStart, dEnd;
                const oneDay = 24 * 3600 * 1000;

                if (dateContext) {
                    dStart = dateContext.start;
                    dEnd = dateContext.end;
                } else {
                    dEnd = Date.now();
                    dStart = dEnd - (14 * oneDay); // Default 14 days
                }

                // 1. Trend Data (Dynamic Range)
                const daysRange = [];
                const statsMap = {};

                // Create daily buckets from start to end
                let loopD = new Date(dStart);
                const loopEnd = new Date(dEnd);

                // Safety Cap: Max 60 days to prevent chart overload
                let safeCap = 0;
                while (loopD <= loopEnd && safeCap < 60) {
                    const ymd = loopD.toISOString().split('T')[0];
                    daysRange.push(ymd);
                    statsMap[ymd] = { late: 0, ot: 0 };
                    loopD.setDate(loopD.getDate() + 1);
                    safeCap++;
                }

                // Populate buckets
                attendance.forEach(a => {
                    const d = new Date(a.ts);
                    const ymd = d.toISOString().split('T')[0];
                    if (statsMap[ymd]) {
                        if (a.late) statsMap[ymd].late++;

                        // OT Check
                        if (a.status === 'pulang' && a.shift && shifts[a.shift]) {
                            const s = shifts[a.shift];
                            if (s && s.end) {
                                const [h, m] = s.end.split(':').map(Number);
                                const sEnd = new Date(d); sEnd.setHours(h, m, 0, 0);
                                if (s.end < s.start) sEnd.setTime(sEnd.getTime() + oneDay);
                                if (a.ts > sEnd.getTime() + (30 * 60000)) statsMap[ymd].ot++;
                            }
                        }
                    }
                });

                const lateData = daysRange.map(ymd => statsMap[ymd].late);
                const otTrendData = daysRange.map(ymd => statsMap[ymd].ot);

                // --- RENDER QUEUE ---
                // We render charts one by one using requestAnimationFrame to keep UI responsive

                const queue = [
                    // Chart 1: Late Trend
                    () => {
                        const ctx = document.getElementById('chartLateTrend')?.getContext('2d');
                        if (ctx) {
                            // Update title dynamic
                            ctx.canvas.parentElement.previousElementSibling.textContent = `Tren Keterlambatan (${daysRange.length} Hari)`;

                            grCharts['chartLateTrend'] = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: daysRange.map(d => d.slice(5)),
                                    datasets: [{
                                        label: 'Terlambat', data: lateData,
                                        borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        fill: true, tension: 0.3
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } }
                            });
                        }
                    },
                    // Chart 2: Composition
                    () => {
                        // Use filtered valid selection for composition
                        // But composition is typically "Today" or "Aggregate of Selected Range"? 
                        // Let's make it Aggregate of Selected Range

                        const cLate = attendance.filter(a => a.late).length;
                        const cOnTime = attendance.filter(a => a.status === 'datang' && !a.late).length;
                        // Absent logic is tricky for range. Let's stick to "Attendance Rate" based on logs present.

                        const ctx = document.getElementById('chartAttendanceRate')?.getContext('2d');
                        if (ctx) {
                            // Update title
                            ctx.canvas.parentElement.previousElementSibling.textContent = `Komposisi Kehadiran (Rentang Ini)`;

                            grCharts['chartAttendanceRate'] = new Chart(ctx, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Tepat Waktu', 'Terlambat'],
                                    datasets: [{
                                        data: [cOnTime, cLate],
                                        backgroundColor: ['#22c55e', '#f59e0b']
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } } }
                            });
                        }
                    },
                    // Chart 3: Division Performance
                    () => {
                        const ctx = document.getElementById('chartDivPerformance')?.getContext('2d');
                        if (ctx) {
                            // Calc stats per company based on FILTERED attendance
                            const compMap = {};
                            const dataRange = attendance.filter(a => a.status === 'datang'); // already filtered by range/comp

                            dataRange.forEach(a => {
                                const c = a.company || 'Lainnya';
                                if (!compMap[c]) compMap[c] = { tot: 0, on: 0 };
                                compMap[c].tot++;
                                if (!a.late) compMap[c].on++;
                            });

                            const labels = Object.keys(compMap);
                            const vals = labels.map(k => compMap[k].tot ? ((compMap[k].on / compMap[k].tot) * 100).toFixed(0) : 0);

                            grCharts['chartDivPerformance'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: '% On-Time (Rentang Ini)',
                                        data: vals,
                                        backgroundColor: '#3b82f6'
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true, max: 100 } } }
                            });
                        }
                    },
                    // Chart 4: Heatmap / Traffic (Bar)
                    () => {
                        const ctx = document.getElementById('chartInOutFlow')?.getContext('2d');
                        if (ctx) {
                            const hours = Array.from({ length: 14 }, (_, i) => i + 6); // 06:00 - 19:00
                            const labels = hours.map(h => String(h).padStart(2, '0') + ':00');
                            const inData = new Array(14).fill(0);

                            // Traffic based on FILTERED attendance
                            attendance.forEach(a => {
                                const h = new Date(a.ts).getHours();
                                if (h >= 6 && h <= 19) {
                                    if (a.status === 'datang') inData[h - 6]++;
                                }
                            });

                            // Update Title
                            ctx.canvas.parentElement.previousElementSibling.textContent = `Traffic Jam Scan`;

                            grCharts['chartInOutFlow'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [{ label: 'Scan Masuk', data: inData, backgroundColor: '#10b981' }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false }
                            });
                        }
                    },
                    // Chart 5: Overtime Trend (Line)
                    () => {
                        const ctx = document.getElementById('chartOvertimeTrend')?.getContext('2d');
                        if (ctx) {
                            ctx.canvas.parentElement.previousElementSibling.textContent = `Tren Lembur (${daysRange.length} Hari)`;

                            grCharts['chartOvertimeTrend'] = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: daysRange.map(d => d.slice(5)),
                                    datasets: [{
                                        label: 'Jumlah Lembur', data: otTrendData,
                                        borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                        fill: true, tension: 0.3
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false }
                            });
                        }
                    },
                    // Chart 6: Top 5 Overtime (Horizontal Bar)
                    () => {
                        const ctx = document.getElementById('chartTopOvertime')?.getContext('2d');
                        if (ctx) {
                            // Calc Top OT (Filtered by Range)
                            const otMap = {};
                            const dataRange = attendance.filter(a => a.status === 'pulang'); // Already filtered

                            dataRange.forEach(a => {
                                // Check OT
                                if (a.shift && shifts[a.shift]) {
                                    const s = shifts[a.shift];
                                    if (s && s.end) {
                                        const d = new Date(a.ts);
                                        const [h, m] = s.end.split(':').map(Number);
                                        const sEnd = new Date(d); sEnd.setHours(h, m, 0, 0);

                                        // Handle night shift cross-day
                                        const [sh, sm] = s.start.split(':').map(Number);
                                        if ((h * 60 + m) < (sh * 60 + sm)) {
                                            if (d.getHours() < sh) {
                                            } else {
                                                sEnd.setTime(sEnd.getTime() + oneDay);
                                            }
                                        }

                                        // Buffer 30 mins
                                        if (a.ts > sEnd.getTime() + (30 * 60000)) {
                                            const name = a.name || a.nid;
                                            otMap[name] = (otMap[name] || 0) + 1;
                                        }
                                    }
                                }
                            });

                            const sorted = Object.entries(otMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
                            const labels = sorted.map(x => x[0]);
                            const vals = sorted.map(x => x[1]);

                            grCharts['chartTopOvertime'] = new Chart(ctx, {
                                type: 'bar',
                                indexAxis: 'y',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: 'Total Lembur (kali)',
                                        data: vals,
                                        backgroundColor: '#f43f5e'
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                            });
                        }
                    },
                    // Chart 7: Top 5 Late (Horizontal Bar)
                    () => {
                        const ctx = document.getElementById('chartTopLate')?.getContext('2d');
                        if (ctx) {
                            const lateMap = {};
                            // Use FILTERED data directly
                            const dataRange = attendance.filter(a => (a.status === 'datang' || a.status === 'late') && a.late);

                            dataRange.forEach(a => {
                                const name = a.name || a.nid;
                                lateMap[name] = (lateMap[name] || 0) + 1;
                            });

                            const sorted = Object.entries(lateMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
                            const labels = sorted.map(x => x[0]);
                            const vals = sorted.map(x => x[1]);

                            grCharts['chartTopLate'] = new Chart(ctx, {
                                type: 'bar',
                                indexAxis: 'y',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: 'Total Terlambat (kali)',
                                        data: vals,
                                        backgroundColor: '#f97316' // Orange
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                            });
                        }
                    },
                    // Chart 8: Late Trend by Day (Bar)
                    () => {
                        const ctx = document.getElementById('chartLateByDay')?.getContext('2d');
                        if (ctx) {
                            const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                            const dayCounts = new Array(7).fill(0);

                            // Use FILTERED data
                            const dataRange = attendance.filter(a => (a.status === 'datang' || a.status === 'late') && a.late);

                            dataRange.forEach(a => {
                                const d = new Date(a.ts).getDay();
                                dayCounts[d]++;
                            });

                            grCharts['chartLateByDay'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: days,
                                    datasets: [{
                                        label: 'Total Terlambat (Rentang Ini)',
                                        data: dayCounts,
                                        backgroundColor: '#8b5cf6' // Violet
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                            });
                        }
                    },
                ];

                // Execute Queue
                let qIdx = 0;
                function step() {
                    if (qIdx < queue.length) {
                        queue[qIdx]();
                        qIdx++;
                        requestAnimationFrame(step);
                    }
                }
                step();

            } catch (err) {
                console.error("Report Chart Error:", err);
            }
        }, 50); // Small 50ms delay
    }

    // Expose to Global
    window.renderGeneralReport = renderGeneralReport;

})();

