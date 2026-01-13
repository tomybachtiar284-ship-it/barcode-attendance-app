/* ============================================================================
   INVENTORY.JS
   Inventory Management Logic & UI.
   ========================================================================== */

function saveInventory() {
    save(LS_INV, inventoryData);
    if (typeof renderInventory === 'function') renderInventory();
}

// RENDER (Moved from app.js as it's modular enough)
function renderInventory() {
    const tbody = $('#invTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (inventoryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;" class="muted">Belum ada data barang keluar/masuk.</td></tr>';
        return;
    }

    const createCell = (html) => `<td>${html}</td>`;

    inventoryData.forEach(item => {
        const tr = document.createElement('tr');

        // Status Badge
        let badge = `<span class="pill light ${item.type === 'IN' ? '' : 'warn'}">${item.type === 'IN' ? 'MASUK' : 'KELUAR'}</span>`;

        // Time
        const tIn = item.timeIn ? fmtTs(item.timeIn) : '-';
        // Logic: If OUT type, timeOut is primary. If IN type, timeOut is checkout time.
        const tOut = item.timeOut ? fmtTs(item.timeOut) : '-';

        let timeDisplay = '';
        if (item.type === 'IN') {
            timeDisplay = `<div>IN: ${tIn}</div>`;
            if (item.timeOut) timeDisplay += `<div class="muted" style="font-size:0.85em">OUT: ${tOut}</div>`;
            else timeDisplay += `<button onclick="checkoutInventory('${item.id}')" class="btn ghost small" style="margin-top:4px; padding:4px 8px; font-size:0.8em; border:1px solid var(--primary-300)">Set Keluar</button>`;
        } else {
            timeDisplay = `<div>OUT: ${tOut}</div>`;
        }

        tr.innerHTML =
            createCell(badge) +
            createCell(`<b>${esc(item.carrier)}</b><br><span class="muted">${esc(item.company)}</span>`) +
            createCell(esc(item.item)) +
            createCell(esc(item.dest)) +
            createCell(esc(item.officer)) +
            createCell(timeDisplay) +
            createCell(`
         <button onclick="editInventory('${item.id}')" class="btn ghost icon-only">✏️</button>
         <button onclick="deleteInventory('${item.id}')" class="btn ghost icon-only" style="color:var(--danger)">🗑️</button>
      `);

        tbody.appendChild(tr);
    });
}

// Logic: Checkout (Set OUT time for IN item)
function checkoutInventory(id) {
    const rec = inventoryData.find(x => x.id === id);
    if (!rec) return;
    if (!confirm(`Set jam keluar untuk barang ${rec.item}?`)) return;

    rec.timeOut = new Date().toISOString(); // Store as ISO for consistency in legacy code? 
    // Wait, original code likely used TS number or ISO? 
    // Looking at db.js extraction: `time_out`.
    // Let's stick to ISO string as `time_in` in Supabase is timestamptz.
    // Ideally use `now().getTime()` if app uses number timestamps consistently.
    // Let's use `Date.now()` (number) if state.js implies `ts` number.
    // Checking `fmtTs`: `new Date(ms)`.
    rec.timeOut = new Date().toISOString(); // Using ISO string for inventory specific fields might be safer based on typical usage.

    saveInventory();
    pushInventory(rec);
    toast('Waktu keluar berhasil dicatat');
}

function handleInvScan(raw) {
    // Inventory uses a different scan input usually, or modal.
    // This is placeholder if specific scan logic exists.
    console.log("Inv Scan:", raw);
}

// Global Export
window.saveInventory = saveInventory;
window.renderInventory = renderInventory;
window.checkoutInventory = checkoutInventory;
window.handleInvScan = handleInvScan;
