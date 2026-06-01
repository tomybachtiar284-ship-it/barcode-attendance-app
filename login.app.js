try {
    // Mendapatkan elemen yang diperlukan
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const messageBox = document.getElementById('messageBox');

    // Fungsi untuk menampilkan pesan
    function showMessage(message, type) {
        // Mengatur teks dan warna
        messageBox.textContent = message;
        messageBox.classList.remove('hidden', 'bg-red-200', 'text-red-800', 'bg-green-200', 'text-green-800');

        if (type === 'error') {
            messageBox.classList.add('bg-red-200', 'text-red-800');
        } else if (type === 'success') {
            messageBox.classList.add('bg-green-200', 'text-green-800');
        }

        // Menampilkan kotak pesan
        messageBox.classList.remove('hidden');

        // Menyembunyikan pesan setelah 3 detik
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 3000);
    }

    // Inisialisasi Supabase
    const url = window.SA_SUPABASE_URL || window.SUPABASE_URL;
    const key = window.SA_SUPABASE_ANON || window.SUPABASE_KEY;

    if (!url || !key) {
        showMessage('Konfigurasi Supabase tidak ditemukan.', 'error');
        console.error('Missing config in config.local.js');
    }

    const supabase = (window.supabase && url && key) ? window.supabase.createClient(url, key, { auth: { storage: window.sessionStorage } }) : null;

    // Menambahkan event listener ke formulir
    loginForm.onsubmit = async function (e) {
        e.preventDefault();

        const email = usernameInput.value.trim();
        const password = passwordInput.value;

        // Validasi sederhana
        if (email === '' || password.trim() === '') {
            showMessage('Email dan Password tidak boleh kosong.', 'error');
            return;
        }

        if (password.length < 6) {
            showMessage('Password minimal harus 6 karakter.', 'error');
            return;
        }
        
        if (!supabase) {
            showMessage('Supabase SDK tidak dimuat.', 'error');
            return;
        }

        try {
            const btnSubmit = loginForm.querySelector('button[type="submit"]');
            const originalText = btnSubmit.textContent;
            btnSubmit.textContent = 'Memproses...';
            btnSubmit.disabled = true;

            // Autentikasi dengan Supabase (menggunakan email)
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                showMessage('Login gagal: ' + error.message, 'error');
                btnSubmit.textContent = originalText;
                btnSubmit.disabled = false;
                return;
            }

            // Jika lolos validasi
            showMessage('Login berhasil! Mengalihkan...', 'success');

            // Bersihkan sesi lokal lama yang tidak aman
            localStorage.removeItem('SA_SESSION');

            // Arahkan ke dashboard
            setTimeout(() => {
                const redirectUrl = window.SA_REDIRECT_AFTER_LOGIN || 'index.html';
                window.location.href = redirectUrl;
            }, 1000);
        } catch (err) {
            alert('Terjadi kesalahan jaringan atau sistem: ' + err.message);
            showMessage('Terjadi kesalahan jaringan.', 'error');
            console.error(err);
            const btnSubmit = loginForm.querySelector('button[type="submit"]');
            if (btnSubmit) btnSubmit.disabled = false;
        }
    };

    // ===== Language Logic =====
    const translations = {
        en: {
            login_title: "Login",
            login_subtitle: "Welcome back! Please enter your details.",
            label_username: "Username / Email",
            label_password: "Password",
            label_remember: "Remember me",
            label_forgot: "Forgot password?",
            btn_signin: "Sign In",
            text_or: "or continue with"
        },
        id: {
            login_title: "Masuk",
            login_subtitle: "Selamat datang kembali! Silakan masukkan detail Anda.",
            label_username: "Nama Pengguna / Email",
            label_password: "Kata Sandi",
            label_remember: "Ingat saya",
            label_forgot: "Lupa kata sandi?",
            btn_signin: "Masuk",
            text_or: "atau lanjut dengan"
        }
    };

    window.changeLang = function (lang) {
        // 1. Update Text
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });

        // 2. Update Flag & Label
        const flag = lang === 'id' ? '🇮🇩' : '🇺🇸';
        const label = lang === 'id' ? 'ID' : 'EN';

        const currFlag = document.getElementById('currFlag');
        const currLang = document.getElementById('currLang');
        if (currFlag) currFlag.textContent = flag;
        if (currLang) currLang.textContent = label;

        // 3. Save Preference
        localStorage.setItem('SA_LANG', lang);
    }

    // Init Language
    const savedLang = localStorage.getItem('SA_LANG') || 'en';
    window.changeLang(savedLang);

} catch (globalErr) {
    alert("Gagal memuat sistem login. Silakan tekan Ctrl+F5. Error: " + globalErr.message);
    console.error(globalErr);
}
