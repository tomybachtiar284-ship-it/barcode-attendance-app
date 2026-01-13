/* ============================================================================
   STATE.JS
   Global State & Constants.
   ========================================================================== */

// CONSTANTS
const LS_ATT = 'barcode_att_v2';
const LS_EMP = 'barcode_emp_v2';
const LS_SHIFTS = 'barcode_shifts';
const LS_SCHED = 'barcode_schedules';
const LS_NEWS = 'barcode_news';
const LS_EDU = 'barcode_edu';
const LS_INV = 'barcode_inventory';

// STATE VARIABLES
let employees = load(LS_EMP) || [];
let attendance = load(LS_ATT) || [];
let news = load(LS_NEWS) || [];
let eduData = load(LS_EDU) || [];
let inventoryData = load(LS_INV) || [];

// SHIFT DEFAULTS
let shifts = load(LS_SHIFTS) || {
    P: { start: '07:00', end: '15:00', color: '#10b981' }, // Pagi
    S: { start: '15:00', end: '23:00', color: '#f59e0b' }, // Sore
    M: { start: '23:00', end: '07:00', color: '#3b82f6' }, // Malam
    O: { start: '08:00', end: '17:00', color: '#6366f1' }, // Office
};

// SCHEDULE STATE
let sched = load(LS_SCHED) || {}; // { "2023-10": { "NID123": ["P","P",...] } }

// Helper: monthKey
function monthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Helpers for Local Storage
function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
}

// Global Export
window.LS_ATT = LS_ATT;
window.LS_EMP = LS_EMP;
window.LS_SHIFTS = LS_SHIFTS;
window.LS_SCHED = LS_SCHED;
window.LS_NEWS = LS_NEWS;
window.LS_EDU = LS_EDU;
window.LS_INV = LS_INV;

window.employees = employees;
window.attendance = attendance;
window.news = news;
window.eduData = eduData;
window.inventoryData = inventoryData;
window.shifts = shifts;
window.sched = sched;

window.monthKey = monthKey;
window.load = load;
window.save = save;
