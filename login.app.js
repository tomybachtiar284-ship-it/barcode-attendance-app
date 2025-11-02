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
loginForm.addEventListener('submit', function(e) {
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

    // Jika lolos validasi (simulasi sukses)
    // Di aplikasi nyata, di sini Anda akan mengirim data ke server (fetch/axios)
    showMessage('Login berhasil! Mengalihkan...', 'success');

    // (Opsional) Arahkan pengguna setelah sukses
    // setTimeout(() => {
    //     window.location.href = '/dashboard'; // Ganti dengan halaman tujuan
    // }, 1500);
});

