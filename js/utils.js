/* ============================================================================
   UTILS.JS
   Helper functions for DOM, Date, and UI.
   ========================================================================== */

// DOM Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const on = (el, type, cb) => el.addEventListener(type, cb);

// Text Helpers
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Date Helpers
function pad(n) { return String(n).padStart(2, '0'); }

function now() { return new Date(); }

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fmtTs(ms) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('id-ID', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
    }).replace('.', ':');
}

function fmtDate(ms) {
    if (!ms) return '-';
    return new Date(ms).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric'
    });
}

function minutesOf(d) { return d.getHours() * 60 + d.getMinutes(); }

/**
 * Converts "HH:mm" string to Date object based on a reference date (baseDate)
 */
function toDateFromHM(baseDate, hmStr) {
    if (!hmStr) return null;
    const [h, m] = hmStr.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h, m, 0, 0);
    return d;
}

// UI Helpers
function toast(msg, type = 'info') {
    let t = document.createElement('div');
    t.className = 'toast show';
    if (type === 'error') t.style.background = 'var(--danger)';
    if (type === 'success') t.style.background = 'var(--success)';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

// Global Export check (if module system used later, but for now global)
window.$ = $;
window.$$ = $$;
window.on = on;
window.esc = esc;
window.now = now;
window.todayISO = todayISO;
window.fmtTs = fmtTs;
window.fmtDate = fmtDate;
window.minutesOf = minutesOf;
window.pad = pad;
window.toDateFromHM = toDateFromHM;
window.toast = toast;
