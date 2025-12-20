/**
 * SmartAttend Translation System
 * Dictionary & Logic
 */

const TRANSLATIONS = {
    id: {
        // Sidebar
        nav_dashboard: "📊 Dasbor",
        nav_scan: "🔎 Scan Barcode",
        nav_employees: "👥 Database Karyawan",
        nav_shifts: "🕘 Pengaturan Shift",
        nav_report: "📑 Laporan 24 Jam",
        nav_latest: "📰 Informasi Terbaru",
        nav_education: "🎓 Edukasi",

        // Dashboard
        dash_welcome_title: "SELAMAT DATANG DI PT PLN NUSANTARA POWER SERVICES LINGKUP PLTU AMPANA ⚡",
        dash_welcome_sub: "ANDA BERADA DI KAWASAN PLN NPS UNIT PLTU AMPANA DAN WAJIB MEMATUHI SEMUA ATURAN YANG BERLAKU",
        btn_fullscreen: "⛶ Layar Penuh",
        btn_exit_fullscreen: "⛶ Keluar Penuh",

        // Stats
        stat_total_emp: "Total Karyawan",
        stat_scan_24h: "Scan 24 jam",
        stat_in: "Datang",
        stat_out: "Pulang",
        stat_ontime_vs_late: "On-time vs Terlambat (hari ini)",
        stat_ontime: "On-time",
        stat_late: "Terlambat",

        // Company Presence
        company_attendance_title: "Kehadiran Perusahaan (hari ini)",
        company_live_stats: "Statistik Kehadiran Langsung",

        // Cards
        card_monthly_calendar: "Kalender Bulan Ini",
        card_latest_info: "Informasi Terbaru ⚠️📢",
        card_recent_activity: "Aktivitas Terbaru",
        table_time: "Waktu",
        table_status: "Status",
        table_nid: "NID",
        table_name: "Nama",
        table_shift: "Shift",
        table_action: "Aksi",

        // Scan Page
        scan_title_main: "SELAMAT DATANG DI PT PLN NUSANTARA POWER SERVICES LINGKUP PLTU AMPANA ⚡",
        scan_hint: "Utamakan Keselamatan dan Kesehatan Kerja.",
        scan_placeholder: "Klik di sini lalu scan...",
        scan_stats_realtime: "Statistik Kehadiran (Realtime)",
        scan_history_title: "Riwayat Scan (5 terbaru hari ini)",
        scan_col_company: "Perusahaan",
        scan_col_present: "Hadir",
        scan_col_progress: "Progress",

        // Employees Page
        btn_add: "＋ Tambah",
        btn_import: "⬆️ Import Excel",
        btn_export: "⬇️ Export Excel",
        btn_template: "📄 Unduh Template",
        search_placeholder: "Cari nama atau NID...",
        col_photo: "Foto",
        col_job: "Jabatan",
        col_action: "Aksi",

        // Shifts Page
        shift_title: "Pengaturan Jam Shift",
        shift_col_code: "Kode",
        shift_col_in: "Datang",
        shift_col_out: "Pulang",
        shift_col_action: "Aksi",

        // Login Page
        login_welcome: "Selamat Datang di SmartAttend",
        login_sub: "PLTU AMPANA",
        login_placeholder_user: "Email atau Username",
        login_placeholder_pass: "Kata Sandi",
        login_btn: "Masuk",
        login_forgot: "Lupa kata sandi?",
        login_footer_title: "SmartAttend",
        login_footer_sub: "PLTU AMPANA"
    },
    en: {
        // Sidebar
        nav_dashboard: "📊 Dashboard",
        nav_scan: "🔎 Scan Barcode",
        nav_employees: "👥 Employee Database",
        nav_shifts: "🕘 Shift Settings",
        nav_report: "📑 24-Hour Report",
        nav_latest: "📰 Latest Info",
        nav_education: "🎓 Education",

        // Dashboard
        dash_welcome_title: "WELCOME TO PT PLN NUSANTARA POWER SERVICES PLTU AMPANA AREA ⚡",
        dash_welcome_sub: "YOU ARE IN THE PLN NPS PLTU AMPANA AREA AND MUST COMPLY WITH ALL APPLICABLE REGULATIONS",
        btn_fullscreen: "⛶ Full Screen",
        btn_exit_fullscreen: "⛶ Exit Full Screen",

        // Stats
        stat_total_emp: "Total Employees",
        stat_scan_24h: "24h Scans",
        stat_in: "In",
        stat_out: "Out",
        stat_ontime_vs_late: "On-time vs Late (today)",
        stat_ontime: "On-time",
        stat_late: "Late",

        // Company Presence
        company_attendance_title: "Company Attendance (today)",
        company_live_stats: "Live Attendance Stats",

        // Cards
        card_monthly_calendar: "Monthly Calendar",
        card_latest_info: "Latest Information ⚠️📢",
        card_recent_activity: "Recent Activity",
        table_time: "Time",
        table_status: "Status",
        table_nid: "NID",
        table_name: "Name",
        table_shift: "Shift",
        table_action: "Action",

        // Scan Page
        scan_title_main: "WELCOME TO PT PLN NUSANTARA POWER SERVICES PLTU AMPANA AREA ⚡",
        scan_hint: "Prioritize Occupational Health and Safety.",
        scan_placeholder: "Click here to scan...",
        scan_stats_realtime: "Attendance Statistics (Realtime)",
        scan_history_title: "Scan History (5 latest today)",
        scan_col_company: "Company",
        scan_col_present: "Present",
        scan_col_progress: "Progress",

        // Employees Page
        btn_add: "＋ Add",
        btn_import: "⬆️ Import Excel",
        btn_export: "⬇️ Export Excel",
        btn_template: "📄 Download Template",
        search_placeholder: "Search name or NID...",
        col_photo: "Photo",
        col_job: "Position",
        col_action: "Action",

        // Shifts Page
        shift_title: "Shift Scheduling",
        shift_col_code: "Code",
        shift_col_in: "In",
        shift_col_out: "Out",
        shift_col_action: "Action",

        // Login Page
        login_welcome: "Welcome to SmartAttend",
        login_sub: "PLTU AMPANA",
        login_placeholder_user: "Email or Username",
        login_placeholder_pass: "Password",
        login_btn: "Sign In",
        login_forgot: "Forgot password?",
        login_footer_title: "SmartAttend",
        login_footer_sub: "PLTU AMPANA"
    }
};

