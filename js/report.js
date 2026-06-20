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
                                ts: Number(x.ts),
                                status: x.status, nid: x.nid, name: x.name,
                                title: x.title, company: x.company, shift: x.shift,
                                note: x.note, late: x.late, okShift: x.ok_shift
                            });
                        });
                        if (brks) brks.forEach(x => {
                            newItems.push({
                                ts: Number(x.ts),
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

    // ============================================================================
    // INDIVIDUAL MONTHLY REPORT & PERFORMANCE GRAPH
    // ============================================================================
    
    let autocompleteListInitialized = false;

    window.switchReportTab = function(tabName) {
        const btns = document.querySelectorAll('.report-tab-btn');
        btns.forEach(btn => {
            if (btn.getAttribute('onclick').includes(tabName)) {
                btn.classList.add('active');
                btn.style.color = 'var(--primary)';
                btn.style.borderBottom = '3px solid var(--primary)';
            } else {
                btn.classList.remove('active');
                btn.style.color = 'var(--muted)';
                btn.style.borderBottom = '3px solid transparent';
            }
        });

        const generalTab = document.getElementById('tab-general-report');
        const individualTab = document.getElementById('tab-individual-report');

        if (tabName === 'general') {
            if (generalTab) generalTab.classList.remove('hidden');
            if (individualTab) individualTab.classList.add('hidden');
            renderGeneralReport(); 
        } else if (tabName === 'individual') {
            if (generalTab) generalTab.classList.add('hidden');
            if (individualTab) individualTab.classList.remove('hidden');
            
            // Set default month & year if not already selected
            const mSelect = document.getElementById('indivMonthSelect');
            const ySelect = document.getElementById('indivYearSelect');
            const now = new Date();
            if (mSelect && !mSelect.value) {
                mSelect.value = now.getMonth() + 1;
            }
            if (ySelect && !ySelect.value) {
                ySelect.value = now.getFullYear();
            }

            initIndividualAutocomplete();
        }
    };

    function initIndividualAutocomplete() {
        const input = document.getElementById('indivSearchInput');
        const dropdown = document.getElementById('indivAutocompleteList');
        if (!input || !dropdown) return;

        if (autocompleteListInitialized) return; 
        autocompleteListInitialized = true;

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        input.addEventListener('focus', () => {
            showAutocompleteResults(input.value);
        });

        input.addEventListener('input', () => {
            showAutocompleteResults(input.value);
        });
    }

    function showAutocompleteResults(query) {
        const dropdown = document.getElementById('indivAutocompleteList');
        const employees = window.employees || [];
        if (!dropdown) return;

        const q = query.trim().toLowerCase();
        
        const matched = employees.filter(emp => {
            const name = (emp.name || '').toLowerCase();
            const nid = (emp.nid || '').toLowerCase();
            return name.includes(q) || nid.includes(q);
        }).slice(0, 10); 

        if (matched.length === 0) {
            dropdown.style.display = 'none';
            return;
        }

        dropdown.innerHTML = matched.map(emp => `
            <div class="autocomplete-item" data-nid="${emp.nid}" data-name="${emp.name}">
                <strong>${emp.name}</strong> <span style="color:var(--muted); font-size:0.8rem;">(${emp.nid}) - ${emp.company || ''}</span>
            </div>
        `).join('');

        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => {
                const nid = item.dataset.nid;
                const name = item.dataset.name;
                const input = document.getElementById('indivSearchInput');
                input.value = `${name} (${nid})`;
                input.dataset.selectedNid = nid;
                dropdown.style.display = 'none';
                renderIndividualReport();
            });
        });
    }

    window.renderIndividualReport = async function() {
        const input = document.getElementById('indivSearchInput');
        if (!input) return;

        let selectedNid = input.dataset.selectedNid;
        if (!selectedNid && input.value.trim()) {
            const rawVal = input.value.trim();
            const matchParentheses = rawVal.match(/\(([^)]+)\)/);
            if (matchParentheses) {
                selectedNid = matchParentheses[1];
            } else {
                selectedNid = rawVal;
            }
        }

        if (!selectedNid) {
            alert('Silakan pilih karyawan terlebih dahulu dari daftar autocomplete.');
            return;
        }

        const employees = window.employees || [];
        const employee = employees.find(e => e.nid === selectedNid);
        if (!employee) {
            alert('Karyawan dengan NID tersebut tidak ditemukan.');
            return;
        }

        const month = parseInt(document.getElementById('indivMonthSelect').value) || (new Date().getMonth() + 1);
        const year = parseInt(document.getElementById('indivYearSelect').value) || new Date().getFullYear();

        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);
        const startMs = startOfMonth.getTime();
        const endMs = endOfMonth.getTime();

        if (window.sb) {
            try {
                const { data: atts } = await window.sb.from('attendance')
                    .select('*')
                    .eq('nid', selectedNid)
                    .gte('ts', startMs)
                    .lte('ts', endMs);

                const { data: brks } = await window.sb.from('breaks')
                    .select('*')
                    .eq('nid', selectedNid)
                    .gte('ts', startMs)
                    .lte('ts', endMs);

                const attList = window.attendance || [];
                if (atts) {
                    atts.forEach(x => {
                        const ts = Number(x.ts);
                        if (!attList.some(a => a.ts === ts && a.nid === x.nid)) {
                            attList.push({
                                ts, status: x.status, nid: x.nid, name: x.name,
                                title: x.title, company: x.company, shift: x.shift,
                                late: x.late, note: x.note, device: x.device,
                                isGhost: false
                            });
                        }
                    });
                }
                const brkList = window.breaks || [];
                if (brks) {
                    brks.forEach(x => {
                        const ts = Number(x.ts);
                        if (!brkList.some(b => b.ts === ts && b.nid === x.nid)) {
                            brkList.push({
                                ts, nid: x.nid, name: x.name, status: x.status
                            });
                        }
                    });
                }
                window.attendance = attList;
                window.breaks = brkList;
            } catch (err) {
                console.error("Error fetching individual history:", err);
            }
        }

        const allAtt = window.attendance || [];
        const personalAtt = allAtt.filter(a => a.nid === selectedNid && a.ts >= startMs && a.ts <= endMs);

        const numDays = new Date(year, month, 0).getDate(); 
        const calendarGrid = document.getElementById('indivCalendarGrid');
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';

        const monthNames = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        document.getElementById('indivCalendarTitle').textContent = `${monthNames[month - 1]} ${year}`;

        let startDayOfWeek = startOfMonth.getDay();
        if (startDayOfWeek === 0) startDayOfWeek = 7; 
        const paddingDays = startDayOfWeek - 1; 

        for (let i = 0; i < paddingDays; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-box empty';
            emptyCell.style.opacity = '0';
            emptyCell.style.pointerEvents = 'none';
            calendarGrid.appendChild(emptyCell);
        }

        let daysPresent = 0;
        let daysLate = 0;
        let daysAbsent = 0;
        let totalOvertimeHours = 0;
        let daysOff = 0;

        const dateStatusArray = []; 

        for (let day = 1; day <= numDays; day++) {
            const currentDate = new Date(year, month - 1, day);
            const currentMsStart = currentDate.getTime();
            const currentMsEnd = currentMsStart + (24 * 3600 * 1000) - 1;

            let shiftCode = 'OFF';
            if (window.effectiveShiftFor) {
                shiftCode = window.effectiveShiftFor(employee, currentDate);
            } else {
                shiftCode = employee.shift || 'OFF';
            }

            const todayLogs = personalAtt.filter(a => a.ts >= currentMsStart && a.ts <= currentMsEnd);
            const inLog = todayLogs.find(a => a.status === 'datang' || a.status === 'late');
            const outLog = todayLogs.find(a => a.status === 'pulang');

            let statusClass = '';
            let statusText = '';
            let statusIcon = '';
            let tooltipContent = `Tanggal: ${day} ${monthNames[month - 1]} ${year}\nShift: ${shiftCode}\n`;

            if (shiftCode === 'OFF') {
                daysOff++;
                statusClass = 'info';
                statusIcon = '💤';
                statusText = 'OFF';
                tooltipContent += `Status: Hari Libur (OFF)`;
                dateStatusArray.push('OFF');
            } else {
                if (inLog) {
                    daysPresent++;
                    tooltipContent += `Masuk: ${new Date(inLog.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}\n`;
                    if (outLog) {
                        tooltipContent += `Pulang: ${new Date(outLog.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}\n`;
                    } else {
                        tooltipContent += `Pulang: - (Lupa Tap)\n`;
                    }

                    if (inLog.late) {
                        daysLate++;
                        statusClass = 'warning';
                        statusIcon = '⚠️';
                        statusText = 'Terlambat';
                        tooltipContent += `Status: Terlambat`;
                        dateStatusArray.push('Terlambat');
                    } else {
                        statusClass = 'success';
                        statusIcon = '✅';
                        statusText = 'Tepat Waktu';
                        tooltipContent += `Status: Tepat Waktu`;
                        dateStatusArray.push('Tepat Waktu');
                    }
                } else {
                    if (currentMsEnd > Date.now()) {
                        statusClass = '';
                        statusIcon = '';
                        statusText = 'Mendatang';
                        tooltipContent += `Status: Belum Terjadi`;
                        dateStatusArray.push('Future');
                    } else {
                        daysAbsent++;
                        statusClass = 'danger';
                        statusIcon = '❌';
                        statusText = 'Mangkir / Alpha';
                        tooltipContent += `Status: Mangkir (Alpha / Tanpa Keterangan)`;
                        dateStatusArray.push('Mangkir');
                    }
                }
            }

            let isOvertime = false;
            let otHours = 0;
            if (outLog && shiftCode !== 'OFF') {
                const shiftDetail = (window.shifts || {})[shiftCode];
                if (shiftDetail && shiftDetail.end) {
                    const [shH, shM] = shiftDetail.end.split(':').map(Number);
                    const shiftEndToday = new Date(year, month - 1, day, shH, shM, 0);
                    const actualOutTime = new Date(outLog.ts);
                    if (actualOutTime.getTime() > shiftEndToday.getTime() + (30 * 60000)) { 
                        isOvertime = true;
                        otHours = (actualOutTime.getTime() - shiftEndToday.getTime()) / (3600000); 
                        otHours = Math.round(otHours * 10) / 10; 
                        totalOvertimeHours += otHours;
                        tooltipContent += `\nLembur: ${otHours} Jam`;
                    }
                }
            }

            const dayBox = document.createElement('div');
            dayBox.className = `day-box ${statusClass}`;
            dayBox.setAttribute('data-tooltip', tooltipContent);
            
            const dayNumEl = document.createElement('div');
            dayNumEl.className = 'day-num';
            dayNumEl.textContent = day;
            dayBox.appendChild(dayNumEl);

            if (statusIcon) {
                const statusEl = document.createElement('div');
                statusEl.className = 'day-status-icon';
                statusEl.textContent = isOvertime ? '⚡' : statusIcon;
                dayBox.appendChild(statusEl);
            }

            calendarGrid.appendChild(dayBox);
        }

        const totalScheduledDays = numDays - daysOff;
        const presentRate = totalScheduledDays > 0 ? Math.round((daysPresent / totalScheduledDays) * 100) : 0;
        
        document.getElementById('indivTotalPresent').textContent = `${presentRate}%`;
        document.getElementById('indivTotalLate').textContent = `${daysLate} Kali`;
        document.getElementById('indivTotalOT').textContent = `${totalOvertimeHours} Jam`;
        document.getElementById('indivTotalAbsent').textContent = `${daysAbsent} Hari`;

        initIndividualCharts(dateStatusArray, personalAtt, startMs, endMs);
    };

    function initIndividualCharts(statusArray, personalAtt, startMs, endMs) {
        ['chartIndivComposition', 'chartIndivTimeTrend'].forEach(id => {
            if (grCharts[id]) {
                try { grCharts[id].destroy(); } catch (e) { }
                delete grCharts[id];
            }
        });

        const cOnTime = statusArray.filter(s => s === 'Tepat Waktu').length;
        const cLate = statusArray.filter(s => s === 'Terlambat').length;
        const cAbsent = statusArray.filter(s => s === 'Mangkir').length;
        const cOff = statusArray.filter(s => s === 'OFF').length;

        const ctxDonut = document.getElementById('chartIndivComposition')?.getContext('2d');
        if (ctxDonut) {
            grCharts['chartIndivComposition'] = new Chart(ctxDonut, {
                type: 'doughnut',
                data: {
                    labels: ['Tepat Waktu', 'Terlambat', 'Mangkir', 'Libur (OFF)'],
                    datasets: [{
                        data: [cOnTime, cLate, cAbsent, cOff],
                        backgroundColor: ['#def7ec', '#fef08a', '#fee2e2', '#e0f2fe'],
                        borderColor: ['#bcf0da', '#fde047', '#fca5a5', '#bae6fd'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 12,
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }

        const daysWithLogs = [];
        const arrivalTimes = [];

        const incomingLogs = personalAtt
            .filter(a => a.status === 'datang' || a.status === 'late')
            .sort((a, b) => a.ts - b.ts);

        incomingLogs.forEach(log => {
            const date = new Date(log.ts);
            const label = `${date.getDate()}/${date.getMonth() + 1}`;
            daysWithLogs.push(label);

            const hours = date.getHours();
            const minutes = date.getMinutes();
            const fractionalHour = hours + (minutes / 60);
            arrivalTimes.push(Math.round(fractionalHour * 100) / 100);
        });

        let minHour = 6;
        let maxHour = 12;
        if (arrivalTimes.length > 0) {
            const minVal = Math.min(...arrivalTimes);
            const maxVal = Math.max(...arrivalTimes);
            minHour = Math.max(0, Math.floor(minVal - 1));
            maxHour = Math.min(24, Math.ceil(maxVal + 1));
            
            // Ensure minimum scale range of 2 hours for readability
            if (maxHour - minHour < 2) {
                minHour = Math.max(0, minHour - 1);
                maxHour = Math.min(24, maxHour + 1);
            }
        }

        const ctxLine = document.getElementById('chartIndivTimeTrend')?.getContext('2d');
        if (ctxLine) {
            grCharts['chartIndivTimeTrend'] = new Chart(ctxLine, {
                type: 'line',
                data: {
                    labels: daysWithLogs.length > 0 ? daysWithLogs : ['No Data'],
                    datasets: [{
                        label: 'Jam Kedatangan',
                        data: arrivalTimes.length > 0 ? arrivalTimes : [0],
                        borderColor: '#0ea5e9',
                        backgroundColor: 'rgba(14, 165, 233, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#0ea5e9',
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            min: minHour,
                            max: maxHour, 
                            ticks: {
                                callback: function(value) {
                                    const h = Math.floor(value);
                                    const m = Math.round((value - h) * 60);
                                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // PDF Download for Individual Report
    window.downloadIndividualReportPDF = async function() {
        const input = document.getElementById('indivSearchInput');
        if (!input) return;

        let selectedNid = input.dataset.selectedNid;
        if (!selectedNid && input.value.trim()) {
            const rawVal = input.value.trim();
            const matchParentheses = rawVal.match(/\(([^)]+)\)/);
            if (matchParentheses) {
                selectedNid = matchParentheses[1];
            } else {
                selectedNid = rawVal;
            }
        }

        if (!selectedNid) {
            alert('Silakan pilih karyawan terlebih dahulu dari daftar autocomplete.');
            return;
        }

        const employees = window.employees || [];
        const employee = employees.find(e => e.nid === selectedNid);
        if (!employee) {
            alert('Karyawan dengan NID tersebut tidak ditemukan.');
            return;
        }

        const month = parseInt(document.getElementById('indivMonthSelect').value) || (new Date().getMonth() + 1);
        const year = parseInt(document.getElementById('indivYearSelect').value) || new Date().getFullYear();

        const startOfMonth = new Date(year, month - 1, 1);
        const endOfMonth = new Date(year, month, 0, 23, 59, 59);
        const startMs = startOfMonth.getTime();
        const endMs = endOfMonth.getTime();

        const allAtt = window.attendance || [];
        const personalAtt = allAtt.filter(a => a.nid === selectedNid && a.ts >= startMs && a.ts <= endMs);

        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            alert("Library jsPDF belum dimuat.");
            return;
        }

        const doc = new jsPDF('p', 'mm', 'a4'); // Portrait, Millimeter, A4 Size
        const monthNames = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni", 
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
        ];
        const monthName = monthNames[month - 1];

        // LOGO / HEADER BAND
        doc.setFillColor(0, 141, 191); // #008dbf Corporate Blue
        doc.rect(0, 0, 210, 8, 'F'); // Header band

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59); // #1e293b
        doc.text("LAPORAN PERFORMA KEHADIRAN INDIVIDU", 14, 22);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139); // #64748b
        doc.text(`Periode Laporan: ${monthName} ${year}`, 14, 28);
        doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 33);

        // Horizontal Line
        doc.setDrawColor(226, 232, 240); // #e2e8f0
        doc.setLineWidth(0.5);
        doc.line(14, 37, 196, 37);

        // EMPLOYEE PROFILE BOX
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text("PROFIL KARYAWAN", 14, 45);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85); // #334155

        // Left column
        doc.text(`Nama Lengkap  :  ${employee.name}`, 14, 52);
        doc.text(`NID           :  ${employee.nid}`, 14, 58);
        doc.text(`Jabatan       :  ${employee.title || '-'}`, 14, 64);

        // Right column
        doc.text(`Perusahaan  :  ${employee.company || '-'}`, 110, 52);
        const groupLabelMap = { A: 'Grup A', B: 'Grup B', C: 'Grup C', D: 'Grup D', DAYTIME: 'Grup Daytime' };
        const grpName = groupLabelMap[employee.shift] || employee.shift || '-';
        doc.text(`Grup/Shift  :  ${grpName}`, 110, 58);
        doc.text(`Status      :  ${employee.status || 'Aktif'}`, 110, 64);

        doc.line(14, 70, 196, 70);

        // METRICS SUMMARY BOX
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text("RINGKASAN METRIK BULANAN", 14, 78);

        // Compute statistics (same as UI render)
        const numDays = new Date(year, month, 0).getDate();
        let daysPresent = 0;
        let daysLate = 0;
        let daysAbsent = 0;
        let totalOvertimeHours = 0;
        let daysOff = 0;

        const tableBody = [];

        for (let day = 1; day <= numDays; day++) {
            const currentDate = new Date(year, month - 1, day);
            const currentMsStart = currentDate.getTime();
            const currentMsEnd = currentMsStart + (24 * 3600 * 1000) - 1;

            let shiftCode = 'OFF';
            if (window.effectiveShiftFor) {
                shiftCode = window.effectiveShiftFor(employee, currentDate);
            } else {
                shiftCode = employee.shift || 'OFF';
            }

            const todayLogs = personalAtt.filter(a => a.ts >= currentMsStart && a.ts <= currentMsEnd);
            const inLog = todayLogs.find(a => a.status === 'datang' || a.status === 'late');
            const outLog = todayLogs.find(a => a.status === 'pulang');

            const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
            const dayName = dayNames[currentDate.getDay()];
            const dateStr = `${dayName}, ${day} ${monthName}`;

            let shiftLabel = shiftCode;
            const shiftDetail = (window.shifts || {})[shiftCode];
            if (shiftDetail && shiftDetail.start && shiftDetail.end) {
                shiftLabel = `${shiftCode} (${shiftDetail.start} - ${shiftDetail.end})`;
            }

            let statusText = '';
            let inTimeStr = '-';
            let outTimeStr = '-';
            let otStr = '-';

            if (shiftCode === 'OFF') {
                daysOff++;
                statusText = 'Libur (OFF)';
            } else {
                if (inLog) {
                    daysPresent++;
                    inTimeStr = new Date(inLog.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
                    if (outLog) {
                        outTimeStr = new Date(outLog.ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});
                    }

                    if (inLog.late) {
                        daysLate++;
                        statusText = 'Terlambat';
                    } else {
                        statusText = 'Tepat Waktu';
                    }
                } else {
                    if (currentMsEnd > Date.now()) {
                        statusText = 'Mendatang';
                    } else {
                        daysAbsent++;
                        statusText = 'Mangkir / Alpha';
                    }
                }
            }

            let otHours = 0;
            if (outLog && shiftCode !== 'OFF') {
                if (shiftDetail && shiftDetail.end) {
                    const [shH, shM] = shiftDetail.end.split(':').map(Number);
                    const shiftEndToday = new Date(year, month - 1, day, shH, shM, 0);
                    const actualOutTime = new Date(outLog.ts);
                    if (actualOutTime.getTime() > shiftEndToday.getTime() + (30 * 60000)) { 
                        otHours = (actualOutTime.getTime() - shiftEndToday.getTime()) / (3600000); 
                        otHours = Math.round(otHours * 10) / 10; 
                        totalOvertimeHours += otHours;
                        otStr = `${otHours} Jam`;
                    }
                }
            }

            tableBody.push([
                day,
                dateStr,
                shiftLabel,
                inTimeStr,
                outTimeStr,
                statusText,
                otStr
            ]);
        }

        const totalScheduledDays = numDays - daysOff;
        const presentRate = totalScheduledDays > 0 ? Math.round((daysPresent / totalScheduledDays) * 100) : 0;

        // Draw colored metric boxes (like cards in UI)
        doc.setFillColor(248, 250, 252); // #f8fafc
        doc.rect(14, 83, 40, 20, 'F');
        doc.rect(60, 83, 40, 20, 'F');
        doc.rect(106, 83, 40, 20, 'F');
        doc.rect(152, 84, 44, 20, 'F');

        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("Tingkat Kehadiran", 16, 88);
        doc.text("Total Terlambat", 62, 88);
        doc.text("Total Jam Lembur", 108, 88);
        doc.text("Mangkir / Alpha", 154, 88);

        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 141, 191); // blue
        doc.text(`${presentRate}%`, 16, 96);
        doc.setTextColor(245, 158, 11); // orange
        doc.text(`${daysLate} Kali`, 62, 96);
        doc.setTextColor(16, 185, 129); // green
        doc.text(`${totalOvertimeHours} Jam`, 108, 96);
        doc.setTextColor(239, 68, 68); // red
        doc.text(`${daysAbsent} Hari`, 154, 96);

        // Space line
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 109, 196, 109);

        // TABLE DETAIL HARIAN TITLE
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.setFont("helvetica", "bold");
        doc.text("DETAIL KEHADIRAN HARIAN", 14, 116);

        const tableHeaders = [["No", "Tanggal / Hari", "Shift / Jam Kerja", "Masuk", "Pulang", "Status", "Lembur"]];

        doc.autoTable({
            head: tableHeaders,
            body: tableBody,
            startY: 121,
            theme: 'striped',
            headStyles: {
                fillColor: [0, 141, 191], // #008dbf primary blue
                textColor: [255, 255, 255],
                fontSize: 9,
                fontStyle: 'bold',
                halign: 'center'
            },
            styles: {
                fontSize: 8.5,
                cellPadding: 2
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 8 },
                1: { cellWidth: 32 },
                2: { cellWidth: 42 },
                3: { halign: 'center', cellWidth: 16 },
                4: { halign: 'center', cellWidth: 16 },
                5: { halign: 'center', cellWidth: 26 },
                6: { halign: 'center', cellWidth: 16 }
            },
            didParseCell: function(data) {
                // Style Status column values
                if (data.column.index === 5 && data.cell.section === 'body') {
                    const val = data.cell.raw;
                    if (val === 'Tepat Waktu') {
                        data.cell.styles.textColor = [22, 163, 74]; // #16a34a green
                        data.cell.styles.fontStyle = 'bold';
                    } else if (val === 'Terlambat') {
                        data.cell.styles.textColor = [217, 119, 6]; // #d97706 orange
                        data.cell.styles.fontStyle = 'bold';
                    } else if (val === 'Mangkir / Alpha') {
                        data.cell.styles.textColor = [220, 38, 38]; // #dc2626 red
                        data.cell.styles.fontStyle = 'bold';
                    } else if (val === 'Libur (OFF)') {
                        data.cell.styles.textColor = [100, 116, 139]; // #64748b slate
                    }
                }
                // Style overtime column values
                if (data.column.index === 6 && data.cell.section === 'body' && data.cell.raw !== '-') {
                    data.cell.styles.textColor = [16, 185, 129]; // green
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });

        // Add Signatures Section at the end
        let finalY = doc.lastAutoTable.finalY + 15;
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(9.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 41, 59);
        
        doc.text("Karyawan Bersangkutan,", 20, finalY);
        doc.text("_______________________", 20, finalY + 22);
        
        doc.text("Mengetahui, Supervisor/HR,", 130, finalY);
        doc.text("_______________________", 130, finalY + 22);

        doc.save(`Laporan_Performa_Individu_${selectedNid}_${month}_${year}.pdf`);
    };

})();

