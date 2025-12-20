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

// Menambahkan event listener ke formulir
loginForm.addEventListener('submit', function (e) {
    // Mencegah formulir dikirim secara default
    e.preventDefault();

    const username = usernameInput.value;
    const password = passwordInput.value;

    // Validasi sederhana
    if (username.trim() === '' || password.trim() === '') {
        showMessage('Username dan Password tidak boleh kosong.', 'error');
        return;
    }

    if (password.length < 6) {
        showMessage('Password minimal harus 6 karakter.', 'error');
        return;
    }

    // Jika lolos validasi
    showMessage('Login berhasil! Mengalihkan...', 'success');

    // Simpan sesi login
    localStorage.setItem('SA_SESSION', 'true');

    // Arahkan ke dashboard
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
});

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

