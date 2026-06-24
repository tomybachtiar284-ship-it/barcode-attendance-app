document.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi Supabase
    if (!window.supabase) {
        console.error('Supabase SDK tidak dimuat.');
        return;
    }

    const sbUrl = window.SA_SUPABASE_URL || window.SUPABASE_URL;
    const sbAnon = window.SA_SUPABASE_ANON || window.SUPABASE_KEY;
    const sbClient = window.supabase.createClient(sbUrl, sbAnon, {
        auth: { storage: window.sessionStorage }
    });

    const loginForm = document.getElementById('loginForm');
    const msgBox = document.getElementById('messageBox');
    const btnSubmit = loginForm.querySelector('button[type="submit"]');
    
    function showMessage(msg, isError = false) {
        msgBox.classList.remove('hidden');
        msgBox.textContent = msg;
        if (isError) {
            msgBox.className = 'p-3 rounded-lg mb-4 text-center text-sm font-medium bg-red-500/20 text-red-200 border border-red-500/50';
        } else {
            msgBox.className = 'p-3 rounded-lg mb-4 text-center text-sm font-medium bg-green-500/20 text-green-200 border border-green-500/50';
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // Mencegah reload form bawaan HTML
            
            const originalText = btnSubmit.textContent;
            btnSubmit.textContent = 'Memproses...';
            btnSubmit.disabled = true;
            btnSubmit.classList.add('opacity-70', 'cursor-not-allowed');
            
            const usernameInput = document.getElementById('username').value.trim();
            const passwordInput = document.getElementById('password').value;

            // Proses sign-in menggunakan Supabase
            const { data, error } = await sbClient.auth.signInWithPassword({
                email: usernameInput,
                password: passwordInput,
            });

            if (error) {
                showMessage(error.message === 'Invalid login credentials' ? 'Email atau password salah.' : error.message, true);
                btnSubmit.textContent = originalText;
                btnSubmit.disabled = false;
                btnSubmit.classList.remove('opacity-70', 'cursor-not-allowed');
            } else {
                const role = data.session?.user?.user_metadata?.role || 'admin';
                sessionStorage.setItem('SA_USER_ROLE', role);
                showMessage('Login berhasil! Mengalihkan...', false);
                setTimeout(() => {
                    let redirectUrl = window.SA_REDIRECT_AFTER_LOGIN || 'index.html';
                    if (role === 'security') {
                        redirectUrl = 'scan.html';
                    } else if (role === 'gudang' || role === 'staf_gudang') {
                        redirectUrl = 'index.html?route=inventory';
                    }
                    window.location.replace(redirectUrl);
                }, 800);
            }
        });
    }

    // Sync language switcher UI with stored language on load
    const savedLang = localStorage.getItem('SA_LANG') || 'id';
    window.changeLang(savedLang);
});

// Fungsi untuk ubah bahasa sederhana (jika diperlukan oleh UI login)
window.changeLang = function(lang) {
    console.log("Bahasa diubah ke:", lang);
    if (window.translationManager) {
        window.translationManager.setLanguage(lang);
    }
    const flag = document.getElementById('currFlag');
    const txt = document.getElementById('currLang');
    if (lang === 'id') {
        if(flag) flag.textContent = '🇮🇩';
        if(txt) txt.textContent = 'ID';
    } else {
        if(flag) flag.textContent = '🇺🇸';
        if(txt) txt.textContent = 'EN';
    }
};
