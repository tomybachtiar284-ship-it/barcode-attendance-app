/**
 * js/safety.js
 * Safety Features & Emergency Muster List
 */

/**
 * Render Emergency Muster List
 * Filters attendance to show people currently on site (In but not Out) for TODAY.
 * Assumes global 'attendance' variable exists and contains records with {timeIn, timeOut, name, ...}
 */
function renderMusterList() {
    console.log("Rendering Emergency Muster List...");

    const musterContainer = document.getElementById('musterListBody');
    const musterCount = document.getElementById('musterTotalCount');
    const musterDate = document.getElementById('musterDate');

    if (!musterContainer || !musterCount) {
        console.error("Emergency Muster elements not found in DOM");
        return;
    }

    if (typeof attendance === 'undefined') {
        console.error("Global 'attendance' data not available");
        musterContainer.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Data Error: Attendance data missing</td></tr>';
        return;
    }

    const now = new Date();
    // Update Date Header
    if (musterDate) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        musterDate.textContent = now.toLocaleDateString('id-ID', options);
    }

    // === LOGIC CORRECTION: Rolling Window 24 Hours ===
    // This allows night shifts (who entered yesterday) to appear active.
    // Look back 24 hours (24 * 60 * 60 * 1000 ms)
    const rollingWindowStart = now.getTime() - (24 * 60 * 60 * 1000);

    // 1. Get Events in last 24h
    const attToday = attendance.filter(a => (a.ts || 0) >= rollingWindowStart);

    // 2. Group by NID to find Last Status
    const statusMap = new Map(); // nid -> status
    const recordMap = new Map(); // nid -> full latest record
    const firstInMap = new Map(); // nid -> timestamp of FIRST 'datang' today

    attToday.sort((a, b) => (a.ts || 0) - (b.ts || 0)); // Sort Ascending

    attToday.forEach(r => {
        statusMap.set(r.nid, r.status);
        recordMap.set(r.nid, r);

        // Capture first IN time
        if (r.status === 'datang' && !firstInMap.has(r.nid)) {
            firstInMap.set(r.nid, r.ts);
        }
    });

    // 3. Filter for "Active" (Datang or Break_In)
    const activeList = [];
    statusMap.forEach((status, nid) => {
        if (status === 'datang' || status === 'break_in') {
            const lastRec = recordMap.get(nid);
            const firstIn = firstInMap.get(nid) || lastRec.ts;
            activeList.push({
                ...lastRec,
                originalTimeIn: firstIn // Use first IN for display, not the last "Back from Break" check-in if preferred
            });
        }
    });

    console.log(`Muster List: Found ${activeList.length} active souls.`);

    // Update Counter
    musterCount.textContent = activeList.length;

    // Sort: Company -> Name
    activeList.sort((a, b) => {
        const compA = (a.company || '').toUpperCase();
        const compB = (b.company || '').toUpperCase();
        if (compA < compB) return -1;
        if (compA > compB) return 1;

        const nameA = (a.name || '').toUpperCase();
        const nameB = (b.name || '').toUpperCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;

        return 0;
    });

    // Render Table
    musterContainer.innerHTML = '';

    if (activeList.length === 0) {
        musterContainer.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:30px; font-weight:bold; color:#64748b;">
                    TIDAK ADA PERSONIL DI LOKASI
                    <div style="font-weight:normal; font-size:0.8rem; margin-top:5px;">(No Active Personnel On-Site)</div>
                </td>
            </tr>
        `;
        return;
    }

    // Helper time formatter
    // Updated Format: "26 Jan 20:02" to clarify multi-day entries
    const fmtTime = (ts) => {
        if (!ts) return '-';
        const d = new Date(ts);
        const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
        return `<span style="font-size:0.7em; color:#64748b; display:block; margin-bottom:-4px;">${dateStr}</span> ${timeStr}`;
    };

    activeList.forEach(p => {
        const row = document.createElement('tr');

        // Visual cue for status
        const isBreakReturn = p.status === 'break_in';
        const statusBadge = isBreakReturn
            ? '<span style="font-size:0.7em; background:#dbeafe; color:#1e40af; padding:2px 4px; border-radius:4px; margin-left:4px;">(Kembali)</span>'
            : '';

        row.innerHTML = `
            <td style="font-size:1.2rem; font-weight:700; color:#334155;">
                ${fmtTime(p.originalTimeIn)}
            </td>
            <td>
                <div style="font-weight:bold; font-size:1.1rem;">${p.name || 'Unknown'} ${statusBadge}</div>
                <div style="font-size:0.8rem; color:#666;">${p.nid || '-'}</div>
            </td>
            <td>${p.company || '-'}</td>
            <td>${p.shift || '-'}</td>
            <td>
                Lobby / Gate
                <div style="font-size:0.75rem; color:#94a3b8;">Ref: ${fmtTime(p.ts)}</div>
            </td> 
        `;
        musterContainer.appendChild(row);
    });
}

// Function to trigger print
function printMusterList() {
    window.print();
}
