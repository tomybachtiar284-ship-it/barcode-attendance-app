/* ============================================================================
   REPORT.JS
   Logic for General Report & Analytics.
   Isolated from app.js for safety and performance.
   ========================================================================== */

(function () {
    // Private Scope for Report Logic
    let grCharts = {};

    function renderGeneralReport() {
        console.log('Rendering General Report safely...');

        // Ensure Global Data Exists
        const employees = window.employees || [];
        const attendance = window.attendance || [];
        const shifts = window.shifts || {};

        // 1. Calculate Summary Stats
        const nowTs = Date.now();
        const sevenDaysAgo = nowTs - (7 * 24 * 3600 * 1000);
        const recentAtt = attendance.filter(a => a.ts >= sevenDaysAgo);

        // Total Employees
        const elTotal = document.getElementById('repTotalEmp');
        if (elTotal) elTotal.textContent = employees.length;

        // Avg Late (7 days)
        const lateCount = recentAtt.filter(a => (a.status === 'datang' || a.status === 'late') && a.late).length;
        // Note: Check 'late' boolean flag mainly
        const avgLate = (lateCount / 7).toFixed(1);
        const elLate = document.getElementById('repAvgLate');
        if (elLate) elLate.textContent = avgLate;

        // Avg Presence % (7 days)
        const presentCount = recentAtt.filter(a => a.status === 'datang').length;
        const possiblePresence = (employees.length * 7) || 1;
        const avgPres = ((presentCount / possiblePresence) * 100).toFixed(1);
        const elPres = document.getElementById('repAvgPresent');
        if (elPres) elPres.textContent = avgPres + '%';

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

        // 2. Render Charts (Deferred)
        initGeneralChartsSafe(attendance, shifts);
    }

    function initGeneralChartsSafe(attendance, shifts) {
        // Helper to destroy old charts
        ['chartLateTrend', 'chartInOutFlow', 'chartAttendanceRate', 'chartDivPerformance', 'chartOvertimeTrend', 'chartTopOvertime'].forEach(id => {
            if (grCharts[id]) {
                try { grCharts[id].destroy(); } catch (e) { }
                delete grCharts[id];
            }
        });

        // Use setTimeout to unblock the main thread immediately
        setTimeout(() => {
            try {
                if (!window.Chart) { console.warn('Chart.js not loaded'); return; }

                const now = new Date();

                // --- PREPARE DATA ---

                // 1. Trend Data (14 Days)
                const days14 = [];
                const statsMap = {};
                const oneDay = 24 * 3600 * 1000;

                for (let i = 13; i >= 0; i--) {
                    const d = new Date(); d.setDate(now.getDate() - i);
                    const ymd = d.toISOString().split('T')[0];
                    days14.push(ymd);
                    statsMap[ymd] = { late: 0, ot: 0 };
                }

                const cutoff = now.getTime() - (15 * oneDay); // buffer
                const recentData = attendance.filter(a => a.ts >= cutoff);

                recentData.forEach(a => {
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

                const lateData = days14.map(ymd => statsMap[ymd].late);
                const otTrendData = days14.map(ymd => statsMap[ymd].ot);

                // --- RENDER QUEUE ---
                // We render charts one by one using requestAnimationFrame to keep UI responsive

                const queue = [
                    // Chart 1: Late Trend
                    () => {
                        const ctx = document.getElementById('chartLateTrend')?.getContext('2d');
                        if (ctx) {
                            grCharts['chartLateTrend'] = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: days14.map(d => d.slice(5)),
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
                        const sod = new Date(); sod.setHours(0, 0, 0, 0);
                        const todayAtt = attendance.filter(a => a.ts >= sod.getTime() && a.status === 'datang');
                        const cLate = todayAtt.filter(a => a.late).length;
                        const cOnTime = todayAtt.length - cLate;
                        const cAbsent = Math.max(0, (window.employees?.length || 0) - todayAtt.length);

                        const ctx = document.getElementById('chartAttendanceRate')?.getContext('2d');
                        if (ctx) {
                            grCharts['chartAttendanceRate'] = new Chart(ctx, {
                                type: 'doughnut',
                                data: {
                                    labels: ['Tepat Waktu', 'Terlambat', 'Belum Hadir'],
                                    datasets: [{
                                        data: [cOnTime, cLate, cAbsent],
                                        backgroundColor: ['#22c55e', '#f59e0b', '#e5e7eb']
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
                            // Calc stats per company
                            const compMap = {};
                            const MONTH = 30 * oneDay;
                            const data30 = attendance.filter(a => a.ts >= (Date.now() - MONTH) && a.status === 'datang');

                            data30.forEach(a => {
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
                                        label: '% On-Time (30 Hari)',
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

                            // Last 7 days traffic
                            const data7 = attendance.filter(a => a.ts >= (Date.now() - 7 * oneDay));
                            data7.forEach(a => {
                                const h = new Date(a.ts).getHours();
                                if (h >= 6 && h <= 19) {
                                    if (a.status === 'datang') inData[h - 6]++;
                                }
                            });

                            grCharts['chartInOutFlow'] = new Chart(ctx, {
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [{ label: 'Scan Masuk (7 Hari)', data: inData, backgroundColor: '#10b981' }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, animation: false }
                            });
                        }
                    },
                    // Chart 5: Overtime Trend (Line)
                    () => {
                        const ctx = document.getElementById('chartOvertimeTrend')?.getContext('2d');
                        if (ctx) {
                            grCharts['chartOvertimeTrend'] = new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: days14.map(d => d.slice(5)),
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
                            // Calc Top OT (30 Days)
                            const otMap = {};
                            const MONTH = 30 * oneDay;
                            const data30 = attendance.filter(a => a.ts >= (Date.now() - MONTH) && a.status === 'pulang');

                            data30.forEach(a => {
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
                                            // End time is smaller than start time -> crosses midnight.
                                            // If scan hour < start hour -> it's next day relative to shift start
                                            if (d.getHours() < sh) {
                                                // sEnd is today
                                            } else {
                                                // sEnd is tomorrow (scan is before midnight)
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
        }, 50); // Small 50ms delay
    }

    // Expose to Global
    window.renderGeneralReport = renderGeneralReport;

})();
