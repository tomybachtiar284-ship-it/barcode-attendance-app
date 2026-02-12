
// Mock Window & Dependencies
global.window = global;
global.sched = {};
global.shifts = {
    P: { start: '07:30', end: '15:30' },
    S: { start: '15:30', end: '23:30' },
    M: { start: '23:30', end: '07:30' },
    DAYTIME: { start: '07:30', end: '16:00' }
};

const GROUP_KEYS = ['A', 'B', 'C', 'D', 'DAYTIME'];
const NORMALIZE_SHIFT = {
    'p': 'P', 'pagi': 'P', 'shift pagi': 'P',
    's': 'S', 'sore': 'S', 'shift sore': 'S',
    'm': 'M', 'malam': 'M', 'shift malam': 'M',
    'day': 'DAYTIME', 'daytime': 'DAYTIME', 'siang': 'DAYTIME',
    'off': 'OFF', 'l': 'OFF', 'libur': 'OFF'
};
const NORMALIZE_GROUP = {
    'a': 'A', 'group a': 'A', 'grup a': 'A',
    'b': 'B', 'group b': 'B', 'grup b': 'B',
    'c': 'C', 'group c': 'C', 'grup c': 'C',
    'd': 'D', 'group d': 'D', 'grup d': 'D',
    'daytime': 'DAYTIME', 'day': 'DAYTIME', 'group daytime': 'DAYTIME', 'grup daytime': 'DAYTIME'
};

const monthKey = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

// --- COPIED LOGIC FROM app.js (Modified for Test) ---

function effectiveShiftFor(emp, date) {
    if (!emp || !emp.shift) return null;

    // 1. Normalize Group Name (emp.shift stores the GROUP code)
    let group = emp.shift;
    const groupAlias = NORMALIZE_GROUP[group.toLowerCase()];
    if (groupAlias) group = groupAlias;

    // 2. Check Monthly Schedule (Jadwal Bulanan)
    // Schedule: sched[monthKey][groupCode][day] = Shift Code (P/S/M/DAYTIME/L)
    const id = monthKey(date), day = date.getDate();
    const dailyCode = sched[id]?.[group]?.[day];

    if (dailyCode) {
        if (dailyCode === 'L' || dailyCode === 'OFF' || dailyCode.toLowerCase() === 'libur') return 'OFF';
        // Normalize cell value to standard shift code (P/S/M/DAYTIME)
        const normalized = NORMALIZE_SHIFT[dailyCode.toLowerCase()];
        const shiftCode = normalized || dailyCode.toUpperCase();
        // Verify it's a valid shift code
        if (shifts[shiftCode]) return shiftCode;
        return shiftCode; // Return as-is even if not found (fallback)
    }

    // 3. Fallback: No schedule entry → default mapping by Group
    const DEFAULT_GROUP_SHIFT = { A: 'P', B: 'S', C: 'M', D: 'P', DAYTIME: 'DAYTIME' };
    const defaultShift = DEFAULT_GROUP_SHIFT[group];
    if (defaultShift && shifts[defaultShift]) return defaultShift;

    return 'OFF';
}

function groupsScheduled(shiftCode, dateFor) {
    const out = [];
    // Standardize: Use effectiveShiftFor to determine if a Group is assigned to this ShiftCode
    // We create a "Mock Employee" representing the Group
    GROUP_KEYS.forEach(g => {
        // Mock employee with just the shift(group) property
        const mockEmp = { shift: g };
        // Get effective shift for this group on the specific date
        const eff = effectiveShiftFor(mockEmp, dateFor);

        // If result matches the requested shiftCode, add group to list
        if (eff === shiftCode) out.push(g);
    });
    return out;
}

// --- TEST CASES ---

const dateStr = '2023-10-25'; // Wednesday
const d = new Date(dateStr);
const id = monthKey(d);
const day = d.getDate();

// Setup Schedule:
// Group A -> P
// Group B -> S
// Group C -> M
// Group D -> OFF (Libur)
// Group DAYTIME -> DAYTIME

// Helper to ensure path exists
if (!sched[id]) sched[id] = {};
['A', 'B', 'C', 'D', 'DAYTIME'].forEach(g => { if (!sched[id][g]) sched[id][g] = {}; });

sched[id]['A'][day] = 'P';
sched[id]['B'][day] = 'S';
sched[id]['C'][day] = 'M';
sched[id]['D'][day] = 'OFF';
sched[id]['DAYTIME'][day] = 'DAYTIME';


console.log(`Testing Date: ${dateStr}`);
console.log('--- Checking effectiveShiftFor ---');
console.log('Group A Shift:', effectiveShiftFor({ shift: 'A' }, d)); // Expect P
console.log('Group B Shift:', effectiveShiftFor({ shift: 'B' }, d)); // Expect S
console.log('Group C Shift:', effectiveShiftFor({ shift: 'C' }, d)); // Expect M
console.log('Group D Shift:', effectiveShiftFor({ shift: 'D' }, d)); // Expect OFF
console.log('Group DAYTIME Shift:', effectiveShiftFor({ shift: 'DAYTIME' }, d)); // Expect DAYTIME

console.log('--- Checking groupsScheduled ---');
console.log('Groups for Shift P:', groupsScheduled('P', d)); // Expect [A]
console.log('Groups for Shift S:', groupsScheduled('S', d)); // Expect [B]
console.log('Groups for Shift M:', groupsScheduled('M', d)); // Expect [C]
console.log('Groups for Shift DAYTIME:', groupsScheduled('DAYTIME', d)); // Expect [DAYTIME]

console.log('--- Test passed if output matches expectations ---');