class TranslationManager {
    constructor() {
        this.currentLang = localStorage.getItem('SA_LANG') || 'id';
        this.init();
    }

    init() {
        this.applyLanguage(this.currentLang);
        this.renderSelector();

        // Listen for dynamic content updates if needed
        window.addEventListener('attendance:update', () => this.applyLanguage(this.currentLang));
    }

    setLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('SA_LANG', lang);
        this.applyLanguage(lang);
        this.updateSelectorUI();
    }

    applyLanguage(lang) {
        const dict = TRANSLATIONS[lang];
        if (!dict) return;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
                    el.placeholder = dict[key];
                } else {
                    // Preserve icons if they exist in the original HTML but not in dictionary
                    // Actually, for simplicity, assuming dictionary has full text including icons if needed.
                    // Or we can check if element has children (icons).
                    // For now, Replace textContent carefully.

                    // Simple text replacement
                    el.textContent = dict[key];
                }
            }
        });

        // Update HTML lang attribute
        document.documentElement.lang = lang;
    }

    renderSelector() {
        const container = document.createElement('div');
        container.className = 'lang-selector';
        container.innerHTML = `
            <button class="lang-btn" id="langBtn" aria-label="Change Language">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
            </button>
            <div class="lang-menu hidden" id="langMenu">
                <div class="lang-opt ${this.currentLang === 'en' ? 'active' : ''}" data-lang="en">
                   <img src="https://flagcdn.com/w20/us.png" alt="English"> English
                </div>
                <div class="lang-opt ${this.currentLang === 'id' ? 'active' : ''}" data-lang="id">
                   <img src="https://flagcdn.com/w20/id.png" alt="Indonesia"> Indonesia
                </div>
            </div>
        `;

        // Append to body or specific nav area. 
        // For Dashboard: Append to top-right
        // For Login: Append to top-right
        document.body.appendChild(container);

        const btn = container.querySelector('#langBtn');
        const menu = container.querySelector('#langMenu');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });

        menu.querySelectorAll('.lang-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                this.setLanguage(opt.dataset.lang);
                menu.classList.add('hidden');
            });
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });
    }

    updateSelectorUI() {
        document.querySelectorAll('.lang-opt').forEach(opt => {
            if (opt.dataset.lang === this.currentLang) opt.classList.add('active');
            else opt.classList.remove('active');
        });
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.translationManager = new TranslationManager();
});
