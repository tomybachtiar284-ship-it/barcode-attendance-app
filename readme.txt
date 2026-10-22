========================================================================
DOKUMENTASI APLIKASI: AMAN-S APP (BARCODE ATTENDANCE SYSTEM)
PLN NUSANTARA POWER SERVICES
========================================================================

1. DESKRIPSI PROYEK
AMAN-S App adalah aplikasi berbasis web (Progressive Web Application / PWA) yang dirancang untuk pencatatan kehadiran (attendance tracking) karyawan menggunakan pemindaian kode batang (barcode scan). Aplikasi ini juga dilengkapi dengan fitur monitoring Keselamatan dan Kesehatan Kerja (K3) serta manajemen inventaris. Aplikasi ini terintegrasi langsung dengan database Supabase secara real-time.

2. STRUKTUR DIREKTORI & FILE UTAMA
Berikut adalah rincian kode sumber utama yang diserahkan dalam arsip ini:

├── index.html            : Halaman utama (dashboard) untuk antarmuka pengguna di desktop.
├── app.js                : Logika utama aplikasi dashboard desktop (manajemen tab, interaksi UI).
├── styles.css            : Lembar gaya (styling) utama untuk dashboard desktop.
│
├── login.html            : Halaman masuk (login) untuk autentikasi pengguna.
├── login.app.js          : Logika autentikasi dan otorisasi menggunakan Supabase Auth.
├── login.css             : Lembar gaya (styling) khusus untuk halaman login.
│
├── scan.html             : Antarmuka pemindai barcode (untuk perangkat dengan kamera/scanner).
├── scan_logic.js         : Logika deteksi barcode, integrasi kamera, dan input kehadiran.
├── scan-styles.css       : Lembar gaya (styling) khusus halaman scanner.
│
├── mobile.html           : Antarmuka khusus untuk tampilan perangkat mobile / HP.
├── mobile-stats.js       : Logika visualisasi data, statistik, dan interaksi versi mobile.
│
├── manifest.json         : Konfigurasi Progressive Web App (PWA) agar aplikasi dapat diinstal di HP.
├── service-worker.js     : Script service worker untuk caching offline dan fungsionalitas PWA.
├── config.local.js       : Konfigurasi koneksi API (URL Supabase dan Anon Key).
│
├── js/                   : Direktori berisi modul logika JavaScript spesifik:
│   ├── db.js             : Konektor utama & fungsi query ke database Supabase.
│   ├── attendance.js     : Logika pencatatan, kalkulasi, dan manajemen kehadiran.
│   ├── report.js         : Logika pembuatan laporan kehadiran (ekspor Excel/PDF).
│   ├── safety.js         : Modul pencatatan K3 (Keselamatan dan Kesehatan Kerja).
│   ├── inventory.js      : Modul manajemen inventaris alat kerja.
│   ├── state.js          : Pengelola state aplikasi secara terpusat.
│   ├── translation.js    : Sistem lokalisasi multi-bahasa (Indonesia / Inggris).
│   └── utils.js          : Helper functions / utilitas umum.
│
├── assets/               : Aset visual pendukung aplikasi (logo PLN, ikon, latar belakang, audio):
│   ├── AMAN-S-Logo.jpg   : Logo aplikasi AMAN-S.
│   ├── LOGO PLN NP SERVICES - FIN.png : Logo resmi PLN Nusantara Power Services.
│   ├── beep.mp3          : Efek suara ketika barcode berhasil dipindai.
│   └── (aset gambar lainnya untuk background dan visual UI)
│
└── sql/                  : Skrip basis data untuk konfigurasi tabel di Supabase:
    ├── seed_employees.sql          : Query contoh data karyawan.
    ├── fix_employees_rls.sql       : Kebijakan keamanan Row Level Security (RLS).
    ├── reset_security_policies.sql : Reset kebijakan hak akses database.
    └── (skrip database penunjang lainnya)

3. PERSYARATAN SISTEM & DEPENDENSI
Aplikasi ini dikembangkan menggunakan teknologi Vanilla HTML5, CSS3, dan JavaScript modern (ES Modules), serta terhubung dengan:
- Database: Supabase (PostgreSQL) melalui Supabase JS SDK (dimuat via CDN).
- Pemindai Barcode: Library Html5-Qrcode (dimuat via CDN).
- Ekspor Laporan: Library SheetJS (XLSX) dan jsPDF (dimuat via CDN).

4. CARA MENJALANKAN APLIKASI
Karena aplikasi ini menggunakan modul JavaScript (ES Modules), aplikasi tidak dapat dijalankan langsung dengan klik ganda (double-click) file HTML lokal pada beberapa browser karena kebijakan CORS. Aplikasi harus dijalankan melalui web server lokal.

Cara Cepat Menjalankannya:
A. Menggunakan VS Code (Rekomendasi):
   1. Buka folder proyek ini di VS Code.
   2. Instal ekstensi "Live Server".
   3. Klik kanan pada file `login.html` atau `index.html`, lalu pilih "Open with Live Server".
   4. Aplikasi akan terbuka secara otomatis di browser pada alamat `http://127.0.0.1:5500`.

B. Menggunakan Python (Terminal/Command Prompt):
   1. Buka Command Prompt / PowerShell di dalam folder proyek ini.
   2. Jalankan perintah:
      python -m http.server 8000
   3. Buka browser dan akses alamat:
      http://localhost:8000/login.html

5. KONFIGURASI DATABASE
Untuk mengganti atau mengarahkan database ke server Supabase milik Anda:
1. Buka file `config.local.js`.
2. Ubah nilai `window.SA_SUPABASE_URL` dan `window.SA_SUPABASE_ANON` sesuai dengan kredensial API project Supabase Anda.

========================================================================
Dokumentasi ini dibuat sebagai lampiran pendukung penyerahan karya inovasi.
========================================================================
