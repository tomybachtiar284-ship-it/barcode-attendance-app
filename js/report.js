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

        const activeEmps = employees.filter(e => e.status !== 'Non-Aktif');
        let filteredEmps = activeEmps;
        if (fComp && fComp.value) filteredEmps = filteredEmps.filter(e => (e.company || 'Unknown') === fComp.value);
        if (fShift && fShift.value) filteredEmps = filteredEmps.filter(e => (e.shift || '') === fShift.value);

        // Total Employees (Contextual)
        const elTotal = document.getElementById('repTotalEmp');
        if (elTotal) {
            elTotal.textContent = filteredEmps.length;
        }

        // Avg Late (based on filtered range)
        const lateCount = recentAtt.filter(a => (a.status === 'datang' || a.status === 'late') && a.late).length;
        const presentCount = recentAtt.filter(a => a.status === 'datang' || a.status === 'late').length;
        const avgLate = presentCount > 0 ? ((lateCount / presentCount) * 100).toFixed(1) : "0.0";
        const elLate = document.getElementById('repAvgLate');
        if (elLate) {
            elLate.textContent = avgLate + '%';
        }

        // Avg Presence %
        const totalDays = Math.max(1, Math.round((dEnd - dStart) / (24 * 3600 * 1000)));
        let empCountBase = filteredEmps.length;

        const possiblePresence = (empCountBase * totalDays) || 1;
        const avgPres = ((presentCount / possiblePresence) * 100).toFixed(1);
        const elPres = document.getElementById('repAvgPresent');
        if (elPres) {
            elPres.textContent = avgPres + '%';
        }

        // Top Division
        const compCounts = {};
        recentAtt.filter(a => (a.status === 'datang' || a.status === 'late') && !a.late).forEach(a => {
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
        ['chartLateTrend', 'chartAttendanceRate', 'chartDivPerformance', 'chartTopLate'].forEach(id => {
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

                let safeCap = 0;
                while (loopD <= loopEnd && safeCap < 60) {
                    const ymd = loopD.toISOString().split('T')[0];
                    daysRange.push(ymd);
                    statsMap[ymd] = { late: 0, onTime: 0 };
                    loopD.setDate(loopD.getDate() + 1);
                    safeCap++;
                }

                // Populate buckets
                attendance.forEach(a => {
                    const d = new Date(a.ts);
                    const ymd = d.toISOString().split('T')[0];
                    if (statsMap[ymd] && (a.status === 'datang' || a.status === 'late')) {
                        if (a.late) {
                            statsMap[ymd].late++;
                        } else {
                            statsMap[ymd].onTime++;
                        }
                    }
                });

                const lateData = daysRange.map(ymd => statsMap[ymd].late);
                const onTimeData = daysRange.map(ymd => statsMap[ymd].onTime);

                // --- RENDER QUEUE ---
                const queue = [
                    // Chart 1: Composition
                    () => {
                        const cLate = attendance.filter(a => (a.status === 'datang' || a.status === 'late') && a.late).length;
                        const cOnTime = attendance.filter(a => (a.status === 'datang' || a.status === 'late') && !a.late).length;

                        const ctx = document.getElementById('chartAttendanceRate')?.getContext('2d');
                        if (ctx) {
                            grCharts['chartAttendanceRate'] = new Chart(ctx, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Tepat Waktu', 'Terlambat'],
                                    datasets: [{
                                        data: [cOnTime, cLate],
                                        backgroundColor: ['#22c55e', '#ef4444'],
                                        borderWidth: 0
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
                            });
                        }
                    },
                    // Chart 2: Combined Trend (Stacked Bar)
                    () => {
                        const ctx = document.getElementById('chartLateTrend')?.getContext('2d');
                        if (ctx) {
                            grCharts['chartLateTrend'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: daysRange.map(d => {
                                        const date = new Date(d);
                                        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                                    }),
                                    datasets: [
                                        {
                                            label: 'Tepat Waktu', data: onTimeData,
                                            backgroundColor: '#22c55e', stack: 'Stack 0'
                                        },
                                        {
                                            label: 'Terlambat', data: lateData,
                                            backgroundColor: '#ef4444', stack: 'Stack 0'
                                        }
                                    ]
                                },
                                options: { 
                                    responsive: true, maintainAspectRatio: false, animation: false, 
                                    plugins: { legend: { position: 'top' } },
                                    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } }
                                }
                            });
                        }
                    },
                    // Chart 3: Division Performance
                    () => {
                        const ctx = document.getElementById('chartDivPerformance')?.getContext('2d');
                        if (ctx) {
                            const compMap = {};
                            const dataRange = attendance.filter(a => a.status === 'datang' || a.status === 'late');

                            dataRange.forEach(a => {
                                const c = a.company || 'Lainnya';
                                if (!compMap[c]) compMap[c] = { tot: 0, on: 0 };
                                compMap[c].tot++;
                                if (!a.late) compMap[c].on++;
                            });

                            // Sort by highest performance
                            const sortedComps = Object.keys(compMap).sort((a, b) => {
                                return (compMap[b].on / compMap[b].tot) - (compMap[a].on / compMap[a].tot);
                            });

                            const labels = sortedComps;
                            const vals = labels.map(k => compMap[k].tot ? ((compMap[k].on / compMap[k].tot) * 100).toFixed(0) : 0);

                            grCharts['chartDivPerformance'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: '% Tepat Waktu',
                                        data: vals,
                                        backgroundColor: '#3b82f6',
                                        borderRadius: 4
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true, max: 100 } } }
                            });
                        }
                    },
                    // Chart 4: Top 10 Late (Horizontal Bar)
                    () => {
                        const ctx = document.getElementById('chartTopLate')?.getContext('2d');
                        if (ctx) {
                            const lateMap = {};
                            const countedDays = new Set();
                            const dataRange = attendance.filter(a => (a.status === 'datang' || a.status === 'late') && a.late);

                            dataRange.forEach(a => {
                                const key = a.nid || a.name;
                                const date = new Date(a.ts);
                                const dateKey = `${key}_${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                                
                                if (!countedDays.has(dateKey)) {
                                    countedDays.add(dateKey);
                                    
                                    if (!lateMap[key]) {
                                        lateMap[key] = { name: a.name || a.nid, searchKey: a.nid || a.name, count: 0 };
                                    }
                                    lateMap[key].count++;
                                }
                            });

                            const sorted = Object.values(lateMap).sort((a, b) => b.count - a.count).slice(0, 10);
                            const labels = sorted.map(x => x.name);
                            const vals = sorted.map(x => x.count);
                            const searchKeys = sorted.map(x => x.searchKey);

                            grCharts['chartTopLate'] = new Chart(ctx, {
                                type: 'bar',
                                indexAxis: 'y',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: 'Total Terlambat (kali)',
                                        data: vals,
                                        backgroundColor: '#dc2626',
                                        borderRadius: 4
                                    }]
                                },
                                options: { 
                                    responsive: true, 
                                    maintainAspectRatio: false, 
                                    animation: false, 
                                    scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                                    onHover: (e, activeEls) => {
                                        if (e.native && e.native.target) {
                                            e.native.target.style.cursor = activeEls && activeEls.length > 0 ? 'pointer' : 'default';
                                        }
                                    },
                                    onClick: (e, activeEls) => {
                                        if (activeEls && activeEls.length > 0) {
                                            const idx = activeEls[0].index;
                                            const searchKey = searchKeys[idx];
                                            if (searchKey) {
                                                const navLink = document.querySelector('.navlink[data-route="employees"]');
                                                if (navLink) navLink.click();
                                                setTimeout(() => {
                                                    const searchBox = document.getElementById('searchEmp');
                                                    if (searchBox) {
                                                        searchBox.value = searchKey;
                                                        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
                                                    }
                                                }, 300);
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
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
        }, 50);
    }

    // Expose to Global
    window.renderGeneralReport = renderGeneralReport;

})();

